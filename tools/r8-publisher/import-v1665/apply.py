"""One-time import of the previously reviewed 1.66.5 program changes into native source."""
import base64,hashlib,io,json,pathlib,sys
from PIL import Image,features
root=pathlib.Path(sys.argv[1]); art=pathlib.Path(sys.argv[2]); here=pathlib.Path(__file__).resolve().parent
def sha(data):return hashlib.sha256(data).hexdigest()
def edits(name):return json.loads((here/name).read_bytes())
def read(name):return (here/name).read_bytes().decode('utf-8')
assert features.version('webp')=='1.6.0',features.version('webp')
portraits=[]
for name,gitsha,digest in [
 ('hoja_09_sparkling.webp','e3e980d227db901b244130b46eed5a7c976dd1dd','0c7295bede4548dadffe42e189da0801bbcf2ba2febd41eef8b0fad442570839'),
 ('nahansang_09_sparkling.webp','12ab0459b228ea9da8119242e0d11e76d067d8cd','d9c5a345ebf681aab3832dc35464de4ebed5a3297abfcdab6d56e9ae2e36f08d')]:
    raw=(art/name).read_bytes()
    assert hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()==gitsha
    im=Image.open(io.BytesIO(raw));assert im.size==(384,384) and im.mode=='RGBA'
    im=im.resize((256,256),Image.Resampling.LANCZOS);buf=io.BytesIO()
    im.save(buf,format='WEBP',quality=82,method=6,alpha_quality=100)
    encoded='data:image/webp;base64,'+base64.b64encode(buf.getvalue()).decode('ascii')
    assert sha(encoded.encode())==digest,(name,sha(encoded.encode()))
    portraits.append(encoded)
all_edits=edits('other.json')
all_edits['dashboard.html']=edits('dashboard-0.json')+edits('dashboard-36.json')+edits('dashboard-66.json')
all_edits['server.ps1']=edits('server-small.json')+[[15109,1388,read('server-0.txt')+read('server-40.txt')+read('server-80.txt')]]
expected={
 'dashboard.html':('83026a0a9f9cf6e085004889a7428b4915201cc52a1dd5a8d7134bd63695b073','9d9c173353258ae47cea22321900be35a92f79d0e4e6ae4d1778f6a472544746'),
 'podo.js':('d46735aa6e78ad26af43314fb68cfa6c279c257f6f10b2d4d878719822744317','ee6ae05627935ffa282a643c50060d0ae4f841cc2e395233774309a64aede5a6'),
 'privacy-reset.ps1':('b0b5162532235da741101792f548a7a04683bc3b26ce0c91c357c383a430e261','9e09457f8130e132483ac1691600f8e3f52e773f22d11b27682e574b54b0f0e7'),
 'release.json':('5e0ca2e428901c5681481d8b15629f5bd0e81116aa0667884ff97b1472ead08b','1b2f9fba07da4ffbebe50957fa85720a69fc3dc2f55a94d06851fec264297be9'),
 'server.ps1':('ba084bac6837f456dadb39cf695503f7c6af621dcf581c9ade90bc904e54257e','3763c3d97cb4316e53e8b054b0c2d7029294be71208e19d969420b4ce64eb0fe')}
result={}
for name,ops in all_edits.items():
    raw=(root/name).read_bytes();before,after=expected[name];assert sha(raw)==before,(name,'base mismatch')
    s=raw.decode('utf-8')
    end=0
    for start,length,new in sorted(ops):
        assert start>=end and start+length<=len(s)
        end=start+length
    for start,length,new in sorted(ops,reverse=True):
        s=s[:start]+new+s[start+length:]
    if name=='dashboard.html':
        for i,portrait in enumerate(portraits,1):
            token=f'@@PORTRAIT{i}@@';assert s.count(token)==1;s=s.replace(token,portrait)
    out=s.encode('utf-8');assert sha(out)==after,(name,'target mismatch',sha(out),len(out))
    result[name]=out;print(name,'exact reviewed target digest PASS')
assert set(result)==set(expected)
for name,raw in result.items():(root/name).write_bytes(raw)
