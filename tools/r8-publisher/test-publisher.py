import base64, hashlib, importlib.util, json, pathlib, subprocess, tempfile, unittest, zipfile
from unittest.mock import patch
import validate as v
class PublisherTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
        self.old=self.root/'old.json';self.old.write_text('{"status":"unreleased"}')
        self.candidate=self.root/'candidate';(self.candidate/'blobs').mkdir(parents=True)
        self.dest=self.root/'channel';self.dest.mkdir()
        self.private=self.root/'key.pem';self.key=self.root/'key.xml'
        subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(self.private)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        modulus=subprocess.check_output(['openssl','rsa','-in',str(self.private),'-noout','-modulus'],text=True).split('=')[1].strip()
        self.key.write_text('<RSAKeyValue><Modulus>'+base64.b64encode(bytes.fromhex(modulus)).decode()+'</Modulus><Exponent>AQAB</Exponent></RSAKeyValue>')
        self.files=[]
        for n in sorted(v.REQUIRED):
            raw=(json.dumps({'version':'1.66.1','channel':'stable','runtimeProtocol':1,'updateMode':'auto-pilot','release':'2026-11-17-V1.66.1-STABLE-PILOT'}).encode() if n=='release.json' else ('test fixture: '+n).encode())
            h=v.sha(raw);(self.candidate/'blobs'/(h+'.bin')).write_bytes(raw);self.files.append({'name':n,'sha256':h,'bytes':len(raw)})
        self.manifest={'schema':'TT-RUNTIME-SNAPSHOT-1','channel':'stable','kernel':1,'version':'1.66.1','bases':[v.BASE],'files':self.files}
        self.payload=self.candidate/'payload.json';self.write()
        self.real_verify=v.verify
    def tearDown(self):self.tmp.cleanup()
    def write(self):
        raw=json.dumps(self.manifest,separators=(',',':')).encode();self.payload.write_bytes(raw);self.digest=v.sha(raw)
    def signed(self):
        sig=self.root/'sig.bin'
        subprocess.run(['openssl','dgst','-sha256','-sign',str(self.private),'-out',str(sig),str(self.payload)],check=True)
        return sig
    def mockkey(self):
        return patch.object(v,'verify',side_effect=lambda p,s:self.real_verify(p,s,self.key))
    def test_valid_signed_publish(self):
        sig=self.signed()
        self.real_verify(self.payload.read_bytes(),sig.read_bytes(),self.key)
        with self.mockkey():
            v.stage(self.candidate,sig,self.old,self.digest,self.dest)
            raw=v.decode_feed((self.dest/'latest.json').read_bytes())
            self.assertEqual(raw,self.payload.read_bytes())
            ver,bases,names=v.current_contract(self.dest/'latest.json')
            self.assertEqual(ver,(1,66,1));self.assertIn(v.BASE,bases);self.assertEqual(names,v.REQUIRED)
            with self.assertRaises(ValueError):v.stage(self.candidate,sig,self.dest/'latest.json',self.digest,self.dest)
        self.assertEqual(self.old.read_text(),'{"status":"unreleased"}')
    def test_bad_signature(self):
        sig=self.signed();sig.write_bytes(bytes(256))
        with self.mockkey(),self.assertRaises(ValueError):v.stage(self.candidate,sig,self.old,self.digest,self.dest)
        self.assertFalse((self.dest/'latest.json').exists())
    def test_bad_blob(self):
        (self.candidate/'blobs'/(self.files[0]['sha256']+'.bin')).write_bytes(b'tampered')
        with self.assertRaises(ValueError):v.validate_candidate(self.candidate,self.old,self.digest)
    def test_unknown_file(self):
        self.manifest['files'][0]['name']='coins.log';self.write()
        with self.assertRaises(ValueError):v.validate_candidate(self.candidate,self.old,self.digest)
    def test_missing_file(self):
        self.manifest['files'].pop();self.write()
        with self.assertRaises(ValueError):v.validate_candidate(self.candidate,self.old,self.digest)
    def test_wrong_base(self):
        self.manifest['bases']=['a'*64];self.write()
        with self.assertRaises(ValueError):v.validate_candidate(self.candidate,self.old,self.digest)
    def test_wrong_approved_digest(self):
        with self.assertRaises(ValueError):v.validate_candidate(self.candidate,self.old,'a'*64)
    def test_archive_and_traversal(self):
        archive=self.root/'a.zip'
        with zipfile.ZipFile(archive,'w') as z:
            for p in self.candidate.rglob('*'):
                if p.is_file():z.write(p,p.relative_to(self.candidate).as_posix())
        v.extract(archive,self.root/'safe',v.sha(archive.read_bytes()))
        v.validate_candidate(self.root/'safe',self.old,self.digest)
        with zipfile.ZipFile(archive,'a') as z:z.writestr('../private.txt','bad')
        with self.assertRaises(ValueError):v.extract(archive,self.root/'unsafe',v.sha(archive.read_bytes()))
    def test_probe_not_installable(self):
        with self.assertRaises(ValueError):v.validate_manifest(b'{"schema":"TT-R8-SIGNING-PROBE-1","installable":false}')
if __name__=='__main__':unittest.main()
