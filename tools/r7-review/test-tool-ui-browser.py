import json, pathlib, sys, shutil, re
from playwright.sync_api import sync_playwright
root=pathlib.Path(sys.argv[1]).resolve()
output=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else '.').resolve();output.mkdir(parents=True,exist_ok=True)
# Offline static document: never navigate a URL. All external network requests are aborted;
# assets and real source are inserted from the verified local R7 candidate.
html=(root/'dashboard.html').read_text(encoding='utf-8')
html=re.sub(r'<script src="/([^"/]+)"></script>',lambda m:'<script>'+((root/m[1]).read_text(encoding='utf-8-sig').replace('</script','<\\/script'))+'</script>',html)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome') or None,args=['--no-sandbox','--disable-dev-shm-usage'])
 ctx=b.new_context(viewport={'width':1600,'height':900},accept_downloads=True)
 ctx.route('**/*',lambda r:r.abort())
 errors=[]
 def fresh(saved=None):
  page=ctx.new_page();page.set_default_timeout(3000);page.on('pageerror',lambda e:errors.append(e.stack or str(e)))
  mock="""<script>(()=>{const memory=()=>{let m=new Map();return {getItem:k=>m.get(String(k))??null,setItem:(k,v)=>m.set(String(k),String(v)),removeItem:k=>m.delete(String(k)),clear:()=>m.clear(),get length(){return m.size},key:i=>[...m.keys()][i]??null}};Object.defineProperty(window,'localStorage',{value:memory()});Object.defineProperty(window,'sessionStorage',{value:memory()});window.testVolume=[];window.testOther=[];window.fetch=async(u,o)=>{const url=String(u);if(o?.method==='POST'){if(url==='/api/volume')testVolume.push(JSON.parse(atob(o.body)));else testOther.push(url);}const data=url==='/api/volume'?{level:55,muted:false}:url.startsWith('/api/week')?{dates:[],rows:[]}:{};return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})};})();</script>"""
  if saved:mock+='<script>for (const [k,v] of Object.entries('+json.dumps(saved,ensure_ascii=False)+'))localStorage.setItem(k,v);</script>'
  page.set_content(html.replace('<head>','<head>'+mock,1),wait_until='domcontentloaded',timeout=10000);page.wait_for_timeout(650);page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
  return page
 page=fresh()
 q=lambda s:page.locator(s)
 ev=lambda s:page.evaluate(s)
 def check(name,cond):
  if not cond: raise AssertionError(name)
  print('PASS',name,flush=True)
 card='.grid>.card[data-widget="tools"]';area=card+' > .tools';speaker=area+' > .spk-split'
 check('legacy default horizontal',q(card).get_attribute('data-tools-direction')=='horizontal')
 check('school icon, app label',q(area+' > [data-app=classkit]').inner_text().strip()=='앱관리' and q(area+' > [data-app=classkit] svg circle').count()==1)
 check('speaker remains one group',q(speaker+' > #toggleSpeaker').count()==1 and q(speaker+' > .spk-vol').count()==1)
 check('direction button not visible outside edit',not q('#ttToolDirection').is_visible())
 ev("document.getElementById('layoutEdit').click()")
 check('direction button last in edit toolbar',ev("document.querySelector('#layoutBar').lastElementChild.id==='ttToolDirection'"))
 orig=ev('JSON.parse(JSON.stringify(layout))')
 q('#ttToolDirection').click();page.wait_for_timeout(250)
 check('vertical CSS',q(card).get_attribute('data-tools-direction')=='vertical' and ev(f"getComputedStyle(document.querySelector('{area}')).gridAutoFlow")=='row')
 now=ev('JSON.parse(JSON.stringify(layout))')
 check('other rectangles unchanged by direction change',all(v==now['items'][k] for k,v in orig['items'].items() if k!='tools'))
 print('vertical rect',q(card).bounding_box(), 'speaker',q(speaker).bounding_box(),flush=True)
 check('vertical overflow controlled',ev(f"getComputedStyle(document.querySelector('{area}')).overflowY")=='auto')
 check('vertical minimum',ev('WIDGETS.tools.min.join(",")')=='3,5')
 q('#layoutCancel').click();page.wait_for_timeout(100)
 check('cancel restores direction and rectangle',q(card).get_attribute('data-tools-direction')=='horizontal' and ev('JSON.stringify(layout.items.tools)')==json.dumps(orig['items']['tools'],separators=(',',':')))
 ev("document.getElementById('layoutEdit').click()");q('#ttToolDirection').click();q('#layoutDone').click();page.wait_for_timeout(200)
 check('save persists direction',ev("JSON.parse(localStorage.getItem('class-layout')).toolsDirection")=='vertical')
 saved=ev('Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>{const k=localStorage.key(i);return [k,localStorage.getItem(k)]}))');page.close();page=fresh(saved)
 check('reload preserves vertical',q(card).get_attribute('data-tools-direction')=='vertical')
 check('vertical speaker aria',q(speaker+' .spk-vol').get_attribute('aria-orientation')=='vertical')
 ev(f"document.querySelector('{speaker}').scrollIntoView({{block:'center'}})");page.wait_for_timeout(300)
 # Avoid overlaps in the default layout by moving only test tool card to top of stacking order (in-memory).
 ev("layout.items.tools.z=999;layoutApply()")
 track=q(speaker+' .spk-track');r=track.bounding_box();print('track rect',r,flush=True)
 check('vertical track geometry',r['height']>r['width'] and r['height']>=12)
 x=r['x']+r['width']/2;y=r['y']+r['height']*.6
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,r['y']+r['height']*.12,steps=6);page.mouse.up();page.wait_for_timeout(220)
 check('vertical drag up increases',ev('testVolume.at(-1)?.level>=80'))
 page.mouse.move(x,r['y']+r['height']*.2);page.mouse.down();page.mouse.move(x,r['y']+r['height']*.85,steps=6);page.mouse.up();page.wait_for_timeout(220)
 check('vertical drag down decreases',ev('testVolume.at(-1)?.level<=25'))
 n=ev('testVolume.length');page.mouse.click(x,r['y']+r['height']*.5);page.wait_for_timeout(180);check('tap does not change volume',ev('testVolume.length')==n)
 q(speaker+' .spk-vol').focus();page.keyboard.press('ArrowUp');page.wait_for_timeout(200);check('vertical keyboard',ev('testVolume.at(-1)?.level>=15'))
 ev("document.getElementById('settings').showModal();window.showSettingsPane('hoja')");page.wait_for_timeout(180)
 check('Hoja settings filled snout, no ear path',q('#settings .settings-pane[data-pane=hoja] .pane-title svg ellipse[fill=currentColor]').count()==3)
 page.screenshot(path=str(output/'hoja-settings.png'));ev("document.getElementById('settings').close()")
 # For screenshot, move the tool card to far right and show only synthetic controls via layout test.
 ev("layout.items.tools.x=GRID_COLS-GRID_SIDE-layout.items.tools.w;layout.items.tools.y=0;layoutApply()")
 page.screenshot(path=str(output/'vertical-preview.png'))
 ev("document.getElementById('layoutEdit').click()")
 check('edit scroll controls visible when needed',q('#ttToolScroll').is_visible())
 ev(f"document.querySelector('{area}').scrollTop=0");page.wait_for_timeout(100)
 # drag first and second active tools along vertical midline
 loc=q(area+' > button:not([hidden])');r1=loc.nth(0).bounding_box();r2=loc.nth(1).bounding_box();before=ev("Array.from(document.querySelectorAll('.card[data-widget=tools] .tools > button:not([hidden])')).map(b=>b.id||b.dataset.app||b.textContent)")
 if r1 and r2:
  page.mouse.move(r1['x']+r1['width']*.4,r1['y']+r1['height']*.5);page.mouse.down();page.mouse.move(r2['x']+r2['width']*.4,r2['y']+r2['height']*.8,steps=8);page.mouse.up();page.wait_for_timeout(250)
  after=ev("Array.from(document.querySelectorAll('.card[data-widget=tools] .tools > button:not([hidden])')).map(b=>b.id||b.dataset.app||b.textContent)")
  check('vertical reorder by y',before!=after)
 q('#layoutCancel').click();page.wait_for_timeout(100)
 for w,h in [(1920,1080),(1366,768),(1024,768)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(220);r=q(card).bounding_box();check(f'{w}x{h} tools inside viewport',r['x']>=-1 and r['y']>=-1 and r['x']+r['width']<=w+1 and r['y']+r['height']<=h+1)
 assert not errors,errors
 assert not ev('testOther'),ev('testOther')
 print('PAGE ERRORS',errors,flush=True)
 print('Mocked other POSTs',ev('testOther'),flush=True)
 b.close()
