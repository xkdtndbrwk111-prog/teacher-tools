"""Immutable, exact-source R8 V1.66.35 Almond native owner-field-test approval."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.35\",\"previous_version\":\"1.66.34\",\"previous_payload_sha\":\"087f34201283a89a294ca92ed8fcd0b12cb1db92cf7871953560be98972d4fde\",\"source_sha\":\"79c86f11aa6627e1961638d4371417c486ee0439\",\"review_sha\":\"200d34ceac832384cbdf0b6bea16e2f5e2979a34\",\"artifact_id\":14881143555,\"archive_sha\":\"73d3fad210502e3244f1255d526582565f276afdc87c155aa94016b03472e790\",\"payload_sha\":\"4670d96cd30896fdd5276f90fbdb726322e4902a49afde5bffccd04344cb3d5b\",\"main_runs\":{\"V1.66.8 education activities browser regression\":45308261234,\"R8 source-driven build\":45308261265,\"Tournament host bridge review\":45308261238,\"R8 publisher contract review\":45308261259,\"R8 native Windows verification\":45308261194,\"V1.66.9 common badge browser regression\":45308261197,\"V1.66.7 theme font shadow and icon regressions\":45308261124,\"R8 native R7 integration checks\":45308261279,\"QR square widget and integer fit checks\":45308261113,\"V1.66.6 browser text contrast\":45308261111},\"review_runs\":{\"QR square widget and integer fit checks\":45306574896,\"R8 recovery candidate build\":45306575165,\"V1.66.8 education activities browser regression\":45306574873,\"V1.66.9 common badge browser regression\":45306574926,\"R8 source-driven build\":45306574846,\"V1.66.6 browser text contrast\":45306575104,\"Tournament host bridge review\":45306574850,\"Daily lesson alert mute checks\":45306574992,\"Routine integer coin candidate checks\":45306574957,\"R8 native R7 integration checks\":45306574938,\"YouTube engine isolated Windows smoke\":45306574997,\"V1.66.7 theme font shadow and icon regressions\":45306574900,\"Book reader native host build and fixture\":45306575097,\"Multimedia candidate browser review\":45306574906,\"Classroom UI2 home and HUD candidate\":45306574895,\"R8 native Windows verification\":45306574857},\"authorization\":\"Owner explicitly requested test deployment of 1.66.35 after successful reviewed CI. This exact candidate addresses installed native Almond launch and diagnostic handling. Signing requires all 16 review and all 10 exact main CI successes. Actual school Windows click, arrow, touch and fullscreen behavior remains unverified.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16635_almond_server_launch_owner_field_test_only\"}")

def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):
    return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))

def main():
    a=json.loads(pathlib.Path('runtime-src/v16635-pilot-approval.json').read_bytes())
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
             '.github/workflows/r8-v16635-pilot.yml',
             '.github/workflows/r8-v16635-pilot-preflight.yml',
             'tools/r8-publisher/check-v16635-pilot.py',
             'runtime-src/v16635-pilot-approval.json'}
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
    print('PASS: 1.66.35 owner field-test candidate, 16 review + 10 main CI successes, exact native host.')

if __name__=='__main__':
    main()
