"""Exact V1.66.25 owner field-test release; physical field validation remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.25\",\"previous_version\":\"1.66.24\",\"previous_payload_sha\":\"b37353fe017ff32f97a6ad6cc851d845b0bfe336dbb38c37e9788230e94f4f03\",\"source_sha\":\"275c750be3f6e8f6c35e2dcffc45fc211a24bcfd\",\"review_sha\":\"05b4291b5ff9cb8b3c552100a1adbbc948f542dc\",\"artifact_id\":14606530286,\"archive_sha\":\"dd3f691c64a3404e000ecf11b6afa1ca556016256da0e4b98ca3d72dd7904dba\",\"payload_sha\":\"598b0d3271b26b81ef2caff2c354a010c236347693856a28504cdd2f9e4e25e5\",\"main_runs\":{\"V1.66.7 theme font shadow and icon regressions\":44684784729,\"Tournament host bridge review\":44684784649,\"QR square widget and integer fit checks\":44684784709,\"R8 native Windows verification\":44684784698,\"R8 native R7 integration checks\":44684784694,\"V1.66.8 education activities browser regression\":44684784594,\"V1.66.9 common badge browser regression\":44684784877,\"V1.66.6 browser text contrast\":44684784724,\"R8 source-driven build\":44684784656},\"review_runs\":{\"V1.66.8 education activities browser regression\":44683811763,\"R8 native R7 integration checks\":44683811783,\"QR square widget and integer fit checks\":44683811768,\"R8 source-driven build\":44683811740,\"R8 native Windows verification\":44683811595,\"V1.66.6 browser text contrast\":44683811323,\"V1.66.7 theme font shadow and icon regressions\":44683811318,\"V1.66.9 common badge browser regression\":44683811508,\"Tournament host bridge review\":44683811330,\"Classroom UI2 home and HUD candidate\":44683811556,\"Routine integer coin candidate checks\":44683811357,\"Daily lesson alert mute checks\":44683811370,\"YouTube engine isolated Windows smoke\":44683811388,\"Multimedia candidate browser review\":44683811369},\"authorization\":\"Owner explicitly requested V1.66.25 deployment after passing 14 review workflows. Windows system CA option resolved metadata retrieval on classroom PC; real authorized video download and complete physical playback remain pending.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16625_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16625-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16625-pilot.yml','.github/workflows/r8-v16625-pilot-preflight.yml','tools/r8-publisher/check-v16625-pilot.py','runtime-src/v16625-pilot-approval.json'}
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
    print('PASS: exact V1.66.25 owner pilot; 14 review and 9 main CI runs; physical checks pending.')
if __name__=='__main__':main()
