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
  const string js=@"(()=>{const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};const bs=[...document.querySelectorAll('button,[role=button]')].filter(vis);const exact=(re)=>{const a=bs.filter(e=>re.test((e.getAttribute('aria-label')||e.innerText||e.getAttribute('title')||'').trim()));if(a.length!==1)return null;const r=a[0].getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const h=document.elementFromPoint(x,y);return {x:x/innerWidth,y:y/innerHeight,hit:!!h&&(a[0]===h||a[0].contains(h))}};return {host:location.hostname,route:location.pathname.endsWith('/edit')?'edit':location.pathname.endsWith('/view')?'view':'other',dialogs:[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis).length,fullscreen:!!document.fullscreenElement,manage:exact(/^(manage cookies|쿠키 관리)$/i),reject:exact(/^(reject all|reject all cookies|reject optional cookies|decline all|decline all cookies|only necessary cookies|essential cookies only|strictly necessary cookies only|reject non-essential cookies|모든 쿠키 거부|선택적 쿠키 거부|필수 쿠키만 허용|필수 쿠키만|모두 거부)$/i),saveCookie:exact(/^(save preferences|save my preferences|save cookie preferences|save cookie settings|confirm choices|confirm my choices|save and close|설정 저장|쿠키 설정 저장|선택 사항 저장|환경 설정 저장|선택 확인)$/i),present:exact(/^(present|present full screen|present fullscreen|enter full screen|enter fullscreen|전체 화면으로 전환|전체 화면으로 발표|전체 화면 발표|발표|프레젠테이션)$/i),cookieButtons:[...document.querySelectorAll('[role=dialog] button,[aria-modal=true] button')].filter(vis).map(e=>(e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,65)).filter(s=>/cookie|reject|decline|save|confirm|preference|necessary|allow|apply|쿠키|저장|거부|선택|확인|필수|허용|적용/i.test(s)).slice(0,20),slider:[...document.querySelectorAll('[role=slider][aria-valuenow][aria-valuemin][aria-valuemax]')].filter(vis).length}})()";
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
  const string js=@"(()=>{const full=document.fullscreenElement;const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&getComputedStyle(e).visibility!=='hidden'};const center=document.elementFromPoint(innerWidth*.5,innerHeight*.48);const inStage=!!(full&&center&&full.contains(center));const unsafe=!!(center&&center.closest('input,textarea,select,button,[role=button],a,[contenteditable=true],[role=textbox]'));const bs=full?[...full.querySelectorAll('button,[role=button]')].filter(vis):[];const editControls=bs.filter(e=>/^(edit|delete|add page|duplicate|share|publish|save|편집|삭제|페이지 추가|복제|공유|게시|저장)$/i.test((e.getAttribute('aria-label')||e.innerText||'').trim())).length;const labels=bs.map(e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim()).filter(s=>/^(next|previous|next page|previous page|next slide|previous slide|exit full screen|exit fullscreen|play|pause|다음|이전|다음 페이지|이전 페이지|다음 슬라이드|이전 슬라이드|전체 화면 종료|전체 화면 해제|재생|일시정지)$/i.test(s));const nums=full?[...full.querySelectorAll('[aria-valuenow],[aria-current], [role=status], [aria-live]')].filter(vis).map(e=>({v:e.getAttribute('aria-valuenow'),max:e.getAttribute('aria-valuemax'),label:e.getAttribute('aria-label'),text:(e.innerText||'').trim()})).map(x=>({value:/^\d{1,4}$/.test(x.v||'')?Number(x.v):null,total:/^\d{1,4}$/.test(x.max||'')?Number(x.max):null,pageLabel:[x.label,x.text].filter(s=>/^(?:(?:page|slide|페이지|슬라이드)\s*)?\d{1,4}\s*(?:\/|of|중)\s*\d{1,4}(?:\s*(?:쪽|페이지))?$/i.test(s||''))})).filter(x=>x.value!==null||x.pageLabel.length).slice(0,12):[];return {full:!!full,tag:full?full.tagName:null,centerTag:center?center.tagName:null,inStage,unsafe,editControls,dialogs:[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis).length,canvas:full?[...full.querySelectorAll('canvas')].filter(vis).length:0,images:full?[...full.querySelectorAll('img')].filter(vis).length:0,iframes:full?[...full.querySelectorAll('iframe')].filter(vis).length:0,labels,nums}})()";
  return Json.Deserialize<Dictionary<string,object>>(await web.CoreWebView2.ExecuteScriptAsync(js));
 }
 bool SafeStage(Dictionary<string,object> stage){
  return Convert.ToBoolean(stage["full"])&&Convert.ToBoolean(stage["inStage"])&&!Convert.ToBoolean(stage["unsafe"])&&Int(stage,"editControls")==0&&Int(stage,"dialogs")==0;
 }
 async Task ObserveRegisteredFullscreen(){
  await Pause(1200);
  var stage=await InspectFullscreenStage();ProbeLog("REGISTERED_STAGE",stage);
  // Read-only hit geometry; distinguish an editor toolbar outside the slide
  // from a real interactive slide. Never click editor controls or capture text.
  const string geometry=@"(()=>{const x=innerWidth*.5,y=innerHeight*.48,hit=document.elementFromPoint(x,y),r=e=>{const a=e.getBoundingClientRect();return {x:Math.round(a.x),y:Math.round(a.y),w:Math.round(a.width),h:Math.round(a.height)}};const vis=e=>{const a=e.getBoundingClientRect();return a.width>0&&a.height>0&&getComputedStyle(e).visibility!=='hidden'};const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim();const editor=/^(edit|delete|add page|duplicate|share|publish|save|편집|삭제|페이지 추가|복제|공유|게시|저장)$/i;return {viewport:[innerWidth,innerHeight],hitAncestors:(()=>{let out=[];for(let p=hit;p&&out.length<12;p=p.parentElement)out.push({tag:p.tagName,role:p.getAttribute('role'),editable:p.isContentEditable,rect:r(p)});return out})(),controls:[...document.querySelectorAll('button,[role=button]')].filter(e=>vis(e)&&editor.test(label(e))).map(e=>({label:label(e),rect:r(e),containsHit:e.contains(hit)})),canvas:[...document.querySelectorAll('canvas')].filter(vis).map(r),sliders:[...document.querySelectorAll('[role=slider]')].filter(vis).map(e=>({rect:r(e),page:e.getAttribute('aria-valuenow'),total:e.getAttribute('aria-valuemax')}))}})()";
  ProbeLog("REGISTERED_STAGE_GEOMETRY",Json.DeserializeObject(await web.CoreWebView2.ExecuteScriptAsync(geometry)));
  if(!SafeStage(stage)){ProbeLog("REGISTERED_BLOCKED",new{reason="no-confirmed-safe-fullscreen-stage"});return;}
  int observed=0,changes=0;
  for(int i=0;i<10;i++){
   stage=await InspectFullscreenStage();if(!SafeStage(stage))break;
   await Pause(800);string a=await FrameHash();await Pause(650);string b=await FrameHash();int before=await Read();
   if(!await PhysicalClick(.5,.48)){ProbeLog("REGISTERED_BLOCKED",new{reason="click-delivery"});break;}
   await Pause(1100);string c=await FrameHash();int after=await Read();
   stage=await InspectFullscreenStage();observed++;if(a==b&&b!=c)changes++;
   ProbeLog("REGISTERED_CLICK",new{step=i+1,before,after,stableBefore=a==b,changedAfter=b!=c,stage});
  }
  foreach(byte key in new byte[]{0x27,0x25}){
   stage=await InspectFullscreenStage();if(!SafeStage(stage))break;
   string before=await FrameHash();bool delivered=await PhysicalKey(key);await Pause(1000);string after=await FrameHash();
   ProbeLog("REGISTERED_KEY",new{key=key==0x27?"right":"left",delivered,changed=before!=after,stage=await InspectFullscreenStage()});
  }
  ProbeLog("REGISTERED_RESULT",new{observed,changes,acceptance=false,reason="visual change alone is not proof of page identity or sentence reveal"});
 }
 async Task<int> RunClickProbe(){
  // Production navigation is exercised first: the exact registered short URL.
  var deadline=DateTime.UtcNow.AddSeconds(55);
  while((web.CoreWebView2==null||!slotVisible||navigationMode=="pending")&&DateTime.UtcNow<deadline)await Pause(400);
  if(web.CoreWebView2==null||!slotVisible){ProbeLog("WINDOWS_BLOCKED",new{reason="no-window-or-WebView2"});return 2;}
  var ui=await PrepareUi("registered-short-link");
  if(!Convert.ToBoolean(ui["fullscreen"])&&Int(ui,"dialogs")==0&&await ClickControl(ui,"present")){
   await Pause(3000);ui=await InspectPublicUi();ProbeLog("WINDOWS_AFTER_PRESENT",new{phase="registered-short-link",ui});
   if(!Convert.ToBoolean(ui["fullscreen"])&&Int(ui,"slider")==0&&ui["manage"]==null&&ui["reject"]==null&&ui["saveCookie"]==null&&await ClickControl(ui,"present")){
    await Pause(3000);ui=await InspectPublicUi();ProbeLog("WINDOWS_AFTER_PRESENT_CONFIRM",new{phase="registered-short-link",ui});
   }
  }
  // The registered link has entered fullscreen even when its navigation
  // slider is absent. Do not assume this is the public viewer. Inspect the
  // actual fullscreen surface and test its safe, non-editable slide region.
  bool registeredFull=Str(ui,"route")=="edit"&&Convert.ToBoolean(ui["fullscreen"])&&Int(ui,"dialogs")==0;
  if(registeredFull){
   await ObserveRegisteredFullscreen();
   // Leave actual presentation before navigation to independent control.
   if(GetForegroundWindow()==Handle)await PhysicalKey(0x1B);
   await Pause(600);
   ui=await InspectPublicUi();
  }
  bool editorPresent=false;
  // Public-view comparison is a diagnostic control, never evidence of true Present.
  if(Str(ui,"route")!="view"&&!editorPresent){
   web.CoreWebView2.Navigate("https://www.canva.com/design/DAHbOZ_XOJI/h3UEZISrHVAyXQuw06aOTw/view");
   ui=await PrepareUi("public-view-control");
   if(Int(ui,"dialogs")==0&&await ClickControl(ui,"present")){
    await Pause(2500);ui=await InspectPublicUi();ProbeLog("WINDOWS_AFTER_PRESENT",new{phase="public-view-control",ui});
   }
  }
  if(Int(ui,"dialogs")!=0||(Str(ui,"route")!="view"&&!editorPresent)||Int(ui,"slider")<1){ProbeLog("WINDOWS_BLOCKED",new{reason="no-unobstructed-observable-view",ui});return 2;}
  int start=await Read();
  // Move to a text-bearing page using actual Windows mouse clicks. A click
  // that reveals a sentence instead of advancing is itself a useful observation.
  int steps=0,sameChanged=0,advances=0;
  for(int i=0;i<10;i++){
   await Pause(1000);string a=await FrameHash();await Pause(700);string b=await FrameHash();int before=await Read();
   if(before==0){ProbeLog("WINDOWS_BLOCKED",new{reason="page-index-unavailable"});return 2;}
   bool delivered=await PhysicalClick(.5,.48);await Pause(1300);int after=await Read();string c=await FrameHash();
   bool stable=a==b,changed=b!=c;
   ProbeLog("WINDOWS_CLICK",new{step=i+1,delivered,before,after,stableBefore=stable,changedAfter=changed,foreground=GetForegroundWindow()==Handle});
   if(!delivered)return 2;
   steps++;if(stable&&changed&&before==after&&after>0)sameChanged++;if(after==before+1)advances++;
  }
  foreach(byte key in new byte[]{0x27,0x25}){
   int before=await Read();bool delivered=await PhysicalKey(key);await Pause(1200);
   ProbeLog("WINDOWS_KEY",new{key=key==0x27?"right":"left",delivered,before,after=await Read()});
  }
  ProbeLog("WINDOWS_RESULT",new{start,steps,advances,sameChanged,editorPresent,presentationAcceptance=false,reason="same-page visual changes require verification against a known animated slide"});
  return 0;
 }
 static int RunLiveProbe(string folder){
  if(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true")return 2;
  folder=Path.GetFullPath(folder);
  string install=Path.Combine(folder,"TeacherToolsLocal"),sessions=Path.Combine(install,"book-reader-sessions"),session=Path.Combine(sessions,Guid.NewGuid().ToString("N"));
  Directory.CreateDirectory(session);Environment.SetEnvironmentVariable("LOCALAPPDATA",folder);
  File.WriteAllText(Path.Combine(session,"lease"),"1");
  int code=2;BookReader reader=null;
  using(var ownerForm=new Form{Text="Disposable CI owner",StartPosition=FormStartPosition.CenterScreen,WindowState=FormWindowState.Maximized}){
   var tick=new Timer{Interval=900};tick.Tick+=(s,e)=>File.SetLastWriteTimeUtc(Path.Combine(session,"lease"),DateTime.UtcNow);
   var watchdog=new Timer{Interval=150000};watchdog.Tick+=(s,e)=>{ProbeLog("WINDOWS_BLOCKED",new{reason="watchdog"});if(reader!=null)reader.Close();ownerForm.Close();};
   ownerForm.Shown+=async(s,e)=>{
    try{
     await Task.Delay(300);
     int w=ownerForm.ClientSize.Width,h=ownerForm.ClientSize.Height;
     File.WriteAllText(Path.Combine(session,"layout.json"),Json.Serialize(new{vw=w,vh=h,x=8,y=8,w=w-16,h=h-16,visible=1,immersive=0}),Utf8);
     var config=new Dictionary<string,object>{{"url",AlmondShareUrl},{"title","Disposable CI Almond click probe"},{"interactive",1},{"pages",394},{"start",1},{"saved",1},{"owner",ownerForm.Handle.ToInt64()},{"ownerPid",System.Diagnostics.Process.GetCurrentProcess().Id}};
     reader=new BookReader(session,config,false);reader.ShowForBoard();tick.Start();watchdog.Start();
     code=await reader.RunClickProbe();
    }catch(Exception ex){ProbeLog("WINDOWS_BLOCKED",new{reason=ex.GetType().Name});code=2;}
    finally{tick.Stop();watchdog.Stop();if(reader!=null&&!reader.IsDisposed)reader.Close();ownerForm.Close();}
   };
   Application.Run(ownerForm);tick.Dispose();watchdog.Dispose();if(reader!=null)reader.Dispose();
  }
  return code;
 }
}
#endif
