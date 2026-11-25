// CI-only physical-input diagnostic, compiled separately from the shipping exe.
// No teacher account, legal acceptance, design edits, saved screenshots or content logs.
#if TT_LIVE_PROBE
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
internal sealed partial class BookReader {
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 static void ProbeLog(string label,object data){Console.WriteLine(label+" "+Json.Serialize(data));}
 async Task Pause(int ms){await Task.Delay(ms);}
 async Task<bool> PhysicalClick(double x,double y){
  if(closed||!slotVisible||!OwnerValid())return false;
  await web.CoreWebView2.ExecuteScriptAsync("0");
  var p=web.PointToScreen(new Point((int)(web.ClientSize.Width*x),(int)(web.ClientSize.Height*y)));
  SetForegroundWindow(Handle);web.Focus();await Pause(120);
  SetCursorPos(p.X,p.Y);
  var hit=WindowFromPoint(new POINT{X=p.X,Y=p.Y});
  if(hit==IntPtr.Zero||GetAncestor(hit,2)!=Handle)return false;
  mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);
  await Pause(150);return true;
 }
 async Task<bool> PhysicalKey(byte key){
  if(closed||GetForegroundWindow()!=Handle)return false;
  keybd_event(key,0,0,UIntPtr.Zero);keybd_event(key,0,2,UIntPtr.Zero);
  await Pause(200);return true;
 }
 async Task<string> FrameHash(){
  using(var m=new MemoryStream()){await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,m);m.Position=0;
   using(var image=new Bitmap(m)){
    // Exclude moving pointer, edge controls and top/bottom toolbar. Only
    // the central slide pixels are hashed, never stored or output.
    var rect=new Rectangle(image.Width/8,image.Height/8,image.Width*3/4,image.Height*3/4);
    using(var cropped=image.Clone(rect,System.Drawing.Imaging.PixelFormat.Format32bppArgb))
    using(var data=new MemoryStream())
    using(var sha=SHA256.Create()){cropped.Save(data,System.Drawing.Imaging.ImageFormat.Png);return Convert.ToBase64String(sha.ComputeHash(data.ToArray()));}
   }
  }
 }
 async Task<Dictionary<string,object>> InspectPublicUi(){
  const string js=@"(()=>{const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};const bs=[...document.querySelectorAll('button,[role=button]')].filter(vis);const exact=(re,dialogOnly=false)=>{const a=bs.filter(e=>(!dialogOnly||e.closest('[role=dialog],[aria-modal=true]'))&&re.test((e.getAttribute('aria-label')||e.innerText||e.getAttribute('title')||'').trim()));if(a.length!==1)return null;const r=a[0].getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const h=document.elementFromPoint(x,y);return {x:x/innerWidth,y:y/innerHeight,hit:!!h&&(a[0]===h||a[0].contains(h))}};const dialogNodes=[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis);const loginDialog=dialogNodes.some(e=>[...e.querySelectorAll('button,[role=button],a,h1,h2,h3')].filter(vis).some(b=>/^(log in|sign in|sign up|continue with google|continue with email|로그인|가입|회원가입|Google로 계속하기|이메일로 계속하기)$/i.test((b.getAttribute('aria-label')||b.innerText||'').trim())));const legalDialog=dialogNodes.some(e=>[...e.querySelectorAll('h1,h2,h3,button,[role=button]')].filter(vis).some(b=>/^(terms of use|terms of service|terms and conditions|agree and continue|이용 약관|서비스 약관|약관 동의|동의하고 계속하기)$/i.test((b.getAttribute('aria-label')||b.innerText||'').trim())));return {language:navigator.language,documentLanguage:document.documentElement.lang,loginDialog,legalDialog,host:location.hostname,route:location.pathname.endsWith('/edit')?'edit':location.pathname.endsWith('/view')?'view':/^\/(?:login|signup)(?:\/|$)/.test(location.pathname)?'auth':'other',dialogs:[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis).length,fullscreen:!!document.fullscreenElement,manage:exact(/^(manage cookies|쿠키 관리)$/i),reject:exact(/^(reject all|reject all cookies|reject optional cookies|decline all|decline all cookies|only necessary cookies|essential cookies only|strictly necessary cookies only|reject non-essential cookies|모든 쿠키 거부|선택적 쿠키 거부|필수 쿠키만 허용|필수 쿠키만|모두 거부)$/i),saveCookie:exact(/^(save preferences|save my preferences|save cookie preferences|save cookie settings|confirm choices|confirm my choices|save and close|save & close|설정 저장|쿠키 설정 저장|선택 사항 저장|환경 설정 저장|선택 확인|저장 및 닫기|저장하고 닫기)$/i,true),present:exact(/^(present|present full screen|present fullscreen|enter full screen|enter fullscreen|전체 화면으로 전환|전체 화면으로 발표|전체 화면 발표|전체 화면 프레젠테이션|발표|발표하기|프레젠테이션|프레젠테이션 시작)$/i),cookieButtons:[...document.querySelectorAll('[role=dialog] button,[aria-modal=true] button')].filter(vis).map(e=>(e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,65)).filter(s=>/cookie|reject|decline|save|confirm|preference|necessary|allow|apply|쿠키|저장|거부|선택|확인|필수|허용|적용/i.test(s)).slice(0,20),slider:[...document.querySelectorAll('[role=slider][aria-valuenow][aria-valuemin][aria-valuemax]')].filter(vis).length}})()";
  return Json.Deserialize<Dictionary<string,object>>(await web.CoreWebView2.ExecuteScriptAsync(js));
 }
 async Task<bool> ClickControl(Dictionary<string,object> ui,string key){
  object v;if(!ui.TryGetValue(key,out v)||v==null)return false;
  var d=v as Dictionary<string,object>;if(d==null)return false;
  double x=Convert.ToDouble(d["x"]),y=Convert.ToDouble(d["y"]);
  if(x<=0||x>=1||y<=0||y>=1||!d.ContainsKey("hit")||!Convert.ToBoolean(d["hit"]))return false;
  return await PhysicalClick(x,y);
 }
 async Task<Dictionary<string,object>> PrepareUi(string phase){
  await Pause(4500);var ui=await InspectPublicUi();
  ProbeLog("WINDOWS_UI",new{phase,ui});
  // Fresh, disposable CI profile only. Reject optional cookies via exact UI.
  if(Int(ui,"dialogs")>0&&await ClickControl(ui,"manage")){await Pause(850);ui=await InspectPublicUi();ProbeLog("WINDOWS_COOKIE_OPTIONS",new{phase,ui});}
  if(Int(ui,"dialogs")>0&&await ClickControl(ui,"reject")){
   await Pause(2200);ui=await InspectPublicUi();ProbeLog("WINDOWS_REJECT_OPTIONAL",new{phase,ui});
   // The cookie manager can remain open after reject-all until preferences
   // are saved. Only an exact cookie settings save control is allowed here,
   // and only after the explicit reject-optional choice in this CI profile.
   if(Int(ui,"dialogs")>0&&await ClickControl(ui,"saveCookie")){
    await Pause(2200);ui=await InspectPublicUi();ProbeLog("WINDOWS_COOKIE_SAVE",new{phase,ui});
   }
  }
  return ui;
 }
 async Task<Dictionary<string,object>> InspectFullscreenStage(){
  const string js=@"(()=>{const full=document.fullscreenElement;const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&getComputedStyle(e).visibility!=='hidden'};const center=document.elementFromPoint(innerWidth*.5,innerHeight*.48);const inStage=!!(full&&center&&full.contains(center));const unsafe=!!(center&&(center.isContentEditable||center.closest('input,textarea,select,button,[role=button],a,[contenteditable=true],[role=textbox]')));const bs=full?[...full.querySelectorAll('button,[role=button]')].filter(vis):[];const editButtons=bs.filter(e=>/^(edit|delete|add page|duplicate|share|publish|save|편집|삭제|페이지 추가|복제|공유|게시|저장)$/i.test((e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim()));const editControls=editButtons.length;const harmlessShare=editButtons.filter(e=>{if(!/^(share|공유)$/i.test((e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim()))return false;const r=e.getBoundingClientRect(),x=innerWidth*.5,y=innerHeight*.48;return r.bottom<=innerHeight*.18&&!(x>=r.left-24&&x<=r.right+24&&y>=r.top-24&&y<=r.bottom+24)&&!(center&&e.contains(center))}).length;const exitControl=bs.some(e=>/^(exit full screen|exit fullscreen|전체 화면 종료|전체 화면 해제)$/i.test((e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim()));const labels=bs.map(e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim()).filter(s=>/^(next|previous|next page|previous page|next slide|previous slide|exit full screen|exit fullscreen|play|pause|다음|이전|다음 페이지|이전 페이지|다음 슬라이드|이전 슬라이드|전체 화면 종료|전체 화면 해제|재생|일시정지)$/i.test(s));const nums=full?[...full.querySelectorAll('[aria-valuenow],[aria-current], [role=status], [aria-live]')].filter(vis).map(e=>({v:e.getAttribute('aria-valuenow'),max:e.getAttribute('aria-valuemax'),label:e.getAttribute('aria-label'),text:(e.innerText||'').trim()})).map(x=>({value:/^\d{1,4}$/.test(x.v||'')?Number(x.v):null,total:/^\d{1,4}$/.test(x.max||'')?Number(x.max):null,pageLabel:[x.label,x.text].filter(s=>/^(?:(?:page|slide|페이지|슬라이드)\s*)?\d{1,4}\s*(?:\/|of|중)\s*\d{1,4}(?:\s*(?:쪽|페이지))?$/i.test(s||''))})).filter(x=>x.value!==null||x.pageLabel.length).slice(0,12):[];return {full:!!full,tag:full?full.tagName:null,centerTag:center?center.tagName:null,inStage,unsafe,editControls,harmlessShare,exitControl,registered:location.origin==='https://www.canva.com'&&location.pathname.startsWith('/design/DAHbOZ_XOJI/')&&location.pathname.endsWith('/edit'),dialogs:[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis).length,canvas:full?[...full.querySelectorAll('canvas')].filter(vis).length:0,images:full?[...full.querySelectorAll('img')].filter(vis).length:0,iframes:full?[...full.querySelectorAll('iframe')].filter(vis).length:0,labels,nums}})()";
  return Json.Deserialize<Dictionary<string,object>>(await web.CoreWebView2.ExecuteScriptAsync(js));
 }
 bool SafeStage(Dictionary<string,object> stage){
  // A non-overlapping Share button in the top toolbar alone is not evidence of editable slide content.
  // Canva can hide its toolbar even before the first click. Actual browser fullscreen,
  // exact design, safe hit target and absence of dialogs are the stable requirements.
  return Flag(stage,"registered")&&Flag(stage,"full")&&Flag(stage,"inStage")&&!Flag(stage,"unsafe")&&Int(stage,"editControls")==Int(stage,"harmlessShare")&&Int(stage,"harmlessShare")<=1&&Int(stage,"dialogs")==0;
 }
 async Task<object> InspectBookmarkSignals(){
  // Read-only metadata, including hidden thumbnail selections. Never emit text,
  // URLs, account identifiers or raw page identifiers. Tokens are run-local aliases.
  const string js=@"(()=>{if(location.origin!=='https://www.canva.com'||!location.pathname.startsWith('/design/DAHbOZ_XOJI/')||!document.fullscreenElement)return null;const alias=window.__ttPageProbeAlias||(window.__ttPageProbeAlias=new Map());const token=v=>{if(!alias.has(v))alias.set(v,alias.size+1);return alias.get(v)};const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};const out=[];for(const e of document.querySelectorAll('*')){for(const a of e.attributes){if(!/^(data-(?:page|slide|artboard)(?:-id|-index|-number)?|aria-posinset|aria-setsize)$/i.test(a.name)||!/^[A-Za-z0-9_-]{1,100}$/.test(a.value))continue;const n=/^\d{1,4}$/.test(a.value)?Number(a.value):null;out.push({name:a.name,number:n,token:n===null?token(a.value):null,visible:vis(e),selected:e.getAttribute('aria-selected')==='true'||['page','true','step'].includes(e.getAttribute('aria-current'))});if(out.length>=500)break}if(out.length>=500)break}const selection=[...document.querySelectorAll('[aria-current],[aria-selected=true]')].map(e=>{const l=e.getAttribute('aria-label')||'';const m=l.match(/^(?:page|slide|페이지|슬라이드)\s*(\d{1,4})(?:\s*(?:\/|of|중)\s*(\d{1,4}))?$/i);return m?{page:Number(m[1]),total:m[2]?Number(m[2]):null,visible:vis(e)}:null}).filter(Boolean).slice(0,30);const center=document.elementFromPoint(innerWidth*.5,innerHeight*.48),anc=[];for(let e=center;e&&anc.length<16;e=e.parentElement){const attrs=[...e.attributes].filter(a=>/^data-(?:page|slide|artboard)(?:-id|-index|-number)?$/i.test(a.name)&&/^[A-Za-z0-9_-]{1,100}$/.test(a.value)).map(a=>({name:a.name,token:token(a.value),number:/^\d{1,4}$/.test(a.value)?Number(a.value):null}));anc.push({tag:e.tagName,attrs})}const params=[];for(const [k,v] of new URLSearchParams(location.search)){if(/^(page|slide|pageIndex|slideIndex|pageId|slideId)$/i.test(k)&&/^[A-Za-z0-9_-]{1,100}$/.test(v))params.push({name:k,number:/^\d{1,4}$/.test(v)?Number(v):null,token:token(v)})}return {attributes:out,selection,centerAncestors:anc,params}})()";
  return Json.DeserializeObject(await web.CoreWebView2.ExecuteScriptAsync(js));
 }
 // Read-only source state diagnostics. No visual fingerprints, credentials,
 // raw IDs, request bodies, script contents or design content are collected.
 async Task<object> InspectSourcePageState(){
  const string js=@"(()=>{if(location.origin!=='https://www.canva.com'||!location.pathname.startsWith('/design/DAHbOZ_XOJI/')||!document.fullscreenElement)return null;const ids=window.__ttSourceProbeAliases||(window.__ttSourceProbeAliases=new Map());const alias=v=>{if(!ids.has(v))ids.set(v,ids.size+1);return ids.get(v)};const keys=/^(?:(?:current|active|selected|presented|presenting|displayed|visible|focused|target|initial|previous|next)?(?:page|slide|artboard)(?:id|index|number|count|total|position|key)?|(?:current|active|selected|presented|presenting|displayed)?(?:animation|reveal|build|step)(?:index|number|count|id|position)?|totalPages|totalSlides|pageCount|slideCount)$/i;const containers=/^(?:presentation|presenter|present|slideshow|viewer|navigation|page|slide|artboard|currentPage|activePage|currentSlide|activeSlide|state|value|data|model|props|context|selection|controller|store|snapshot|memoizedState|memoizedProps|baseState|presentationState|pageState|slideState|animationState)$/i;const data=(o,k)=>{try{const d=Object.getOwnPropertyDescriptor(o,k);return d&&'value'in d?d.value:undefined}catch{return undefined}};const own=o=>{try{return Object.getOwnPropertyNames(o).slice(0,100)}catch{return []}};const results=[],seen=new WeakSet();let budget=1800;function scan(o,path,depth){if(!o||typeof o!=='object'||depth<0||budget--<1||seen.has(o)||Array.isArray(o)||o instanceof Node)return;seen.add(o);for(const k of own(o)){if(!keys.test(k)&&!containers.test(k))continue;const v=data(o,k);if(keys.test(k)){if(Number.isInteger(v)&&v>=-1&&v<=4095)results.push({path:path+'.'+k,value:v});else if(typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v))results.push({path:path+'.'+k,alias:alias(v)});}if(v&&typeof v==='object'&&depth>0)scan(v,path+'.'+k,depth-1);if(results.length>=160)return;}}const center=document.elementFromPoint(innerWidth*.5,innerHeight*.48),nodes=[];for(let e=center;e&&nodes.length<28;e=e.parentElement)nodes.push(e);for(const e of [document.fullscreenElement,document.body,document.documentElement])if(e&&!nodes.includes(e))nodes.push(e);const fibers=new Set();for(const e of nodes)for(const k of own(e)){if(!/^__react(?:Fiber|InternalInstance|Container)\$/.test(k))continue;let f=data(e,k);for(let j=0;f&&j<45;j++,f=data(f,'return'))fibers.add(f)}let i=0;for(const f of fibers){const t=data(f,'type'),name=typeof t==='function'?data(t,'name'):t&&typeof t==='object'?data(t,'displayName'):null;const label=typeof name==='string'&&/^[A-Za-z0-9_$]{1,80}$/.test(name)?name:'component';const path='fiber['+(i++)+']:'+label;scan(data(f,'memoizedProps'),path+'.props',4);scan(data(f,'memoizedState'),path+'.state',4);let hook=data(f,'memoizedState');for(let j=0;hook&&typeof hook==='object'&&j<36;j++,hook=data(hook,'next')){scan(data(hook,'memoizedState'),path+'.hook['+j+']',4);scan(data(hook,'baseState'),path+'.base['+j+']',3)}if(results.length>=160||budget<1)break;}for(const k of own(window)){if(/^(?:presentationState|presenterState|slideState|pageState|presentationStore|presenterStore|viewerState|__INITIAL_STATE__|__PRELOADED_STATE__)$/i.test(k))scan(data(window,k),'window.'+k,4)}const resourceHints=[];for(const e of performance.getEntriesByType('resource').slice(-120)){try{const u=new URL(e.name);if(!/(^|\.)canva\.com$/.test(u.hostname))continue;const fields=[];for(const [k,v] of u.searchParams){if(!/^(?:page|slide|artboard)(?:Id|Index|Number)?$/i.test(k)||!/^[A-Za-z0-9_-]{1,80}$/.test(v))continue;fields.push({key:k,value:/^\d{1,4}$/.test(v)?Number(v):null,alias:/^\d{1,4}$/.test(v)?null:alias(v)})}if(fields.length)resourceHints.push({type:e.initiatorType,fields})}catch{}}return {fibers:fibers.size,candidates:results.slice(0,160),resourceHints:resourceHints.slice(-20)}})()";
  return Json.DeserializeObject(await web.CoreWebView2.ExecuteScriptAsync(js));
 }
 async Task<object> InspectAccessibilityPageState(){
  try{
   var raw=await web.CoreWebView2.CallDevToolsProtocolMethodAsync("Accessibility.getFullAXTree","{\"depth\":16}");
   var serializer=new System.Web.Script.Serialization.JavaScriptSerializer{MaxJsonLength=16000000,RecursionLimit=100};
   var root=serializer.DeserializeObject(raw) as Dictionary<string,object>;
   var result=new List<object>();
   if(root==null||!root.ContainsKey("nodes"))return result;
   var nodes=root["nodes"] as System.Collections.IEnumerable;
   if(nodes==null)return result;
   foreach(object v in nodes){
    var node=v as Dictionary<string,object>;if(node==null)continue;
    string role=AxString(node,"role"),name=AxString(node,"name"),value=AxString(node,"value");
    var m=System.Text.RegularExpressions.Regex.Match(name??"", @"^(?:Page|Slide|페이지|슬라이드)\s*(\d{1,4})(?:\s*(?:/|of|중)\s*(\d{1,4}))?$",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    if(m.Success)result.Add(new{role,page=int.Parse(m.Groups[1].Value),total=m.Groups[2].Success?int.Parse(m.Groups[2].Value):0});
    else if(role=="slider"&&System.Text.RegularExpressions.Regex.IsMatch(value??"", @"^\d{1,4}$"))result.Add(new{role,page=int.Parse(value),total=0});
    if(result.Count>=50)break;
   }
   return result;
  }catch(Exception ex){return new{error=ex.GetType().Name};}
 }
 static string AxString(Dictionary<string,object> node,string key){
  object raw;if(!node.TryGetValue(key,out raw))return null;
  var prop=raw as Dictionary<string,object>;object value;
  return prop!=null&&prop.TryGetValue("value",out value)?Convert.ToString(value,System.Globalization.CultureInfo.InvariantCulture):null;
 }
 // Find the semantic control even when Canva auto-hides its toolbar.
 async Task<object> InspectSliderDom(){
  const string js=@"(()=>{if(location.origin!=='https://www.canva.com'||!location.pathname.startsWith('/design/DAHbOZ_XOJI/')||!document.fullscreenElement)return [];return [...document.querySelectorAll('[role=slider],input[type=range]')].map(e=>{const r=e.getBoundingClientRect(),n=v=>v!=null&&/^\d{1,4}$/.test(String(v))?Number(v):null;return {tag:e.tagName,role:e.getAttribute('role'),nativeRange:e.tagName==='INPUT'&&e.type==='range',value:n(e.getAttribute('aria-valuenow')??e.value),min:n(e.getAttribute('aria-valuemin')??e.min),max:n(e.getAttribute('aria-valuemax')??e.max),visible:r.width>0&&r.height>0,disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',tabIndex:e.tabIndex}})})()";
  return Json.DeserializeObject(await web.CoreWebView2.ExecuteScriptAsync(js));
 }
 async Task<int> ReadExactSlider(){return await ReadInteractivePage();}
 async Task TestExactSeek(){
  var core=web.CoreWebView2;
  int initial=await ReadExactSlider();ProbeLog("DIRECT_SLIDER",new{initial,dom=await InspectSliderDom()});
  if(initial<1){ProbeLog("DIRECT_SEEK_BLOCKED",new{reason="no-unique-bounded-page-control"});return;}
  if(!await FocusInteractiveSlider(true)){ProbeLog("DIRECT_SEEK_BLOCKED",new{reason="official-slider-not-focusable"});return;}
  for(int i=0;i<4;i++){
   int before=await ReadExactSlider();bool right=i<2;string key=right?"ArrowRight":"ArrowLeft";int vk=right?39:37;
   await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent",Json.Serialize(new{type="keyDown",key,code=key,windowsVirtualKeyCode=vk,nativeVirtualKeyCode=vk}));
   await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent",Json.Serialize(new{type="keyUp",key,code=key,windowsVirtualKeyCode=vk,nativeVirtualKeyCode=vk}));
   await Pause(1000);int after=await ReadExactSlider();
   ProbeLog("DIRECT_SEEK_STEP",new{before,after,expected=before+(right?1:-1),ok=after==before+(right?1:-1)});
   if(after!=before+(right?1:-1))break;
  }
  await core.ExecuteScriptAsync("document.activeElement&&document.activeElement.blur()");
 }
 async Task LogSourceState(int step,string action){
  ProbeLog("SOURCE_PAGE_STATE",new{step,action,state=await InspectSourcePageState(),accessibility=await InspectAccessibilityPageState(),domSlider=await InspectSliderDom(),directPage=await ReadExactSlider()});
 }
 async Task<bool> ObserveRegisteredFullscreen(){
  await Pause(1200);
  var stage=await InspectFullscreenStage();ProbeLog("REGISTERED_STAGE",stage);ProbeLog("BOOKMARK_SIGNALS",new{step=0,signals=await InspectBookmarkSignals()});
  // Read-only hit geometry; distinguish an editor toolbar outside the slide
  // from a real interactive slide. Never click editor controls or capture text.
  const string geometry=@"(()=>{const x=innerWidth*.5,y=innerHeight*.48,hit=document.elementFromPoint(x,y),r=e=>{const a=e.getBoundingClientRect();return {x:Math.round(a.x),y:Math.round(a.y),w:Math.round(a.width),h:Math.round(a.height)}};const vis=e=>{const a=e.getBoundingClientRect();return a.width>0&&a.height>0&&getComputedStyle(e).visibility!=='hidden'};const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim();const editor=/^(edit|delete|add page|duplicate|share|publish|save|편집|삭제|페이지 추가|복제|공유|게시|저장)$/i;return {viewport:[innerWidth,innerHeight],hitAncestors:(()=>{let out=[];for(let p=hit;p&&out.length<12;p=p.parentElement)out.push({tag:p.tagName,role:p.getAttribute('role'),editable:p.isContentEditable,rect:r(p)});return out})(),controls:[...document.querySelectorAll('button,[role=button]')].filter(e=>vis(e)&&editor.test(label(e))).map(e=>({label:label(e),rect:r(e),containsHit:e.contains(hit)})),canvas:[...document.querySelectorAll('canvas')].filter(vis).map(r),sliders:[...document.querySelectorAll('[role=slider]')].filter(vis).map(e=>({rect:r(e),page:e.getAttribute('aria-valuenow'),total:e.getAttribute('aria-valuemax')}))}})()";
  ProbeLog("REGISTERED_STAGE_GEOMETRY",Json.DeserializeObject(await web.CoreWebView2.ExecuteScriptAsync(geometry)));
  if(!SafeStage(stage)){ProbeLog("REGISTERED_BLOCKED",new{reason="no-confirmed-safe-fullscreen-stage"});return false;}
  int observed=0,keysDelivered=0;
  await LogSourceState(0,"initial");
  for(int i=0;i<16;i++){
   stage=await InspectFullscreenStage();if(!SafeStage(stage)){ProbeLog("REGISTERED_BLOCKED",new{reason="unsafe-next-click",stage});break;}
   if(!await PhysicalClick(.5,.48)){ProbeLog("REGISTERED_BLOCKED",new{reason="click-delivery"});break;}
   await Pause(900);observed++;
   await LogSourceState(i+1,"click");
  }
  foreach(byte key in new byte[]{0x27,0x25,0x25,0x27}){
   stage=await InspectFullscreenStage();if(!SafeStage(stage))break;
   if(await PhysicalKey(key)){keysDelivered++;await Pause(900);await LogSourceState(observed+keysDelivered,key==0x27?"right":"left");}
  }
  ProbeLog("SOURCE_RESULT",new{observed,keysDelivered,acceptance=false,reason="candidate state requires independent mapping"});
  if(observed==16&&keysDelivered==4&&SafeStage(await InspectFullscreenStage()))await TestExactSeek();
  return observed==16&&keysDelivered==4;
 }
 async Task<bool> VerifyLiveBookmarkResume(int target=125){
  timer.Stop();
  for(int i=0;i<30&&busy;i++)await Pause(100);
  if(busy||!SafeStage(await InspectFullscreenStage()))return false;
  int prior=await ReadInteractivePage();if(prior<1)return false;
  saved=prior;seekTarget=target;interactiveBookmarkValid=false;interactiveSeekFocused=false;interactiveSeekFailed=false;
  interactiveSeekExpected=0;interactiveSeekAt=DateTime.MinValue;interactiveSeekKeys=0;interactiveFastKeys=0;interactiveFastPending=false;interactiveFastDisabled=false;previous=0;stable=0;
  var started=DateTime.UtcNow;var deadline=started.AddSeconds(95);
  while(DateTime.UtcNow<deadline&&!interactiveBookmarkValid&&!interactiveSeekFailed){
   await UpdateInteractiveBookmark();
   if(!interactiveBookmarkValid&&saved!=prior){ProbeLog("LIVE_RESUME_FAIL",new{reason="premature-overwrite",prior,saved});return false;}
   await Pause(350);
  }
  int actual=await ReadInteractivePage();bool ok=interactiveBookmarkValid&&saved==target&&actual==target&&detected==target;
  ProbeLog("LIVE_RESUME_RESULT",new{prior,target,actual,saved,confirmed=interactiveBookmarkValid,keys=interactiveSeekKeys,fastKeys=interactiveFastKeys,fastDisabled=interactiveFastDisabled,elapsedMs=(int)(DateTime.UtcNow-started).TotalMilliseconds,ok});
  if(ok)await LogSourceState(target,"resume");
  return ok;
 }
 // Enumerate only UI controls related to presentation/authentication, never slide text.
 async Task<object> InspectLocalizedControls(){
  const string js=@"(()=>{const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&s.visibility!=='hidden'&&s.display!=='none'};const rx=/발표|프레젠테이션|전체\s*화면|슬라이드\s*쇼|로그인|회원\s*가입|약관|쿠키|present|slideshow|full.?screen|sign.?in|log.?in|sign.?up|terms|cookie/i;const a=[];for(const e of document.querySelectorAll('button,[role=button],[role=menuitem],a[role=button],input[type=button]')){if(!vis(e))continue;const labels=[e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-tooltip'),e.innerText].map(x=>(x||'').trim().replace(/\s+/g,' ')).filter(x=>x.length>0&&x.length<=70&&rx.test(x));if(!labels.length)continue;const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);a.push({labels:[...new Set(labels)],role:e.getAttribute('role')||e.tagName,disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',hasPopup:e.getAttribute('aria-haspopup'),hit:!!h&&(e===h||e.contains(h))});if(a.length>=30)break;}return {ready:document.readyState,count:document.querySelectorAll('button,[role=button]').length,controls:a}})()";
  return Json.DeserializeObject(await web.CoreWebView2.ExecuteScriptAsync(js));
 }
 async Task<object> InspectLocalizedAxControls(){
  try{
   var raw=await web.CoreWebView2.CallDevToolsProtocolMethodAsync("Accessibility.getFullAXTree","{}");
   var root=Json.Deserialize<Dictionary<string,object>>(raw);var output=new List<object>();
   foreach(object x in (System.Collections.IEnumerable)root["nodes"]){
    var n=x as Dictionary<string,object>;if(n==null||Flag(n,"ignored")||!n.ContainsKey("role")||!n.ContainsKey("name"))continue;
    var role=n["role"] as Dictionary<string,object>;var name=n["name"] as Dictionary<string,object>;if(role==null||name==null)continue;
    string kind=Str(role,"value"),label=Str(name,"value");
    if(kind!="button"&&kind!="menuitem"&&kind!="menuitemradio"&&kind!="menuitemcheckbox"&&kind!="link")continue;
    if(label.Length==0||label.Length>70||!System.Text.RegularExpressions.Regex.IsMatch(label,@"발표|프레젠테이션|전체\s*화면|슬라이드\s*쇼|로그인|회원\s*가입|약관|쿠키|present|slideshow|full.?screen|sign.?in|log.?in|sign.?up|terms|cookie",System.Text.RegularExpressions.RegexOptions.IgnoreCase))continue;
    output.Add(new{role=kind,label});if(output.Count>=30)break;
   }
   return output;
  }catch{return new object[0];}
 }
 async Task<int> RunClickProbe(){
  // Production navigation is exercised first: the exact registered short URL.
  var deadline=DateTime.UtcNow.AddSeconds(55);
  while((web.CoreWebView2==null||!slotVisible||navigationMode=="pending")&&DateTime.UtcNow<deadline)await Pause(400);
  if(web.CoreWebView2==null||!slotVisible){ProbeLog("WINDOWS_BLOCKED",new{reason="no-window-or-WebView2"});return 2;}
  var ui=await PrepareUi("registered-short-link");
  if(Environment.GetEnvironmentVariable("TT_LIVE_LANGUAGE")=="ko-KR"){
   // The original probe sampled once after 4.5 seconds. Observe the entire
   // bounded startup window before classifying the localized route as blocked.
   for(int i=0;i<12;i++){
    ProbeLog("KO_STARTUP_STATE",new{elapsedStep=i,ui,controls=await InspectLocalizedControls(),ax=await InspectLocalizedAxControls(),presentAttempts});
    if(Flag(ui,"fullscreen")||Flag(ui,"loginDialog")||Flag(ui,"legalDialog")||Str(ui,"route")=="auth")break;
    if(Int(ui,"dialogs")>0&&(ui["manage"]!=null||ui["reject"]!=null))ui=await PrepareUi("ko-cookie-options");
    else{await Pause(2500);ui=await InspectPublicUi();}
   }
  }
  if(!Convert.ToBoolean(ui["fullscreen"])&&Int(ui,"dialogs")==0&&await ClickControl(ui,"present")){
   await Pause(3000);ui=await InspectPublicUi();ProbeLog("WINDOWS_AFTER_PRESENT",new{phase="registered-short-link",ui});
   if(!Convert.ToBoolean(ui["fullscreen"])&&Int(ui,"slider")==0&&ui["manage"]==null&&ui["reject"]==null&&ui["saveCookie"]==null&&await ClickControl(ui,"present")){
    await Pause(3000);ui=await InspectPublicUi();ProbeLog("WINDOWS_AFTER_PRESENT_CONFIRM",new{phase="registered-short-link",ui});
   }
  }
  // The registered link has entered fullscreen even when its navigation
  // slider is absent. Do not assume this is the public viewer. Inspect the
  // actual fullscreen surface and test its safe, non-editable slide region.
  if(Int(ui,"dialogs")!=0){ProbeLog("REGISTERED_BLOCKED",new{reason="original-link-dialog-still-open",ui});return 2;}
  bool registeredFull=Str(ui,"route")=="edit"&&Convert.ToBoolean(ui["fullscreen"]);
  if(!registeredFull){ProbeLog("REGISTERED_BLOCKED",new{reason="registered-fullscreen-not-entered",ui});return 2;}
  if(Environment.GetEnvironmentVariable("TT_LIVE_LANGUAGE")=="ko-KR"){
   // Fresh anonymous Korean locale, no authentication or terms acceptance.
   // Only cookie preference controls and the official Present button were used.
   // Fullscreen is not the same as a ready presentation. Require the actual
   // initial bookmark and removal of the native loading cover before physical clicks.
   var readyDeadline=DateTime.UtcNow.AddSeconds(30);
   while(DateTime.UtcNow<readyDeadline&&!closed&&(startupCoverActive||!interactiveBookmarkValid||saved!=requested||await ReadInteractivePage()!=requested))await Pause(400);
   int first=await ReadInteractivePage();
   bool readyToRead=!startupCoverActive&&interactiveBookmarkValid&&saved==requested&&first==requested&&SafeStage(await InspectFullscreenStage());
   ProbeLog("KO_READER_READY",new{readyToRead,first,saved,requested,startupCoverActive,interactiveBookmarkValid});
   if(!readyToRead)return 2;
   int samePage=0,advanced=0,invalid=0;
   for(int i=0;i<6;i++){
    if(!SafeStage(await InspectFullscreenStage())||!await PhysicalClick(.5,.48)){invalid++;break;}
    await Pause(1000);int p=await ReadInteractivePage();
    if(p==0)invalid++;else if(p==first)samePage++;else if(p==first+1)advanced++;else invalid++;
    first=p;
   }
   bool ok=invalid==0&&samePage>0&&advanced>0;
   if(ok){
    // Exercise the real keyboard path (not just a direct handler call) after
    // the prior presentation click test, with the host in immersive layout.
    var layout=ReadFile("layout.json");if(layout==null)return 2;
    layout["immersive"]=1;File.WriteAllText(Path.Combine(dir,"layout.json"),Json.Serialize(layout),Utf8);
    await Pause(500);SetForegroundWindow(Handle);web.Focus();await Pause(200);
    bool delivered=await PhysicalKey(0x1B);await Pause(500);
    bool remainsFull=Flag(await InspectPublicUi(),"fullscreen");
    bool escapeOk=delivered&&immersive&&exitFull&&remainsFull;
    ProbeLog("KO_PHYSICAL_ESCAPE",new{delivered,immersive,exitFull,remainsFull,escapeOk});
    ok=ok&&escapeOk;
   }
   ProbeLog("ANONYMOUS_KO_RESULT",new{samePage,advanced,invalid,ok,ui=await InspectPublicUi()});
   return ok?0:2;
  }
  bool inputOk=await ObserveRegisteredFullscreen();
  if(inputOk)inputOk=await VerifyLiveBookmarkResume(125);
  if(inputOk)inputOk=await VerifyLiveBookmarkResume(390);
  if(inputOk)inputOk=await VerifyLiveBookmarkResume(125);
  // The public-view comparison was already recorded; do not obscure an original-link failure.
  if(GetForegroundWindow()==Handle)await PhysicalKey(0x1B);
  await Pause(500);
  ProbeLog("REGISTERED_INPUT_RESULT",new{inputOk,fullscreenExited=!Flag(await InspectPublicUi(),"fullscreen"),animationAcceptance=false});
  return inputOk?0:2;
 }
 // A second OS process uses the actual saved state from the first process.
 // No assignment to detected/saved/seekTarget: the ordinary Poll owns resume.
 async Task<int> RunRestartProbe(int target){
  var deadline=DateTime.UtcNow.AddSeconds(110);
  int checks=0;bool hadValid=false;
  while(DateTime.UtcNow<deadline&&!closed){
   if(saved!=target){ProbeLog("RESTART_FAIL",new{reason="saved-page-overwritten",saved,target});return 2;}
   if(interactiveBookmarkValid&&presentationConfirmed){
    hadValid=true;
    if(busy){await Pause(150);continue;}
    int p=await ReadInteractivePage();checks++;
    if(p==target&&detected==target&&saved==target&&checks>=2){
     timer.Stop();
     for(int i=0;i<30&&busy;i++)await Pause(100);
     if(busy||closed||!interactiveBookmarkValid||await ReadInteractivePage()!=target||saved!=target||detected!=target){ProbeLog("RESTART_FAIL",new{reason="final-state-unstable",saved,detected});return 2;}
     Publish("자동 저장됨");
     ProbeLog("RESTART_RESULT",new{target,actual=p,saved,detected,checks,keys=interactiveSeekKeys,fastKeys=interactiveFastKeys,fastDisabled=interactiveFastDisabled,confirmed=true,ok=true});
     return 0;
    }
    if(p!=target){ProbeLog("RESTART_FAIL",new{reason="different-confirmed-page",p,target});return 2;}
   }
   await Pause(400);
  }
  ProbeLog("RESTART_FAIL",new{reason="timeout-or-closed",target,saved,detected,hadValid,presentationConfirmed,navigationMode});return 2;
 }
 static int RunLiveProbe(string folder){
  if(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true")return 2;
  folder=Path.GetFullPath(folder);
  string install=Path.Combine(folder,"TeacherToolsLocal"),sessions=Path.Combine(install,"book-reader-sessions"),session=Path.Combine(sessions,Guid.NewGuid().ToString("N"));
  Directory.CreateDirectory(session);Environment.SetEnvironmentVariable("LOCALAPPDATA",folder);
  File.WriteAllText(Path.Combine(session,"lease"),"1");
  int resume=0;int.TryParse(Environment.GetEnvironmentVariable("TT_LIVE_RESUME_PAGE"),out resume);if(resume<0||resume>394)return 2;
  int code=2;BookReader reader=null;
  using(var ownerForm=new Form{Text="Disposable CI owner",StartPosition=FormStartPosition.CenterScreen,WindowState=FormWindowState.Maximized}){
   var tick=new Timer{Interval=900};tick.Tick+=(s,e)=>File.SetLastWriteTimeUtc(Path.Combine(session,"lease"),DateTime.UtcNow);
   var watchdog=new Timer{Interval=240000};watchdog.Tick+=(s,e)=>{ProbeLog("WINDOWS_BLOCKED",new{reason="watchdog"});if(reader!=null)reader.Close();ownerForm.Close();};
   ownerForm.Shown+=async(s,e)=>{
    try{
     await Task.Delay(300);
     int w=ownerForm.ClientSize.Width,h=ownerForm.ClientSize.Height;
     File.WriteAllText(Path.Combine(session,"layout.json"),Json.Serialize(new{vw=w,vh=h,x=8,y=8,w=w-16,h=h-16,visible=1,immersive=0}),Utf8);
     var config=new Dictionary<string,object>{{"url",AlmondShareUrl},{"title","Disposable CI Almond click probe"},{"interactive",1},{"pages",394},{"start",resume>0?resume:1},{"saved",resume>0?resume:1},{"owner",ownerForm.Handle.ToInt64()},{"ownerPid",System.Diagnostics.Process.GetCurrentProcess().Id}};
     reader=new BookReader(session,config,false);reader.ShowForBoard();tick.Start();watchdog.Start();
     code=resume>0?await reader.RunRestartProbe(resume):await reader.RunClickProbe();
    }catch(Exception ex){ProbeLog("WINDOWS_BLOCKED",new{reason=ex.GetType().Name});code=2;}
    // C# 5 compiler cannot await in finally; use a separate guarded cleanup block.
    try{if(reader!=null&&!reader.IsDisposed){reader.timer.Stop();for(int i=0;i<30&&reader.busy;i++)await Task.Delay(100);if(reader.busy)code=2;reader.Close();}if(reader!=null){var final=reader.ReadFile("state.json");ProbeLog("FINAL_STATE",new{closed=Flag(final,"closed"),bookmarkValid=Flag(final,"bookmarkValid"),saved=final==null?0:Int(final,"saved"),page=final==null?0:Int(final,"page")});}}
    catch(Exception ex){ProbeLog("WINDOWS_BLOCKED",new{reason="cleanup-"+ex.GetType().Name});code=2;}
    finally{tick.Stop();watchdog.Stop();if(reader!=null&&!reader.IsDisposed)reader.Close();ownerForm.Close();}
   };
   Application.Run(ownerForm);tick.Dispose();watchdog.Dispose();if(reader!=null)reader.Dispose();
  }
  return code;
 }
}
#endif
