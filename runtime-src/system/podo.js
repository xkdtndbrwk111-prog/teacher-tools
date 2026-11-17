/* Teacher Tools: classroom grape reward board. Separate from individual student coins. */
(()=>{
'use strict';
const KEY='class-podo-board';
const SRC=window.ttCharacterPortraits||{hoja:'/hoja_face_original.webp',nahan:'/nahan_face_original.webp'};
const FALLBACK=window.ttCharacterPortraits||{hoja:'https://raw.githubusercontent.com/xkdtndbrwk111-prog/hoja-minigames/main/src/assets/images/core/portraits/hoja_09_sparkling.webp',nahan:'https://raw.githubusercontent.com/xkdtndbrwk111-prog/hoja-minigames/main/src/assets/images/core/portraits/nahansang_09_sparkling.webp'};
const $=id=>document.getElementById(id),card=document.querySelector('.card[data-widget="podo"]'),grid=$('podoGrid');
if(!card||!grid)return;
const css=document.createElement('style');
css.id='podo-style';
css.textContent=`
.podo-card{padding:0!important;min-width:0;overflow:hidden;display:flex;flex-direction:column;gap:0}
.podo-card[hidden]{display:none!important}
.podo-sheet{position:relative;flex:1 1 0;min-height:0;overflow:auto;text-align:center;color:var(--text-primary);background:linear-gradient(145deg,#fff,#f6f8f9);border-radius:inherit;padding:clamp(12px,1.3vw,24px) clamp(10px,1vw,20px) 12px;box-shadow:inset 0 0 0 1px rgba(110,126,136,.2)}
.podo-sheet:before{display:none!important} /* Handmade-paper texture is clipped only to the grape/leaf silhouette. */
.podo-sheet>*{position:relative;z-index:1}
.podo-head h2{font-size:clamp(18px,2vw,35px);font-weight:900;line-height:1.3;margin:0 0 8px;color:var(--text-primary)!important}
.podo-head>div{font-size:clamp(12px,1.2vw,18px);font-weight:850;margin:4px 0}
.podo-leaves{font-size:clamp(22px,2.4vw,42px);line-height:1.1;margin:6px 0;color:var(--text-accent)}
.podo-grid{display:flex;flex-direction:column;align-items:center;gap:clamp(2px,.4vw,9px);max-width:100%;width:max-content;margin:6px auto 18px}
.podo-row{display:flex;gap:clamp(2px,.4vw,9px);justify-content:center}
.podo-ball{display:grid;place-items:center;width:clamp(25px,3.4vw,57px);aspect-ratio:1;flex:none;border-radius:50%;border:1.5px dashed rgba(115,128,140,.45);background:#ffffff94;color:var(--text-secondary);font:900 clamp(11px,1.05vw,18px)/1 var(--tt-font,system-ui,sans-serif);position:relative;box-shadow:inset 0 1px 3px #66718a16}
.podo-ball.filled{border:2px solid #fffefa;box-shadow:0 3px 3px #27344340,0 4px 8px #2c304020,inset 0 2px 3px #fff8}
#podoDetail[data-grape='purple'] .podo-ball.filled{background:radial-gradient(circle at 27% 20%,#ecbdf5,#b17ac5 48%,#75438c)}
#podoDetail[data-grape='green'] .podo-ball.filled{background:radial-gradient(circle at 27% 20%,#f5ffd6,#bce179 48%,#83ad3c)}
.podo-ball img{position:absolute;inset:4px;width:calc(100% - 8px);height:calc(100% - 8px);object-fit:contain;object-position:center;opacity:.99;pointer-events:none;clip-path:none}
.podo-ball .podo-icon-fallback{font-size:clamp(15px,2vw,25px);display:none}
.podo-ball img:not([src])+.podo-icon-fallback,.podo-ball img.err+.podo-icon-fallback{display:block}
.podo-actions{flex:none;display:flex;gap:6px;padding:8px;background:#f4f7fa;box-shadow:0 -1px 5px #26324120}
.podo-actions button{flex:1;min-height:clamp(39px,5vh,58px);font:850 clamp(13px,1.2vw,20px)/1.2 var(--tt-font,system-ui,sans-serif);border-radius:8px;cursor:pointer}
.podo-actions button:last-child{background:#737f8d;color:var(--text-on-fill)}
.podo-due{font-weight:800;font-size:clamp(12px,1vw,16px);color:var(--text-secondary);padding-bottom:6px}
.podo-unconfigured{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#fafcfcec;padding:16px;text-align:center;color:var(--text-primary)}
.podo-unconfigured[hidden]{display:none!important}
.podo-unconfigured button{font-size:clamp(13px,1vw,18px);min-height:50px}
.podo-fly{position:fixed;z-index:2147482800;pointer-events:none;width:60px;height:60px;display:grid;place-items:center;border:3px solid #fff9e7;border-radius:50%;box-shadow:0 7px 10px #0005;background:#b37bc9;overflow:hidden}
.podo-fly img{width:92%;height:92%;object-fit:contain;clip-path:none}
#ttClasskit .podo-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:760px}
#ttClasskit .podo-form label{font-weight:850;font-size:16px;display:grid;gap:7px}
#ttClasskit .podo-form input,#ttClasskit .podo-form select{min-width:0;width:100%;min-height:46px;padding:8px;color:var(--text-primary);background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:17px}
#ttClasskit .podo-form .podo-wide{grid-column:span 2}
#ttClasskit .podo-management{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
#ttClasskit .podo-management button{min-height:48px}
#ttClasskit #podoHistory{overflow:auto;max-height:300px;padding:10px;border-radius:10px;background:var(--surface);font-size:14px;line-height:1.6}
#ttClasskit .podo-event{display:flex;gap:10px;padding:5px 3px;border-bottom:1px solid var(--border)}
#ttClasskit .podo-event time{min-width:112px;opacity:.75}
#podoWin{position:fixed;inset:0;z-index:2147482950;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#122e3fef;color:var(--text-on-fill);overflow:hidden;text-align:center}
#podoWin[hidden]{display:none!important}
#podoWin>*:not(canvas){position:relative;z-index:2}
#podoWin h2{font-size:clamp(32px,5vw,72px)}
#podoWin p{font-size:clamp(19px,2.4vw,36px)}
#podoWin button{font-size:22px;font-weight:850;min-height:58px;padding:12px 24px}
#podoConfetti{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#podoHojaJump{height:240px;width:240px;image-rendering:pixelated;image-rendering:crisp-edges;object-fit:contain}
/* V1.62.2: dashboard is display-only, click opens teacher-controlled full-size board. */
.grid>.card.podo-card{padding:0!important;min-height:0!important;min-width:0!important;cursor:pointer;user-select:none;overflow:hidden!important;background:#f6f9fa!important;box-shadow:inset 0 0 0 1px rgba(133,150,159,.34),0 3px 8px rgba(0,0,0,.1)}
.grid>.card.podo-card:focus-visible{outline:3px solid #6094c2;outline-offset:2px}
.podo-card .podo-overview{width:100%;height:100%;min-width:0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(2px,.4vh,7px);padding:clamp(4px,.7vw,13px);color:var(--text-primary);text-align:center;overflow:hidden}
.podo-card .podo-overview-full{width:100%;min-width:0;display:flex;flex-direction:column;align-items:center;gap:clamp(1px,.35vh,6px)}
.podo-card .podo-overview-label{font-size:clamp(11px,1.1vw,18px);font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.podo-card .podo-overview-count{font:900 clamp(18px,2.25vw,37px)/1.05 var(--tt-font,system-ui,sans-serif);font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--text-primary)}
.podo-card .podo-overview-count small{font-size:.6em;font-weight:800;color:var(--text-secondary)}
.podo-card .podo-overview-track{height:clamp(5px,.6vh,10px);width:min(85%,250px);border-radius:16px;background:#dce5e9;overflow:hidden;border:1px solid #cbd5da}
.podo-card .podo-overview-track i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ab79c1,#82519f);border-radius:inherit;transition:width .25s}
.podo-card[data-grape='green'] .podo-overview-track i{background:linear-gradient(90deg,#b9df6d,#6f9f37)}
.podo-card .podo-overview-caption{max-width:100%;font-size:clamp(9px,.8vw,13px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-secondary);font-weight:750}
.podo-card .podo-overview-tiny{display:none;font:900 clamp(15px,1.65vw,27px)/1 var(--tt-font,system-ui,sans-serif);white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--text-primary)}
.podo-card.podo-compact .podo-overview-caption{display:none}
.podo-card.podo-compact .podo-overview-label{font-size:12px}
.podo-card.podo-compact .podo-overview-count{font-size:clamp(17px,2vw,26px)}
.podo-card.podo-micro .podo-overview{padding:2px}
.podo-card.podo-micro .podo-overview-full{display:none}
.podo-card.podo-micro .podo-overview-tiny{display:block;max-width:100%;overflow:hidden;text-overflow:clip;font-size:clamp(11px,1.2vw,24px)}
body.layout-editing .podo-card{cursor:move}
/* The original sticker sheet and controls are mounted only in the enlarged dialog. */
#podoDetail{width:min(760px,96vw);height:min(930px,95dvh);max-width:none;max-height:none;min-width:0;padding:0;border:1px solid #bdc9d0;border-radius:18px;background:#f8fafb;color:var(--text-primary);box-shadow:0 18px 60px #0008;overflow:hidden}
#podoDetail[open]{display:flex;flex-direction:column}
#podoDetail::backdrop{background:rgba(5,19,28,.65)}
#podoDetail .podo-detail-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:0 0 auto;padding:12px 18px;background:#f7fafb;border-bottom:1px solid #d7e0e4}
#podoDetail .podo-detail-bar strong{font-size:clamp(18px,1.5vw,25px);font-weight:950}
#podoDetail .podo-detail-bar button{min-height:42px;padding:8px 18px;font-size:17px}
#podoDetail .podo-detail-inner{display:flex;flex-direction:column;flex:1;min-height:0;position:relative;overflow:hidden}
#podoDetail .podo-sheet{flex:1 1 0;min-height:0;border-radius:0;overflow:auto;background:linear-gradient(145deg,#e7f0ec,#dce8e3)}
#podoDetail .podo-grid{margin-bottom:18px}
#podoDetail .podo-actions{padding:12px 16px;gap:12px}
#podoDetail .podo-actions button{min-height:56px;font-size:clamp(19px,1.6vw,25px)}
#podoDetail .podo-unconfigured{position:absolute}
@media(max-width:900px){#podoDetail{height:min(880px,96dvh)}#podoDetail .podo-sheet{padding:15px 10px}#podoDetail .podo-grid{gap:5px}#podoDetail .podo-row{gap:4px}}

/* V1.62.4: keep the original modal header, title and action bar. Only grapes/stem/leaves get cut paper. */
#podoDetail .podo-cut-area{position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:center;width:100%;max-width:660px;margin:0 auto;min-height:90px;padding:5px 4px 10px}
#podoDetail .podo-cut-svg{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:visible}
#podoDetail .podo-cut-area>.podo-leaves{position:relative;z-index:1;display:flex;justify-content:center;align-items:center;width:170px;height:78px;max-width:60%;margin:0 auto -8px;line-height:1}
#podoDetail .podo-cut-area>.podo-leaves svg{height:100%;width:100%;display:block;overflow:visible}
#podoDetail .podo-cut-area>.podo-grid{position:relative;z-index:1;margin:4px auto 8px;overflow:visible}
#podoDetail .podo-cut-area .podo-ball{background:#ffffff75}
@media(max-width:900px){#podoDetail .podo-cut-area{padding:3px 3px 6px}#podoDetail .podo-cut-area>.podo-leaves{height:66px;width:142px;margin-bottom:-9px}}
@media(max-width:900px){#ttClasskit .podo-form{grid-template-columns:1fr}#ttClasskit .podo-form .podo-wide{grid-column:auto}}
`;
css.textContent+=`
#podoDetail,dialog.podo-pin,#ttClasskit:has([data-ck-page="podo"]:not([hidden])){position:fixed!important;inset:0!important;margin:auto!important;transform:none!important}
#podoDetail .podo-cut-area .podo-ball.filled{background:radial-gradient(circle at 27% 20%,#ecbdf5,#b17ac5 48%,#75438c)}
#podoDetail[data-grape="green"] .podo-cut-area .podo-ball.filled{background:radial-gradient(circle at 27% 20%,#f5ffd6,#bce179 48%,#83ad3c)}
.podo-card .podo-preview{display:none;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:8px;height:100%;width:100%;overflow:hidden;color:var(--text-primary);text-align:center}
.podo-card.podo-expanded .podo-overview{display:none}.podo-card.podo-expanded .podo-preview{display:flex}
.podo-preview strong,.podo-preview span{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:850;font-size:clamp(12px,1.1vw,20px)}
.podo-preview-grid{display:flex;flex-direction:column;align-items:center;gap:3px}.podo-preview-row{display:flex;gap:3px}
.podo-preview-ball{position:relative;display:grid;place-items:center;width:var(--podo-size);height:var(--podo-size);flex:none;border:1px dashed #a1adb5;border-radius:50%;background:#fff9;font-size:12px;color:var(--text-secondary)}
.podo-preview-ball.filled{border:2px solid #fffefa;background:radial-gradient(circle at 27% 20%,#ecbdf5,#b17ac5 48%,#75438c);box-shadow:0 2px 3px #37424a52}
.podo-card[data-grape="green"] .podo-preview-ball.filled{background:radial-gradient(circle at 27% 20%,#f5ffd6,#bce179 48%,#83ad3c)}
.podo-preview-ball img{position:absolute;width:84%;height:84%;inset:8%;object-fit:contain;pointer-events:none}
dialog.podo-pin{box-sizing:border-box;width:min(425px,calc(100vw - 32px));height:max-content;max-height:calc(100dvh - 40px);padding:24px;border:1px solid var(--border);border-radius:18px;background:var(--panel);color:var(--text-primary);overflow:auto}
dialog.podo-pin::backdrop{background:#07182099}.podo-pin form{display:grid;gap:12px}.podo-pin input{width:100%;font-size:26px;text-align:center;letter-spacing:.3em;padding:10px}.podo-pin form div{display:flex;gap:8px}.podo-pin form button{flex:1;min-height:44px}.podo-pin [role="alert"]{color:var(--text-alert);min-height:1em}
#podoDetail .podo-ball.podo-landing{z-index:4}
#podoDetail .podo-fly{position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;transform-origin:center;pointer-events:none;overflow:hidden;z-index:4}
`;
document.head.append(css);
// Move the full board out of the resizable widget. Only the summary remains on the dashboard.
const detail=document.createElement('dialog');detail.id='podoDetail';detail.setAttribute('aria-label','포도알 스티커 붙이기·떼기');
const detailBar=document.createElement('div');detailBar.className='podo-detail-bar';
const detailTitle=document.createElement('strong');detailTitle.textContent='🍇 우리 반 포도알';
const detailClose=document.createElement('button');detailClose.id='podoDetailClose';detailClose.type='button';detailClose.textContent='닫기';
detailBar.append(detailTitle,detailClose);
const detailInner=document.createElement('div');detailInner.className='podo-detail-inner';
for(const child of [card.querySelector('.podo-sheet'),$('podoWidgetActions'),$('podoUnconfigured')])detailInner.append(child);
detail.append(detailBar,detailInner);document.body.append(detail);
detailClose.addEventListener('click',()=>detail.close());
detail.addEventListener('close',()=>{detailUnlocked=false;detailEpoch++;if(pinDialog.open)pinDialog.close();if(activeFlight)activeFlight.cancel()});
const overview=document.createElement('div');overview.className='podo-overview';
overview.innerHTML='<div class="podo-overview-full"><div class="podo-overview-label">🍇 포도알 칭찬판</div><div class="podo-overview-count" id="podoSummaryCount">0 <small>/ 30</small></div><div class="podo-overview-track"><i id="podoSummaryBar"></i></div><div class="podo-overview-caption" id="podoSummaryCaption">눌러서 포도알 판 열기</div></div><strong class="podo-overview-tiny" id="podoSummaryTiny">0/30</strong>';
const preview=document.createElement('div');preview.className='podo-preview';preview.innerHTML='<strong>🍇 우리 반 포도알</strong><span id="podoPreviewInfo"></span><div id="podoPreviewGrid" class="podo-preview-grid" aria-hidden="true"></div>';card.prepend(preview,overview);card.tabIndex=0;card.setAttribute('role','button');
function openDetail(){
 if(document.body.classList.contains('layout-editing'))return;
 if(!state){openSetup();return}
 if(!detail.open){detailEpoch++;detailUnlocked=false;detail.showModal()}draw();requestAnimationFrame(renderCutPaper);
}
card.addEventListener('click',e=>{if(e.target.closest('.w-edit,.tt-edit-controls,button,input'))return;openDetail()});
card.addEventListener('keydown',e=>{if(e.target!==card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail()}});
function syncOverviewSize(){
 const b=card.getBoundingClientRect(),w=b.width,h=b.height;
 card.classList.toggle('podo-micro',w<168||h<85);
 card.classList.toggle('podo-compact',w<235||h<135);
 const lengths=rowFor(state?.goal||30),rows=lengths.length,cols=Math.max(...lengths),size=Math.floor(Math.min(72,(w-22-3*(cols-1))/cols,(h-82-3*(rows-1))/rows));
 const expanded=!!state&&w>=235&&h>=180&&size>=22;card.classList.toggle('podo-expanded',expanded);if(expanded){card.style.setProperty('--podo-size',size+'px');renderPreview()}
}
new ResizeObserver(syncOverviewSize).observe(card);
const rowFor=n=>n===30?[4,5,6,6,5,4]:(()=>{let count=0,res=[];const max=n<=24?5:n<=48?6:8;while(count<n){const len=Math.min(max,n-count);res.push(len);count+=len}return res})();
// The title and control bar remain in their original .podo-head / .podo-actions slots.
// All SVG geometry is restricted to this new grape-only board zone.
const paperArea=document.createElement('div');paperArea.className='podo-cut-area';
const leaf=detail.querySelector('.podo-leaves');
const grapeSheet=detail.querySelector('.podo-sheet');
const cutSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
cutSvg.classList.add('podo-cut-svg');cutSvg.setAttribute('aria-hidden','true');
paperArea.append(cutSvg,leaf,grid);grapeSheet.insertBefore(paperArea,grapeSheet.querySelector('.podo-due'));
leaf.textContent='';leaf.innerHTML=`<svg viewBox="0 0 170 86" role="img" aria-label="포도송이 꼭지와 두 잎">
 <path data-stem d="M87 78 Q80 48 87 12" fill="none" stroke="#678d55" stroke-width="7" stroke-linecap="round"/>
 <path data-leaf d="M84 59 Q47 24 17 40 Q36 81 83 63Z" fill="#a4c980" stroke="#5d8651" stroke-width="3"/>
 <path data-leaf d="M90 59 Q124 24 153 40 Q136 79 89 63Z" fill="#97c479" stroke="#5d8651" stroke-width="3"/>
 <path d="M32 43 Q59 53 79 63 M140 43 Q114 54 95 63" fill="none" stroke="#d9eabd" stroke-width="2.5"/>
 </svg>`;
const svgNS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs={}){const e=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e}
function renderCutPaper(){
 if(!detail.open)return;
 const B=paperArea.getBoundingClientRect();if(B.width<30||B.height<30)return;
 const rows=[...grid.querySelectorAll('.podo-row')].map(row=>[...row.querySelectorAll('.podo-ball')].map(el=>{
  const r=el.getBoundingClientRect();return{x:r.left+r.width/2-B.left,y:r.top+r.height/2-B.top,r:r.width/2+4.5};
 })).filter(x=>x.length);
 if(!rows.length)return;
 const W=B.width,H=B.height;cutSvg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const defs=svgEl('defs');const pattern=svgEl('pattern',{id:'ttPodoPaperTex',width:100,height:100,patternUnits:'userSpaceOnUse'});
 pattern.append(svgEl('rect',{x:0,y:0,width:100,height:100,fill:'#fffdf8'}));pattern.append(svgEl('image',{href:'/handmade-paper.png',x:0,y:0,width:100,height:100}));defs.append(pattern);
 const mask=svgEl('mask',{id:'ttPodoPaperSilhouette',x:0,y:0,width:W,height:H,maskUnits:'userSpaceOnUse'});
 // Solid center polygon closes ALL interior holes without flattening the lobed outside edge.
 const rights=rows.map(row=>row[row.length-1]),lefts=rows.map(row=>row[0]);
 const centerPath='M '+lefts[0].x+' '+lefts[0].y+' L '+rights.map(x=>x.x+' '+x.y).join(' L ')+' L '+lefts.slice().reverse().map(x=>x.x+' '+x.y).join(' L ')+' Z';
 mask.append(svgEl('path',{d:centerPath,fill:'#fff'}));
 for(const row of rows){
  if(row.length>1){const first=row[0],last=row[row.length-1];mask.append(svgEl('line',{x1:first.x,y1:first.y,x2:last.x,y2:last.y,stroke:'#fff','stroke-width':Math.min(18,first.r*.45),'stroke-linecap':'round'}))}
  for(const p of row)mask.append(svgEl('circle',{cx:p.x,cy:p.y,r:p.r,fill:'#fff'}));
 }
 // Trace the actual vector stem and leaves, not a large rectangular paper patch.
 const leafSVG=leaf.querySelector('svg');const R=leafSVG.getBoundingClientRect();
 const group=svgEl('g',{transform:`translate(${R.left-B.left} ${R.top-B.top}) scale(${R.width/170} ${R.height/86})`});
 for(const elem of leafSVG.querySelectorAll('[data-stem],[data-leaf]')){
  const c=elem.cloneNode(true);c.removeAttribute('data-leaf');c.removeAttribute('data-stem');c.setAttribute('stroke','#fff');c.setAttribute('stroke-width',elem.hasAttribute('data-stem')?'17':'10');c.setAttribute('fill',elem.hasAttribute('data-stem')?'none':'#fff');c.setAttribute('stroke-linejoin','round');group.append(c);
 }mask.append(group);
 // Continuous small connector under the stem to the first row, with no isolated islands.
 const firstY=rows[0][0].y,stemX=R.left-B.left+R.width*.5,stemY=R.top-B.top+R.height*.85;
 mask.append(svgEl('line',{x1:stemX,y1:stemY,x2:stemX,y2:firstY,stroke:'#fff','stroke-width':13,'stroke-linecap':'round'}));
 defs.append(mask);
 const shadow=svgEl('filter',{id:'ttPodoPaperShadow',x:'-15%',y:'-15%',width:'130%',height:'130%'});
 shadow.append(svgEl('feDropShadow',{dx:0,dy:5,stdDeviation:4,'flood-color':'#465a52','flood-opacity':'.38'}));defs.append(shadow);
 const base=svgEl('rect',{x:0,y:0,width:W,height:H,fill:'#fffdf8',mask:'url(#ttPodoPaperSilhouette)',filter:'url(#ttPodoPaperShadow)'});
 const back=svgEl('rect',{x:0,y:0,width:W,height:H,fill:'url(#ttPodoPaperTex)',mask:'url(#ttPodoPaperSilhouette)'});
 cutSvg.replaceChildren(defs,base,back);
}
const paperResizeObserver=new ResizeObserver(()=>{if(detail.open)requestAnimationFrame(renderCutPaper)});
paperResizeObserver.observe(paperArea);
detail.addEventListener('toggle',()=>{if(detail.open)requestAnimationFrame(renderCutPaper)});

let previewKey='';
function renderPreview(){if(!state||!card.classList.contains('podo-expanded'))return;const key=JSON.stringify([state.goal,state.type,state.reward,state.stamps]);if(key===previewKey)return;previewKey=key;const frag=document.createDocumentFragment();let i=0;for(const len of rowFor(state.goal)){const row=document.createElement('div');row.className='podo-preview-row';for(let j=0;j<len;j++,i++){const slot=document.createElement('div');slot.className='podo-preview-ball';if(i<state.stamps.length){slot.classList.add('filled');slot.append(makeStamp(state.stamps[i]))}else slot.textContent=String(i+1);row.append(slot)}frag.append(row)}$('podoPreviewGrid').replaceChildren(frag);$('podoPreviewInfo').textContent=state.stamps.length+' / '+state.goal+'알 · '+safe(state.reward,20)}
function makeStamp(person){const img=new Image();img.alt=person==='hoja'?'호자':'나한상';img.src=SRC[person];img.onerror=()=>{if(!img.dataset.tried){img.dataset.tried='1';img.src=FALLBACK[person]}else img.classList.add('err')};return img}
const safe=(s,max=80)=>String(s??'').slice(0,max);
function readRecord(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}
function teacherPin(){const v=readRecord();return v?.version===1&&typeof v.pinHash==='string'&&v.pinHash?v.pinHash:null}
function read(){try{const v=readRecord();if(v?.configured===false)return null;if(v&&typeof v==='object'&&v.version===1)return {...v,stamps:Array.isArray(v.stamps)?v.stamps.filter(x=>x==='hoja'||x==='nahan'):[],events:Array.isArray(v.events)?v.events:[]}}catch{}return null}
let state=read(),detailUnlocked=false,detailEpoch=0,activeFlight=null,working=false,winRaf=0,flakes=[],lastEmit=0,winOpen=false;
function storeRecord(value){try{return window.ttStoreJson?window.ttStoreJson(KEY,value):(localStorage.setItem(KEY,JSON.stringify(value)),true)}catch{return false}}
function save(){return storeRecord(state)}
const stampPerson=()=>Math.random()<.5?'hoja':'nahan';
const formatted=d=>d?`${Number(d.slice(5,7))}월 ${Number(d.slice(8,10))}일 까지`:'기한 없음';
function draw(){
 const configured=!!state;
 $('podoUnconfigured').hidden=configured;$('podoWidgetActions').hidden=!configured;
 const count=state?.stamps?.length||0,goal=state?.goal||30;
 $('podoSummaryCount').innerHTML=String(count)+' <small>/ '+String(goal)+'</small>';
 $('podoSummaryTiny').textContent=configured?`${count}/${goal}`:'미설정';
 $('podoSummaryBar').style.width=(configured?Math.min(100,count/goal*100):0)+'%';
 $('podoSummaryCaption').textContent=configured?(safe(state.reward,24)+' · 눌러서 열기'):'눌러서 수업 보조에서 설정';
 card.setAttribute('aria-label',configured?`포도알 ${count}/${goal}개. 눌러 스티커 판 열기`:'포도알 설정 필요. 눌러 수업 보조 열기');
 syncOverviewSize();if(!configured)return;
 card.dataset.grape=state.type;detail.dataset.grape=state.type;
 $('podoReward').textContent='🎁 '+safe(state.reward);$('podoProgress').textContent=`${count} / ${goal}알`;$('podoDue').textContent=formatted(state.due);
 if(activeFlight)return;grid.replaceChildren();let i=0;
 for(const len of rowFor(state.goal)){
  const row=document.createElement('div');row.className='podo-row';
  for(let j=0;j<len;j++){
   const slot=document.createElement('div');slot.className='podo-ball';slot.dataset.index=String(i);
   if(i<state.stamps.length){
    slot.classList.add('filled');const person=state.stamps[i],img=new Image();img.alt=person==='hoja'?'호자':'나한상';img.loading='lazy';img.src=SRC[person];img.onerror=()=>{if(img.dataset.tried)return;img.dataset.tried='1';img.src=FALLBACK[person];img.onerror=()=>{img.classList.add('err')}};
    const fallback=document.createElement('span');fallback.className='podo-icon-fallback';fallback.textContent=person==='hoja'?'🐾':'🪨';slot.append(img,fallback);
   }else{slot.textContent=String(i+1)}
   row.append(slot);i++;
  }grid.append(row);
 }
 if(detail.open)requestAnimationFrame(renderCutPaper);
}
// A PIN is required for classroom-board writes; no additional visual/sound settings.
async function hashPin(pin){const input=new TextEncoder().encode('TT-PODO-V1/'+pin);if(crypto.subtle){const digest=await crypto.subtle.digest('SHA-256',input);return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')}return Array.from(input).join('-')}
const pinDialog=document.createElement('dialog');pinDialog.className='podo-pin';pinDialog.id='podoPinDialog';pinDialog.setAttribute('aria-label','공통 교사 인증');pinDialog.innerHTML='<form method="dialog"><h3 id="podoPinTitle">🔒 교사 인증</h3><p id="podoPinHelp"></p><input id="podoPinInput" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="교사 인증번호 4자리"><input id="podoPinConfirm" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="새 인증번호 다시 입력" placeholder="새 인증번호 다시 입력" hidden><p id="podoPinError" role="alert"></p><div><button type="button" id="podoPinCancel">취소</button><button type="submit" class="accent">확인</button></div></form>';document.body.append(pinDialog);
let pinPending=null;
function requestPin(scope,verified=null){if(pinPending)return Promise.resolve(false);const expected=teacherPin(),changing=scope==='coin-change'&&Boolean(expected)&&verified===expected,creating=(scope==='coin-create'&&!expected)||changing,epoch=detailEpoch;let resolve;pinPending=new Promise(r=>resolve=r);const pending=pinPending;const input=$('podoPinInput'),error=$('podoPinError');const confirmInput=$('podoPinConfirm');input.value='';confirmInput.value='';confirmInput.hidden=!creating;error.textContent='';$('podoPinTitle').textContent=creating?'🔒 교사 인증번호 설정':'🔒 교사 인증';$('podoPinHelp').textContent=creating?'포도알·코인에서 함께 사용할 숫자 4자리를 두 번 입력하세요.':scope==='detail'?'인증하면 이 포도알 판을 닫을 때까지 붙이거나 뗄 수 있습니다.':scope==='coin'?'코인을 지급하거나 회수하려면 교사 인증번호를 입력하세요.':'설정을 변경하려면 교사 인증번호를 입력하세요.';let settled=false,checking=false;
 const finish=ok=>{if(settled)return;settled=true;pinPending=null;input.value='';confirmInput.value='';if(pinDialog.open)pinDialog.close();resolve(ok)};
 pinDialog.onclose=()=>{if(!pinDialog.open)finish(false)};pinDialog.oncancel=e=>{e.preventDefault();finish(false)};$('podoPinCancel').onclick=()=>finish(false);
 pinDialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(settled||checking)return;const pin=input.value.trim();checking=true;try{if(creating){if(!/^\d{4}$/.test(pin)||pin!==confirmInput.value){error.textContent='동일한 숫자 4자리를 두 번 입력하세요.';return}const hash=await hashPin(pin);if(settled)return;if(teacherPin()!==expected){error.textContent='인증번호가 변경되었습니다. 다시 열어 주세요.';return}const record=readRecord();const next=record?.version===1?{...record,pinHash:hash}:{version:1,configured:false,pinHash:hash};if(!storeRecord(next)){error.textContent='인증번호를 저장하지 못했습니다.';return}if(state)state=next;detailUnlocked=false;finish(true);return}const valid=/^\d{4}$/.test(pin)&&expected&&await hashPin(pin)===expected;if(settled)return;if(!valid||teacherPin()!==expected){error.textContent='인증번호가 맞지 않습니다.';input.value='';input.focus();return}if(scope==='detail'&&(!detail.open||epoch!==detailEpoch)){finish(false);return}finish(true)}catch{error.textContent='인증을 확인하지 못했습니다.'}finally{checking=false}};
 pinDialog.showModal();input.focus();return pending;
}
async function authorize(scope='settings'){const epoch=detailEpoch;const expected=teacherPin();if(scope==='detail'&&detail.open&&expected&&detailUnlocked===expected)return true;const ok=await requestPin(scope);if(scope!=='detail')return ok;if(ok&&detail.open&&epoch===detailEpoch){detailUnlocked=expected;return Boolean(expected&&teacherPin()===expected)}return false}
function log(kind,detail){state.events.unshift({at:new Date().toISOString(),kind,detail});if(state.events.length>1000)state.events=state.events.slice(0,1000)}
function play(notes){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=play.ctx||(play.ctx=new C());if(ctx.state==='suspended')ctx.resume().catch(()=>{});const delta=0.93+Math.random()*.14,duration=0.92+Math.random()*.2;notes.forEach(([offset,a,b,len,wave,gain])=>{const osc=ctx.createOscillator(),v=ctx.createGain(),start=ctx.currentTime+offset*duration+.008;osc.type=wave;osc.frequency.setValueAtTime(a*delta,start);osc.frequency.exponentialRampToValueAtTime(b*delta,start+len*duration);v.gain.setValueAtTime(.0001,start);v.gain.exponentialRampToValueAtTime(gain,start+.012);v.gain.exponentialRampToValueAtTime(.0001,start+len*duration);osc.connect(v).connect(ctx.destination);osc.start(start);osc.stop(start+len*duration+.01)})}catch{}}
const sfxAdd=()=>play([[0,405,580,.13,'sine',.08],[.13,220,320,.08,'triangle',.10],[.29,720,245,.22,'sine',.13]]),sfxRemove=()=>play([[0,440,145,.2,'triangle',.10],[.08,210,100,.15,'sine',.07]]),sfxWin=()=>play([[0,650,760,.22,'sine',.13],[.12,790,970,.22,'triangle',.10],[.27,1040,1320,.40,'sine',.13]]);
async function apply(delta){
 if(working||!state||!detail.open)return;
 const session=detailEpoch;working=true;
 try{
  if(delta>0&&state.due&&new Date(state.due+'T23:59:59').getTime()<Date.now()){alert('기한이 지난 포도알 칭찬판입니다. 앱관리에서 새 목표를 설정하세요.');return}
  if(delta>0&&state.stamps.length>=state.goal)return;
  if(delta<0&&!state.stamps.length)return;
  if(!await authorize('detail')||!detail.open||session!==detailEpoch)return;
  const before=JSON.stringify(state),person=stampPerson(),index=delta>0?state.stamps.length:state.stamps.length-1;
  if(delta>0){state.stamps.push(person);log('add',(person==='hoja'?'호자':'나한상')+' +1')}else{const removed=state.stamps.pop();log('remove',(removed==='hoja'?'호자':'나한상')+' -1')}
  if(!save()){state=JSON.parse(before);alert('포도알 기록을 저장하지 못했습니다.');return}
  if(delta>0){
   // Use the destination slot as the containing block, not a fixed viewport position inside a modal.
   const target=grid.querySelector(`[data-index="${index}"]`),from=$('podoAdd');sfxAdd();
   if(target&&from&&target.offsetWidth){target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const a=from.getBoundingClientRect(),b=target.getBoundingClientRect(),sx=b.width/Math.max(1,target.offsetWidth),sy=b.height/Math.max(1,target.offsetHeight),dx=(a.left+a.width/2-b.left-b.width/2)/sx,dy=(a.top+a.height/2-b.top-b.height/2)/sy;
    const flyer=document.createElement('div');flyer.className='podo-fly';flyer.style.background=state.type==='green'?'#b6df72':'#b37cc5';flyer.append(makeStamp(person));target.classList.add('podo-landing');target.append(flyer);
    try{activeFlight=flyer.animate([{transform:`translate(${dx}px,${dy}px) scale(.65) rotate(-12deg)`},{transform:`translate(${dx*.42}px,${dy*.42-45}px) scale(1.3) rotate(13deg)`,offset:.5},{transform:'translate(0,0) scale(1)'}],{duration:600,easing:'cubic-bezier(.26,.74,.22,1)',fill:'forwards'});await activeFlight.finished.catch(()=>{})}finally{activeFlight=null;flyer.remove();target.classList.remove('podo-landing')}
   }
  }else sfxRemove();
  draw();renderHistory();if(detail.open&&session===detailEpoch&&state.stamps.length>=state.goal){detail.close();sfxWin();openWin()}
 }finally{working=false}
}
$('podoAdd').addEventListener('click',e=>{e.stopPropagation();void apply(1)});
$('podoRemove').addEventListener('click',e=>{e.stopPropagation();void apply(-1)});
// Teacher-only controls are inside the existing classroom toolkit.
const kit=$('ttClasskit');if(!kit){draw();return}
const tabs=kit.querySelector('.ck-tabs'),content=kit.querySelector('.ck-content');
// The management tab/page are statically part of the toolkit. Reuse them rather
// than appending a seventh, potentially offscreen tab after initialization.
let tab=tabs.querySelector('[data-ck-tab="podo"]');
if(!tab){tab=document.createElement('button');tab.type='button';tab.dataset.ckTab='podo';tab.textContent='🍇 포도알 관리';tabs.prepend(tab)}
let page=content.querySelector('[data-ck-page="podo"]');
if(!page){page=document.createElement('section');page.className='ck-page';page.dataset.ckPage='podo';page.hidden=true;content.prepend(page)}
page.innerHTML=`<h3>🍇 학급 포도알 칭찬판 설정</h3><p class="ck-sub">위젯에서는 붙이기·떼기만 할 수 있습니다. 목표와 변경 기록은 이 화면에서 관리합니다.</p><div class="podo-form"><label>보상 이름<input id="podoGoalReward" maxlength="45" placeholder="예: 과자 파티"></label><label>목표 개수<input id="podoGoalCount" type="number" min="6" max="100" step="1"></label><label>기한 (선택)<input id="podoGoalDue" type="date"></label><label>포도 종류<select id="podoGoalType"><option value="purple">보라 포도</option><option value="green">샤인머스켓</option></select></label><label class="podo-wide">공통 교사 인증번호 (포도알·코인, 숫자 4자리)<input id="podoGoalPin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="처음 등록 시 설정, 이후 변경하지 않을 땐 비워 두세요"></label></div><div class="podo-management"><button type="button" class="accent" id="podoSaveSettings">설정 저장</button><button type="button" id="podoNewGoal">새 목표 시작</button></div><p class="ck-sub" id="podoSettingsStatus" role="status"></p><h3>변경 기록</h3><div id="podoHistory">아직 기록이 없습니다.</div>`;
content.append(page);
const openSetup=()=>{window.ttClasskit?.open?.('podo');syncForm()};
$('podoGoSetup').addEventListener('click',e=>{e.stopPropagation();openSetup()});
tab.onclick=()=>openSetup();
function syncForm(){
 $('podoGoalReward').value=state?.reward||'';$('podoGoalCount').value=state?.goal||30;$('podoGoalDue').value=state?.due||'';$('podoGoalType').value=state?.type||'purple';$('podoGoalPin').value='';$('podoGoalPin').placeholder=teacherPin()?'변경할 때만 입력 (기존 공통 번호 사용)':'최초 공통 인증번호 4자리';renderHistory();
}
function renderHistory(){if(!$('podoHistory'))return;if(!state?.events?.length){$('podoHistory').textContent='아직 기록이 없습니다.';return}const frag=document.createDocumentFragment();for(const e of state.events.slice(0,300)){const line=document.createElement('div');line.className='podo-event';const time=document.createElement('time');time.textContent=new Date(e.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});const label=document.createElement('span');label.textContent=e.detail;line.append(time,label);frag.append(line)}$('podoHistory').replaceChildren(frag)}
$('podoSaveSettings').onclick=async()=>{
 const reward=$('podoGoalReward').value.trim().slice(0,45),goal=Number($('podoGoalCount').value),due=$('podoGoalDue').value,type=$('podoGoalType').value,pin=$('podoGoalPin').value;
 if(!reward||!Number.isInteger(goal)||goal<6||goal>100||!['purple','green'].includes(type)){$('podoSettingsStatus').textContent='보상 이름과 목표 개수(6~100)를 확인해 주세요.';return}
 if(state&&goal<state.stamps.length){$('podoSettingsStatus').textContent='현재 붙인 수보다 목표가 작습니다. 새 목표로 시작해 주세요.';return}
 const current=teacherPin();if((!current||pin)&&!/^\d{4}$/.test(pin)){$('podoSettingsStatus').textContent='최초 설정 시 인증번호 4자리가 필요합니다.';return}
 const before=state&&JSON.stringify(state),hash=pin?await hashPin(pin):current;
 if(current&&!(await authorize()))return;if(teacherPin()!==current){$('podoSettingsStatus').textContent='공통 인증번호가 변경되었습니다. 다시 시도하세요.';return}detailUnlocked=false;
 const next={version:1,reward,goal,due,type,pinHash:hash,stamps:state?.stamps||[],events:state?.events||[]};
 state=next;log('settings',`설정 변경 · ${reward} · ${goal}알 · ${type==='purple'?'보라 포도':'샤인머스켓'}`);
 if(!save()){state=before?JSON.parse(before):null;$('podoSettingsStatus').textContent='설정을 저장하지 못했습니다.';return}
 $('podoSettingsStatus').textContent='설정이 저장됐습니다.';syncForm();draw();
};
$('podoNewGoal').onclick=async()=>{
 if(!state){$('podoSettingsStatus').textContent='먼저 목표를 등록해 주세요.';return}
 if(!await authorize()||!confirm('기존 스티커는 비우고 새 목표를 시작할까요? 이전 기록은 보존됩니다.'))return;
 detailUnlocked=false;const before=JSON.stringify(state);state.stamps=[];log('reset',`새 목표 시작 · 이전 기록 유지`);if(!save()){state=JSON.parse(before);return}draw();renderHistory();
};
// Existing layout-editing completes before an unconfigured widget is taken to setup.
function maybeConfigure(){if(!state&&!card.hidden&&!document.body.classList.contains('layout-editing')&&!kit.open)setTimeout(()=>{if(!state&&!card.hidden&&!kit.open)openSetup()},50)}
$('layoutDone')?.addEventListener('click',()=>setTimeout(maybeConfigure,80));
$('layoutAddMenu')?.addEventListener('click',e=>{if(e.target?.dataset?.addWidget==='podo')setTimeout(maybeConfigure,150)});
const observer=new MutationObserver(()=>{if(!card.hidden)maybeConfigure()});observer.observe(card,{attributes:true,attributeFilter:['hidden']});
// Celebration is a view only: its pixels come from window.HOJA_DATA.frames.JUMP (five existing 64×64 frames).
const win=document.createElement('div');win.id='podoWin';win.hidden=true;win.setAttribute('role','dialog');win.setAttribute('aria-label','포도알 목표 달성');win.innerHTML='<canvas id="podoConfetti" aria-hidden="true"></canvas><h2>우리 반 목표 달성!</h2><canvas id="podoHojaJump" width="64" height="64" aria-label="기뻐하며 점프하는 픽셀 호자"></canvas><p id="podoWinReward"></p><button type="button" class="accent" id="podoWinClose">닫기</button>';document.body.append(win);
const c=$('podoHojaJump'),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
const frameCache=[];
function pixelFrame(i){if(frameCache[i])return frameCache[i];const D=window.HOJA_DATA,rows=D?.frames?.JUMP?.[i];if(!rows)return null;const can=document.createElement('canvas');can.width=64;can.height=64;const p=can.getContext('2d');for(let y=0;y<Math.min(64,rows.length);y++){let x=0;for(const m of String(rows[y]).matchAll(/(\D)(\d*)/g)){const color=D.pal[m[1]],len=m[2]?+m[2]:1;if(color){p.fillStyle=color;p.fillRect(x,y,Math.min(len,64-x),1)}x+=len}}return frameCache[i]=can}
const colors=['#c9a0f1','#ffe58e','#8bc4fe','#a8e47a','#ffffff','#ff9bc1'];
const fx=$('podoConfetti'),fctx=fx.getContext('2d');
function closeWin(){winOpen=false;win.hidden=true;cancelAnimationFrame(winRaf);winRaf=0;flakes=[]}
$('podoWinClose').onclick=closeWin;
function openWin(){if(winOpen)return;winOpen=true;win.hidden=false;$('podoWinReward').textContent=safe(state?.reward,45)+' · 함께 해냈어요!';lastEmit=performance.now();let lastFrame=-1;
 function animate(t){if(!winOpen)return;const ratio=Math.min(2,devicePixelRatio||1),w=innerWidth,h=innerHeight,W=Math.round(w*ratio),H=Math.round(h*ratio);if(fx.width!==W||fx.height!==H){fx.width=W;fx.height=H}fctx.setTransform(ratio,0,0,ratio,0,0);fctx.clearRect(0,0,w,h);const dt=Math.min(50,t-lastEmit||16);lastEmit=t;for(let i=0;i<Math.max(1,Math.round(w/150));i++)flakes.push({x:Math.random()*w,y:-24,v:2+Math.random()*3,phase:Math.random()*6.28,color:colors[Math.random()*colors.length|0],spin:Math.random()*6.28});
 flakes=flakes.filter(a=>a.y<h+32).slice(-650);for(const p of flakes){p.y+=p.v*(dt/16);p.x+=Math.sin(t/400+p.phase)*.6;fctx.fillStyle=p.color;fctx.save();fctx.translate(p.x,p.y);fctx.rotate(p.spin+t/1400);fctx.fillRect(-3,-6,6,12);fctx.restore()}
 const i=Math.floor(t/125)%5;if(i!==lastFrame){lastFrame=i;ctx.clearRect(0,0,64,64);const pic=pixelFrame(i);if(pic)ctx.drawImage(pic,0,0);}
 // The five source frames already encode the jump; keep one shared ground origin.
 winRaf=requestAnimationFrame(animate)
 }winRaf=requestAnimationFrame(animate);
}
draw();renderHistory();maybeConfigure();
async function requestCoinAccess(){const old=teacherPin();if(!await requestPin(old?'coin':'coin-create'))return null;const expected=teacherPin();if(!expected||(old&&old!==expected))return null;return ()=>teacherPin()===expected}
async function changeTeacherPin(){const expected=teacherPin();if(!expected||!await requestPin('coin')||teacherPin()!==expected)return false;return requestPin('coin-change',expected)}
window.ttPodo={openSetup,syncForm,redraw:draw,changeTeacherPin,hasTeacherPin:()=>Boolean(teacherPin()),requestCoinAccess,info:()=>state&&{goal:state.goal,count:state.stamps.length,type:state.type}};
})();
