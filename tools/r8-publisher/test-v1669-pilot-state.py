"""A spent V1.66.9 authorization must never publish again."""
import importlib.util,pathlib,json,sys,subprocess
import validate as v
old=v.decode_feed(pathlib.Path('stable/runtime-v1/latest.json').read_bytes())
spec=importlib.util.spec_from_file_location('pilot','tools/r8-publisher/check-v1669-pilot.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
record=json.loads(pathlib.Path('runtime-src/v1669-pilot-approval.json').read_bytes())
ver=tuple(map(int,json.loads(old)['version'].split('.')))
if ver<(1,66,9):
    subprocess.run([sys.executable,'tools/r8-publisher/check-v1669-pilot.py'],check=True)
else:
    try:m.verify_record(record,old)
    except ValueError as e:
        assert str(e)=='exact previous signed feed required; no replay'
        print('PASS: spent 1.66.9 pilot cannot be reused')
    else:raise AssertionError('Spent pilot accepted')
