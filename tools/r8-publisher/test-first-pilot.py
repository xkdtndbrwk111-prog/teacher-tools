import importlib.util,pathlib,unittest,copy
spec=importlib.util.spec_from_file_location('pilot',pathlib.Path(__file__).with_name('check-first-pilot.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PilotTest(unittest.TestCase):
    def test_exact(self):m.verify_record(copy.deepcopy(m.EXPECTED),{'status':'unreleased'})
    def test_no_false_gate(self):
        a=copy.deepcopy(m.EXPECTED);a['field_gate']=True
        with self.assertRaises(ValueError):m.verify_record(a,{'status':'unreleased'})
    def test_different_candidate(self):
        a=copy.deepcopy(m.EXPECTED);a['payload_sha']='a'*64
        with self.assertRaises(ValueError):m.verify_record(a,{'status':'unreleased'})
    def test_no_replay(self):
        with self.assertRaises(ValueError):m.verify_record(m.EXPECTED,{'payload':'x','signature':'y'})
    def test_failed_check(self):
        a={'id':m.EXPECTED['windows_run_id'],'name':'R8 native Windows verification','head_sha':m.EXPECTED['source_sha'],'head_branch':'main','event':'push','status':'completed','conclusion':'failure','repository':{'full_name':'test/repo'}}
        with self.assertRaises(ValueError):m.verify_run(a,a['id'],a['name'],'test/repo')
if __name__=='__main__':unittest.main()
