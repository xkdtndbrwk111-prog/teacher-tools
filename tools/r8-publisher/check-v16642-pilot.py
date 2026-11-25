"""Immutable, exact-source R8 V1.66.42 BookReader owner-field-test approval."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.42\",\"previous_version\":\"1.66.41\",\"previous_payload_sha\":\"2a6d5aa96919816e56cd3a745b92bd9ec335e672e100f372ffa68027ed8e022c\",\"source_sha\":\"13502e09b9e7db5995a5e2da8cc83db2e8ce513f\",\"review_sha\":\"4c74b3be27639a91a88369febbbee87a9eea34c4\",\"artifact_id\":15001188540,\"archive_sha\":\"1dfd1df4162698db0bbfcff3090ac8e9d0218aaa3ed9a71088666651cac07277\",\"payload_sha\":\"0424e65c5b5888445f84644ad9f29fb1541bf67ecbaa324420f7443c833716cf\",\"main_runs\":{\"Tournament host bridge review\":45569850625,\"V1.66.8 education activities browser regression\":45569850646,\"R8 source-driven build\":45569850522,\"V1.66.7 theme font shadow and icon regressions\":45569850493,\"QR square widget and integer fit checks\":45569850596,\"V1.66.6 browser text contrast\":45569850640,\"V1.66.9 common badge browser regression\":45569850548,\"R8 native R7 integration checks\":45569850606,\"R8 native Windows verification\":45569850717,\"pages build and deployment\":45569849859},\"review_runs\":{\"V1.66.8 education activities browser regression\":45568722951,\"V1.66.6 browser text contrast\":45568723681,\"R8 source-driven build\":45568723375,\"Routine integer coin candidate checks\":45568723372,\"Tournament host bridge review\":45568723185,\"Daily lesson alert mute checks\":45568722936,\"QR square widget and integer fit checks\":45568723351,\"V1.66.7 theme font shadow and icon regressions\":45568723009,\"YouTube engine isolated Windows smoke\":45568723357,\"R8 native R7 integration checks\":45568723096,\"Classroom UI2 home and HUD candidate\":45568723242,\"V1.66.9 common badge browser regression\":45568722919,\"Multimedia candidate browser review\":45568723468,\"R8 native Windows verification\":45568723247,\"Book reader native host build and fixture\":45568723353},\"authorization\":\"Owner explicitly requested publication and deployment after all tests pass, including auto-update and manual installer. Exact BookReader dynamic page detection and Escape control restoration candidate only; 15/15 review and 10/10 main checks verified. Physical classroom authenticated editor and actual display remain pending; independent signature verification required.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16642_book_reader_owner_field_test_only\"}")

def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):
    return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))

def main():
    a=json.loads(pathlib.Path('runtime-src/v16642-pilot-approval.json').read_bytes())
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
    allowed={'.github/workflows/r8-v16642-signed-release.yml',
             '.github/workflows/r8-v16642-pilot.yml',
             '.github/workflows/r8-v16642-pilot-preflight.yml',
             'tools/r8-publisher/check-v16642-pilot.py',
             'runtime-src/v16642-pilot-approval.json', 'README.md', 'hub.css', 'hub.js', 'index.html'}
    require(set(git('diff','--name-only',a['source_sha'],'HEAD').splitlines())<=allowed,
            'only approved signing/CI plumbing may change since reviewed source')
    assert hashlib.sha256(pathlib.Path('runtime-src/system/asset-book-reader-host.zip').read_bytes()).hexdigest()==\
        '20666e7d2c9fc7e28c89f4827258dbcd145f0f39176ea5d16335db8f4b473f6c'
    require('20666e7d2c9fc7e28c89f4827258dbcd145f0f39176ea5d16335db8f4b473f6c' in
            pathlib.Path('runtime-src/system/server.ps1').read_text(encoding='utf-8-sig'),
            'native host is not pinned in HTTP service')
    repo=os.environ['GITHUB_REPOSITORY']
    api='repos/'+repo+'/actions/'
    for group,sha,event in [('main_runs',a['source_sha'],'push'),('review_runs',a['review_sha'],'pull_request')]:
        for name,rid in a[group].items():
            r=gh(api+'runs/'+str(rid))
            require(r['id']==rid and r['name']==name and r['head_sha']==sha and
                    r['event']==('dynamic' if name=='pages build and deployment' else event) and r['status']=='completed' and
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
    print('PASS: 1.66.42 owner field-test candidate, 15 review + 10 main CI successes, exact native host.')

if __name__=='__main__':
    main()
