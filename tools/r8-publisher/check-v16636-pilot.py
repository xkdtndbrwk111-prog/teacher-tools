"""Immutable, exact-source R8 V1.66.36 Almond native owner-field-test approval."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.36\",\"previous_version\":\"1.66.35\",\"previous_payload_sha\":\"4670d96cd30896fdd5276f90fbdb726322e4902a49afde5bffccd04344cb3d5b\",\"source_sha\":\"b1a0dc4b26a644a3fdee8c63cc9ebb843f989a8f\",\"review_sha\":\"52becc78bbfc053d4646d591964bc787279a7a99\",\"artifact_id\":14885173017,\"archive_sha\":\"fd670a7725aa30a3587641106a62476dd425fa6485e411dadbc3df015869356f\",\"payload_sha\":\"ca7e2eea093431954329d9e2a9136396808fac7d47353c52c3121bf0f7f09cea\",\"main_runs\":{\"R8 publisher contract review\":45315516155,\"R8 native Windows verification\":45315516367,\"V1.66.8 education activities browser regression\":45315516141,\"R8 native R7 integration checks\":45315516354,\"V1.66.6 browser text contrast\":45315516196,\"QR square widget and integer fit checks\":45315516188,\"V1.66.9 common badge browser regression\":45315516330,\"Tournament host bridge review\":45315516113,\"R8 source-driven build\":45315516123,\"V1.66.7 theme font shadow and icon regressions\":45315516084},\"review_runs\":{\"V1.66.7 theme font shadow and icon regressions\":45314598121,\"QR square widget and integer fit checks\":45314598050,\"V1.66.9 common badge browser regression\":45314598176,\"Daily lesson alert mute checks\":45314598163,\"Routine integer coin candidate checks\":45314598239,\"Tournament host bridge review\":45314598230,\"R8 recovery candidate build\":45314598229,\"R8 source-driven build\":45314598071,\"V1.66.8 education activities browser regression\":45314598169,\"Classroom UI2 home and HUD candidate\":45314598258,\"Book reader native host build and fixture\":45314598039,\"Multimedia candidate browser review\":45314598105,\"V1.66.6 browser text contrast\":45314598192,\"R8 native R7 integration checks\":45314598198,\"YouTube engine isolated Windows smoke\":45314598123,\"R8 native Windows verification\":45314598079},\"authorization\":\"Owner explicitly requested field-test deployment of 1.66.36 after 16/16 reviewed checks. Exact original Canva share navigation, isolated worker and server survival. All 10 exact main CI successes required before signing. Actual school device click animations and touch remain unverified.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16636_direct_canva_isolated_worker_owner_field_test_only\"}")

def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):
    return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))

def main():
    a=json.loads(pathlib.Path('runtime-src/v16636-pilot-approval.json').read_bytes())
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
    allowed={'.github/workflows/r8-v16636-signed-release.yml',
             '.github/workflows/r8-v16636-pilot.yml',
             '.github/workflows/r8-v16636-pilot-preflight.yml',
             'tools/r8-publisher/check-v16636-pilot.py',
             'runtime-src/v16636-pilot-approval.json'}
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
    print('PASS: 1.66.36 owner field-test candidate, 16 review + 10 main CI successes, exact native host.')

if __name__=='__main__':
    main()
