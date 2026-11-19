"""Exact V1.66.22 owner field-test release; physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.22\",\"previous_version\":\"1.66.21\",\"previous_payload_sha\":\"7a654488a5cdb9905a11220cbf1b281e25749c45b7b00b2554c3089f67e0fa5d\",\"source_sha\":\"6a11153c114fa29636f3a7bc65d3a8d73ecf581f\",\"review_sha\":\"98ec16507bea0a28f4a7c6bbffdf279e053caf20\",\"artifact_id\":14490605966,\"archive_sha\":\"8a9788e65660155f82839c650f08abf7ad5d8ea9f1b33a44193975ca63136747\",\"payload_sha\":\"97347fc0ed55a9e1d3e00ddbad242182307a839a245361b57b651aa4beb66179\",\"main_runs\":{\"R8 source-driven build\":44439229043,\"R8 native Windows verification\":44439229145,\"R8 native R7 integration checks\":44439229086,\"Tournament host bridge review\":44439229036,\"V1.66.6 browser text contrast\":44439229037,\"V1.66.7 theme font shadow and icon regressions\":44439229008,\"V1.66.8 education activities browser regression\":44439228975,\"V1.66.9 common badge browser regression\":44439228980},\"review_runs\":{\"Routine integer coin candidate checks\":44434134099,\"R8 source-driven build\":44434134273,\"R8 native Windows verification\":44434134471,\"V1.66.7 theme font shadow and icon regressions\":44434134222,\"Tournament host bridge review\":44434134032,\"Daily lesson alert mute checks\":44434134006,\"Classroom UI2 home and HUD candidate\":44434134093,\"Multimedia candidate browser review\":44434134025,\"V1.66.6 browser text contrast\":44434134098,\"V1.66.9 common badge browser regression\":44434134094,\"V1.66.8 education activities browser regression\":44434134012,\"R8 native R7 integration checks\":44434134023},\"authorization\":\"Owner requested deployment after automated tests pass; physical school PC verification remains pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16622_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16622-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16622-pilot.yml','.github/workflows/r8-v16622-pilot-preflight.yml','tools/r8-publisher/check-v16622-pilot.py','runtime-src/v16622-pilot-approval.json'}
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
    print('PASS: exact V1.66.22 owner pilot; 12 review and 8 main CI runs; physical checks pending.')
if __name__=='__main__':main()
