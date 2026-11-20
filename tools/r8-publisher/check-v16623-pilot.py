"""Exact V1.66.23 owner field-test release; physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.23\",\"previous_version\":\"1.66.22\",\"previous_payload_sha\":\"97347fc0ed55a9e1d3e00ddbad242182307a839a245361b57b651aa4beb66179\",\"source_sha\":\"d8d1c816f697a5c42fee32c783a332f746f0cd04\",\"review_sha\":\"37251b8a760e0b6b8ae20f0d80256cf493c86222\",\"artifact_id\":14499720938,\"archive_sha\":\"4a27ca6a34f9f27e48031b22ce5d3c047f0ab314fe04ced84ca1a8815bfae025\",\"payload_sha\":\"4bd5cd0f2b1d8938d3ce30eb29e1811d73594a596ab2dc216708d772b1d85ec0\",\"main_runs\":{\"Tournament host bridge review\":44459539486,\"R8 source-driven build\":44459539474,\"V1.66.8 education activities browser regression\":44459539456,\"V1.66.7 theme font shadow and icon regressions\":44459539503,\"V1.66.9 common badge browser regression\":44459539389,\"QR square widget and integer fit checks\":44459539546,\"R8 native R7 integration checks\":44459539378,\"V1.66.6 browser text contrast\":44459539450,\"R8 native Windows verification\":44459539447},\"review_runs\":{\"V1.66.9 common badge browser regression\":44450390000,\"Routine integer coin candidate checks\":44450390075,\"V1.66.8 education activities browser regression\":44450390119,\"Tournament host bridge review\":44450390153,\"V1.66.6 browser text contrast\":44450390027,\"R8 source-driven build\":44450390001,\"Daily lesson alert mute checks\":44450389984,\"R8 native R7 integration checks\":44450390021,\"V1.66.7 theme font shadow and icon regressions\":44450389967,\"Multimedia candidate browser review\":44450390160,\"QR square widget and integer fit checks\":44450389988,\"R8 native Windows verification\":44450390118,\"Classroom UI2 home and HUD candidate\":44450390033},\"authorization\":\"Owner explicitly requested deployment of tested V1.66.23 QR/timetable candidate; physical school PC verification remains pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16623_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16623-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16623-pilot.yml','.github/workflows/r8-v16623-pilot-preflight.yml','tools/r8-publisher/check-v16623-pilot.py','runtime-src/v16623-pilot-approval.json'}
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
    print('PASS: exact V1.66.23 owner pilot; 13 review and 9 main CI runs; physical checks pending.')
if __name__=='__main__':main()
