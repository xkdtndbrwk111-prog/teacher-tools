"""Validate release approval from trusted main and bind it to the exact build and tests."""
import json,pathlib,re,subprocess,sys
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*args):return subprocess.check_output(['git',*args],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def check_record(a,repo,meta,build,windows,source_tree,head_tree,digest):
    require(set(a)=={'schema','source_sha','artifact_id','archive_sha','payload_sha','windows_run_id','field_gate','evidence'},'approval fields')
    require(type(a['schema']) is int and a['schema']==1 and a['field_gate'] is True,'explicit field approval required')
    require(re.fullmatch('[a-f0-9]{40}',a['source_sha']) is not None,'source commit')
    require(all(type(a[k]) is int and a[k]>0 for k in ('artifact_id','windows_run_id')),'IDs')
    require(all(isinstance(a[k],str) and re.fullmatch('[a-f0-9]{64}',a[k]) for k in ('archive_sha','payload_sha')),'exact digests')
    e=a['evidence'];require(isinstance(e,dict) and set(e)=={'windows_install','windows_update','windows_rollback','r7_integration'} and all(isinstance(x,str) and x.strip() and len(x)<=2000 for x in e.values()),'field evidence required')
    require(source_tree==head_tree,'source changed after validation')
    require(digest==a['payload_sha'],'candidate rebuild differs from approval')
    require(meta['id']==a['artifact_id'] and meta['name']=='r8-runtime-release-candidate' and not meta['expired'] and meta['digest']=='sha256:'+a['archive_sha'],'artifact identity/digest')
    for run,name in ((build,'R8 source-driven build'),(windows,'R8 native Windows verification')):
        require(run['name']==name and run['head_sha']==a['source_sha'] and run['head_branch']=='main' and run['event']=='push' and run['status']=='completed' and run['conclusion']=='success' and run['repository']['full_name']==repo,'required main-branch checks')
    require(meta['workflow_run']['id']==build['id'] and windows['id']==a['windows_run_id'],'artifact and tests bound to exact run')
if __name__=='__main__':
    import os,tempfile,hashlib
    a=json.loads(pathlib.Path('runtime-src/release-approval.json').read_bytes())
    # Validate input formats before using them in paths or shell commands.
    require(re.fullmatch('[a-f0-9]{40}',a.get('source_sha','')) is not None,'source commit')
    require(all(type(a.get(k)) is int and a[k]>0 for k in ('artifact_id','windows_run_id')),'IDs')
    repo=os.environ['GITHUB_REPOSITORY'];base='repos/'+repo+'/actions/'
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    meta=gh(base+'artifacts/'+str(a['artifact_id']))
    build=gh(base+'runs/'+str(meta['workflow_run']['id']))
    windows=gh(base+'runs/'+str(a['windows_run_id']))
    with tempfile.TemporaryDirectory() as td:
        out=pathlib.Path(td)/'candidate'
        subprocess.run([sys.executable,'tools/r8-publisher/source-build.py','build','runtime-src/system','stable/runtime-v1/latest.json',str(out)],check=True)
        digest=hashlib.sha256((out/'payload.json').read_bytes()).hexdigest()
    check_record(a,repo,meta,build,windows,git('rev-parse',a['source_sha']+':runtime-src/system'),git('rev-parse','HEAD:runtime-src/system'),digest)
    with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:
        for k in ('artifact_id','archive_sha','payload_sha'):f.write(f'{k}={a[k]}\n')
    print('Approved record bound to exact source, successful main build and Windows run. Existing signing environment remains required.')
