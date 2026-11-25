"""Immutable, exact-source R8 V1.66.41 BookReader owner-field-test approval."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.41\",\"previous_version\":\"1.66.40\",\"previous_payload_sha\":\"b93502801f7a4e623050c82cef6d2ca29b5d94d839fe98486a21c283fcb6a1a9\",\"source_sha\":\"2598be3674c444e1510a943e785c133dc859b96e\",\"review_sha\":\"2598be3674c444e1510a943e785c133dc859b96e\",\"artifact_id\":14994280400,\"archive_sha\":\"ed9755024e3e413d671f84d1b1f1e4214a76cf76f83e3be9e0fd33c4f3c43f97\",\"payload_sha\":\"2a6d5aa96919816e56cd3a745b92bd9ec335e672e100f372ffa68027ed8e022c\",\"main_runs\":{\"Tournament host bridge review\":45550974287,\"QR square widget and integer fit checks\":45550974328,\"V1.66.7 theme font shadow and icon regressions\":45550974269,\"V1.66.6 browser text contrast\":45550974428,\"V1.66.9 common badge browser regression\":45550974268,\"V1.66.8 education activities browser regression\":45550974267,\"R8 source-driven build\":45550974340,\"R8 native R7 integration checks\":45550974375,\"R8 native Windows verification\":45550974321,\"pages build and deployment\":45550972792},\"review_runs\":{\"V1.66.7 theme font shadow and icon regressions\":45549959621,\"Book reader native host build and fixture\":45549959292,\"R8 native Windows verification\":45549959322,\"Tournament host bridge review\":45549959400,\"Daily lesson alert mute checks\":45549959272,\"V1.66.9 common badge browser regression\":45549959417,\"R8 source-driven build\":45549959284,\"Routine integer coin candidate checks\":45549959424,\"V1.66.8 education activities browser regression\":45549959384,\"V1.66.6 browser text contrast\":45549959281,\"QR square widget and integer fit checks\":45549959306,\"R8 native R7 integration checks\":45549959276,\"Multimedia candidate browser review\":45549959450,\"YouTube engine isolated Windows smoke\":45549959404,\"Classroom UI2 home and HUD candidate\":45549959344},\"authorization\":\"Owner explicitly requested deployment after all tests pass, including auto-update and manual installer. Exact BookReader startup fullscreen and manual page seek candidate only; 15/15 review and 10/10 main checks verified. Physical classroom authenticated editor and actual display remain pending; independent signature verification required.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16641_book_reader_owner_field_test_only\"}")

def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):
    return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))

def main():
    a=json.loads(pathlib.Path('runtime-src/v16641-pilot-approval.json').read_bytes())
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
    allowed={'.github/workflows/r8-v16641-signed-release.yml',
             '.github/workflows/r8-v16641-pilot.yml',
             '.github/workflows/r8-v16641-pilot-preflight.yml',
             'tools/r8-publisher/check-v16641-pilot.py',
             'runtime-src/v16641-pilot-approval.json', 'README.md', 'hub.css', 'hub.js', 'index.html'}
    require(set(git('diff','--name-only',a['source_sha'],'HEAD').splitlines())<=allowed,
            'only approved signing/CI plumbing may change since reviewed source')
    assert hashlib.sha256(pathlib.Path('runtime-src/system/asset-book-reader-host.zip').read_bytes()).hexdigest()==\
        'dfaf22e87ea32c38993d6b9116957c862f2bd394942d6940e3c4375c6d702288'
    require('dfaf22e87ea32c38993d6b9116957c862f2bd394942d6940e3c4375c6d702288' in
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
    print('PASS: 1.66.41 owner field-test candidate, 15 review + 10 main CI successes, exact native host.')

if __name__=='__main__':
    main()
