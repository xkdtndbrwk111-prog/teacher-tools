"""Exact V1.66.26 owner field-test release; physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.26\",\"previous_version\":\"1.66.25\",\"previous_payload_sha\":\"598b0d3271b26b81ef2caff2c354a010c236347693856a28504cdd2f9e4e25e5\",\"source_sha\":\"dc3096a7702ccc5448bc9a8bb8dc2d11ecc59df2\",\"review_sha\":\"6a4935a6e6a6c3a0d8914109b930ccd479dd71e1\",\"artifact_id\":14611253454,\"archive_sha\":\"5e21c6ab4727e6da8f4283ad92888f7aab4d6ebc0c9c297be3d9bea296d6b236\",\"payload_sha\":\"28c3fce54deca82732e0c3c53ce778a1483159e9b16b76115ab59ffd06fae118\",\"main_runs\":{\"V1.66.7 theme font shadow and icon regressions\":44698444005,\"Tournament host bridge review\":44698444001,\"QR square widget and integer fit checks\":44698444067,\"R8 native Windows verification\":44698444080,\"R8 native R7 integration checks\":44698444072,\"V1.66.8 education activities browser regression\":44698444053,\"V1.66.9 common badge browser regression\":44698444063,\"V1.66.6 browser text contrast\":44698444097,\"R8 source-driven build\":44698444043},\"review_runs\":{\"V1.66.8 education activities browser regression\":44696397423,\"R8 native R7 integration checks\":44696397448,\"QR square widget and integer fit checks\":44696397225,\"R8 source-driven build\":44696397389,\"R8 native Windows verification\":44696397406,\"V1.66.6 browser text contrast\":44696397426,\"V1.66.7 theme font shadow and icon regressions\":44696397367,\"V1.66.9 common badge browser regression\":44696397497,\"Tournament host bridge review\":44696397351,\"Classroom UI2 home and HUD candidate\":44696397363,\"Routine integer coin candidate checks\":44696397354,\"Daily lesson alert mute checks\":44696397521,\"YouTube engine isolated Windows smoke\":44696397317,\"Multimedia candidate browser review\":44696397347},\"authorization\":\"Owner explicitly authorized V1.66.26 deployment after all required CI checks. Actual classroom Windows video playback and field checks remain pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16626_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16626-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16626-pilot.yml','.github/workflows/r8-v16626-pilot-preflight.yml','tools/r8-publisher/check-v16626-pilot.py','runtime-src/v16626-pilot-approval.json'}
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
    print('PASS: exact V1.66.26 owner pilot; 14 review and 9 main CI runs; physical checks pending.')
if __name__=='__main__':main()
