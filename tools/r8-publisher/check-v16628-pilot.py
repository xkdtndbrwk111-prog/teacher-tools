"""Immutable V1.66.28 book-reader owner-pilot approval; physical field test remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.28\",\"previous_version\":\"1.66.27\",\"previous_payload_sha\":\"d8a02387e2007ea73dd923e5284ac967a6ba79484f79926b7c1f9cbceb7c3e84\",\"source_sha\":\"49bfb43af1e9b0f091310c6b45fdaecfdacc9701\",\"review_sha\":\"1eae9ae831741c4f23b8c73532312b63c5a5fef3\",\"artifact_id\":14778058468,\"archive_sha\":\"e3e8db92fc12f2bc0d001d90e0376ff7649798078458499f6b94fd3e90daadc3\",\"payload_sha\":\"ef5e9e28f0bfcda8406930d4466a6c244774498ead89b1e85fdd8d30a1dc31a3\",\"main_runs\":{\"R8 source-driven build\":45084334209,\"R8 native Windows verification\":45084334166,\"R8 native R7 integration checks\":45084334158,\"V1.66.6 browser text contrast\":45084334154,\"V1.66.7 theme font shadow and icon regressions\":45084334442,\"V1.66.8 education activities browser regression\":45084334332,\"V1.66.9 common badge browser regression\":45084334184,\"Tournament host bridge review\":45084334221,\"QR square widget and integer fit checks\":45084334187},\"review_runs\":{\"R8 source-driven build\":45083901052,\"R8 native Windows verification\":45083901250,\"R8 native R7 integration checks\":45083901125,\"Multimedia candidate browser review\":45083901271,\"V1.66.6 browser text contrast\":45083901087,\"V1.66.7 theme font shadow and icon regressions\":45083901141,\"V1.66.8 education activities browser regression\":45083901084,\"V1.66.9 common badge browser regression\":45083901137,\"Tournament host bridge review\":45083901060,\"QR square widget and integer fit checks\":45083901054,\"Classroom UI2 home and HUD candidate\":45083901055,\"Daily lesson alert mute checks\":45083901368,\"Routine integer coin candidate checks\":45083901321},\"authorization\":\"Owner explicitly requested V1.66.28 deployment after relevant automated checks passed. Physical classroom Windows/Canva validation remains pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16628_book_reader_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16628-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed source tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16628-pilot.yml','.github/workflows/r8-v16628-pilot-preflight.yml','tools/r8-publisher/check-v16628-pilot.py','runtime-src/v16628-pilot-approval.json'}
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
    print('PASS: exact V1.66.28 owner pilot; 13 review and 9 main CI runs; physical field checks pending.')
if __name__=='__main__':main()
