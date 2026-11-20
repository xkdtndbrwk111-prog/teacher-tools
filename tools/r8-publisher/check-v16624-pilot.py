"""Exact V1.66.24 owner field-test release; physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.24\",\"previous_version\":\"1.66.23\",\"previous_payload_sha\":\"4bd5cd0f2b1d8938d3ce30eb29e1811d73594a596ab2dc216708d772b1d85ec0\",\"source_sha\":\"938bead0d1b2bafd795f46243c4e368a05aa9d40\",\"review_sha\":\"d0b73ac2a9d8676c89a5d2413e209cf02d1428dc\",\"artifact_id\":14602767870,\"archive_sha\":\"8b99ba5d4ac667717b1d2da803168257c6f4ce0d02f9ae5713f16b51b46f3778\",\"payload_sha\":\"b37353fe017ff32f97a6ad6cc851d845b0bfe336dbb38c37e9788230e94f4f03\",\"main_runs\":{\"R8 native Windows verification\":44678520622,\"V1.66.9 common badge browser regression\":44678520679,\"Tournament host bridge review\":44678520676,\"R8 source-driven build\":44678520740,\"V1.66.6 browser text contrast\":44678520625,\"QR square widget and integer fit checks\":44678520645,\"R8 native R7 integration checks\":44678520859,\"V1.66.8 education activities browser regression\":44678520791,\"V1.66.7 theme font shadow and icon regressions\":44678520649},\"review_runs\":{\"V1.66.9 common badge browser regression\":44676365758,\"Routine integer coin candidate checks\":44676365664,\"V1.66.8 education activities browser regression\":44676365641,\"R8 native R7 integration checks\":44676365503,\"QR square widget and integer fit checks\":44676365520,\"R8 source-driven build\":44676365504,\"V1.66.7 theme font shadow and icon regressions\":44676365500,\"Tournament host bridge review\":44676365528,\"Daily lesson alert mute checks\":44676365555,\"Classroom UI2 home and HUD candidate\":44676365546,\"V1.66.6 browser text contrast\":44676365496,\"YouTube engine isolated Windows smoke\":44676365596,\"Multimedia candidate browser review\":44676365560,\"R8 native Windows verification\":44676365548},\"authorization\":\"Owner explicitly requested deployment of tested V1.66.24 YouTube downloader candidate for actual classroom field testing; physical school PC verification and real YouTube download remain pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16624_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16624-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16624-pilot.yml','.github/workflows/r8-v16624-pilot-preflight.yml','tools/r8-publisher/check-v16624-pilot.py','runtime-src/v16624-pilot-approval.json'}
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
    print('PASS: exact V1.66.24 owner pilot; 14 review and 9 main CI runs; physical checks pending.')
if __name__=='__main__':main()
