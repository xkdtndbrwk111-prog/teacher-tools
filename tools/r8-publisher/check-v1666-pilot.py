"""Exact one-time owner-field-test rollout of 1.66.6. Physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.6\",\"previous_version\":\"1.66.5\",\"previous_payload_sha\":\"c3d60c5401579adc3d1e5500979c7a3ef2cc1c827e3ed8a76965fd1c4b89e0d6\",\"source_sha\":\"d37f28949f2377e4bf0b7c3be1c5063f6ff8237f\",\"artifact_id\":14307406730,\"archive_sha\":\"0f9ef84d6d60a9972857710abdf450b2cb95b33d86cb96229a74ff6d28c7c8ef\",\"payload_sha\":\"49152598c67a70055afe007c9aeeb22106839bd8101bdd56dbac38b6a84f4365\",\"build_run_id\":44035880380,\"windows_run_id\":44035880161,\"integration_run_id\":44035880155,\"contract_run_id\":44035880112,\"contrast_run_id\":44035880183,\"authorization\":\"Owner requested V1.66.6 publication in the 2026-11-17 conversation after being informed that physical classroom visual checks and publication remain pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v1666_owner_field_test_only\"}")
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
    a=json.loads(pathlib.Path('runtime-src/v1666-pilot-approval.json').read_bytes())
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    verify_record(a,old)
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['source_sha']+':runtime-src/system')==git('rev-parse','HEAD:runtime-src/system'),'runtime source changed')
    repo=os.environ['GITHUB_REPOSITORY'];api='repos/'+repo+'/actions/'
    meta=gh(api+'artifacts/'+str(a['artifact_id']))
    require(meta['id']==a['artifact_id'] and not meta['expired'] and meta['name']=='r8-runtime-release-candidate' and meta['digest']=='sha256:'+a['archive_sha'] and meta['workflow_run']['id']==a['build_run_id'],'exact signed candidate identity')
    for key,name in [('build_run_id','R8 source-driven build'),('windows_run_id','R8 native Windows verification'),('integration_run_id','R8 native R7 integration checks'),('contract_run_id','R8 publisher contract review'),('contrast_run_id','V1.66.6 browser text contrast')]:
        verify_run(gh(api+'runs/'+str(a[key])),a[key],name,repo)
    with tempfile.TemporaryDirectory() as td:
        out=pathlib.Path(td)/'candidate'
        subprocess.run([sys.executable,'tools/r8-publisher/source-build.py','build','runtime-src/system','stable/runtime-v1/latest.json',str(out)],check=True)
        raw=(out/'payload.json').read_bytes()
        require(hashlib.sha256(raw).hexdigest()==a['payload_sha'] and json.loads(raw)['version']==a['version'],'exact rebuilt manifest required')
    with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:
        for k in ('artifact_id','archive_sha','payload_sha'):f.write(f'{k}={a[k]}\n')
    print('PASS: exact V1.66.6 owner pilot with five successful main CI runs and signed prior inventory. Physical field checks remain pending.')
if __name__=='__main__':main()
