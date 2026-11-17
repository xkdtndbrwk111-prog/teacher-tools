"""Strict R8 publishing contract. Does not execute candidate code or use private keys."""
import argparse, base64, hashlib, hmac, json, pathlib, re, stat, zipfile, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parent
KEY=ROOT/'public-key.xml'
BASE='3b5110f2553ddf7835296e21167304c4e63eaed1c0bd317135d9f81797c14bdb'
BASES={BASE,'da3c6487f0460487df872a2d3d6209ae0d996e837a36cb6dfa8bf84eb64525bf','c2e450eed106aafeb66ed52aa9ec26b172b7bc0a1b6af426f7aafd8f6595cc44'}
BASE_VERSION=(1,66,2)
REVIEWED_1663='5e0ca2e428901c5681481d8b15629f5bd0e81116aa0667884ff97b1472ead08b'
MAX_FILE=16777216
MAX_TOTAL=67108864
REQUIRED=set('dashboard.html release.json board-launch.ps1 server.ps1 runtime.ps1 privacy-reset.ps1 start-teacher-tools.ps1 stop-teacher-tools.ps1 change-monitor.ps1 disable-autostart.ps1 speaker.ps1 share-input.ps1 board-heartbeat.ps1 open-web.ps1 seating-inbox.html coins.js coins-ui.js school.js podo.js update-ui.js classkit_QR_LICENSE.txt handmade-paper.png hoja.ico presentation-board.js presentation-board.css presentation-server.ps1 presentation-assets.zip museum-sky.webp museum-cloud-far.webp museum-cloud-near.webp museum-sway-spring-base.webp museum-sway-spring-sheet.png museum-sway-summer-base.webp museum-sway-summer-sheet.png museum-sway-autumn-base.webp museum-sway-autumn-sheet.png museum-sway-winter-base.webp museum-sway-winter-left.png museum-sway-winter-right.png'.split())
def require(ok,message):
    if not ok:raise ValueError(message)
def sha(b):return hashlib.sha256(b).hexdigest()
def hex64(v):return isinstance(v,str) and re.fullmatch(r'[a-f0-9]{64}',v) is not None
def version(v):
    require(isinstance(v,str) and re.fullmatch(r'\d{1,3}\.\d{1,3}\.\d{1,4}',v),'invalid version')
    return tuple(map(int,v.split('.')))
def parse(b):
    def unique(pairs):
        d={}
        for k,v in pairs:
            require(k not in d,'duplicate JSON field')
            d[k]=v
        return d
    return json.loads(b,object_pairs_hook=unique)
def allowed(n):
    return isinstance(n,str) and (n in REQUIRED or re.fullmatch(r'asset-[a-z0-9][a-z0-9_-]{0,60}\.(png|webp|jpg|ogg|mp3|wav|woff2|zip)',n) is not None)
def verify(payload,sig,key=KEY):
    xml=ET.parse(key).getroot()
    require(xml.tag=='RSAKeyValue' and sorted(x.tag for x in xml)==['Exponent','Modulus'],'not public RSA key')
    n=int.from_bytes(base64.b64decode(xml.findtext('Modulus'),validate=True),'big')
    e=int.from_bytes(base64.b64decode(xml.findtext('Exponent'),validate=True),'big')
    require(n.bit_length()==2048 and e==65537 and len(sig)==256,'key/signature size')
    s=int.from_bytes(sig,'big');require(s<n,'invalid signature integer')
    digest=bytes.fromhex('3031300d060960864801650304020105000420')+hashlib.sha256(payload).digest()
    expected=b'\0\1'+b'\xff'*(256-len(digest)-3)+b'\0'+digest
    require(hmac.compare_digest(pow(s,e,n).to_bytes(256,'big'),expected),'signature invalid')
def validate_manifest(raw):
    require(0<len(raw)<=262144,'payload size')
    m=parse(raw);require(set(m)=={'schema','channel','kernel','version','bases','files'},'manifest fields')
    require(m['schema']=='TT-RUNTIME-SNAPSHOT-1' and m['channel']=='stable' and type(m['kernel']) is int and m['kernel']==1,'manifest contract')
    version(m['version'])
    bs=m['bases'];require(isinstance(bs,list) and 1<=len(bs)<=80 and all(hex64(b) for b in bs) and len(set(bs))==len(bs),'base hashes')
    fs=m['files'];require(isinstance(fs,list) and 1<=len(fs)<=128,'file count')
    names=set();sizes={}
    for f in fs:
        require(isinstance(f,dict) and set(f)=={'name','sha256','bytes'},'file record')
        n,h,z=f['name'],f['sha256'],f['bytes']
        require(allowed(n) and n not in names and hex64(h) and type(z) is int and 1<=z<=MAX_FILE,'file metadata')
        require(h not in sizes or sizes[h]==z,'inconsistent blob size')
        names.add(n);sizes[h]=z
    require(REQUIRED<=names and sum(f['bytes'] for f in fs)<=MAX_TOTAL,'missing required file or total size')
    return m,sizes
def decode_feed(raw):
    require(len(raw)<=524288,'feed size')
    e=parse(raw);require(set(e)=={'payload','signature'},'feed fields')
    p=base64.b64decode(e['payload'],validate=True);s=base64.b64decode(e['signature'],validate=True)
    verify(p,s)
    return p
def current_contract(path):
    b=path.read_bytes()
    if parse(b)=={'status':'unreleased'}:return BASE_VERSION,set(BASES),set()
    m,_=validate_manifest(decode_feed(b))
    release=next(f['sha256'] for f in m['files'] if f['name']=='release.json')
    return version(m['version']),set(m['bases'])|{release},{f['name'] for f in m['files']}
def validate_candidate(directory,old,approved):
    require(hex64(approved),'expected payload digest')
    raw=(directory/'payload.json').read_bytes()
    require(sha(raw)==approved,'payload not approved')
    m,sizes=validate_manifest(raw)
    v,bases,names=current_contract(old)
    # An already installed, exact reviewed 1.66.3 package must be eligible for the first 1.66.4+ feed.
    # Keep the original 1.66.3 candidate contract intact, and never trust a caller-selected base.
    if parse(old.read_bytes())=={'status':'unreleased'} and version(m['version']) >= (1,66,4):
        v=(1,66,3);bases.add(REVIEWED_1663)
    require(version(m['version'])>v,'non-increasing version')
    require(set(m['bases'])==bases,'base inventory must match exact approved ancestry')
    require(names<={f['name'] for f in m['files']},'program removal forbidden')
    expected={'payload.json'}|{'blobs/'+h+'.bin' for h in sizes}
    require({p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}==expected,'candidate unexpected/missing file')
    for h,n in sizes.items():
        p=directory/'blobs'/(h+'.bin');require(not p.is_symlink() and p.stat().st_size==n and sha(p.read_bytes())==h,'blob hash/size')
    r=next(f for f in m['files'] if f['name']=='release.json')
    rel=parse((directory/'blobs'/(r['sha256']+'.bin')).read_bytes().decode('utf-8-sig'))
    require(rel['version']==m['version'] and rel['channel']=='stable' and type(rel['runtimeProtocol']) is int and rel['runtimeProtocol']==1 and rel['updateMode']=='auto-pilot','release metadata')
    require(re.fullmatch(r'\d{4}-\d{2}-\d{2}-V'+re.escape(m['version'])+r'-STABLE-PILOT',rel['release']) is not None,'release ID')
    return raw,m
def extract(path,out,expected_sha):
    require(hex64(expected_sha) and path.stat().st_size<=MAX_TOTAL+2097152 and sha(path.read_bytes())==expected_sha,'archive hash/size')
    require(not out.exists(),'output must be fresh')
    with zipfile.ZipFile(path) as z:
        entries=z.infolist();require(1<=len(entries)<=130,'zip count')
        files=[x for x in entries if not x.is_dir()]
        require(len({x.filename for x in files})==len(files),'duplicate entry')
        require(sum(x.file_size for x in files)<=MAX_TOTAL+262144,'zip size')
        for x in entries:
            if x.is_dir():
                require(x.filename=='blobs/','unexpected directory')
                continue
            require(x.filename=='payload.json' or re.fullmatch(r'blobs/[a-f0-9]{64}\.bin',x.filename),'unsafe archive member')
            require(not stat.S_ISLNK(x.external_attr>>16) and not x.flag_bits&1 and x.file_size<= (262144 if x.filename=='payload.json' else MAX_FILE),'unsafe ZIP entry')
        require(z.testzip() is None,'ZIP integrity')
        for x in files:
            p=out/x.filename;p.parent.mkdir(parents=True,exist_ok=True)
            p.write_bytes(z.read(x))
def seal(raw,sig,out):
    verify(raw,sig)
    out.write_text(json.dumps({'payload':base64.b64encode(raw).decode(),'signature':base64.b64encode(sig).decode()},separators=(',',':'))+'\n',encoding='utf-8')
def stage(directory,signature,old,approved,dest):
    raw,m=validate_candidate(directory,old,approved)
    sig=signature.read_bytes();verify(raw,sig)
    # No private files or installer bootstrap are accepted by this publisher.
    for f in m['files']:
        h=f['sha256'];src=directory/'blobs'/(h+'.bin');p=dest/'blobs'/(h+'.bin')
        p.parent.mkdir(parents=True,exist_ok=True)
        if p.exists():require(sha(p.read_bytes())==h,'content-addressed blob collision')
        else:p.write_bytes(src.read_bytes())
    seal(raw,sig,dest/'latest.json')
    print('Verified, staged',m['version'],'with',len(m['files']),'program files')
def main():
    p=argparse.ArgumentParser();sp=p.add_subparsers(dest='cmd',required=True)
    for name,fields in [('extract',['archive','directory','archive_sha']),('check',['directory','old','payload_sha']),('stage',['directory','signature','old','payload_sha','destination']),('probe',['payload','signature','output'])]:
        x=sp.add_parser(name)
        for f in fields:x.add_argument(f,type=str if f.endswith('_sha') else pathlib.Path)
    a=p.parse_args()
    if a.cmd=='extract':extract(a.archive,a.directory,a.archive_sha)
    elif a.cmd=='check':
        _,m=validate_candidate(a.directory,a.old,a.payload_sha);print('Valid approved payload',m['version'])
    elif a.cmd=='stage':stage(a.directory,a.signature,a.old,a.payload_sha,a.destination)
    else:
        raw=a.payload.read_bytes();require(parse(raw).get('schema')=='TT-R8-SIGNING-PROBE-1','not a probe')
        seal(raw,a.signature.read_bytes(),a.output)
if __name__=='__main__':main()
