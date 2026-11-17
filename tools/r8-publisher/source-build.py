"""Repository-native R8 builder. No keys, private data or mutable network sources."""
import argparse,json,pathlib,re,shutil,tempfile
import validate as v
SEED_ARCHIVE='818c82c9e8a3ea7ed3cf9c8afef69c8b48ac5fcfe67848d5421ee36bb347235c'
SEED_PAYLOAD='b6056da425b026ff50043cd933ca12d267b4b4b39514948567eeedd1488ec8a4'

def bootstrap(archive,source):
    v.require(not source.exists(),'source must be fresh')
    with tempfile.TemporaryDirectory() as td:
        tmp=pathlib.Path(td)
        stub=tmp/'old.json';stub.write_text('{"status":"unreleased"}')
        v.extract(archive,tmp/'seed',SEED_ARCHIVE)
        _,m=v.validate_candidate(tmp/'seed',stub,SEED_PAYLOAD)
        source.mkdir(parents=True)
        for f in m['files']:
            shutil.copyfile(tmp/'seed'/'blobs'/(f['sha256']+'.bin'),source/f['name'])
        v.require(len(list(source.iterdir())) == len(m['files']),'source inventory mismatch')

def build(source,old,out):
    v.require(source.is_dir() and not source.is_symlink(),'source must be directory')
    files=sorted(source.iterdir(),key=lambda p:p.name)
    v.require(all(p.is_file() and not p.is_symlink() and v.allowed(p.name) for p in files),'unexpected or non-program source')
    v.require(v.REQUIRED <= {p.name for p in files},'required program missing')
    rel=v.parse((source/'release.json').read_bytes().decode('utf-8-sig'))
    ver=v.version(rel['version'])
    _,bases,_=v.current_contract(old)
    if v.parse(old.read_bytes())=={'status':'unreleased'} and ver >= (1,66,4):
        bases.add(v.REVIEWED_1663)
    v.require(not out.exists(),'output must be fresh')
    (out/'blobs').mkdir(parents=True)
    manifest={'schema':'TT-RUNTIME-SNAPSHOT-1','channel':'stable','kernel':1,'version':rel['version'],'bases':sorted(bases),'files':[]}
    for p in files:
        v.require(0<p.stat().st_size<=v.MAX_FILE,'program size')
        data=p.read_bytes();digest=v.sha(data)
        manifest['files'].append({'name':p.name,'sha256':digest,'bytes':len(data)})
        (out/'blobs'/(digest+'.bin')).write_bytes(data)
    payload=json.dumps(manifest,separators=(',',':')).encode()
    (out/'payload.json').write_bytes(payload)
    v.validate_candidate(out,old,v.sha(payload))
    print('payload_sha='+v.sha(payload))
    print('Built',rel['version'],len(files),'program files from repository source')

def main():
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='cmd',required=True)
    b=sub.add_parser('bootstrap');b.add_argument('archive',type=pathlib.Path);b.add_argument('source',type=pathlib.Path)
    b=sub.add_parser('build');b.add_argument('source',type=pathlib.Path);b.add_argument('old',type=pathlib.Path);b.add_argument('out',type=pathlib.Path)
    a=p.parse_args()
    if a.cmd=='bootstrap':bootstrap(a.archive,a.source)
    else:build(a.source,a.old,a.out)
if __name__=='__main__':main()
