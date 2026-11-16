"""Generate a content-addressed candidate feed from an exact R8 baseline and target. Offline signing is separate."""
import argparse, base64, hashlib, hmac, json, pathlib, re, shutil, xml.etree.ElementTree as ET
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def make(base,target,out):
    kernel=(pathlib.Path(__file__).parent/'runtime/r8-kernel.ps1').read_text()
    names=set(re.findall(r"'([^']+)'",kernel.split('$R8Names=@(',1)[1].split(')\n',1)[0]))
    def allowed(n):return n in names or bool(re.fullmatch(r'asset-[a-z0-9][a-z0-9_-]{0,60}\.(png|webp|jpg|ogg|mp3|wav|woff2|zip)',n))
    for n in ('launch.ps1','r8-kernel.ps1','update-public.xml'):
        if sha(base/n)!=sha(target/n):raise ValueError('immutable bootstrap changed: '+n)
    old=json.loads((base/'release.json').read_text(encoding='utf-8-sig'));new=json.loads((target/'release.json').read_text(encoding='utf-8-sig'))
    if old.get('runtimeProtocol')!=1 or new.get('runtimeProtocol')!=1 or old['channel']!='stable' or new['channel']!='stable' or tuple(map(int,new['version'].split('.')))<=tuple(map(int,old['version'].split('.'))):raise ValueError('invalid base/target')
    if out.exists():raise ValueError('output must be new')
    files=[]
    for p in sorted(target.iterdir()):
        if p.is_file() and allowed(p.name):
            if p.is_symlink() or not 0<p.stat().st_size<=16777216:raise ValueError('invalid program asset')
            files.append(dict(name=p.name,sha256=sha(p),bytes=p.stat().st_size))
    present={f['name'] for f in files}
    if not names<=present or len(files)>128 or sum(f['bytes'] for f in files)>67108864:raise ValueError('incomplete or too large snapshot')
    for p in base.iterdir():
        if p.is_file() and allowed(p.name) and p.name not in present:raise ValueError('removals require manual migration: '+p.name)
    (out/'blobs').mkdir(parents=True)
    for f in files:shutil.copyfile(target/f['name'],out/'blobs'/(f['sha256']+'.bin'))
    m=dict(schema='TT-RUNTIME-SNAPSHOT-1',channel='stable',kernel=1,version=new['version'],bases=[sha(base/'release.json')],files=files)
    (out/'payload.json').write_bytes(json.dumps(m,ensure_ascii=False,separators=(',',':')).encode())
    print('Unsigned candidate only. Sign payload.json exact bytes using existing RSA-2048 PKCS#1 SHA256 offline.')
def verify_signature(payload,signature,key):
    xml=ET.parse(key).getroot()
    if xml.tag!='RSAKeyValue' or sorted(child.tag for child in xml)!=['Exponent','Modulus']: raise ValueError('public key only')
    modulus=int.from_bytes(base64.b64decode(xml.findtext('Modulus'),validate=True),'big')
    exponent=int.from_bytes(base64.b64decode(xml.findtext('Exponent'),validate=True),'big')
    if modulus.bit_length()!=2048 or len(signature)!=256 or not 3<=exponent<=2**32-1 or exponent%2!=1:raise ValueError('RSA key/signature size')
    n=int.from_bytes(signature,'big')
    if n>=modulus:raise ValueError('invalid RSA signature')
    digest=bytes.fromhex('3031300d060960864801650304020105000420')+hashlib.sha256(payload).digest()
    expected=b'\0\1'+b'\xff'*(256-len(digest)-3)+b'\0'+digest
    actual=pow(n,exponent,modulus).to_bytes(256,'big')
    if not hmac.compare_digest(actual,expected):raise ValueError('signature verification failed')
def envelope(out,sig,key):
    p=(out/'payload.json').read_bytes();s=sig.read_bytes()
    verify_signature(p,s,key)
    m=json.loads(p)
    for f in m['files']:
        if not re.fullmatch(r'[a-f0-9]{64}',f['sha256']):raise ValueError('blob digest invalid')
        blob=out/'blobs'/(f['sha256']+'.bin')
        if blob.stat().st_size!=f['bytes'] or sha(blob)!=f['sha256']:raise ValueError('blob changed after signing')
    (out/'latest.json').write_text(json.dumps({'payload':base64.b64encode(p).decode(),'signature':base64.b64encode(s).decode()},separators=(',',':')))
if __name__=='__main__':
    p=argparse.ArgumentParser();sp=p.add_subparsers(dest='cmd',required=True)
    m=sp.add_parser('prepare');m.add_argument('base',type=pathlib.Path);m.add_argument('target',type=pathlib.Path);m.add_argument('out',type=pathlib.Path)
    e=sp.add_parser('envelope');e.add_argument('out',type=pathlib.Path);e.add_argument('signature',type=pathlib.Path);e.add_argument('public_key',type=pathlib.Path)
    a=p.parse_args()
    if a.cmd=='prepare':make(a.base,a.target,a.out)
    else:envelope(a.out,a.signature,a.public_key)
