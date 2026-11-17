const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve('runtime-src/system');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1:17439');if(u.pathname.startsWith('/api/')||u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{}')}
let f=path.resolve(root,'.'+(u.pathname==='/'?'/dashboard.html':u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(17439,'127.0.0.1',r));let browser;try{
browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});
const engineErrors=[];page.on('pageerror',e=>{if(/ttTextRoles|score|ink|refresh|hex|ratio|glass/.test(e.stack||''))engineErrors.push(e.message)});
await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:17439/')?r.continue():r.abort());
await page.goto('http://127.0.0.1:17439/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>!!window.ttTextRoles&&document.body.style.getPropertyValue('--tt-ink-modal-primary'));
const results=await page.evaluate(async()=>{
const api=window.ttTextRoles,b=document.body,results=[],wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const color=c=>{if(c.startsWith('#'))return c;const m=c.match(/\d+/g);return '#'+m.slice(0,3).map(x=>(+x).toString(16).padStart(2,'0')).join('')};
function verify(name,fg,bg){const ratio=api.ratio(color(fg),color(bg));if(ratio<4.5-.00001)throw Error(name+' contrast '+ratio+' '+fg+' / '+bg);results.push({name,ratio:Math.round(ratio*100)/100})}
b.classList.remove('tt-scene-glass');await wait();
const settings=document.getElementById('settings');if(!settings.open)settings.showModal();
const privacy=settings.querySelector('#ttPrivacySection')||settings;
const links=[...privacy.querySelectorAll('a')];if(!links.some(a=>a.textContent.includes('CC BY')||a.textContent.includes('MET Norway')))throw Error('Real privacy links not found');
const probe=document.createElement('div');probe.innerHTML='<p>normal</p><p class="sub">secondary</p><a href="#probe">link</a><p class="error">warning</p><button class="accent">accent</button><div class="dust dust-good">dust</div>';settings.append(probe);
const primary=probe.children[0],sub=probe.children[1],link=probe.children[2],error=probe.children[3],btn=probe.children[4],dust=probe.children[5];
function checks(label,bgs){
 for(const [n,el] of [['primary',primary],['secondary',sub],['link',link],['alert',error]])for(const bg of bgs)verify(label+' '+n,getComputedStyle(el).color,bg);
 for(const el of links)for(const bg of bgs)verify(label+' actual privacy link',getComputedStyle(el).color,bg);
 verify(label+' accent button',getComputedStyle(btn).color,getComputedStyle(btn).backgroundColor);
 verify(label+' fixed air badge',getComputedStyle(dust).color,getComputedStyle(dust).backgroundColor);
}
for(const t of ['dark','sky','pink','green','black']){
 if(typeof window.setTheme==='function')window.setTheme(t);else b.dataset.theme=t;
 await wait();checks(t,[getComputedStyle(settings).backgroundColor]);
}
for(const [tag,bg,panel,modal,text,accent] of [['bad-light','#eeeeee','#ffffff','#f1f1f1','#e7e7e7','#f3eab4'],['bad-dark','#111111','#151515','#090909','#171717','#333333'],['mixed','#222222','#dddddd','#272727','#999999','#aaaaaa']]){
 b.classList.remove('tt-scene-glass');b.dataset.theme='custom';for(const [k,v] of Object.entries({'--bg':bg,'--panel':panel,'--surface':panel,'--tt-modal-panel':modal,'--text':text,'--sub':text,'--accent':accent,'--control':panel,'--current':accent}))b.style.setProperty(k,v);await wait();await wait();console.log('custom',tag,'scene',b.classList.contains('tt-scene-glass'),'modal',getComputedStyle(settings).backgroundColor,'role',getComputedStyle(settings).getPropertyValue('--text-primary'),'backing',b.style.getPropertyValue('--tt-ink-modal-primary'),'calc',api.ink(text,[modal]));checks(tag,[modal]);
}
b.classList.add('tt-scene-glass');
for(const [id,rgb] of [['glass-light','240,240,240'],['glass-dark','25,25,25'],['glass-mid','119,119,119']]){
 b.style.setProperty('--tt-glass-modal-rgb',rgb);b.style.setProperty('--tt-modal-alpha','.45');await wait();const a=Number(b.style.getPropertyValue('--tt-ink-modal-alpha'));const bg='#'+rgb.split(',').map(x=>(+x).toString(16).padStart(2,'0')).join('');checks(id,[api.mix('#000000',bg,a),api.mix('#ffffff',bg,a)]);
}
probe.remove();settings.close();return results;
});
console.log('PASS:',results.length,'contrast assertions across 5 built-in, 3 pathological custom, 3 glass cases; minimum',Math.min(...results.map(x=>x.ratio)));assert.deepEqual(engineErrors,[]);
}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
