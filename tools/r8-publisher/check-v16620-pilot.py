"""Exactly one V1.66.20 owner field-test release. Physical checks remain pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.20\",\"previous_version\":\"1.66.19\",\"previous_payload_sha\":\"ddb0224f5a07c68c118c50232839de115d7c0329ef321e0cbc654303d57baa75\",\"source_sha\":\"48e978bde81fce5cbbf12750b9860e6a589b0d78\",\"review_sha\":\"0d4739e601fd1ed99d77caeb51ba04f0831a1100\",\"offline_fix_sha\":\"b79796ae2129150b365586422a531eb865d8dbf2\",\"offline_review_sha\":\"d45ca86b189180889bee2bb55099465368aeae0b\",\"artifact_id\":14480236848,\"archive_sha\":\"6fc56a86e0c3eb0396048ccb8a39889185aa00403a60ec0dafb502a1727cd112\",\"payload_sha\":\"a721fba41fc32b2a9af678315264b2d6f27a818c3663486b908f08a875779e2f\",\"main_runs\":{\"R8 publisher contract review\":44417509288,\"V1.66.6 browser text contrast\":44417509188,\"Classroom life guided workflow review\":44417509287,\"R8 source-driven build\":44417509240,\"Tournament host bridge review\":44417509410,\"V1.66.9 common badge browser regression\":44417509445,\"V1.66.8 education activities browser regression\":44417509202,\"R8 native Windows verification\":44417509339,\"V1.66.7 theme font shadow and icon regressions\":44417509350,\"R8 native R7 integration checks\":44417509457},\"review_runs\":{\"R8 source-driven build\":44416250403,\"R8 recovery candidate build\":44416250558,\"V1.66.6 browser text contrast\":44416250681,\"R8 native R7 integration checks\":44416250443,\"V1.66.7 theme font shadow and icon regressions\":44416250414,\"Classroom UI2 home and HUD candidate\":44416250408,\"V1.66.9 common badge browser regression\":44416250686,\"Routine integer coin candidate checks\":44416250639,\"V1.66.8 education activities browser regression\":44416250451,\"Tournament host bridge review\":44416250402,\"R8 native Windows verification\":44416250453,\"Classroom UI2 full regression\":44416250525,\"Multimedia candidate browser review\":44416250405},\"offline_run_id\":44417999087,\"offline_review_run_id\":44417869909,\"authorization\":\"Owner explicitly requested operational deployment for own real use after 13/13 automated workflows and 38/38 core browser checks. Physical Google account and school PC remain owner field checks.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16620_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16620-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    for sha in (a['source_sha'],a['offline_fix_sha']):
        subprocess.run(['git','merge-base','--is-ancestor',sha,'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed tree differs from merged main')
    require(git('rev-parse',a['offline_review_sha']+'^{tree}')==git('rev-parse',a['offline_fix_sha']+'^{tree}'),'offline fix review differs from merged main')
    offline={'.github/workflows/r7-presentation-review.yml','tools/r7-presentation/apply-presentation.py','tools/r7-presentation/test-browser.cjs'}
    require(set(git('diff','--name-only',a['source_sha'],a['offline_fix_sha']).splitlines())==offline,'offline-only successor required')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16620-pilot.yml','.github/workflows/r8-v16620-pilot-preflight.yml','tools/r8-publisher/check-v16620-pilot.py','runtime-src/v16620-pilot-approval.json'}
    require(set(git('diff','--name-only',a['offline_fix_sha'],'HEAD').splitlines())<=allowed,'only release approval plumbing can change')
    repo=os.environ['GITHUB_REPOSITORY'];api='repos/'+repo+'/actions/'
    def run(name,rid,sha,event):
        r=gh(api+'runs/'+str(rid))
        require(r['id']==rid and r['name']==name and r['head_sha']==sha and r['event']==event and r['status']=='completed' and r['conclusion']=='success' and r['repository']['full_name']==repo and (event!='push' or r['head_branch']=='main'),'exact required CI: '+name)
    for group,sha,event in [('main_runs',a['source_sha'],'push'),('review_runs',a['review_sha'],'pull_request')]:
        for name,rid in a[group].items():run(name,rid,sha,event)
    run('R7 student presentation review',a['offline_run_id'],a['offline_fix_sha'],'push')
    run('R7 student presentation review',a['offline_review_run_id'],a['offline_review_sha'],'pull_request')
    for name,rid,required in [('Classroom UI2 full regression',a['review_runs']['Classroom UI2 full regression'],8),('Multimedia candidate browser review',a['review_runs']['Multimedia candidate browser review'],2),('R7 offline premerge',a['offline_review_run_id'],2),('R7 offline main',a['offline_run_id'],2)]:
        jobs=gh(api+'runs/'+str(rid)+'/jobs')['jobs']
        require(len(jobs)==required and all(j['conclusion']=='success' for j in jobs),'all jobs required: '+name)
    meta=gh(api+'artifacts/'+str(a['artifact_id']))
    require(meta['id']==a['artifact_id'] and not meta['expired'] and meta['name']=='r8-runtime-release-candidate' and meta['digest']=='sha256:'+a['archive_sha'] and meta['workflow_run']['id']==a['main_runs']['R8 source-driven build'],'exact main candidate required')
    with tempfile.TemporaryDirectory() as td:
        out=pathlib.Path(td)/'candidate'
        subprocess.run([sys.executable,'tools/r8-publisher/source-build.py','build','runtime-src/system','stable/runtime-v1/latest.json',str(out)],check=True)
        raw=(out/'payload.json').read_bytes()
        require(hashlib.sha256(raw).hexdigest()==a['payload_sha'] and json.loads(raw)['version']==a['version'],'exact rebuilt manifest required')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:
            for k in ('artifact_id','archive_sha','payload_sha'):f.write(f'{k}={a[k]}\n')
    print('PASS: exact V1.66.20 owner pilot; 13 candidate + 10 main + 2 corrected offline workflows, prior signed feed verified; physical checks pending.')
if __name__=='__main__':main()
