"""Build the first R8 recovery candidate from the exact reviewed 1.66.3 snapshot.

No secrets, school data, or installed program execution. Only dashboard version text
and release metadata change. Never publishes a feed.
"""
import argparse, json, pathlib, tempfile
import validate as v

SEED_ARCHIVE='818c82c9e8a3ea7ed3cf9c8afef69c8b48ac5fcfe67848d5421ee36bb347235c'
SEED_PAYLOAD='b6056da425b026ff50043cd933ca12d267b4b4b39514948567eeedd1488ec8a4'

def build(archive,old,out):
    v.require(not out.exists(),'output must be fresh')
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);source=root/'source';stub=root/'initial.json'
        stub.write_text('{"status":"unreleased"}',encoding='utf-8')
        v.extract(archive,source,SEED_ARCHIVE)
        _,m=v.validate_candidate(source,stub,SEED_PAYLOAD)
        v.require(m['version']=='1.66.3','wrong recovery seed')
        release=next(f for f in m['files'] if f['name']=='release.json')
        v.require(release['sha256']==v.REVIEWED_1663,'wrong source release digest')
        m['version']='1.66.4'
        m['bases']=sorted(set(m['bases'])|{v.REVIEWED_1663})
        (out/'blobs').mkdir(parents=True)
        changes=[]
        for f in m['files']:
            data=(source/'blobs'/(f['sha256']+'.bin')).read_bytes()
            if f['name']=='dashboard.html':
                v.require(data.count(b'1.66.3')==6,'unexpected dashboard version references')
                data=data.replace(b'1.66.3',b'1.66.4').replace(b'2026-11-14 V1.66.4 STABLE PILOT',b'2026-11-17 V1.66.4 STABLE PILOT')
            elif f['name']=='release.json':
                v.require(data.count(b'1.66.3')==2,'unexpected release version references')
                data=data.replace(b'1.66.3',b'1.66.4')
            digest=v.sha(data)
            if digest!=f['sha256']:changes.append(f['name'])
            f.update(sha256=digest,bytes=len(data))
            (out/'blobs'/(digest+'.bin')).write_bytes(data)
        v.require(set(changes)=={'dashboard.html','release.json'},'unexpected program changes')
        payload=json.dumps(m,separators=(',',':')).encode()
        (out/'payload.json').write_bytes(payload)
        v.validate_candidate(out,old,v.sha(payload))
        print('Recovery candidate: 1.66.4; only dashboard.html and release.json changed')
        print('payload_sha='+v.sha(payload))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('archive',type=pathlib.Path);p.add_argument('old',type=pathlib.Path);p.add_argument('out',type=pathlib.Path)
    a=p.parse_args();build(a.archive,a.old,a.out)
