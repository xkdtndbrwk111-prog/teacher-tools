"""Immutable, exact-source R8 V1.66.38 minigame lesson-end owner-field-test approval."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.38\",\"previous_version\":\"1.66.36\",\"previous_payload_sha\":\"ca7e2eea093431954329d9e2a9136396808fac7d47353c52c3121bf0f7f09cea\",\"source_sha\":\"5d2b6d7bf4b74e9b111f34a89c70337dad17b425\",\"review_sha\":\"3fb92ee5ac63965e2f9d8607e72fcddfd0cd1050\",\"artifact_id\":14916639624,\"archive_sha\":\"e434798d0970027f9d9a66af9025e3158fa12360e44cbd67bad80aa2b93b5a1c\",\"payload_sha\":\"3d40f6ccd7065eccd901dda5a5ac9e122ee7e7f280bb0c2c6f5099daf6417e25\",\"main_runs\":{\"R8 publisher contract review\":45389581361,\"R8 native Windows verification\":45389581726,\"V1.66.8 education activities browser regression\":45389581651,\"R8 native R7 integration checks\":45389581441,\"V1.66.6 browser text contrast\":45389581653,\"QR square widget and integer fit checks\":45389581202,\"V1.66.9 common badge browser regression\":45389581263,\"Tournament host bridge review\":45389581251,\"R8 source-driven build\":45389581171,\"V1.66.7 theme font shadow and icon regressions\":45389581155},\"review_runs\":{\"V1.66.6 browser text contrast\":45378081708,\"R8 native Windows verification\":45378078473,\"V1.66.7 theme font shadow and icon regressions\":45378078130,\"R8 source-driven build\":45378078252,\"QR square widget and integer fit checks\":45378078128,\"V1.66.8 education activities browser regression\":45378078215,\"V1.66.9 common badge browser regression\":45378078246,\"Multimedia candidate browser review\":45378078189,\"R8 recovery candidate build\":45378078283,\"Tournament host bridge review\":45378078147,\"Routine integer coin candidate checks\":45378078162,\"Daily lesson alert mute checks\":45378078225,\"Classroom UI2 home and HUD candidate\":45378078291,\"R8 native R7 integration checks\":45378078380},\"authorization\":\"Owner explicitly requested deployment after being informed that 14/14 candidate CI checks passed and the physical classroom board test had not been performed. Exact minigame lesson-end candidate only; 10 exact successful main checks and independent signature verification required.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16638_minigame_lesson_end_owner_field_test_only\"}")

def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):
    return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))

def main():
    a=json.loads(pathlib.Path('runtime-src/v16638-pilot-approval.json').read_bytes())
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
    allowed={'.github/workflows/r8-v16638-signed-release.yml',
             '.github/workflows/r8-v16638-pilot.yml',
             '.github/workflows/r8-v16638-pilot-preflight.yml',
             'tools/r8-publisher/check-v16638-pilot.py',
             'runtime-src/v16638-pilot-approval.json'}
    require(set(git('diff','--name-only',a['source_sha'],'HEAD').splitlines())<=allowed,
            'only approved signing/CI plumbing may change since reviewed source')
    assert hashlib.sha256(pathlib.Path('runtime-src/system/asset-book-reader-host.zip').read_bytes()).hexdigest()==\
        'd32b46cf45cc269f1e3820ca496534a829ef1013a86dcd2da9fee08ab7959f52'
    require('d32b46cf45cc269f1e3820ca496534a829ef1013a86dcd2da9fee08ab7959f52' in
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
    print('PASS: 1.66.38 owner field-test candidate, 14 review + 10 main CI successes, exact native host.')

if __name__=='__main__':
    main()
