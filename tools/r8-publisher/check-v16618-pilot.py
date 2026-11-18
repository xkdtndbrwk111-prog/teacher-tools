"""Exact one-time V1.66.18 owner-field-test rollout. Physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.18\",\"previous_version\":\"1.66.17\",\"previous_payload_sha\":\"e088993947537cd9ba3f1f030649138f025a9dff10a362edefd757411d28700a\",\"source_sha\":\"05a1ece1d6ce3506d561c2f77f28d9b4b333f631\",\"artifact_id\":14418878921,\"archive_sha\":\"cd83d79b26460f912847d794b1de25f1e7633364a94e0ab8e9397fe94d9f78e6\",\"payload_sha\":\"4167fd818783a9b8ba3005a019415e62c78f3533ce22bdc22d39bb708fe38810\",\"build_run_id\":44286352143,\"windows_run_id\":44286352258,\"integration_run_id\":44286352152,\"visual_run_id\":44286352106,\"contrast_run_id\":44286352222,\"education_run_id\":44286352278,\"badge_run_id\":44286352367,\"tournament_run_id\":44286352171,\"authorization\":\"Owner explicitly requested deployment on 2026-11-18 after all candidate CI and repeated actual Windows Canva immersive navigation, controls and bookmark tests passed. Physical classroom touch/display field check remains pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16618_owner_field_test_only\",\"multimedia_run_id\":44263137801,\"native_host_run_id\":44263138002,\"review_sha\":\"c7d4615a8a3e82e50ce6422ca7f5b8d0405a3649\"}")
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
    a=json.loads(pathlib.Path('runtime-src/v16618-pilot-approval.json').read_bytes())
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    verify_record(a,old)
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['source_sha']+':runtime-src/system')==git('rev-parse','HEAD:runtime-src/system'),'runtime source changed')
    repo=os.environ['GITHUB_REPOSITORY'];api='repos/'+repo+'/actions/'
    meta=gh(api+'artifacts/'+str(a['artifact_id']))
    require(meta['id']==a['artifact_id'] and not meta['expired'] and meta['name']=='r8-runtime-release-candidate' and meta['digest']=='sha256:'+a['archive_sha'] and meta['workflow_run']['id']==a['build_run_id'],'exact signed candidate identity')
    for key,name in [('build_run_id','R8 source-driven build'),('windows_run_id','R8 native Windows verification'),('integration_run_id','R8 native R7 integration checks'),('visual_run_id','V1.66.7 theme font shadow and icon regressions'),('contrast_run_id','V1.66.6 browser text contrast'),('education_run_id','V1.66.8 education activities browser regression'),('badge_run_id','V1.66.9 common badge browser regression'),('tournament_run_id','Tournament host bridge review')]:
        verify_run(gh(api+'runs/'+str(a[key])),a[key],name,repo)
    for key,name in [('multimedia_run_id','Multimedia candidate browser review'),('native_host_run_id','Book reader native host build and fixture')]:
        run=gh(api+'runs/'+str(a[key]))
        require(run['id']==a[key] and run['name']==name and run['head_sha']==a['review_sha'] and run['event']=='pull_request' and run['status']=='completed' and run['conclusion']=='success' and run['repository']['full_name']==repo,'required exact candidate check: '+name)
    for path in ('runtime-src/system','tools/multimedia','tools/r8-publisher/test-native-launch.ps1'):
        require(git('rev-parse',a['review_sha']+':'+path)==git('rev-parse',a['source_sha']+':'+path),'reviewed source differs: '+path)
    jobs=gh(api+'runs/'+str(a['multimedia_run_id'])+'/jobs')['jobs']
    require({j['name'] for j in jobs if j['conclusion']=='success'} >= {'browser','windows-browser'},'both multimedia browser jobs required')
    with tempfile.TemporaryDirectory() as td:
        out=pathlib.Path(td)/'candidate'
        subprocess.run([sys.executable,'tools/r8-publisher/source-build.py','build','runtime-src/system','stable/runtime-v1/latest.json',str(out)],check=True)
        raw=(out/'payload.json').read_bytes()
        require(hashlib.sha256(raw).hexdigest()==a['payload_sha'] and json.loads(raw)['version']==a['version'],'exact rebuilt manifest required')
    with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:
        for k in ('artifact_id','archive_sha','payload_sha'):f.write(f'{k}={a[k]}\n')
    print('PASS: exact V1.66.18 owner pilot with eight successful main CI runs and native host plus both multimedia browser jobs and signed prior inventory. Physical field checks remain pending.')
if __name__=='__main__':main()
