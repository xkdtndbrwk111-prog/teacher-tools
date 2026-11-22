"""Immutable V1.66.27 owner-pilot approval; physical field test remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.27\",\"previous_version\":\"1.66.26\",\"previous_payload_sha\":\"28c3fce54deca82732e0c3c53ce778a1483159e9b16b76115ab59ffd06fae118\",\"source_sha\":\"a9165285973f9ae73548ba435a706fe5b0812b62\",\"review_sha\":\"a84aa3ae7c67b75f474a77f936b156efb8930754\",\"artifact_id\":14744528741,\"archive_sha\":\"f40b94f3dcccd6a97636da7c16651be8a5eda8cc3ddd50f5df08cdee5dafb553\",\"payload_sha\":\"d8a02387e2007ea73dd923e5284ac967a6ba79484f79926b7c1f9cbceb7c3e84\",\"main_runs\":{\"V1.66.7 theme font shadow and icon regressions\":44999395322,\"R8 native R7 integration checks\":44999395263,\"V1.66.6 browser text contrast\":44999395239,\"R8 native Windows verification\":44999395220,\"Tournament host bridge review\":44999395206,\"QR square widget and integer fit checks\":44999395165,\"R8 publisher contract review\":44999395160,\"R8 source-driven build\":44999395134,\"V1.66.9 common badge browser regression\":44999395133,\"V1.66.8 education activities browser regression\":44999395130},\"review_runs\":{\"V1.66.6 browser text contrast\":44999282679,\"Book reader native host build and fixture\":44999282653,\"V1.66.7 theme font shadow and icon regressions\":44999282644,\"R8 recovery candidate build\":44999282639,\"V1.66.8 education activities browser regression\":44999282612,\"Multimedia candidate browser review\":44999282542,\"YouTube engine isolated Windows smoke\":44999282537,\"R8 native Windows verification\":44999282536,\"R8 source-driven build\":44999282518,\"Routine integer coin candidate checks\":44999282513,\"R8 native R7 integration checks\":44999282503,\"Classroom UI2 home and HUD candidate\":44999282502,\"Tournament host bridge review\":44999282499,\"QR square widget and integer fit checks\":44999282497,\"Daily lesson alert mute checks\":44999282496,\"V1.66.9 common badge browser regression\":44999282491},\"authorization\":\"Owner explicitly authorized V1.66.27 deployment after required CI verification. Physical classroom Windows verification remains pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16627_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16627-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed source tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16627-pilot.yml','.github/workflows/r8-v16627-pilot-preflight.yml','tools/r8-publisher/check-v16627-pilot.py','runtime-src/v16627-pilot-approval.json'}
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
    print('PASS: exact V1.66.27 owner pilot; 16 review and 10 main CI runs; physical field checks pending.')
if __name__=='__main__':main()
