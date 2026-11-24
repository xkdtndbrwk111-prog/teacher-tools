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
  using(var m=new MemoryStream()){await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,m);
   using(var sha=SHA256.Create())return Convert.ToBase64String(sha.ComputeHash(m.ToArray()));}
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
 async Task<int> RunClickProbe(){
  // Production navigation is exercised first: the exact registered short URL.
  var deadline=DateTime.UtcNow.AddSeconds(55);
  while((web.CoreWebView2==null||!slotVisible||navigationMode=="pending")&&DateTime.UtcNow<deadline)await Pause(400);
  if(web.CoreWebView2==null||!slotVisible){ProbeLog("WINDOWS_BLOCKED",new{reason="no-window-or-WebView2"});return 2;}
  var ui=await PrepareUi("registered-short-link");
  if(Int(ui,"dialogs")==0&&await ClickControl(ui,"present")){
   await Pause(3000);ui=await InspectPublicUi();ProbeLog("WINDOWS_AFTER_PRESENT",new{phase="registered-short-link",ui});
   if(Int(ui,"slider")==0&&ui["manage"]==null&&ui["reject"]==null&&ui["saveCookie"]==null&&await ClickControl(ui,"present")){
    await Pause(3000);ui=await InspectPublicUi();ProbeLog("WINDOWS_AFTER_PRESENT_CONFIRM",new{phase="registered-short-link",ui});
   }
  }
  bool editorPresent=Str(ui,"route")=="edit"&&Convert.ToBoolean(ui["fullscreen"])&&Int(ui,"slider")>0&&Int(ui,"dialogs")==0;
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
