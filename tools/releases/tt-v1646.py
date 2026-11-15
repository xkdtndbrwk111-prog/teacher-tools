import pathlib,sys,re,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
# Change display text only. Keep backup schema, paths, storage keys and protocol.
s=s.replace('Teacher Tools','호자보드')
s=s.replace("a.download='TeacherTools_'", "a.download='호자보드_'")
s=s.replace("a.download='teacher-tools-backup.json'", "a.download='호자보드-백업.json'")
s=s.replace('<title>우리 반 대시보드</title>','<title>호자보드</title>')
s=s.replace('⚙ 대시보드 설정','⚙ 호자보드 설정').replace('대시보드 빌드:','호자보드 빌드:')
s=s.replace('최신 대시보드 받기','최신 호자보드 받기').replace('최신 대시보드 안내 웹사이트','최신 호자보드 안내 웹사이트')
addition='''<style id="tt-brand-portrait-style">
#settings .settings-nav>button{flex-shrink:0}
#settings .tt-settings-portrait{flex:1 1 0;min-height:0;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;pointer-events:none}
#settings .tt-settings-portrait img{display:block;max-width:76%;max-height:min(100%,150px);width:auto;height:auto;object-fit:contain;flex-shrink:1}
#settings .tt-settings-portrait img[hidden]{display:none!important}
@media(max-width:820px){#settings .tt-settings-portrait{display:none}}
</style><script id="tt-brand-portrait">
(()=>{const dlg=document.getElementById('settings'),nav=dlg?.querySelector('.settings-nav');if(!nav)return;
const box=document.createElement('div');box.className='tt-settings-portrait';box.setAttribute('aria-hidden','true');
const img=document.createElement('img');img.alt='';img.hidden=true;box.append(img);
const base='https://raw.githubusercontent.com/xkdtndbrwk111-prog/hoja-minigames/main/src/assets/images/core/portraits/';
let seq=0,wasOpen=false;
function show(){const open=dlg.open;if(open&&!wasOpen){nav.append(box);const hoja=Math.random()<.75;const urls=[hoja?'/hoja_face_original.webp':'/nahan_face_original.webp',base+(hoja?'hoja_09_sparkling.webp':'nahansang_09_sparkling.webp')];const id=++seq;img.hidden=true;
let i=0;const load=()=>{if(id!==seq)return;if(i>=urls.length){img.hidden=true;return}const src=urls[i++];img.onload=()=>{if(id===seq&&dlg.open)img.hidden=false};img.onerror=load;img.src=src};load();}
else if(!open&&wasOpen){seq++;img.hidden=true;img.onload=null;img.onerror=null}wasOpen=open;}
new MutationObserver(show).observe(dlg,{attributes:true,attributeFilter:['open']});show();})();
</script>'''
assert s.count('</body></html>')==1
s=s.replace('</body></html>',addition+'</body></html>')
s=s.replace('1.64.5','1.64.6')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
