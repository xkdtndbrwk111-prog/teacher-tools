"""Exact one-time V1.66.10 owner-field-test rollout. Physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.10\",\"previous_version\":\"1.66.9\",\"previous_payload_sha\":\"20047d60796719d183f95e9728f21af8621a5a7ebd027fea30febc885b9b2300\",\"source_sha\":\"a10a0de5adfe527abf95af5146d5bce0fcb548b3\",\"artifact_id\":14340700130,\"archive_sha\":\"622e3dcb04f21bff0615864489f8a46074d2e65aa5ce5152d96ebfce46ba57c3\",\"payload_sha\":\"76fce63f4c0c8399ccde0c1b009019a56da60b0f31289dbb2391055ea5ae4850\",\"build_run_id\":44108993509,\"windows_run_id\":44108992017,\"integration_run_id\":44108992515,\"visual_run_id\":44108991707,\"contrast_run_id\":44108991800,\"education_run_id\":44108992000,\"badge_run_id\":44108991961,\"multimedia_run_id\":44106342762,\"multimedia_pr_sha\":\"a8e363c9ec71d384751aee1193ecb1fb1a751bf9\",\"authorization\":\"Owner explicitly requested V1.66.10 multimedia deployment, 2026-11-17; actual classroom external playback and field checks remain pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16610_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def verify_record(a,old):
    require(a==EXPECTED and type(a['field_gate']) is bool and a['field_gate'] is False,'exact owner pilot only; field checks not passed')
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed required; no replay')
def verify_run(run,rid,name,repo):
    require(run['id']==rid and run['name']==name and run['head_sha']==EXPECTED['source_sha'] and run['head_branch']=='main' and run['event']=='push' and run['status']=='completed' and run['conclusion']=='success' and run['repository']['full_name']==repo,'required exact main check: '+name)
def main():
    a=json.loads(pathlib.Path('runtime-src/v16610-pilot-approval.json').read_bytes())
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    verify_record(a,old)
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['source_sha']+':runtime-src/system')==git('rev-parse','HEAD:runtime-src/system'),'runtime source changed')
    repo=os.environ['GITHUB_REPOSITORY'];api='repos/'+repo+'/actions/'
    meta=gh(api+'artifacts/'+str(a['artifact_id']))
    require(meta['id']==a['artifact_id'] and not meta['expired'] and meta['name']=='r8-runtime-release-candidate' and meta['digest']=='sha256:'+a['archive_sha'] and meta['workflow_run']['id']==a['build_run_id'],'exact signed candidate identity')
    for key,name in [('build_run_id','R8 source-driven build'),('windows_run_id','R8 native Windows verification'),('integration_run_id','R8 native R7 integration checks'),('visual_run_id','V1.66.7 theme font shadow and icon regressions'),('contrast_run_id','V1.66.6 browser text contrast'),('education_run_id','V1.66.8 education activities browser regression'),('badge_run_id','V1.66.9 common badge browser regression')]:
        verify_run(gh(api+'runs/'+str(a[key])),a[key],name,repo)
    mm=gh(api+'runs/'+str(a['multimedia_run_id']))
    require(mm['name']=='Multimedia candidate browser review' and mm['head_sha']==a['multimedia_pr_sha'] and mm['event']=='pull_request' and mm['status']=='completed' and mm['conclusion']=='success' and mm['repository']['full_name']==repo,'multimedia PR regression')
    require(git('rev-parse',a['multimedia_pr_sha']+':runtime-src/system')==git('rev-parse',a['source_sha']+':runtime-src/system'),'multimedia tested runtime differs')
    require(git('rev-parse',a['multimedia_pr_sha']+':tools/multimedia')==git('rev-parse',a['source_sha']+':tools/multimedia'),'multimedia regression source differs')
    jobs=gh(api+'runs/'+str(a['multimedia_run_id'])+'/jobs')['jobs']
    require({j['name'] for j in jobs if j['conclusion']=='success'} >= {'browser','windows-browser'},'both multimedia browser jobs required')
    with tempfile.TemporaryDirectory() as td:
        out=pathlib.Path(td)/'candidate'
        subprocess.run([sys.executable,'tools/r8-publisher/source-build.py','build','runtime-src/system','stable/runtime-v1/latest.json',str(out)],check=True)
        raw=(out/'payload.json').read_bytes()
        require(hashlib.sha256(raw).hexdigest()==a['payload_sha'] and json.loads(raw)['version']==a['version'],'exact rebuilt manifest required')
    with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:
        for k in ('artifact_id','archive_sha','payload_sha'):f.write(f'{k}={a[k]}\n')
    print('PASS: exact V1.66.10 owner pilot with seven successful main CI runs plus both multimedia browser jobs and signed prior inventory. Physical field checks remain pending.')
if __name__=='__main__':main()
