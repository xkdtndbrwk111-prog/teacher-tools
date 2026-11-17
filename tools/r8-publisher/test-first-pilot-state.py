"""Check initial authorization or prove it cannot be reused after publication."""
import importlib.util,json,pathlib,subprocess,sys
import validate as v
feed=pathlib.Path('stable/runtime-v1/latest.json').read_bytes()
if json.loads(feed)=={'status':'unreleased'}:
    subprocess.run([sys.executable,'tools/r8-publisher/check-first-pilot.py'],check=True)
else:
    v.decode_feed(feed)
    spec=importlib.util.spec_from_file_location('first_pilot','tools/r8-publisher/check-first-pilot.py')
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    record=json.loads(pathlib.Path('runtime-src/first-pilot-approval.json').read_bytes())
    try:
        m.verify_record(record,json.loads(feed))
    except ValueError as e:
        assert str(e)=='Pilot is valid only for the first unpublished feed'
        print('PASS: published signed feed rejects reuse of the first pilot')
    else:
        raise AssertionError('First pilot replay accepted')
