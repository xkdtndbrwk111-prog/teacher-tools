"""Immutable, exact-source R8 V1.66.39 BookReader owner-field-test approval."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.39\",\"previous_version\":\"1.66.38\",\"previous_payload_sha\":\"3d40f6ccd7065eccd901dda5a5ac9e122ee7e7f280bb0c2c6f5099daf6417e25\",\"source_sha\":\"5b97e31636ef9382ba56c8dcaaf872f396bc0f4c\",\"review_sha\":\"210602873dfaa3d0f97339b90ff8f9b472ce09db\",\"artifact_id\":14925969303,\"archive_sha\":\"155a82bf2ab8e375ef849b6c957214aab2b7f4904facc1c3d2cbbac832883847\",\"payload_sha\":\"a6a0b47686df4e3259d2d50f6f4cd43a7e2e92d5e22632f99b4d2394185211fe\",\"main_runs\":{\"Tournament host bridge review\":45410496168,\"QR square widget and integer fit checks\":45410495789,\"R8 native R7 integration checks\":45410495927,\"V1.66.9 common badge browser regression\":45410495241,\"pages build and deployment\":45410494043,\"V1.66.6 browser text contrast\":45410495508,\"R8 native Windows verification\":45410495216,\"R8 source-driven build\":45410495562,\"V1.66.7 theme font shadow and icon regressions\":45410495857,\"V1.66.8 education activities browser regression\":45410495317},\"review_runs\":{\"Tournament host bridge review\":45402916953,\"V1.66.7 theme font shadow and icon regressions\":45402917256,\"R8 source-driven build\":45402917397,\"Daily lesson alert mute checks\":45402917155,\"V1.66.9 common badge browser regression\":45402917198,\"V1.66.6 browser text contrast\":45402917215,\"V1.66.8 education activities browser regression\":45402917138,\"Routine integer coin candidate checks\":45402917248,\"Classroom UI2 home and HUD candidate\":45402917048,\"Live Canva presentation entry probe\":45402916996,\"R8 native R7 integration checks\":45402917053,\"QR square widget and integer fit checks\":45402917287,\"Multimedia candidate browser review\":45402917294,\"YouTube engine isolated Windows smoke\":45402917130,\"Book reader native host build and fixture\":45402917478,\"R8 native Windows verification\":45402917391},\"authorization\":\"Owner explicitly requested release of both the installer and auto-update after disclosure of 16/16 review and 10/10 main checks and pending physical classroom Canva animation verification. Exact BookReader candidate only; independent signature verification required.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16639_book_reader_owner_field_test_only\"}")

def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):
    return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))

def main():
    a=json.loads(pathlib.Path('runtime-src/v16639-pilot-approval.json').read_bytes())
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
    allowed={'.github/workflows/r8-v16639-signed-release.yml',
             '.github/workflows/r8-v16639-pilot.yml',
             '.github/workflows/r8-v16639-pilot-preflight.yml',
             'tools/r8-publisher/check-v16639-pilot.py',
             'runtime-src/v16639-pilot-approval.json', 'README.md', 'hub.css', 'hub.js', 'index.html'}
    require(set(git('diff','--name-only',a['source_sha'],'HEAD').splitlines())<=allowed,
            'only approved signing/CI plumbing may change since reviewed source')
    assert hashlib.sha256(pathlib.Path('runtime-src/system/asset-book-reader-host.zip').read_bytes()).hexdigest()==\
        '7a2ecc17f932d65d33f31899d03945dab883f205822fd33bdea5f714d52303dc'
    require('7a2ecc17f932d65d33f31899d03945dab883f205822fd33bdea5f714d52303dc' in
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
    print('PASS: 1.66.39 owner field-test candidate, 16 review + 10 main CI successes, exact native host.')

if __name__=='__main__':
    main()
