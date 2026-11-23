using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class BookReader : Form {
 static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
 static readonly UTF8Encoding Utf8=new UTF8Encoding(false);
 static readonly Regex UrlPattern=new Regex(@"^https://www\.canva\.com/design/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/view\?embed$",RegexOptions.CultureInvariant);
 // Use direct top-level Canva navigation so real touch/click/arrow input reaches the document.
 // The earlier nested iframe was blocked or noninteractive on the field PC.
 const string PageScript="(()=>{if(location.origin!=='https://www.canva.com')return null;const a=[...document.querySelectorAll('[role=slider][aria-valuenow][aria-valuemin][aria-valuemax]')].filter(e=>e.getClientRects().length>0&&e.getAttribute('aria-valuemin')==='1');if(a.length!==1)return null;return {page:Number(a[0].getAttribute('aria-valuenow')),total:Number(a[0].getAttribute('aria-valuemax'))}})()";
 readonly WebView2 web=new WebView2();
 readonly Timer placement=new Timer();
 readonly IntPtr owner;
 readonly int ownerPid;
 bool shownOnce, positioned, slotVisible, immersive, exitFull, cleanControls;
 long commandSeq;
 bool immersiveApplied;
 Rectangle lastSlot;
 readonly Timer timer=new Timer();
 readonly string dir, url, title;
 readonly bool interactive;
 readonly int pages, requested, initialMark, fixtureTotal;
  int actualPages;
 readonly Rectangle screenArea, workingArea;
 int saved,detected,previous,stable,waitingFor,steps,manualMode;
 bool ready,busy,closed,fixture;
 DateTime seekStart=DateTime.UtcNow,waitingSince=DateTime.UtcNow;
 string lastState="", lastStatus="불러오는 중", placementStatus="initial";
 int ownerError;

 static int Int(Dictionary<string,object> d,string k){object v;return d.TryGetValue(k,out v)?Convert.ToInt32(v):0;}
 static string Str(Dictionary<string,object> d,string k){object v;return d.TryGetValue(k,out v)?Convert.ToString(v):"";}
 static bool ValidUrl(string u){return u!=null&&u.Length<=500&&UrlPattern.IsMatch(u);}
 // Keep top-level navigation constrained, including attempts to leave the embed wrapper.
 static bool AllowedInteractiveNavigation(string u) {
  Uri x; if(!Uri.TryCreate(u,UriKind.Absolute,out x)||x.Scheme!=Uri.UriSchemeHttps||x.Port!=443||x.UserInfo.Length!=0)return false;
  if(x.Host=="canva.link")return x.AbsolutePath=="/9qxk3zuhh93ts2s";
  return (x.Host=="www.canva.com"||x.Host=="canva.com")&&
         (x.AbsolutePath.StartsWith("/design/DAHbOZ_XOJI/",StringComparison.Ordinal)||
          x.AbsolutePath=="/login"||x.AbsolutePath=="/signup");
 }
 static Rectangle Rect(Dictionary<string,object> a,string prefix,Rectangle fallback){try{var r=new Rectangle(Int(a,prefix+"X"),Int(a,prefix+"Y"),Int(a,prefix+"W"),Int(a,prefix+"H"));return r.Width>=400&&r.Height>=300&&r.Width<=16384&&r.Height<=16384?r:fallback;}catch{return fallback;}}
 BookReader(string folder,Dictionary<string,object> config,bool lab){
  dir=folder;fixture=lab;url=Str(config,"url");title=Str(config,"title");interactive=Int(config,"interactive")==1;pages=Int(config,"pages");requested=Int(config,"start");initialMark=Int(config,"saved");saved=initialMark;fixtureTotal=fixture&&Int(config,"fixtureTotal")>0?Int(config,"fixtureTotal"):pages;
  if(!fixture&&!(interactive?url=="https://canva.link/9qxk3zuhh93ts2s":ValidUrl(url))||pages<1||pages>4095||requested<1||requested>pages||initialMark<0||initialMark>pages||title.Length>80)throw new ArgumentException("invalid book request");
  screenArea=Rect(config,"screen",Screen.PrimaryScreen.Bounds);workingArea=Rect(config,"work",Screen.PrimaryScreen.WorkingArea);
  owner=new IntPtr(Convert.ToInt64(config.ContainsKey("owner")?config["owner"]:0));
  ownerPid=Int(config,"ownerPid");
  if(!fixture&&!OwnerValid())throw new ArgumentException("missing board owner");
  Text=title+" · 호자보드";StartPosition=FormStartPosition.Manual;FormBorderStyle=FormBorderStyle.None;
  Bounds=fixture?workingArea:new Rectangle(-30000,-30000,320,180);
  BackColor=Color.FromArgb(17,17,17);ShowInTaskbar=false;KeyPreview=true;
  Controls.Add(web);web.Dock=DockStyle.Fill;
  timer.Interval=350;timer.Tick+=async(s,e)=>await Poll();
  placement.Interval=120;placement.Tick+=(s,e)=>Place();
  Shown+=async(s,e)=>{shownOnce=true;Place();if(!fixture)placement.Start();await Initialize();};
  FormClosing+=(s,e)=>{closed=true;timer.Stop();placement.Stop();Publish("종료");};
 }
 [StructLayout(LayoutKind.Sequential)] struct RECT{public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] struct POINT{public int X,Y;}
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h,uint cmd);
 [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW",SetLastError=true)] static extern IntPtr SetWindowLongPtr(IntPtr h,int n,IntPtr p);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int hgt,uint flags);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 protected override bool ShowWithoutActivation{get{return !fixture;}}
 protected override CreateParams CreateParams {
  get {
   var p=base.CreateParams;
   if(!fixture&&owner!=IntPtr.Zero){p.Parent=owner;p.Style=(p.Style&~0x40000000)|unchecked((int)0x80000000);p.ExStyle=(p.ExStyle|0x80)&~0x40000;}
   return p;
  }
 }
 sealed class BoardOwner : IWin32Window {
  public IntPtr Handle{get;private set;}
  public BoardOwner(IntPtr h){Handle=h;}
 }
 bool EnsureOwner(){
  if(GetWindow(Handle,4)==owner){ownerError=0;return true;}
  SetWindowLongPtr(Handle,-8,owner);ownerError=Marshal.GetLastWin32Error();
  bool ok=GetWindow(Handle,4)==owner;if(ok)ownerError=0;return ok;
 }
 void ShowForBoard(){if(!fixture)Show(new BoardOwner(owner));}
 bool OwnerValid(){uint pid;return owner!=IntPtr.Zero&&IsWindow(owner)&&GetWindowThreadProcessId(owner,out pid)!=0&&pid==ownerPid;}
 Dictionary<string,object> ReadFile(string name){try{return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(dir,name),Encoding.UTF8));}catch{return null;}}
 void HideSlot(string reason){placementStatus=reason;if(slotVisible){ShowWindow(Handle,0);slotVisible=false;}Publish(lastStatus);}
 void Place(){
  if(fixture||closed||!shownOnce)return;
  if(!OwnerValid()){Close();return;}
  if(!EnsureOwner()){HideSlot("owner attach failed");return;}
  var l=ReadFile("layout.json");
  if(l==null||IsIconic(owner)||!IsWindowVisible(owner)||Int(l,"visible")!=1){HideSlot("owner or slot hidden");return;}
  RECT r;POINT o=new POINT();
  if(!GetClientRect(owner,out r)||!ClientToScreen(owner,ref o)){HideSlot("client rect unavailable");return;}
  int cw=r.R-r.L,ch=r.B-r.T,vw=Int(l,"vw"),vh=Int(l,"vh");
  int x=Int(l,"x"),y=Int(l,"y"),w=Int(l,"w"),h=Int(l,"h");
  if(vw<200||vh<150||cw<200||ch<150||x<0||y<0||w<100||h<60||x+w>vw+1||y+h>vh+1){HideSlot("invalid slot geometry");return;}
  bool nextImmersive=Int(l,"immersive")==1;if(nextImmersive!=immersive){immersive=nextImmersive;exitFull=false;cleanControls=false;}
  double scale=(double)cw/vw;int contentH=(int)Math.Round(vh*scale),offset=ch-contentH;
  // Chromium app has no toolbar; bottom-align CSS viewport in client area, allowing only a bounded title strip.
  if(scale<0.45||scale>4.5||offset< -4||offset>Math.Max(96,scale*96)){HideSlot("viewport scale mismatch");return;}
  int left=o.X+(int)Math.Round(x*scale),top=o.Y+Math.Max(0,offset)+(int)Math.Round(y*scale);
  int right=Math.Min(o.X+cw,o.X+(int)Math.Round((x+w)*scale)),bottom=Math.Min(o.Y+ch,o.Y+Math.Max(0,offset)+(int)Math.Round((y+h)*scale));
  var next=Rectangle.FromLTRB(left,top,right,bottom);
  if(next.Width<100||next.Height<60||GetWindow(Handle,4)!=owner){HideSlot("invalid projected slot");return;}
  if(!positioned||next!=lastSlot||!slotVisible){
   if(!SetWindowPos(Handle,IntPtr.Zero,next.X,next.Y,next.Width,next.Height,0x0010|0x0004|0x0040)){HideSlot("position failed");return;}
   lastSlot=next;positioned=true;slotVisible=true;placementStatus="positioned";Publish(lastStatus);
  }
 }
 string State(string status){return Json.Serialize(new{page=detected,saved=saved,status=status,closed=closed,ready=ready,total=actualPages>0?actualPages:pages,manual=manualMode!=0,ack=commandSeq,owned=fixture||GetWindow(Handle,4)==owner,visible=fixture||slotVisible,x=lastSlot.X,y=lastSlot.Y,w=lastSlot.Width,h=lastSlot.Height,placement=placementStatus,ownerError=ownerError,immersive=immersive,exitFull=exitFull,cleanControls=cleanControls});}
 void Publish(string status){
  lastStatus=status;string data=State(status);if(data==lastState)return;
  try{string p=Path.Combine(dir,"state.json"),tmp=p+".tmp";File.WriteAllText(tmp,data,Utf8);if(File.Exists(p))File.Replace(tmp,p,null);else File.Move(tmp,p);lastState=data;}catch{}
 }
 async Task Command(){
  var d=ReadFile("command.json");if(d==null)return;
  long seq=Convert.ToInt64(d["seq"]);if(seq<=commandSeq)return;
  string kind=Str(d,"kind");int p=Int(d,"page");
  if(kind=="manual"&&p>=1&&p<=(actualPages>0?actualPages:pages)){manualMode=1;saved=p;seekTarget=0;waitingFor=0;}
  else if(kind=="auto"){manualMode=0;seekTarget=0;waitingFor=0;stable=0;previous=0;}
  else if((kind=="prev"||kind=="next")&&immersive&&!interactive){seekTarget=0;waitingFor=0;steps=0;stable=0;await Step(kind=="next");}
  else return;
  commandSeq=seq;Publish(manualMode!=0?"수동 저장됨":"자동 판독 중");
 }
 async Task Initialize(){
  Publish("불러오는 중");try{
   // Shared runtime, fresh book-only profile. No screen capture or web host objects.
   var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dir,"profile"));
   await web.EnsureCoreWebView2Async(env);var core=web.CoreWebView2;
   core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreHostObjectsAllowed=false;core.Settings.IsWebMessageEnabled=false;
   core.NewWindowRequested+=(s,e)=>e.Handled=true;core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;
   core.DownloadStarting+=(s,e)=>e.Cancel=true;
   core.NavigationStarting+=(s,e)=>{
     // Allow only this exact Canva share target and redirects within the same design.
     if(!fixture&&!(interactive?AllowedInteractiveNavigation(e.Uri):String.Equals(e.Uri,url,StringComparison.Ordinal)))e.Cancel=true;
    };
   core.NavigationCompleted+=(s,e)=>{
     ready=e.IsSuccess;seekStart=DateTime.UtcNow;
     if(ready&&interactive&&!fixture)BeginInvoke(new Action(()=>{if(!closed&&web.CanFocus)web.Focus();}));
     Publish(ready?(interactive?"Canva 클릭형 책 준비됨":"페이지 판독 중"):"책 연결 실패");
    };
    if(fixture)core.NavigateToString("<!doctype html><div role=slider aria-valuemin=1 aria-valuemax="+fixtureTotal+" aria-valuenow=1>fixture</div><button aria-label='Previous page'>back</button><button aria-label='Next page'>next</button><script>let s=document.querySelector('[role=slider]');const step=n=>s.setAttribute('aria-valuenow',Math.max(1,Math.min("+fixtureTotal+",+s.getAttribute('aria-valuenow')+n)));for(let b of document.querySelectorAll('button'))b.onclick=()=>step(b.textContent==='next'?1:-1);document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')step(1);if(e.key==='ArrowLeft')step(-1)})</script>");
    else core.Navigate(url);
    timer.Start();
  }catch{Publish("WebView2 시작 실패");Close();}
 }
 const string ImmersiveScript=@"(()=>{const on=MODE;if(location.origin!=='https://www.canva.com'&&location.protocol!=='about:')return {exit:false,clean:false};const key='__ttBookImmersiveV1';let q=window[key];if(!on){if(q){q.remove();delete window[key]}return {exit:false,clean:false}}if(!q){let hidden=null,prior='',ended=false,exit=false,navigated=false,timer=0,canStep=false;const overlay=document.createElement('div');overlay.setAttribute('aria-label','Book fullscreen navigation');overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:transparent;touch-action:manipulation;outline:none';overlay.tabIndex=0;const hint=document.createElement('button');hint.type='button';hint.textContent='전체화면 해제 (Esc)';hint.style.cssText='position:absolute;top:12px;right:12px;padding:12px 18px;font:16px sans-serif;color:white;background:#222d;border:1px solid #fff8;border-radius:8px;display:none;cursor:pointer';overlay.append(hint);const reveal=()=>{hint.style.display='block';clearTimeout(timer);timer=setTimeout(()=>hint.style.display='none',2200)};const findButtons=label=>[...document.querySelectorAll('button,[role=button]')].filter(e=>e.getAttribute('aria-label')===label&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&e.getClientRects().length>0);const step=next=>{if(!canStep)return false;const a=findButtons(next?'Next page':'Previous page');if(a.length!==1)return false;navigated=true;a[0].click();return true};const keys=e=>{if(ended||e.altKey||e.ctrlKey||e.metaKey)return;if(!['ArrowLeft','ArrowRight',' ','PageDown','PageUp','Escape'].includes(e.key))return;if(e.key!=='Escape'&&!canStep)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(e.key==='Escape'){exit=true;return}step(e.key!=='ArrowLeft'&&e.key!=='PageUp')};document.addEventListener('keydown',keys,true);overlay.addEventListener('click',e=>{e.stopPropagation();if(e.target===hint){exit=true;return}const x=e.clientX/innerWidth;if(x<.45)step(false);else if(x>.55)step(true);else reveal()});overlay.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&e.clientY<80)reveal()});document.body.append(overlay);overlay.focus({preventScroll:true});q=window[key]={get exit(){return exit},takeNavigation(){const n=navigated;navigated=false;return n},refresh(){canStep=findButtons('Previous page').length===1&&findButtons('Next page').length===1;overlay.style.pointerEvents=canStep?'auto':'none';hint.style.pointerEvents='auto';const a=[...document.querySelectorAll('[role=slider][aria-valuenow][aria-valuemin][aria-valuemax]')].filter(e=>e.getClientRects().length>0&&e.getAttribute('aria-valuemin')==='1');let bar=null;if(canStep&&a.length===1){for(let p=a[0];p&&p!==document.body;p=p.parentElement){const r=p.getBoundingClientRect();if(r.height>Math.min(240,innerHeight*.28))break;if(r.top>=innerHeight*.70&&r.bottom<=innerHeight+5&&p.querySelector('[aria-label=""Next page""]')&&p.querySelector('[aria-label=""Previous page""]'))bar=p;}}if(bar!==hidden){if(hidden)hidden.style.opacity=prior;hidden=bar;if(bar){prior=bar.style.opacity;bar.style.opacity='0'}}return !!bar},remove(){ended=true;clearTimeout(timer);document.removeEventListener('keydown',keys,true);if(hidden)hidden.style.opacity=prior;overlay.remove()}};reveal();}return {exit:q.exit,clean:q.refresh(),navigated:q.takeNavigation()}})()";
 async Task ApplyImmersive(){
  if(!immersive&&!immersiveApplied)return;
  string raw=await web.CoreWebView2.ExecuteScriptAsync(ImmersiveScript.Replace("MODE",immersive?"true":"false"));
  immersiveApplied=immersive;
  if(raw=="null")return;
  var d=Json.Deserialize<Dictionary<string,object>>(raw);
  cleanControls=d.ContainsKey("clean")&&Convert.ToBoolean(d["clean"]);if(immersive&&d.ContainsKey("exit")&&Convert.ToBoolean(d["exit"]))exitFull=true;
  if(immersive&&d.ContainsKey("navigated")&&Convert.ToBoolean(d["navigated"])){seekTarget=0;waitingFor=0;steps=0;stable=0;}
 }
 async Task<int> Read(){
  string script=fixture?PageScript.Replace("if(location.origin!=='https://www.canva.com')return null;",""):PageScript;
  string raw=await web.CoreWebView2.ExecuteScriptAsync(script);
  if(raw=="null")return 0;
  var d=Json.Deserialize<Dictionary<string,object>>(raw);int p=Int(d,"page"),n=Int(d,"total");if(n<1||n>4095||p<1||p>n)return 0;actualPages=n;return p;
 }
 async Task<bool> Step(bool next){
  string label=next?"Next page":"Previous page";
  string script="(()=>{const a=[...document.querySelectorAll('button,[role=button]')].filter(e=>e.getAttribute('aria-label')==='"+label+"'&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&e.getClientRects().length>0);if(a.length!==1)return false;a[0].click();return true})()";
  return await web.CoreWebView2.ExecuteScriptAsync(script)=="true";
 }

 int seekTarget=-1;
 async Task Poll(){
  if(closed||busy)return;
  if(!fixture&&(File.Exists(Path.Combine(dir,"stop"))||DateTime.UtcNow-File.GetLastWriteTimeUtc(Path.Combine(dir,"lease"))>TimeSpan.FromSeconds(35))){Close();return;}
  if(!ready)return;
  busy=true;
  try{
   await Command();
   if(!fixture&&!slotVisible)return;
   if(interactive){
    // Canva owns native clicks and arrow keys; never synthesize animation clicks.
    // Its DOM is not a reliable bookmark source; manual page changes are authoritative.
    detected=saved>0?saved:requested;
    Publish("Canva 직접 재생 · 페이지 수동 기록");
    if(fixture){
     // Verify pointer and keyboard events on a real top-level WebView2 fixture.
     if(await web.CoreWebView2.ExecuteScriptAsync("(()=>!document.querySelector('iframe')&&document.querySelectorAll('button').length===2)()")!="true")throw new InvalidOperationException("interactive fixture must have no iframe");
     await web.CoreWebView2.ExecuteScriptAsync("document.querySelectorAll('button')[1].click()");
     if(await Read()!=2)throw new InvalidOperationException("interactive fixture click failed");
     await web.CoreWebView2.ExecuteScriptAsync("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
     if(await Read()!=3)throw new InvalidOperationException("interactive fixture right arrow failed");
     await web.CoreWebView2.ExecuteScriptAsync("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
     if(await Read()!=2)throw new InvalidOperationException("interactive fixture left arrow failed");
     Console.WriteLine("HOST INTERACTIVE TOP-LEVEL INPUT FIXTURE PASS");Close();
    }
    return;
   }
   await ApplyImmersive();    return;
   }
   await ApplyImmersive();
   if(seekTarget<0)seekTarget=requested;
   int p=await Read();if(p==0){stable=0;previous=0;Publish("페이지 정보 없음 · 기존 북마크 유지");return;}
    if(seekTarget>actualPages)seekTarget=actualPages;
   if(p==previous)stable++;else{previous=p;stable=1;}
   if(stable<2)return;
   detected=p;
   if(manualMode!=0){Publish("수동 저장됨");return;}
   if(seekTarget>0){
    if(p==seekTarget){seekTarget=0;waitingFor=0;}
    else{
     if(DateTime.UtcNow-seekStart>TimeSpan.FromSeconds(150)||steps>=120){waitingFor=0;Publish("이어 읽기 위치로 직접 이동");return;}
     if(waitingFor!=0&&p!=waitingFor){if(DateTime.UtcNow-waitingSince<TimeSpan.FromSeconds(8))return;waitingFor=0;steps=120;Publish("이어 읽기 위치로 직접 이동");return;}
     if(waitingFor==p)waitingFor=0;
     if(await Step(p<seekTarget)){waitingFor=p+(p<seekTarget?1:-1);waitingSince=DateTime.UtcNow;steps++;Publish(seekTarget+"쪽 이동 중");}
     else{steps=120;Publish("이어 읽기 위치로 직접 이동");}
     return;
    }
   }
   if(saved!=p)saved=p;
   Publish("자동 저장됨");
   if(fixture&&saved==requested){if(requested==3){try{await VerifyImmersiveFixture();}catch(Exception ex){Console.Error.WriteLine(ex.Message);saved=0;Close();return;}}Console.WriteLine("HOST FIXTURE PASS "+saved);Close();}
  }catch{Publish("페이지 판독 실패 · 기존 북마크 유지");}finally{busy=false;}
 }
 async Task VerifyImmersiveFixture(){
  var core=web.CoreWebView2;
  await core.ExecuteScriptAsync(@"(()=>{let s=document.querySelector('[role=slider]'),b=document.createElement('div');b.style.cssText='position:fixed;bottom:0;left:0;width:100%;height:40px';b.append(s,...document.querySelectorAll('button'));document.body.append(b);return true})()");
  immersive=true;await ApplyImmersive();if(!cleanControls)throw new InvalidOperationException("fixture control bar not hidden");
  await core.ExecuteScriptAsync(@"(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));return true})()");
  if(await Read()!=4)throw new InvalidOperationException("fixture right key");
  await core.ExecuteScriptAsync(@"(()=>{let o=document.querySelector('[aria-label=""Book fullscreen navigation""]');o.dispatchEvent(new MouseEvent('click',{clientX:10,bubbles:true}));return true})()");
  if(await Read()!=3)throw new InvalidOperationException("fixture left click");
  // Regression: if Canva changes localized navigation controls, do not swallow input.
  await core.ExecuteScriptAsync(@"(()=>{for(const b of document.querySelectorAll('button'))b.remove();return true})()");
  await ApplyImmersive();
  if(cleanControls)throw new InvalidOperationException("fallback should expose Canva controls");
  if(await core.ExecuteScriptAsync(@"(()=>{const o=document.querySelector('[aria-label=""Book fullscreen navigation""]');return o&&getComputedStyle(o).pointerEvents==='none'&&document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))})()")!="true")throw new InvalidOperationException("fallback must release pointer and keyboard events");
  await core.ExecuteScriptAsync(@"(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return true})()");
  await ApplyImmersive();if(!exitFull)throw new InvalidOperationException("fixture escape");
  immersive=false;await ApplyImmersive();
  if(await core.ExecuteScriptAsync(@"(()=>!document.querySelector('[aria-label=""Book fullscreen navigation""]')&&document.querySelector('[role=slider]').parentElement.style.opacity!=='0')()")!="true")throw new InvalidOperationException("fixture restore");
  Console.WriteLine("HOST IMMERSIVE FIXTURE PASS keyboard click escape Canva fallback control restore");
 }
 [STAThread] static int Main(string[] args){
  try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  try{
   if(args.Length!=2||args[0]!="--session"&&args[0]!="--self-test")return 2;
   bool lab=args[0]=="--self-test";string dir=Path.GetFullPath(args[1]);
   var d=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(dir,"request.json"),Encoding.UTF8));
   using(var f=new BookReader(dir,d,lab)){if(lab){var watchdog=new Timer{Interval=25000};watchdog.Tick+=(s,e)=>{watchdog.Stop();f.Close();};watchdog.Start();Application.Run(f);watchdog.Dispose();return f.saved==f.requested&&f.detected==f.requested?0:1;}f.ShowForBoard();Application.Run(f);}
   return 0;
  }catch(Exception ex){Console.Error.WriteLine(ex.GetType().Name);return 1;}
 }
}
