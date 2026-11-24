"""Immutable, exact-source R8 V1.66.34 Almond native owner-field-test approval."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.34\",\"previous_version\":\"1.66.33\",\"previous_payload_sha\":\"ad2164eb3148868fbdaea01f9c7ede3adb423a93e87827f7d1621c2bd25af09d\",\"source_sha\":\"70df87a6e212c97d4b32d245d6fd6a23487575a6\",\"review_sha\":\"030be120932caf5d92b1180b798c366b65ecff33\",\"artifact_id\":14874726948,\"archive_sha\":\"5e1dbe8635b0b754c4b4974dcaf768e494cf17bdd48528c4901587c0a16983a5\",\"payload_sha\":\"087f34201283a89a294ca92ed8fcd0b12cb1db92cf7871953560be98972d4fde\",\"main_runs\":{\"Tournament host bridge review\":45292408020,\"R8 source-driven build\":45292408307,\"V1.66.8 education activities browser regression\":45292408125,\"V1.66.6 browser text contrast\":45292408002,\"V1.66.9 common badge browser regression\":45292408079,\"QR square widget and integer fit checks\":45292408023,\"R8 native R7 integration checks\":45292408073,\"V1.66.7 theme font shadow and icon regressions\":45292408115,\"R8 native Windows verification\":45292408080},\"review_runs\":{\"QR square widget and integer fit checks\":45292108054,\"Tournament host bridge review\":45292108147,\"V1.66.7 theme font shadow and icon regressions\":45292108035,\"Classroom UI2 home and HUD candidate\":45292108292,\"V1.66.6 browser text contrast\":45292108217,\"R8 native R7 integration checks\":45292108194,\"V1.66.8 education activities browser regression\":45292108134,\"V1.66.9 common badge browser regression\":45292108319,\"Book reader native host build and fixture\":45292108010,\"Multimedia candidate browser review\":45292108272,\"Routine integer coin candidate checks\":45292108138,\"Daily lesson alert mute checks\":45292108053,\"R8 source-driven build\":45292108052,\"YouTube engine isolated Windows smoke\":45292108176,\"R8 native Windows verification\":45292108055},\"authorization\":\"Owner explicitly requested test deployment of Almond 394-page direct native Canva WebView2, error-code diagnostics and in-board retry after 15 reviewed CI checks and 9 signed-update source main checks. The 1.66.34 candidate may be signed as an owner-field-test pilot; actual school Windows Canva touch, arrow and login behavior remain unverified.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16634_almond_native_direct_owner_field_test_only\"}")

def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):
    return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))

def main():
    a=json.loads(pathlib.Path('runtime-src/v16634-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner-pilot approval required')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and
            json.loads(old)['version']==a['previous_version'],'exact previous signed feed required')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    # PR review started before a separate installer-site change; compare only source
    # subtrees which entered the signed candidate. These must be byte-identical.
    for path in ('runtime-src/system','tools/multimedia','tools/r8-publisher'):
        require(git('rev-parse',a['review_sha']+':'+path)==
                git('rev-parse',a['source_sha']+':'+path),'reviewed source subtree changed: '+path)
    allowed={'.github/workflows/r8-runtime-release.yml',
             '.github/workflows/r8-v16634-pilot.yml',
             '.github/workflows/r8-v16634-pilot-preflight.yml',
             'tools/r8-publisher/check-v16634-pilot.py',
             'runtime-src/v16634-pilot-approval.json'}
    require(set(git('diff','--name-only',a['source_sha'],'HEAD').splitlines())<=allowed,
            'only approved signing/CI plumbing may change since reviewed source')
    assert hashlib.sha256(pathlib.Path('runtime-src/system/asset-book-reader-host.zip').read_bytes()).hexdigest()==\
        '60d89ace7b567fad79bd75c8744cc70e07be7feb998ad42f8ebec82eb19130d7'
    require('60d89ace7b567fad79bd75c8744cc70e07be7feb998ad42f8ebec82eb19130d7' in
            pathlib.Path('runtime-src/system/server.ps1').read_text(encoding='utf-8-sig'),
            'native host is not pinned in HTTP service')
    repo=os.environ['GITHUB_REPOSITORY']
    api='repos/'+repo+'/actions/'
    for group,sha,event in [('main_runs',a['source_sha'],'push'),('review_runs',a['review_sha'],'pull_request')]:
        for name,rid in a[group].items():
            r=gh(api+'runs/'+str(rid))
            require(r['id']==rid and r['name']==name and r['head_sha']==sha and
                    r['event']==event and r['status']=='completed' and
                    r['conclusion']=='success' and r['repository']['full_name']==repo and
                    (event!='push' or r['head_branch']=='main'),'exact required CI: '+name)
    meta=gh(api+'artifacts/'+str(a['artifact_id']))
    require(meta['id']==a['artifact_id'] and not meta['expired'] and
            meta['name']=='r8-runtime-release-candidate' and
            meta['digest']=='sha256:'+a['archive_sha'] and
            meta['workflow_run']['id']==a['main_runs']['R8 source-driven build'],
            'exact main candidate required')
    with tempfile.TemporaryDirectory() as td:
        out=pathlib.Path(td)/'candidate'
        subprocess.run([sys.executable,'tools/r8-publisher/source-build.py','build',
                        'runtime-src/system','stable/runtime-v1/latest.json',str(out)],check=True)
        raw=(out/'payload.json').read_bytes()
        require(hashlib.sha256(raw).hexdigest()==a['payload_sha'] and
                json.loads(raw)['version']==a['version'],'exact rebuilt manifest required')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:
            for k in ('artifact_id','archive_sha','payload_sha'):
                f.write(f'{k}={a[k]}\n')
    print('PASS: 1.66.34 owner field-test candidate, 15 review + 9 main CI successes, exact native host.')

if __name__=='__main__':
    main()
