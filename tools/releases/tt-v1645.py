import pathlib,sys,re,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
# Preserve existing background preferences and use separate modal opacity.
rep('glassBlur:12,glassOpacity:78,particleDensity:', 'glassBlur:12,glassOpacity:78,modalOpacity:78,particleDensity:')
rep(' const load=()=>{\n  let v={};try{const x=JSON.parse(localStorage.getItem(KEY)', ' const glassValue=(v,def,min,max)=>typeof v===\'number\'&&Number.isFinite(v)?Math.max(min,Math.min(max,Math.round(v))):def;\n const load=()=>{\n  let v={};try{const x=JSON.parse(localStorage.getItem(KEY)')
rep("glass:true,particleDensity:'normal',glassBlur:12,glassOpacity:78,", "glass:true,particleDensity:'normal',glassBlur:glassValue(v.glassBlur,12,0,28),glassOpacity:glassValue(v.glassOpacity,78,45,100),modalOpacity:glassValue(v.modalOpacity,78,45,100),")
rep("document.body.style.setProperty('--tt-glass-alpha',(Math.max(45,Math.min(96,Number(S.glassOpacity)||78))/100).toFixed(2));\n  document.body.style.setProperty('--tt-glass-blur',Math.max(0,Math.min(28,Number(S.glassBlur)||0))+'px');", "applyGlass();")
rep(' function syncBackground(){',''' function applyGlass(){
  document.body.style.setProperty('--tt-glass-alpha',(S.glassOpacity/100).toFixed(2));
  document.body.style.setProperty('--tt-modal-alpha',(S.modalOpacity/100).toFixed(2));
  document.body.style.setProperty('--tt-glass-blur',S.glassBlur+'px');
 }
 function syncBackground(){''')
rep(' body.tt-scene-glass .item,body.tt-scene-glass .placeholder,body.tt-scene-glass .event-item,', ''' body.tt-scene-glass dialog,body.tt-scene-glass .house-modal{
  background:rgba(var(--tt-glass-rgb),var(--tt-modal-alpha,.78))!important;
 }
 /* Photo frame uses the card's one glass layer, not a second tinted overlay. */
 body .photo-card[data-photo-frame="glass"] .photo-frame{background:transparent!important;box-shadow:none!important}
 body .photo-card[data-photo-frame="glass"] .photo-frame::before,
 body .photo-card[data-photo-frame="glass"] .photo-frame::after{content:none!important;display:none!important}
 body .photo-card[data-photo-frame="glass"] .photo-frame img{box-shadow:0 0 0 1px var(--border)!important}
 body .photo-card[data-photo-frame="glass"] .photo-empty:not([hidden]){background:transparent!important}
 body #ttPhotoFrameRail [data-frame="glass"] .tt-mini-frame{background:var(--panel);border-color:var(--border)}
 body.tt-scene-glass #ttPhotoFrameRail [data-frame="glass"] .tt-mini-frame{background:rgba(var(--tt-glass-rgb),var(--tt-glass-alpha,.78));border-color:rgba(var(--tt-glass-border-rgb),.43)}
 body.tt-scene-glass .item,body.tt-scene-glass .placeholder,body.tt-scene-glass .event-item,''')
rep('   <div class="scene-field"><label for="sceneParticleScope">', '''   <h3>글라스 효과</h3>
   <p class="sub">배경 표시를 켜면 적용됩니다. 사진첩 글라스 프레임은 일반 위젯과 같은 색상·불투명도·블러를 사용합니다. 사진과 글자는 흐려지지 않습니다.</p>
   <div class="scene-field"><label for="sceneGlassOpacity">위젯 불투명도</label><input type="range" id="sceneGlassOpacity" min="45" max="100" step="1"><output id="sceneGlassOpacityValue" for="sceneGlassOpacity"></output></div>
   <div class="scene-field"><label for="sceneModalOpacity">설정창·모달 불투명도</label><input type="range" id="sceneModalOpacity" min="45" max="100" step="1"><output id="sceneModalOpacityValue" for="sceneModalOpacity"></output></div>
   <div class="scene-field"><label for="sceneGlassBlur">배경 블러</label><input type="range" id="sceneGlassBlur" min="0" max="28" step="1"><output id="sceneGlassBlurValue" for="sceneGlassBlur"></output><button type="button" id="sceneGlassReset">기본값 복원</button></div>
   <p class="scene-tip">100%는 불투명, 45%는 배경이 많이 비칩니다. 칠판형 알림장·학생 뽑기 등 가독성 보호 화면은 기존 스타일을 유지합니다.</p>
   <div class="scene-field"><label for="sceneParticleScope">''')
rep("  sec.querySelector('#sceneParticleScope').addEventListener('change'", '''  for(const [id,key,min,max,unit] of [['sceneGlassOpacity','glassOpacity',45,100,'%'],['sceneModalOpacity','modalOpacity',45,100,'%'],['sceneGlassBlur','glassBlur',0,28,'px']]){
   const input=sec.querySelector('#'+id),output=sec.querySelector('#'+id+'Value');
   input.addEventListener('input',()=>{S[key]=glassValue(Number(input.value),DEF[key],min,max);output.textContent=S[key]+unit;applyGlass();save()});
  }
  sec.querySelector('#sceneGlassReset').onclick=()=>{S.glassOpacity=DEF.glassOpacity;S.modalOpacity=DEF.modalOpacity;S.glassBlur=DEF.glassBlur;applyGlass();save();refreshSettings()};
  sec.querySelector('#sceneParticleScope').addEventListener('change' ''')
rep("  const field=(id)=>el.querySelector('#'+id);\n   field('sceneEnabled')", "  const field=(id)=>el.querySelector('#'+id);\n  for(const [id,key,unit] of [['sceneGlassOpacity','glassOpacity','%'],['sceneModalOpacity','modalOpacity','%'],['sceneGlassBlur','glassBlur','px']]){field(id).value=String(S[key]);field(id+'Value').textContent=S[key]+unit;}\n   field('sceneEnabled')")
a=s.index('  // V1.60.6: the detailed sound audit');b=s.index('  try{\n   const setting=JSON.parse(localStorage.getItem(\'teacher-lesson-alert-settings\')',a)
s=s[:a]+s[b:]
s=s.replace('1.64.4','1.64.5')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
