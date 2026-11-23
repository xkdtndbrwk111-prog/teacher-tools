"""Immutable V1.66.33 Almond official Canva embed in-board owner-pilot approval; physical field test remains pending."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
import validate as v
EXPECTED=json.loads("{\"schema\":1,\"version\":\"1.66.33\",\"previous_version\":\"1.66.32\",\"previous_payload_sha\":\"b9dedb54a4a0ae5144d9fea709bb55d402c0f790806fb16d578e7924c27b09c7\",\"source_sha\":\"8fa3a896c28ac7b9ab7ea16b5865316709db2128\",\"review_sha\":\"236a015e45a98915100e1151ee394b3acb2b0847\",\"artifact_id\":14803610938,\"archive_sha\":\"608d730bd62c3a51751bef6ad0f35f515bcfe33df1313ca93b45da2aade858b5\",\"payload_sha\":\"ad2164eb3148868fbdaea01f9c7ede3adb423a93e87827f7d1621c2bd25af09d\",\"main_runs\":{\"Tournament host bridge review\":45143809678,\"R8 source-driven build\":45143809518,\"V1.66.8 education activities browser regression\":45143809712,\"V1.66.6 browser text contrast\":45143809522,\"V1.66.7 theme font shadow and icon regressions\":45143809473,\"V1.66.9 common badge browser regression\":45143809436,\"QR square widget and integer fit checks\":45143809671,\"R8 native R7 integration checks\":45143809516,\"R8 native Windows verification\":45143809538},\"review_runs\":{\"R8 source-driven build\":45143556354,\"R8 native R7 integration checks\":45143556531,\"QR square widget and integer fit checks\":45143556514,\"V1.66.7 theme font shadow and icon regressions\":45143556356,\"Daily lesson alert mute checks\":45143556527,\"Routine integer coin candidate checks\":45143556625,\"Tournament host bridge review\":45143556526,\"V1.66.9 common badge browser regression\":45143556586,\"V1.66.6 browser text contrast\":45143556346,\"V1.66.8 education activities browser regression\":45143556370,\"YouTube engine isolated Windows smoke\":45143556557,\"Classroom UI2 home and HUD candidate\":45143556372,\"Book reader native host build and fixture\":45143556286,\"Multimedia candidate browser review\":45143556593,\"R8 native Windows verification\":45143556562},\"authorization\":\"Owner requested restoring Almond's clean internal Canva presentation using their official embed URL. Reviewed 1.66.33 candidate may be signed for owner-field-test after exact CI; real Canva rendering and click animations remain unverified until Windows school-PC testing.\",\"field_gate\":false,\"field_status\":\"pending_after_owner_pilot\",\"scope\":\"exact_v16633_almond_official_embed_owner_field_test_only\"}")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def gh(path):return json.loads(subprocess.check_output(['gh','api',path],text=True))
def main():
    a=json.loads(pathlib.Path('runtime-src/v16633-pilot-approval.json').read_bytes())
    require(a==EXPECTED and a['field_gate'] is False,'exact owner pilot only')
    old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    require(hashlib.sha256(old).hexdigest()==a['previous_payload_sha'] and json.loads(old)['version']==a['previous_version'],'exact previous signed feed; no replay')
    subprocess.run(['git','merge-base','--is-ancestor',a['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',a['review_sha']+'^{tree}')==git('rev-parse',a['source_sha']+'^{tree}'),'reviewed source tree differs from merged main')
    allowed={'.github/workflows/r8-runtime-release.yml','.github/workflows/r8-v16633-pilot.yml','.github/workflows/r8-v16633-pilot-preflight.yml','tools/r8-publisher/check-v16633-pilot.py','runtime-src/v16633-pilot-approval.json'}
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
    print('PASS: exact V1.66.33 owner pilot; 15 review and 9 main CI runs; physical field checks pending.')
if __name__=='__main__':main()
