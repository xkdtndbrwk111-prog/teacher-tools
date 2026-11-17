"""Restore the exact current signed runtime for isolated update/rollback tests."""
import pathlib,sys,shutil
import validate as v
root,out,fallback=map(pathlib.Path,sys.argv[1:])
feed=(root/'latest.json').read_bytes()
if v.parse(feed)=={'status':'unreleased'}:
    v.extract(fallback,out,'818c82c9e8a3ea7ed3cf9c8afef69c8b48ac5fcfe67848d5421ee36bb347235c')
    print('Using reviewed first seed')
else:
    payload=v.decode_feed(feed)
    m,sizes=v.validate_manifest(payload)
    v.require(not out.exists(),'fresh test directory required')
    (out/'blobs').mkdir(parents=True)
    for h,n in sizes.items():
        p=root/'blobs'/(h+'.bin')
        v.require(p.stat().st_size==n and v.sha(p.read_bytes())==h,'signed seed integrity')
        shutil.copyfile(p,out/'blobs'/p.name)
    (out/'payload.json').write_bytes(payload)
    print('Restored signed current base',m['version'],len(m['files']),'files')
