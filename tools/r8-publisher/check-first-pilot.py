"""One-time, owner-authorized first pilot. Never represents pending field checks as passed."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile
EXPECTED={"schema":1,"version":"1.66.5","source_sha":"1c7653aa7c26c4b6e0241e2efdc9b68d5639907f","artifact_id":14299231514,"archive_sha":"b8810ce788b75959e9f020c704b76ccdf251c34540f1fc5d76e31307687aa47e","payload_sha":"c3d60c5401579adc3d1e5500979c7a3ef2cc1c827e3ed8a76965fd1c4b89e0d6","build_run_id":44016513697,"windows_run_id":44016513709,"integration_run_id":44016513770,"contract_run_id":44016513612,"authorization":"Owner explicitly approved publishing V1.66.5 as the first operational pilot before school-PC field checks, in the 2026-11-17 conversation.","field_gate":False,"field_status":"pending_after_pilot","scope":"first_runtime_feed_only"}
def require(ok,msg):
    if not ok: raise ValueError(msg)
def git(*args):
    return subprocess.check_output(['git',*args],text=True).strip()
def gh(path):
    return json.loads(subprocess.check_output(['gh','api',path],text=True))
def verify_record(record,feed):
    require(record==EXPECTED,'Only the exact owner-authorized pilot is eligible')
    require(type(record['field_gate']) is bool and record['field_gate'] is False,'Field validation must not be represented as passed')
    require(feed=={'status':'unreleased'},'Pilot is valid only for the first unpublished feed')
def verify_run(run,expected_id,name,repo):
    require(run['id']==expected_id and run['name']==name and run['head_sha']==EXPECTED['source_sha'] and run['head_branch']=='main' and run['event']=='push' and run['status']=='completed' and run['conclusion']=='success' and run['repository']['full_name']==repo,'Required exact main run failed: '+name)
def main():
    record=json.loads(pathlib.Path('runtime-src/first-pilot-approval.json').read_bytes())
    feed=json.loads(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
    verify_record(record,feed)
    subprocess.run(['git','merge-base','--is-ancestor',record['source_sha'],'HEAD'],check=True)
    require(git('rev-parse',record['source_sha']+':runtime-src/system')==git('rev-parse','HEAD:runtime-src/system'),'Source changed after validation')
    repo=os.environ['GITHUB_REPOSITORY'];api='repos/'+repo+'/actions/'
    meta=gh(api+'artifacts/'+str(record['artifact_id']))
    require(meta['id']==record['artifact_id'] and not meta['expired'] and meta['name']=='r8-runtime-release-candidate' and meta['digest']=='sha256:'+record['archive_sha'] and meta['workflow_run']['id']==record['build_run_id'],'Exact artifact required')
    for field,name in (('build_run_id','R8 source-driven build'),('windows_run_id','R8 native Windows verification'),('integration_run_id','R8 native R7 integration checks'),('contract_run_id','R8 publisher contract review')):
        verify_run(gh(api+'runs/'+str(record[field])),record[field],name,repo)
    with tempfile.TemporaryDirectory() as td:
        out=pathlib.Path(td)/'candidate'
        subprocess.run([sys.executable,'tools/r8-publisher/source-build.py','build','runtime-src/system','stable/runtime-v1/latest.json',str(out)],check=True)
        raw=(out/'payload.json').read_bytes()
        require(hashlib.sha256(raw).hexdigest()==record['payload_sha'] and json.loads(raw)['version']==record['version'],'Rebuilt payload differs')
    with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:
        for k in ('artifact_id','archive_sha','payload_sha'):f.write(f'{k}={record[k]}\n')
    print('Owner-authorized exact first pilot; automated verification PASS; physical school field checks remain pending.')
if __name__=='__main__':main()
