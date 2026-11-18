"""Exact one-time V1.66.16 owner-field-test rollout. Physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.16\",\"previous_version\":\"1.66.15\",\"previous_payload_sha\":\"58bcc0632f6f9cf3696efb4734f27296514cf9706273671fb3693ca5fdb317f6\",\"source_sha\":\"0fc9a7683f800942056fbfe2e7396d2039071c4b\",\"artifact_id\":14403640897,\"archive_sha\":\"7bc84cd59ab73647e913ec6a2ec278c92e8668b9fa783a4f3b976605f1aa671a\",\"payload_sha\":\"5446c4b63b9a4ddaad14f6f960d10821574d4f3756ee945ca3a28b5dde49ef15\",\"build_run_id\":44249915215,\"windows_run_id\":44249915152,\"integration_run_id\":44249915162,\"visual_run_id\":44249915164,\"contrast_run_id\":44249915198,\"education_run_id\":44249915166,\"badge_run_id\":44249915241,\"tournament_run_id\":44249915232,\"authorization\":\"Owner requested publication after tests pass on 2026-11-18. Native Canva page seek and installed update tested in CI; physical classroom touch, display/audio and field check remain pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16616_owner_field_test_only\",\"multimedia_run_id\":44247531490,\"native_host_run_id\":44247531467,\"review_sha\":\"d5617a1acc1ce2ae9613cf08fab775af75134d65\"}")
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
    a=json.loads(pathlib.Path('runtime-src/v16616-pilot-approval.json').read_bytes())
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
    print('PASS: exact V1.66.16 owner pilot with eight successful main CI runs and native host plus both multimedia browser jobs and signed prior inventory. Physical field checks remain pending.')
if __name__=='__main__':main()
