"""Immutable, exact-source R8 V1.66.43 compact UI and lunch owner-field-test approval."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.43\",\"previous_version\":\"1.66.42\",\"previous_payload_sha\":\"0424e65c5b5888445f84644ad9f29fb1541bf67ecbaa324420f7443c833716cf\",\"source_sha\":\"17f774223c83bb98463b6551cc75cde83a6b20ed\",\"review_sha\":\"89d9e3667efc5c092187986f9d0b14fb5d2d6571\",\"artifact_id\":15019953778,\"archive_sha\":\"473d408abb7f52ca41a4a784c547305fa90ba7e0480de5d0814c26a97565a5ba\",\"payload_sha\":\"a7683405ced542513b6fa707b1a95bcf00977b64b3d1a012d0ad693f606724c8\",\"main_runs\":{\"R8 source-driven build\":45611974853,\"V1.66.9 common badge browser regression\":45611974919,\"V1.66.8 education activities browser regression\":45611974742,\"R8 native Windows verification\":45611974484,\"Tournament host bridge review\":45611974434,\"QR square widget and integer fit checks\":45611974584,\"V1.66.6 browser text contrast\":45611974579,\"V1.66.7 theme font shadow and icon regressions\":45611974744,\"pages build and deployment\":45611974240,\"R8 native R7 integration checks\":45611974596},\"review_runs\":{\"Classroom UI2 home and HUD candidate\":45610692947,\"Multimedia candidate browser review\":45610693278,\"Daily lesson alert mute checks\":45610692937,\"Tournament host bridge review\":45610692932,\"R8 source-driven build\":45610692988,\"V1.66.7 theme font shadow and icon regressions\":45610693416,\"R8 native R7 integration checks\":45610692952,\"V1.66.43 compact UI regression\":45610693164,\"V1.66.6 browser text contrast\":45610693177,\"V1.66.9 common badge browser regression\":45610692934,\"Routine integer coin candidate checks\":45610692983,\"V1.66.8 education activities browser regression\":45610693174,\"QR square widget and integer fit checks\":45610692933,\"R8 native Windows verification\":45610693040},\"authorization\":\"Owner explicitly requested deployment of compact school dialog, two-row horizontal tools, speaker layout, weather consent placement and lunch schedule adjustment only. Exact candidate; all listed CI must pass before release. BookReader unchanged; SAC and physical display checks remain pending. Independent signature verification required.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16643_compact_ui_lunch_owner_field_test_only\"}")

def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):
    return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))

def main():
    a=json.loads(pathlib.Path('runtime-src/v16643-pilot-approval.json').read_bytes())
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
    allowed={'.github/workflows/r8-v16643-signed-release.yml',
             '.github/workflows/r8-v16643-pilot.yml',
             '.github/workflows/r8-v16643-pilot-preflight.yml',
             'tools/r8-publisher/check-v16643-pilot.py',
             'runtime-src/v16643-pilot-approval.json', 'README.md', 'hub.css', 'hub.js', 'index.html'}
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
    print('PASS: 1.66.43 owner field-test candidate, 14 review + 10 main CI successes, exact native host.')

if __name__=='__main__':
    main()
