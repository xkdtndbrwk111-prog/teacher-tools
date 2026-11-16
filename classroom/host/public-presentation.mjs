// The exact same student playback engines are used by the popup and the offline board.
export async function renderPublicPresentation(data){
   if(data?.kind==='seating'&&data.payload?.layout&&Array.isArray(data.payload?.students)){
     showPlayback(data.payload);
     document.querySelectorAll('#backToTeacher,#simpleBackToTeacher').forEach(el=>el.remove());
   }else if(data?.kind==='pe'&&Array.isArray(data.payload?.teams)){
     const api=window.__TT_PE_PUBLIC_VIEW;
     if(!api)throw Error('체육 공개 화면을 준비하지 못했습니다.');
     api.show(data.payload);
     document.getElementById('pePitchBack')?.remove();
   }else if(data?.kind==='life-qr'){
     const payload=data.payload;
     const {validatePublicSurveyUrl}=await import('./life-public-url.mjs?v=20261116-qr-cloud');
     const validated=validatePublicSurveyUrl(payload);
     const view=document.createElement('main');view.className='tt-life-qr-public';
     const eyebrow=document.createElement('p');eyebrow.className='tt-life-qr-eyebrow';eyebrow.textContent='TEACHER TOOLS · 학급생활';
     const title=document.createElement('h1');title.textContent=`${payload.month}월 학급생활 설문`;
     const classInfo=document.createElement('p');classInfo.className='tt-life-qr-class';classInfo.textContent=`${payload.className||'우리 반'} · ${payload.year}학년도`;
     const qr=document.createElement('div');qr.className='tt-life-qr-code';qr.setAttribute('aria-label','학생 설문 접속 QR 코드');
     const state=document.createElement('strong');state.className='tt-life-qr-state'+(payload.open?'':' is-closed');state.textContent=payload.open?'설문 진행 중':'설문이 아직 열리지 않았습니다';
     const guide=document.createElement('p');guide.className='tt-life-qr-guide';guide.textContent=payload.open?'개인 기기에서 QR을 읽고 학생 번호와 개인 코드 6자리를 입력하세요.':'선생님이 설문을 개설하면 참여할 수 있습니다.';
     const address=document.createElement('p');address.className='tt-life-qr-address';address.textContent=validated.url;
     view.append(eyebrow,title,classInfo,qr,state,guide,address);
     if(validated.local){const local=document.createElement('p');local.className='tt-life-qr-local';local.textContent='로컬 시험용 주소 · 다른 기기에서는 접속할 수 없습니다.';view.append(local)}
     document.body.append(view);
     await import('./qr-vendor/index.mjs').then(({default:QRCode})=>{
       const code=new QRCode(0,1);code.addData(validated.url);code.make();const n=code.getModuleCount(),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${n+8} ${n+8}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','학생 설문 접속 QR');const bg=document.createElementNS(svg.namespaceURI,'rect');bg.setAttribute('width',n+8);bg.setAttribute('height',n+8);bg.setAttribute('fill','white');svg.append(bg);for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(code.isDark(y,x)){const cell=document.createElementNS(svg.namespaceURI,'rect');cell.setAttribute('x',x+4);cell.setAttribute('y',y+4);cell.setAttribute('width',1);cell.setAttribute('height',1);svg.append(cell)}qr.replaceChildren(svg);
     }).catch(error=>{qr.textContent='QR을 표시하지 못했습니다. 아래 주소를 이용하세요.';throw error});
   }else throw Error('잘못된 학생 화면 자료입니다.');
}
