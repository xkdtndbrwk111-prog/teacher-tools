import pathlib,sys,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
a='<span class="tag" id="weekName">불러오는 중</span>'
b='<span id="weekName" hidden>불러오는 중</span><div class="tt-week-links"><a id="ttWeekNeis" target="_blank" rel="noopener noreferrer" title="주간학습 양식 사본 만들기">나이스</a><a id="ttWeekSheet" target="_blank" rel="noopener noreferrer" title="연결된 구글 시트 열기">구글시트</a></div>'
assert s.count(a)==1;s=s.replace(a,b)
a='</body></html>'
b='''<style id="tt-week-links-style">
.card[data-widget="week"]>.row{flex-wrap:wrap;gap:5px}
#weekTitle{flex:1 1 auto;min-width:0;white-space:normal;overflow:visible;text-overflow:clip;word-break:keep-all;line-height:1.15;margin:0}
#weekName[hidden]{display:none!important}
.tt-week-links{display:flex;flex:0 0 auto;gap:4px;align-items:center;margin-left:auto}
.tt-week-links a{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;font-size:clamp(11px,1vw,15px);padding:5px 8px;min-height:32px;line-height:1.2;box-sizing:border-box;flex:none;border-radius:8px;background:var(--control-bg,var(--panel));color:var(--control-text,var(--text));text-decoration:none;border:1px solid var(--border);cursor:pointer}
.tt-week-links a:focus-visible{outline:2px solid var(--accent)}
</style><script id="tt-week-links-script">
(()=>{const neis=document.getElementById('ttWeekNeis'),sheet=document.getElementById('ttWeekSheet');if(!neis||!sheet)return;
let loaded=false;const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{20,80}$/.test(id);
const url=(id,action)=>'https://docs.google.com/spreadsheets/d/'+id+'/'+action;
fetch('/api/school',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('school');return r.json()}).then(d=>{if(valid(d.template))neis.href=url(d.template,'copy');if(valid(d.school?.sheet))sheet.href=url(d.school.sheet,'edit');loaded=true}).catch(()=>{});
for(const a of [neis,sheet]){a.tabIndex=0;a.addEventListener('click',e=>{e.stopPropagation();if(a.hasAttribute('href'))return;e.preventDefault();alert(!loaded?'시간표 연결 정보를 읽지 못했습니다. 호자보드를 다시 실행해 주세요.':a===sheet?'설정 → 학교·학급에서 주간학습 구글 시트를 먼저 연결해 주세요.':'주간학습 양식 링크를 찾지 못했습니다.');});a.addEventListener('keydown',e=>{if(e.key==='Enter'&&!a.hasAttribute('href')){e.preventDefault();a.click()}})}
const name=document.getElementById('weekName'),title=document.getElementById('weekTitle');if(name&&title){const sync=()=>{title.title=name.textContent};new MutationObserver(sync).observe(name,{childList:true,characterData:true,subtree:true});sync()}
})();</script></body></html>'''
assert s.count(a)==1;s=s.replace(a,b).replace('1.64.9','1.65.0')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
