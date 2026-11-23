"""Immutable V1.66.31 Almond minimal toolbar owner-pilot approval; physical field test remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.31\",\"previous_version\":\"1.66.30\",\"previous_payload_sha\":\"3e699f9942e96f9b331b33ee8b810d2edbfa2832ef3c257de0468df349d22c42\",\"source_sha\":\"143305fe943aeaf53fefc1222f90a571eb1c46e8\",\"review_sha\":\"af19a29d892814de38e128e582f1743128fc7ab4\",\"artifact_id\":14782887220,\"archive_sha\":\"bcf92372865558651f0b7b08c12b9bbb625c9c19835a189f193629407aa1c13c\",\"payload_sha\":\"3597585986a2758ee143523da2a9bc635e3cdbe42ed947c0952e387534865b55\",\"main_runs\":{\"R8 source-driven build\":45094569500,\"R8 native Windows verification\":45094569438,\"R8 native R7 integration checks\":45094569469,\"V1.66.6 browser text contrast\":45094569501,\"V1.66.7 theme font shadow and icon regressions\":45094569443,\"V1.66.8 education activities browser regression\":45094569545,\"V1.66.9 common badge browser regression\":45094569754,\"Tournament host bridge review\":45094569482,\"QR square widget and integer fit checks\":45094569460},\"review_runs\":{\"Multimedia candidate browser review\":45094395509,\"R8 source-driven build\":45094395510,\"R8 native Windows verification\":45094395401,\"R8 native R7 integration checks\":45094395417,\"Classroom UI2 home and HUD candidate\":45094395435,\"Daily lesson alert mute checks\":45094395377,\"Routine integer coin candidate checks\":45094395413,\"Tournament host bridge review\":45094395379,\"QR square widget and integer fit checks\":45094395427,\"V1.66.6 browser text contrast\":45094395425,\"V1.66.7 theme font shadow and icon regressions\":45094395475,\"V1.66.8 education activities browser regression\":45094395621,\"V1.66.9 common badge browser regression\":45094395442},\"authorization\":\"Owner directly requested removing the redundant book controls and status text while preserving the working Canva click-animation launch. Exact reviewed 1.66.31 candidate allowed for signed owner-field-test publication after CI; physical school device remains pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16631_almond_direct_popup_minimal_five_control_bar_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16631-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed source tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16631-pilot.yml','.github/workflows/r8-v16631-pilot-preflight.yml','tools/r8-publisher/check-v16631-pilot.py','runtime-src/v16631-pilot-approval.json'}
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
    print('PASS: exact V1.66.31 owner pilot; 13 review and 9 main CI runs; physical field checks pending.')
if __name__=='__main__':main()
