"""Immutable V1.66.30 Almond interactive Canva link owner-pilot approval; physical field test remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.30\",\"previous_version\":\"1.66.29\",\"previous_payload_sha\":\"7b385c67267aa1901980d74257e4827b2f1aba9d5e24ecd231068e3bfb3adabc\",\"source_sha\":\"84e8fbbf26f00d96c8ea618f851d0838cb638971\",\"review_sha\":\"9dce9b4a9af1d1463b432007d88a4079ad2b5992\",\"artifact_id\":14782570435,\"archive_sha\":\"053aef738fccb008aa98344101a88f9e86ea279e8a0027aef80fa25d0c65fea5\",\"payload_sha\":\"3e699f9942e96f9b331b33ee8b810d2edbfa2832ef3c257de0468df349d22c42\",\"main_runs\":{\"R8 source-driven build\":45092761553,\"R8 native Windows verification\":45092761637,\"R8 native R7 integration checks\":45092761554,\"V1.66.6 browser text contrast\":45092761578,\"V1.66.7 theme font shadow and icon regressions\":45092761533,\"V1.66.8 education activities browser regression\":45092761543,\"V1.66.9 common badge browser regression\":45092761602,\"Tournament host bridge review\":45092761608,\"QR square widget and integer fit checks\":45092761547},\"review_runs\":{\"Multimedia candidate browser review\":45092601211,\"R8 source-driven build\":45092601340,\"R8 native Windows verification\":45092601207,\"R8 native R7 integration checks\":45092601204,\"Classroom UI2 home and HUD candidate\":45092601222,\"Daily lesson alert mute checks\":45092601209,\"Routine integer coin candidate checks\":45092601330,\"Tournament host bridge review\":45092601205,\"QR square widget and integer fit checks\":45092601304,\"V1.66.6 browser text contrast\":45092601396,\"V1.66.7 theme font shadow and icon regressions\":45092601302,\"V1.66.8 education activities browser regression\":45092601255,\"V1.66.9 common badge browser regression\":45092601298},\"authorization\":\"Owner requested changing the current Almond book to a new Canva click-animation share link; post-CI signed owner-field-test publication requested in the ongoing HOJA release workflow. Physical school-PC Canva interaction remains unverified.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16630_almond_canva_click_share_link_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16630-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed source tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16630-pilot.yml','.github/workflows/r8-v16630-pilot-preflight.yml','tools/r8-publisher/check-v16630-pilot.py','runtime-src/v16630-pilot-approval.json'}
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
    print('PASS: exact V1.66.30 owner pilot; 13 review and 9 main CI runs; physical field checks pending.')
if __name__=='__main__':main()
