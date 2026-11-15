import sys,pathlib,re,json,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
def records(rows):
 return ','.join(json.dumps(dict(t=t,e=e),ensure_ascii=False,separators=(',',':')) for t,e in rows)
subjects={
 '체육':[('난 나한상보다도 빠르게 뛸 수 있어!','stars'),('{name:아/야}! 나랑 달리기 시합해 볼래?','question'),('피구? 난 공은 못 잡아…','drop')],
 '미술':[('내가 경주에서 성덕대왕신종 그림을 그린 적이 있는데…','idea'),('난 물감보다는 크레용이 좋아.','heart')],
 '음악':[('입이 크다고 노래를 꼭 잘하는 건 아니지.','dots1')],
 '국어':[('기역 니은 디글 니을...?? 틀렸나?','question'),('한글은 좀 어려운 것 같아.','drop')],
 '사회':[('나는 역사를 좋아해. {name:아/야}! 부여박물관 가 봤니? 내가 사는 집이야.','heart'),('경제나 정치는 너무 어려워서 못 하겠어.','drop'),('사회 시간은 자꾸 잠이 와…','sleep')],
 '수학':[('수학 문제에 단위를 안 쓰면 엄마한테 등짝 맞을지도 몰라.','drop')],
 '과학':[('과학 실험이 있는 날에는 선생님한테 자주 혼나는 것 같아.','drops'),('알코올램프 실험은 무서워.','alert')],
 '영어':[('아이 앰 어 보이. 유 아 어 걸.','music'),('라떼는 말이야. 초등학교 때 영어 수업이 없었는데…','dots3')],
 '도덕':[('도둑!!! 아닌가??','question'),('도덕 시간에 잠을 자면 왠지 좀 찔려.','drop')],
 '실과':[('선생님! 음식 만들기 실습은 안 하나요?','question')]
}
for k,v in subjects.items():
 m=re.search(r"(?m)^  '"+k+r"':\[(.*)\],$",s);assert m,k
 rep(m[0],m[0][:-2]+','+records(v)+'],')
m=re.search(r'(?m)^ dayStart:\[(.*)\],$',s);assert m
rep(m[0],m[0][:-2]+','+records([('얘들아, 오늘 숙제나 준비물은 잘 챙겼니?','question'),('아침 시간에는 차분하게 독서를 하는 거 어때?','idea'),('1교시 전에는 나랑 책 읽자.','heart')])+'],')
rep('const ex={next:s,subject:s};add(3,L.next,ex);','const ex={next:s,subject:s};if(cfg.names&&roster.length)ex.name=callName(pickOne(roster).name);add(3,L.next,ex);')
rep("  house:[{t:'앗! 여기 내 집이다!'", "  podo:["+records([('와, 칭찬 포도가 자라고 있어!','stars'),('우리 반 친구들이 힘을 모아 포도알을 채우는구나!','hearts'),('포도알을 다 모으면 뭐 할 거야?','question'),('나도 칭찬 포도알 받고 싶어!','heart'),('포도 한 송이가 되는 날이 기다려져!','idea')])+"],\n  dday:["+records([('기다리는 날이 점점 가까워진다!','star'),('두근두근, 무슨 일이 기다리고 있을까?','question'),('하루씩 줄어드는 숫자를 보니 설레!','hearts'),('기다리는 날까지 하루하루 즐겁게 보내자!','heart'),('달력에 표시해 두면 잊지 않겠지?','idea')])+"],\n  house:[{t:'앗! 여기 내 집이다!'")
rep("'우리 집 창문도 열린다~'],{e:'heart',eye:'smile'});", "'우리 집 창문도 열린다~','우리 집에 온 걸 환영해!','날 돌봐 주려고? 고마워!','오늘 날씨가 {weather}하네?','우리 집 꽤 좋지?'],{e:'heart',eye:'smile'});")
rep('const pool=(HL[key]||[]).concat(extra||[]);if(!pool.length)return null;', '''if(key==='houseInfo'){
   const code=window.ttWeather?.cur?.code;
   if(code!=null&&Number.isFinite(Number(code)))ctx={...ctx,weather:({clear:'화창',cloudy:'흐릿',rain:'축축',snow:'쌀쌀',thunder:'요란'})[weatherKind()]};
  }
  const pool=(HL[key]||[]).concat(extra||[]).filter(l=>key!=='houseInfo'||!l.t.includes('{weather}')||ctx.weather);if(!pool.length)return null;''')
rep("  const pool=WIDGET_LINES[id];", """  if(id==='podo'){
   const v=window.ttPodo?.info?.();if(!v||!v.goal)return null;
   if(v.count>=v.goal)return line([{t:'우와! 포도 한 송이 완성이다!',e:'stars'},{t:'우리 반이 힘을 모아 해냈어!',e:'hearts'},{t:'칭찬 포도를 다 모았네! 축하해!',e:'hearts'}],ctx);
  }
  if(id==='dday'){
   const v=card.querySelector('.tt-dday-large')?.textContent||'';if(!v||v.startsWith('D+'))return null;
   if(v==='D-DAY')return line([{t:'드디어 기다리던 날이야!',e:'stars'},{t:'오늘이 바로 그날이구나!',e:'hearts'}],ctx);
  }
  const pool=WIDGET_LINES[id];""")
# Pixel emote shared with house; render a real vector tail and shape with CSS, without image asset.
rep(' const SPEED={fast:35,normal:60,slow:110};', ''' // Measure complete text before the typewriter starts; separate at words, fall back to graphemes.
 function speechPages(text,measure,max){
  const lines=[];let row='';
  const flush=()=>{if(row){lines.push(row);row=''}};
  for(const word of String(text).trim().split(/\\s+/u).filter(Boolean)){
   if(row&&measure(row+' '+word)<=max){row+=' '+word;continue}
   flush();if(measure(word)<=max){row=word;continue}
   for(const ch of Array.from(word)){if(row&&measure(row+ch)>max)flush();row+=ch}
  }flush();const pages=[];for(let i=0;i<lines.length;i+=2)pages.push(lines.slice(i,i+2).join('\\n'));return pages;
 }
 const speechMeasure=document.createElement('canvas').getContext('2d');
 function preparePages(el,text,maxWidth){
  const c=getComputedStyle(el);speechMeasure.font=c.fontWeight+' '+c.fontSize+' '+c.fontFamily;
  const padding=parseFloat(c.paddingLeft)+parseFloat(c.paddingRight)+parseFloat(c.borderLeftWidth)+parseFloat(c.borderRightWidth)+6;
  const measure=t=>speechMeasure.measureText(t).width;
  const cap=Math.max(20,maxWidth-padding);
  return speechPages(text,measure,cap).map(t=>({text:t,width:Math.min(maxWidth,Math.ceil(Math.max(...t.split('\\n').map(measure))+padding))}));
 }
 function drawEmote(canvas,name){const c=emo[name];if(!c)return false;const p=canvas.getContext('2d');p.clearRect(0,0,18,18);p.drawImage(c,0,0);return true}
 const SPEED={fast:35,normal:60,slow:110};''')
a=s.index(' function say(l,opts={}){');b=s.index(' function positionBubble(el,anchor){',a)
s=s[:a]+''' function say(l,opts={}){
  if(!dashboardSpeakerAvailable())return;
  if(!l||!l.text){cancelSpeech();return}clearTimeout(talkTimer);const sp=l.sp||opts.sp||'normal',quiet=opts.quiet;
  activeCareSpeech=!!l.houseCare;st.talking=true;st.eye=l.eye||st.eye;st.eyeUntil=performance.now()+6000;
  const h=headPos(),e=l.e; bub.hidden=true;bub.classList.remove('fade');
  const hasEmote=!!(e&&emo[e]);if(hasEmote)emoteAt(e,h.x,h.y-20*S);else pop.hidden=true;
  const begin=()=>{
   if(!dashboardSpeakerAvailable()){cancelSpeech();return}
   pop.hidden=true;bub.className='hoja-bubble'+(sp==='fast'?' fast':'');bub.innerHTML='';
   const span=document.createElement('span');bub.append(span);
   const pages=preparePages(bub,l.text,Math.min(520,innerWidth*.65,innerWidth-16));let page=0;
   function showPage(){if(!dashboardSpeakerAvailable()){cancelSpeech();return}const p=pages[page];if(!p){cancelSpeech();return}
    bub.style.width=p.width+'px';bub.hidden=false;span.textContent='';let i=0;positionBubble(bub);
    const chars=Array.from(p.text);
    const step=()=>{if(!dashboardSpeakerAvailable()){cancelSpeech();return}if(i>=chars.length){
     talkTimer=setTimeout(()=>{bub.classList.add('fade');talkTimer=setTimeout(()=>{bub.hidden=true;bub.classList.remove('fade');page++;if(page<pages.length)showPage();else{st.talking=false;activeCareSpeech=false}},400)},2500+Math.min(3500,chars.length*60)+(sp==='slow'?1000:0));return}
     const ch=chars[i++];span.textContent=chars.slice(0,i).join('');positionBubble(bub);if(!quiet&&i%2&&ch.trim())beep('type');
     const pause=ch===','?150:/[.!?]/.test(ch)?250:ch==='…'?400:ch==='~'?120:0;talkTimer=setTimeout(step,SPEED[sp]+pause)};step();
   }showPage();
  };
  if(hasEmote)talkTimer=setTimeout(()=>{pop.hidden=true;talkTimer=setTimeout(begin,120)},700);else begin();
 }
'''+s[b:]
rep("el.style.setProperty('--tail',Math.max(16,Math.min(w-24,a.x-left))+'px');", "el.style.setProperty('--tail',Math.max(16,Math.min(w-28,a.x-left))+'px');el.style.setProperty('--tail-flip',a.x>left+w/2?-1:1);")
rep('cancelHouseExit};','cancelHouseExit,preparePages,drawEmote};')
# House: same page policy, distinct icon stage with no overlap. Explicit short game messages retain their requested dwell time.
rep("const bubble={text:'',until:0,emote:''};", "const bubble={text:'',until:0,emote:'',emoteUntil:0,start:0,pages:[],spans:[]};")
rep("function clearHouseSpeech(){bubble.text='';bubble.until=0;bub.hidden=true}", "function clearHouseSpeech(){bubble.text='';bubble.until=0;bubble.pages=[];bub.hidden=true;housePop.hidden=true}")
rep("  bubble.text=l.text;bubble.until=Date.now()+(ms||Math.max(3200,1600+l.text.length*120));\n  drawBubble();return l;", "  showHouseLine(l,ms);return l;")
rep('const viewCv=$id(\'houseView\'),panel=$id(\'housePanel\'),bub=$id(\'houseBubble\');', '''const viewCv=$id('houseView'),panel=$id('housePanel'),bub=$id('houseBubble');
 const housePop=document.createElement('canvas');housePop.className='house-emote';housePop.width=18;housePop.height=18;housePop.hidden=true;bub.after(housePop);
 function showHouseLine(l,ms){
  if(!houseSpeakerAvailable()||!l?.text)return;
  clearHouseSpeech();const now=Date.now();bubble.text=l.text;
  const hasEmote=!!(l.e&&window.ttHoja?.drawEmote?.(housePop,l.e));
  bubble.emoteUntil=now+(hasEmote?700:0);bubble.start=now+(hasEmote?820:0);
  const w=modal.querySelector('.house-body').getBoundingClientRect().width;
  bubble.pages=window.ttHoja.preparePages(bub,l.text,Math.max(30,Math.min(520,w*.72,w-16)));
  bubble.spans=bubble.pages.map(p=>ms||Math.max(3200,1600+p.text.length*120));
  bubble.until=bubble.start+bubble.spans.reduce((a,b)=>a+b,0);drawBubble();
 }''')
a=s.index(' function drawBubble(){');b=s.index(' function refreshUi(){',a)
s=s[:a]+''' function drawBubble(){
  if(!houseSpeakerAvailable()||!bubble.text||Date.now()>bubble.until){if(bubble.text||!bub.hidden||!housePop.hidden)clearHouseSpeech();return}
  const r=viewCv.getBoundingClientRect(),b=modal.querySelector('.house-body').getBoundingClientRect(),v=viewCv._vp||{VW:W,ox:0,oy:0},k=r.width/v.VW;
  const x=r.left-b.left+(hj.x+32+v.ox)*k,y=r.top-b.top+(hojaY()+(hj.act==='sleep'?30:8)+v.oy)*k,now=Date.now();
  if(now<bubble.start){bub.hidden=true;housePop.hidden=now>=bubble.emoteUntil;if(!housePop.hidden){housePop.style.left=clamp(x-housePop.offsetWidth/2,4,b.width-housePop.offsetWidth-4)+'px';housePop.style.top=Math.max(4,y-housePop.offsetHeight-8)+'px'}return}
  housePop.hidden=true;let elapsed=now-bubble.start,i=0;while(i<bubble.spans.length-1&&elapsed>=bubble.spans[i]){elapsed-=bubble.spans[i];i++}
  const p=bubble.pages[i];if(!p){clearHouseSpeech();return}if(bub.textContent!==p.text)bub.textContent=p.text;bub.style.width=p.width+'px';bub.hidden=false;
  const left=clamp(x-bub.offsetWidth/2,8,Math.max(8,b.width-bub.offsetWidth-8));bub.style.left=left+'px';bub.style.top=Math.max(4,y-bub.offsetHeight-12)+'px';
  bub.style.setProperty('--tail',clamp(x-left,16,Math.max(16,bub.offsetWidth-28))+'px');bub.style.setProperty('--tail-flip',x>left+bub.offsetWidth/2?-1:1);
 }
'''+s[b:]
rep("if(l){bubble.text=l.text;bubble.until=Date.now()+Math.max(3500,1600+l.text.length*120);drawBubble()}","if(l)showHouseLine(l)")
rep("bubble.text='';bub.hidden=true;", "clearHouseSpeech();")
# QR: no unregistered placeholders created by opening the add UI; keep registered URLs and meaningful custom entries.
rep("qrExtras.forEach(buildExtra);retireBase('qr');", """// Retire only unused, automatically numbered empty slots; preserve registered URLs, custom names and visible cards.
const oldQrLayout=safeGet('class-layout',{})?.items||{};
qrExtras=qrExtras.filter(q=>q.url.trim()||!/^QR 링크(?: \\d+)?$/.test(q.title||'')||oldQrLayout[q.id]?.off===false);
qrExtras.forEach(buildExtra);retireBase('qr');""")
a=s.index('function addQr(){');b=s.index('// Add from editor',a)
s=s[:a]+'''function addQr(){
 window.ttClasskit.open('qr');$('#ckQrName').focus();
}
'''+s[b:]
rep("title:'QR 링크 '+(qrExtras.length+1)","title:'QR 링크'") if "title:'QR 링크 '+(qrExtras.length+1)" in s else None
rep("const item={id:'qr-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),title:name.slice(0,35),url:u.href};qrExtras.push(item);buildExtra(item,qrExtras.length-1);saveExtras();layoutSave();layoutApply();renderExtraChoices();renderQrManager();", "const item={id:'qr-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),title:name.slice(0,35),url:u.href};qrExtras.push(item);buildExtra(item,qrExtras.length-1);saveExtras();if(document.body.classList.contains('layout-editing')){editAdded.push({kind:'qr',id:item.id});layoutDecorate()}else layoutSave();layoutApply();renderExtraChoices();renderQrManager();")
rep("else layout.items[item.id].off=true;layoutSave();layoutApply();renderQrManager()", "else layout.items[item.id].off=true;if(document.body.classList.contains('layout-editing'))layoutDecorate();else layoutSave();layoutApply();renderQrManager()")
rep("['＋ QR 링크','[data-add-qr-extra]']", "['＋ QR 등록·관리','[data-add-qr-extra]']")
rep('</body></html>', '''<style id="tt-v1644-speech">
.hoja-bubble,.house-bubble{box-sizing:border-box;display:block;border:3px solid #795a40;border-radius:999px;padding:.48em 1.05em;background:#fff3dc;color:#453326;font-weight:800;text-align:center;line-height:1.35;white-space:pre-line;overflow:visible;box-shadow:0 4px 0 #0002;word-break:normal;overflow-wrap:anywhere;max-width:none;}
.hoja-bubble[hidden],.house-bubble[hidden],.house-emote[hidden]{display:none!important}
.hoja-bubble.fast{font-size:clamp(17px,1.35vw,28px)}
.hoja-bubble span{white-space:pre-line;display:block;}
.hoja-bubble::after,.house-bubble::after{content:"";position:absolute;top:calc(100% - 4px);left:var(--tail,30px);width:27px;height:17px;transform:translateX(-11px) scaleX(var(--tail-flip,1));background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='27' height='17' viewBox='0 0 27 17'%3E%3Cpath d='M2 0H25Q18 13 5 15Q2 15 4 12Q10 5 7 0Z' fill='%23fff3dc'/%3E%3Cpath d='M7 0Q10 5 4 12Q2 15 5 15Q18 13 25 0' stroke='%23795a40' stroke-width='2.8' fill='none' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat;box-shadow:none;border:0;pointer-events:none;}
.hoja-bubble.nahan{background:#efe6d8;max-width:min(440px,60vw);width:max-content;}
.house-emote{position:absolute;z-index:3;width:clamp(32px,3vw,54px);height:auto;image-rendering:pixelated;pointer-events:none;}
</style></body></html>''')
s=s.replace('1.64.3','1.64.4')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
