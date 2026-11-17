/* The board owns the actual modal, theme, and seasonal overlay. Only public data is rendered. */
(()=>{
 'use strict';
 let frame=document.getElementById('ttPresentationFrame');
 const dlg=document.getElementById('ttPresentation'),title=document.getElementById('ttPresentationTitle'),close=document.getElementById('ttPresentationClose'),veil=document.getElementById('ttPresentationLoading'),canvas=document.getElementById('ttPresentationParticles');
 if(!dlg||!frame||!close||!canvas)return;
 const ctx=canvas.getContext('2d'),origin=location.origin,names={seating:'교실 자리 발표',pe:'체육 모둠 발표','life-qr':'학급생활 설문'};
 let active=null,loadTimer=0,frameReady=false,pollBusy=false,themeKey='',lastFailed=0,suppressedId='';
 const api=async(path,method='GET',body)=>{const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),2400);try{const r=await fetch('/api/presentation/'+path,{method,cache:'no-store',credentials:'omit',signal:ctrl.signal,...(body?{headers:{'Content-Type':'text/plain'},body}:{})});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}};
 const ack=(id,state)=>api('ack','POST',id+':'+state).catch(()=>{});
 const theme=()=>{const s=getComputedStyle(document.body),read=k=>s.getPropertyValue(k).trim();return {panel:read('--tt-modal-panel')||read('--panel'),text:read('--text'),border:read('--border'),control:read('--control'),controlText:read('--control-text'),accent:read('--accent'),sub:read('--sub'),surface:read('--surface')}};
 function replaceFrame(){const fresh=frame.cloneNode(false);fresh.removeAttribute('src');frame.replaceWith(fresh);frame=fresh;}
 function teardown(){clearTimeout(loadTimer);active=null;frameReady=false;themeKey='';replaceFrame();ctx.clearRect(0,0,canvas.width,canvas.height);if(dlg.open)dlg.close();document.body.classList.remove('tt-presentation-open')}
 function dismiss(state='closed'){const id=active?.id;if(id)suppressedId=id;teardown();if(id)void ack(id,state)}
 close.onclick=()=>dismiss();dlg.addEventListener('cancel',e=>{e.preventDefault();dismiss()});dlg.addEventListener('close',()=>{if(active&&!dlg.open)dismiss()});
 function show(item){
  if(!names[item.data?.kind]||!/^[a-f0-9]{32}$/.test(item.id)){void ack(item.id,'failed');return}
  if([...document.querySelectorAll('dialog[open]')].some(d=>d!==dlg)||document.body.classList.contains('layout-editing')||window.ttHouse?.isOpen?.()){suppressedId=item.id;void ack(item.id,'failed');return}
  clearTimeout(loadTimer);active=item;frameReady=false;themeKey='';dlg.dataset.kind=item.data.kind;title.textContent=names[item.data.kind];veil.hidden=false;
  window.ttHoja?.cancelSpeech?.();document.body.classList.add('tt-presentation-open');
  // A hash-only navigation retained the one-shot renderer. Destroy the old browsing context.
  replaceFrame();if(!dlg.open)dlg.showModal();frame.src='/presentation/seating/index.html?view=board&present=1&session='+item.id+'#'+item.id;
  loadTimer=setTimeout(()=>{if(active?.id===item.id)dismiss('failed')},26000);
 }
 addEventListener('message',event=>{
  if(!active||event.origin!==origin||event.source!==frame.contentWindow||!event.data)return;
  const d=event.data,id=active.id;
  if(d.type==='tt-present-ready'&&d.id===id){frame.contentWindow.postMessage({type:'tt-present-data',id,data:active.data,theme:theme()},origin)}
  else if(d.type==='tt-present-rendered'&&d.id===id){clearTimeout(loadTimer);frameReady=true;veil.hidden=true;void ack(id,'displayed')}
  else if(d.type==='tt-present-error'&&d.id===id)dismiss('failed');
 });
 async function poll(){
  if(pollBusy)return;pollBusy=true;
  try{
   const item=await api('poll');lastFailed=0;
   if(!item.id){suppressedId='';if(active)teardown();return}
   if(item.id===suppressedId)return;
   if(active?.id!==item.id){show(item);return}
   if(frameReady){const t=theme(),key=JSON.stringify(t);if(themeKey!==key){themeKey=key;frame.contentWindow.postMessage({type:'tt-present-theme',theme:t},origin)}}
  }catch{if(active){lastFailed++;if(lastFailed>=5)teardown()}}
  finally{pollBusy=false}
 }
 function particles(){
  if(dlg.open&&ctx){
   const source=document.getElementById('ttBackdropParticles'),r=dlg.getBoundingClientRect();
   const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
   ctx.clearRect(0,0,w,h);
   if(source&&source.width&&source.height&&!source.hidden&&getComputedStyle(source).display!=='none'){
    const s=source.getBoundingClientRect();
    if(s.width&&s.height){ctx.globalAlpha=.9;ctx.imageSmoothingEnabled=false;ctx.drawImage(source,(r.left-s.left)*source.width/s.width,(r.top-s.top)*source.height/s.height,w*source.width/s.width,h*source.height/s.height,0,0,w,h);ctx.globalAlpha=1}
    if(dlg.dataset.kind==='life-qr'){// Keep the complete QR square (including its quiet zone) scannable.
     try{const box=frame.contentDocument.querySelector('.tt-life-qr-code')?.getBoundingClientRect(),f=frame.getBoundingClientRect();if(box)ctx.clearRect(f.left-r.left+box.left-8,f.top-r.top+box.top-8,box.width+16,box.height+16)}catch{}
    }
   }
  }
  requestAnimationFrame(particles)
 }
 setInterval(poll,600);void poll();requestAnimationFrame(particles);
})();
