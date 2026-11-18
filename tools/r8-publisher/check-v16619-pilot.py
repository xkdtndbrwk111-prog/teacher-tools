"""Exact one-time V1.66.19 owner-field-test rollout. Physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.19\",\"previous_version\":\"1.66.18\",\"previous_payload_sha\":\"4167fd818783a9b8ba3005a019415e62c78f3533ce22bdc22d39bb708fe38810\",\"source_sha\":\"0347de465c66984811e85b0a80a9bd6e32934a2c\",\"artifact_id\":14424200033,\"archive_sha\":\"866fe0b6302939105cac0c93c28fb49611f6f5e05d7082cf10f48ccd3c54733c\",\"payload_sha\":\"ddb0224f5a07c68c118c50232839de115d7c0329ef321e0cbc654303d57baa75\",\"build_run_id\":44295404578,\"windows_run_id\":44295404680,\"integration_run_id\":44295404712,\"visual_run_id\":44295404937,\"contrast_run_id\":44295404725,\"education_run_id\":44295404628,\"badge_run_id\":44295404629,\"tournament_run_id\":44295636621,\"authorization\":\"Owner requested deployment after integer coin and routine development. Main and candidate automated checks passed, including live V4 game capability; classroom touch, real-data migration and routine game interruption remain owner field checks.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16619_owner_field_test_only\",\"multimedia_run_id\":44295162792,\"review_sha\":\"f6ee4e8411be7925abed589b793d5ebf1cd0d21a\",\"tournament_sha\":\"e68a15922b08a7465663abbe393dd6344366b157\",\"classroom_run_id\":44295404758,\"publisher_run_id\":44295404897,\"routine_run_id\":44295162884}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def verify_record(a,old):
    require(a==EXPECTED and type(a['field_gate']) is bool and a['field_gate'] is False,'exact owner pilot only; field checks not passed')
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed required; no replay')
def verify_run(run,rid,name,repo):
    require(run['id']==rid and run['name']==name and run['head_sha']==(EXPECTED['tournament_sha'] if name=='Tournament host bridge review' else EXPECTED['source_sha']) and run['head_branch']=='main' and run['event']=='push' and run['status']=='completed' and run['conclusion']=='success' and run['repository']['full_name']==repo,'required exact main check: '+name)
def main():
    a=json.loads(pathlib.Path('runtime-src/v16619-pilot-approval.json').read_bytes())
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    verify_record(a,old)
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['source_sha']+':runtime-src/system')==git('rev-parse','HEAD:runtime-src/system'),'runtime source changed')
    subprocess.run(['git','merge-base','--is-ancestor',a['tournament_sha'],'HEAD'],check=True)
    require(set(git('diff','--name-only',a['source_sha'],a['tournament_sha']).splitlines())=={'.github/workflows/tournament-bridge-review.yml','tools/tournament-bridge/test.cjs'},'tournament successor must be test-only')
    require(git('rev-parse',a['tournament_sha']+':runtime-src/system')==git('rev-parse',a['source_sha']+':runtime-src/system'),'runtime changed in test-only successor')
    repo=os.environ['GITHUB_REPOSITORY'];api='repos/'+repo+'/actions/'
    meta=gh(api+'artifacts/'+str(a['artifact_id']))
    require(meta['id']==a['artifact_id'] and not meta['expired'] and meta['name']=='r8-runtime-release-candidate' and meta['digest']=='sha256:'+a['archive_sha'] and meta['workflow_run']['id']==a['build_run_id'],'exact signed candidate identity')
    for key,name in [('build_run_id','R8 source-driven build'),('windows_run_id','R8 native Windows verification'),('integration_run_id','R8 native R7 integration checks'),('visual_run_id','V1.66.7 theme font shadow and icon regressions'),('contrast_run_id','V1.66.6 browser text contrast'),('education_run_id','V1.66.8 education activities browser regression'),('badge_run_id','V1.66.9 common badge browser regression'),('tournament_run_id','Tournament host bridge review'),('classroom_run_id','Classroom life guided workflow review'),('publisher_run_id','R8 publisher contract review')]:
        verify_run(gh(api+'runs/'+str(a[key])),a[key],name,repo)
    for key,name in [('multimedia_run_id','Multimedia candidate browser review'),('routine_run_id','Routine integer coin candidate checks')]:
        run=gh(api+'runs/'+str(a[key]))
        require(run['id']==a[key] and run['name']==name and run['head_sha']==a['review_sha'] and run['event']=='pull_request' and run['status']=='completed' and run['conclusion']=='success' and run['repository']['full_name']==repo,'required exact candidate check: '+name)
    for path in ('runtime-src/system','tools/multimedia','tools/r8-publisher/test-native-launch.ps1','tools/routine','classroom/host/dashboard-link.js'):
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
    print('PASS: exact V1.66.19 owner pilot with ten successful main CI runs and routine plus both multimedia browser jobs and signed prior inventory. Physical field checks remain pending.')
if __name__=='__main__':main()
