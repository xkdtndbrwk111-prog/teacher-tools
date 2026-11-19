"""Exact V1.66.21 owner field-test release; physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.21\",\"previous_version\":\"1.66.20\",\"previous_payload_sha\":\"a721fba41fc32b2a9af678315264b2d6f27a818c3663486b908f08a875779e2f\",\"source_sha\":\"ce51fc8dd6c4a40fff4f5dd7e8b205b87e175e41\",\"review_sha\":\"75b39933bc12a66d376a5ccd837ef2a2b196a4d1\",\"artifact_id\":14485606792,\"archive_sha\":\"420f643d9a7a931fd19ab15b4b37d2795a8349debe791a04d6afab33ab152edf\",\"payload_sha\":\"7a654488a5cdb9905a11220cbf1b281e25749c45b7b00b2554c3089f67e0fa5d\",\"main_runs\":{\"R8 source-driven build\":44429055365,\"R8 native Windows verification\":44429055008,\"R8 native R7 integration checks\":44429055012,\"Tournament host bridge review\":44429054977,\"V1.66.6 browser text contrast\":44429055492,\"V1.66.7 theme font shadow and icon regressions\":44429054969,\"V1.66.8 education activities browser regression\":44429054952,\"V1.66.9 common badge browser regression\":44429055117},\"review_runs\":{\"Tournament host bridge review\":44428613174,\"Routine integer coin candidate checks\":44428613213,\"R8 source-driven build\":44428613082,\"V1.66.8 education activities browser regression\":44428612909,\"Classroom UI2 home and HUD candidate\":44428612938,\"V1.66.7 theme font shadow and icon regressions\":44428612978,\"V1.66.9 common badge browser regression\":44428612966,\"R8 native R7 integration checks\":44428612908,\"V1.66.6 browser text contrast\":44428613117,\"R8 native Windows verification\":44428612894,\"Multimedia candidate browser review\":44428613095},\"authorization\":\"Owner requested deployment after automated tests passed; physical school PC verification remains pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16621_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16621-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16621-pilot.yml','.github/workflows/r8-v16621-pilot-preflight.yml','tools/r8-publisher/check-v16621-pilot.py','runtime-src/v16621-pilot-approval.json'}
    require(set(git('diff','--name-only',a['source_sha'],'HEAD').splitlines())<=allowed,'only release approval plumbing can change')
    repo=os.environ['GITHUB_REPOSITORY'];api='repos/'+repo+'/actions/'
    for group,sha,event in [('main_runs',a['source_sha'],'push'),('review_runs',a['review_sha'],'pull_request')]:
        for name,rid in a[group].items():
            r=gh(api+'runs/'+str(rid))
            require(r['id']==rid and r['name']==name and r['head_sha']==sha and r['event']==event and r['status']=='completed' and r['conclusion']=='success' and r['repository']['full_name']==repo and (event!='push' or r['head_branch']=='main'),'exact required CI: '+name)
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
    print('PASS: exact V1.66.21 owner pilot; 11 review and 8 main CI runs; physical checks pending.')
if __name__=='__main__':main()
