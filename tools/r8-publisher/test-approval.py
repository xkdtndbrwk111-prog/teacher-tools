import importlib.util, pathlib, unittest, copy
s=importlib.util.spec_from_file_location('approval',pathlib.Path(__file__).with_name('check-approval.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ApprovalTest(unittest.TestCase):
    def setUp(self):
        self.a={'schema':1,'source_sha':'a'*40,'artifact_id':123,'archive_sha':'b'*64,'payload_sha':'c'*64,'windows_run_id':456,'field_gate':True,'evidence':{k:'synthetic test evidence' for k in ('windows_install','windows_update','windows_rollback','r7_integration')}}
        self.meta={'id':123,'name':'r8-runtime-release-candidate','expired':False,'digest':'sha256:'+'b'*64,'workflow_run':{'id':789}}
        self.build={'id':789,'name':'R8 source-driven build','head_sha':'a'*40,'head_branch':'main','event':'push','status':'completed','conclusion':'success','repository':{'full_name':'test/repo'}}
        self.win=dict(self.build,id=456,name='R8 native Windows verification')
    def check(self,a=None,meta=None,build=None,win=None,source='tree',head='tree',digest='c'*64):
        m.check_record(a or self.a,'test/repo',meta or self.meta,build or self.build,win or self.win,source,head,digest)
    def test_valid(self):self.check()
    def test_no_gate(self):
        self.a['field_gate']=False
        with self.assertRaises(ValueError):self.check()
    def test_missing_evidence(self):
        self.a['evidence']['r7_integration']=''
        with self.assertRaises(ValueError):self.check()
    def test_wrong_artifact(self):
        self.meta['digest']='sha256:'+'d'*64
        with self.assertRaises(ValueError):self.check()
    def test_source_changed(self):
        with self.assertRaises(ValueError):self.check(head='other')
    def test_failed_windows(self):
        self.win['conclusion']='failure'
        with self.assertRaises(ValueError):self.check()
    def test_untrusted_pr(self):
        self.build['event']='pull_request'
        with self.assertRaises(ValueError):self.check()
    def test_wrong_payload(self):
        with self.assertRaises(ValueError):self.check(digest='e'*64)
if __name__=='__main__':unittest.main()
