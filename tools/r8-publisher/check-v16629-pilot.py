"""Immutable V1.66.29 book navigation owner-pilot approval; physical field test remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.29\",\"previous_version\":\"1.66.28\",\"previous_payload_sha\":\"ef5e9e28f0bfcda8406930d4466a6c244774498ead89b1e85fdd8d30a1dc31a3\",\"source_sha\":\"169389254c0507c0d524045a31357163310c02ac\",\"review_sha\":\"f314436f0a037a9a0df3eb523645f9e9eb711c91\",\"artifact_id\":14780291103,\"archive_sha\":\"a00d46246e75909786bdbc3619ed3ed68e57332e0278ae6da2f9d8761007b30b\",\"payload_sha\":\"7b385c67267aa1901980d74257e4827b2f1aba9d5e24ecd231068e3bfb3adabc\",\"main_runs\":{\"R8 source-driven build\":45088434570,\"R8 native Windows verification\":45088434513,\"R8 native R7 integration checks\":45088434499,\"V1.66.6 browser text contrast\":45088434448,\"V1.66.7 theme font shadow and icon regressions\":45088434493,\"V1.66.8 education activities browser regression\":45088434439,\"V1.66.9 common badge browser regression\":45088434603,\"Tournament host bridge review\":45088434518,\"QR square widget and integer fit checks\":45088434495},\"review_runs\":{\"Book reader native host build and fixture\":45088157936,\"Classroom UI2 home and HUD candidate\":45088157858,\"Daily lesson alert mute checks\":45088157965,\"Multimedia candidate browser review\":45088157832,\"QR square widget and integer fit checks\":45088157976,\"R8 native R7 integration checks\":45088157876,\"R8 native Windows verification\":45088157908,\"R8 source-driven build\":45088157878,\"Routine integer coin candidate checks\":45088157888,\"Tournament host bridge review\":45088157838,\"V1.66.6 browser text contrast\":45088157830,\"V1.66.7 theme font shadow and icon regressions\":45088157825,\"V1.66.8 education activities browser regression\":45088158000,\"V1.66.9 common badge browser regression\":45088158015,\"YouTube engine isolated Windows smoke\":45088157820},\"authorization\":\"Owner requested fixes and prior release-after-tests workflow; deploy V1.66.29 only after verified checks. Physical classroom Canva navigation validation remains pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16629_book_navigation_youtube_pin_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16629-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed source tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16629-pilot.yml','.github/workflows/r8-v16629-pilot-preflight.yml','tools/r8-publisher/check-v16629-pilot.py','runtime-src/v16629-pilot-approval.json'}
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
    print('PASS: exact V1.66.29 owner pilot; 15 review and 9 main CI runs; physical field checks pending.')
if __name__=='__main__':main()
