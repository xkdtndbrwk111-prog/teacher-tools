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

internal sealed partial class BookReader : Form {
 static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
 static readonly UTF8Encoding Utf8=new UTF8Encoding(false);
 static readonly Regex UrlPattern=new Regex(@"^https://www\.canva\.com/design/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/view\?embed$",RegexOptions.CultureInvariant);
 // Use direct top-level Canva navigation so real touch/click/arrow input reaches the document.
 // The earlier nested iframe was blocked or noninteractive on the field PC.
 const string AlmondShareUrl="https://canva.link/9qxk3zuhh93ts2s";
 string navigationMode="pending";
 int presentAttempts; DateTime presentRetry=DateTime.MinValue; bool presentationConfirmed;
 const string PageScript="(()=>{if(location.origin!=='https://www.canva.com')return null;const a=[...document.querySelectorAll('[role=slider][aria-valuenow][aria-valuemin][aria-valuemax]')].filter(e=>e.getClientRects().length>0&&e.getAttribute('aria-valuemin')==='1');if(a.length!==1)return null;return {page:Number(a[0].getAttribute('aria-valuenow')),total:Number(a[0].getAttribute('aria-valuemax'))}})()";
 readonly WebView2 web=new WebView2();
 readonly Panel startupCover=new Panel();
 readonly Label startupText=new Label();
 readonly Button startupManual=new Button();
 bool startupCoverActive;
 DateTime startupCoverAt=DateTime.UtcNow;
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
 bool interactiveBookmarkValid,interactiveSeekFocused,interactiveSeekFailed;
 DateTime interactiveSeekAt=DateTime.MinValue; int interactiveSeekExpected,interactiveSeekKeys;
 bool interactiveFastDisabled,interactiveFastPending;int interactiveFastFrom,interactiveFastKeys;
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
  // An embed viewer plays slide animations together; never force or accept it for the click book.
  if(Regex.IsMatch(x.Query,@"(?:^\?|&)embed(?:=|&|$)",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))return false;
  return (x.Host=="www.canva.com"||x.Host=="canva.com")&&
         (x.AbsolutePath.StartsWith("/design/DAHbOZ_XOJI/",StringComparison.Ordinal)||
          x.AbsolutePath=="/login"||x.AbsolutePath=="/signup");
 }
 static Rectangle Rect(Dictionary<string,object> a,string prefix,Rectangle fallback){try{var r=new Rectangle(Int(a,prefix+"X"),Int(a,prefix+"Y"),Int(a,prefix+"W"),Int(a,prefix+"H"));return r.Width>=400&&r.Height>=300&&r.Width<=16384&&r.Height<=16384?r:fallback;}catch{return fallback;}}
 BookReader(string folder,Dictionary<string,object> config,bool lab){
  dir=folder;fixture=lab;url=Str(config,"url");title=Str(config,"title");interactive=Int(config,"interactive")==1;pages=Int(config,"pages");requested=Int(config,"start");initialMark=Int(config,"saved");saved=initialMark;fixtureTotal=fixture&&Int(config,"fixtureTotal")>0?Int(config,"fixtureTotal"):pages;
  if(!fixture&&!(interactive?url==AlmondShareUrl:ValidUrl(url))||pages<1||pages>4095||requested<1||requested>pages||initialMark<0||initialMark>pages||title.Length>80)throw new ArgumentException("invalid book request");
  screenArea=Rect(config,"screen",Screen.PrimaryScreen.Bounds);workingArea=Rect(config,"work",Screen.PrimaryScreen.WorkingArea);
  owner=new IntPtr(Convert.ToInt64(config.ContainsKey("owner")?config["owner"]:0));
  ownerPid=Int(config,"ownerPid");
  if(!fixture&&!OwnerValid())throw new ArgumentException("missing board owner");
  Text=title+" · 호자보드";StartPosition=FormStartPosition.Manual;FormBorderStyle=FormBorderStyle.None;
  Bounds=fixture?workingArea:new Rectangle(-30000,-30000,320,180);
  BackColor=Color.FromArgb(17,17,17);ShowInTaskbar=false;KeyPreview=true;
  Controls.Add(web);web.Dock=DockStyle.Fill;
  web.KeyDown+=InteractiveEscape;
  if(interactive){
   startupCover.Dock=DockStyle.Fill;startupCover.BackColor=Color.FromArgb(24,24,24);
   startupText.Dock=DockStyle.Fill;startupText.TextAlign=ContentAlignment.MiddleCenter;startupText.ForeColor=Color.White;startupText.Font=new Font("Malgun Gothic",20);startupText.Text=StartupMessage(false,requested);
   startupManual.Dock=DockStyle.Bottom;startupManual.Height=44;startupManual.Text="직접 열기";startupManual.Click+=(sender,args)=>DismissStartupCover();
   startupCover.Controls.Add(startupText);startupCover.Controls.Add(startupManual);Controls.Add(startupCover);startupCover.BringToFront();startupCoverActive=true;
  }
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
 void InteractiveEscape(object sender,KeyEventArgs e){
  if(!interactive||!immersive||closed||e.KeyCode!=Keys.Escape||e.Modifiers!=Keys.None)return;
  e.Handled=true;e.SuppressKeyPress=true;
  // Restore only the board layout, not Canva's own presentation. Do not make COM calls inside accelerator callback.
  exitFull=true;Publish(lastStatus);
 }
 void DismissStartupCover(){if(!startupCoverActive)return;startupCoverActive=false;startupCover.Visible=false;if(!closed&&web.CanFocus)web.Focus();}
 static string StartupMessage(bool presenting,int page){return (presenting?page+"쪽 펼치는 중…":"책 펼치는 중…")+"\n\n조금 오래 걸릴 수 있어요. 잠시만 기다려 주세요.";}
 void UpdateStartupCover(){
  if(!startupCoverActive)return;
  if(interactiveBookmarkValid||interactiveSeekFailed||(!presentationConfirmed&&(DateTime.UtcNow-startupCoverAt).TotalSeconds>15)||(DateTime.UtcNow-startupCoverAt).TotalSeconds>105){DismissStartupCover();return;}
  startupText.Text=StartupMessage(presentationConfirmed,requested);
 }
 string State(string status){return Json.Serialize(new{page=detected,saved=saved,status=status,closed=closed,ready=ready,total=actualPages>0?actualPages:pages,manual=manualMode!=0,ack=commandSeq,owned=fixture||GetWindow(Handle,4)==owner,visible=fixture||slotVisible,x=lastSlot.X,y=lastSlot.Y,w=lastSlot.Width,h=lastSlot.Height,placement=placementStatus,ownerError=ownerError,immersive=immersive,exitFull=exitFull,cleanControls=cleanControls,navigationMode=navigationMode,presentationConfirmed=presentationConfirmed,bookmarkValid=interactiveBookmarkValid,seekPage=interactive&&seekTarget>0?seekTarget:0,seekFailed=interactive&&interactiveSeekFailed});}
 void Publish(string status){
  if(closed&&status!="종료")return;
  lastStatus=status;string data=State(status);if(data==lastState)return;
  try{string p=Path.Combine(dir,"state.json"),tmp=p+".tmp";File.WriteAllText(tmp,data,Utf8);if(File.Exists(p))File.Replace(tmp,p,null);else File.Move(tmp,p);lastState=data;}catch{}
 }
 async Task Command(){
  var d=ReadFile("command.json");if(d==null)return;
  long seq=Convert.ToInt64(d["seq"]);if(seq<=commandSeq)return;
  string kind=Str(d,"kind");int p=Int(d,"page");
  if(interactive){if(kind=="seek"&&p>=1&&p<=pages){await BeginInteractiveSeek(p);commandSeq=seq;Publish(p+"쪽 이동 중");}else commandSeq=seq;return;}
  if(kind=="manual"&&p>=1&&p<=(actualPages>0?actualPages:pages)){manualMode=1;saved=p;seekTarget=0;waitingFor=0;}
  else if(kind=="auto"){manualMode=0;seekTarget=0;waitingFor=0;stable=0;previous=0;}
  else if((kind=="prev"||kind=="next")&&immersive&&!interactive){seekTarget=0;waitingFor=0;steps=0;stable=0;await Step(kind=="next");}
  else return;
  commandSeq=seq;Publish(manualMode!=0?"수동 저장됨":"자동 판독 중");
 }
 // Only the interactive book uses a persistent isolated WebView2 profile.
 // Never reuse the teacher's ordinary Edge/Chrome profile, or store it inside
 // the per-session directory which is discarded on every new book open.
 static string InteractiveProfilePath(string session){
  var s=new DirectoryInfo(Path.GetFullPath(session));
  var sessions=s.Parent;var install=sessions==null?null:sessions.Parent;
  string expected=Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"TeacherToolsLocal"));
  // LOCALAPPDATA is explicitly isolated by the native test runner as well.
  string local=Environment.GetEnvironmentVariable("LOCALAPPDATA");
  if(!String.IsNullOrEmpty(local))expected=Path.GetFullPath(Path.Combine(local,"TeacherToolsLocal"));
  if(install==null||!String.Equals(install.FullName,expected,StringComparison.OrdinalIgnoreCase)||
     !String.Equals(sessions.Name,"book-reader-sessions",StringComparison.OrdinalIgnoreCase)||
     !Regex.IsMatch(s.Name,@"^[a-f0-9]{32}$"))throw new InvalidOperationException("unexpected book profile root");
  foreach(var d in new[]{install,sessions,s})if((d.Attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("linked book profile root");
  string profile=Path.Combine(install.FullName,"book-reader-profile");
  if(File.Exists(profile))throw new InvalidOperationException("invalid book profile");
  var p=Directory.CreateDirectory(profile);
  if((p.Attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("linked book profile");
  return p.FullName;
 }
 async Task Initialize(){
  Publish("불러오는 중");try{
   // No screen capture, web host objects, or ordinary browser profile access.
   // Legal/cookie choices are made only by the teacher in the actual Canva UI.
   string profile=interactive&&!fixture?InteractiveProfilePath(dir):Path.Combine(dir,"profile");
   CoreWebView2EnvironmentOptions options=null;
#if TT_LIVE_PROBE
   // CI-only locale reproduction; never alter an installed teacher's language.
   if(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")=="true"&&Environment.GetEnvironmentVariable("TT_LIVE_LANGUAGE")=="ko-KR")options=new CoreWebView2EnvironmentOptions{Language="ko-KR"};
#endif
   var env=await CoreWebView2Environment.CreateAsync(null,profile,options);
   await web.EnsureCoreWebView2Async(env);var core=web.CoreWebView2;
   core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreHostObjectsAllowed=false;core.Settings.IsWebMessageEnabled=false;
   core.NewWindowRequested+=(s,e)=>e.Handled=true;core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;
   core.DownloadStarting+=(s,e)=>e.Cancel=true;
   core.NavigationStarting+=(s,e)=>{
     if(closed){e.Cancel=true;return;}
     // Allow only this exact Canva share target and redirects within the same design.
     if(!fixture&&!(interactive?AllowedInteractiveNavigation(e.Uri):String.Equals(e.Uri,url,StringComparison.Ordinal))){e.Cancel=true;if(interactive){ready=false;navigationMode="blocked";Publish("Canva 재생 주소 차단");}}
    };
   core.NavigationCompleted+=(s,e)=>{
     if(closed)return;
     ready=e.IsSuccess;seekStart=DateTime.UtcNow;presentAttempts=0;presentRetry=DateTime.MinValue;presentationConfirmed=false;interactiveBookmarkValid=false;stable=0;previous=0;if(interactive&&seekTarget>0){interactiveSeekFocused=false;interactiveSeekExpected=0;interactiveSeekFailed=false;interactiveSeekAt=DateTime.MinValue;interactiveSeekKeys=0;interactiveFastPending=false;interactiveFastDisabled=false;interactiveFastKeys=0;}
     if(interactive){
      if(fixture)navigationMode="fixture";
      else{Uri target; bool direct=Uri.TryCreate(core.Source,UriKind.Absolute,out target)&&AllowedInteractiveNavigation(core.Source)&&(target.Host=="www.canva.com"||target.Host=="canva.com")&&target.AbsolutePath.StartsWith("/design/DAHbOZ_XOJI/",StringComparison.Ordinal);navigationMode=direct?"direct":(navigationMode=="blocked"?"blocked":"not-presentation");ready=ready&&direct;if(!direct)DismissStartupCover();}
     }
     if(ready&&interactive&&!fixture)BeginInvoke(new Action(()=>{if(!closed&&web.CanFocus)web.Focus();}));
     Publish(ready?(interactive?"Canva 클릭형 책 준비됨":"페이지 판독 중"):"책 연결 실패");
    };
    if(fixture)core.NavigateToString("<!doctype html><div role=slider aria-valuemin=1 aria-valuemax="+fixtureTotal+" aria-valuenow=1>fixture</div><button aria-label='Previous page'>back</button><button aria-label='Next page'>next</button><script>let s=document.querySelector('[role=slider]');const step=n=>s.setAttribute('aria-valuenow',Math.max(1,Math.min("+fixtureTotal+",+s.getAttribute('aria-valuenow')+n)));for(let b of document.querySelectorAll('button'))b.onclick=()=>step(b.textContent==='next'?1:-1);document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')step(1);if(e.key==='ArrowLeft')step(-1)});let reveal=0;let surface=document.createElement('div');surface.id='reveal-surface';surface.textContent='click';document.body.append(surface);for(let i=0;i<3;i++){let t=document.createElement('span');t.className='line';t.hidden=true;t.textContent='line '+i;surface.append(t)}surface.onclick=()=>{let lines=surface.querySelectorAll('.line');if(reveal<lines.length)lines[reveal++].hidden=false}</script>");
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

 // Exact official Present button only. CDP dispatches a browser input event
 // without moving the teacher's physical pointer or injecting a click overlay.
 // Never click the public view's generic fullscreen control: it is not proof
 // of interactive sentence animation, and never click consent/login/edit UI.
 const string PresentProbe=@"(()=>{const lab=LAB;if(!lab&&(location.origin!=='https://www.canva.com'||!location.pathname.startsWith('/design/DAHbOZ_XOJI/')||!location.pathname.endsWith('/edit')))return {allowed:false};if(document.fullscreenElement)return {allowed:true,full:true};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};if([...document.querySelectorAll('[role=dialog],[aria-modal=true]')].some(visible))return {allowed:false,dialog:true};const labels=/^(present|present full screen|present fullscreen|전체 화면으로 발표|전체 화면 발표|전체 화면 프레젠테이션|발표|프레젠테이션)$/i;const a=[...document.querySelectorAll('button,[role=button]')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&e.getAttribute('aria-expanded')!=='true'&&[e.getAttribute('aria-label'),e.getAttribute('title'),e.innerText].some(t=>labels.test((t||'').trim()))).map(e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return {e,x,y,hit:!!h&&(e===h||e.contains(h))}}).filter(c=>c.hit);const unique=a.filter(c=>!a.some(d=>d!==c&&c.e.contains(d.e)));if(unique.length!==1)return {allowed:true};return {allowed:true,hit:true,x:unique[0].x,y:unique[0].y}})()";
 static bool Flag(Dictionary<string,object> d,string k){return d!=null&&d.ContainsKey(k)&&d[k] is bool&&(bool)d[k];}
 async Task<bool> PresentInput(bool lab){
  var core=web.CoreWebView2;
  var d=Json.Deserialize<Dictionary<string,object>>(await core.ExecuteScriptAsync(PresentProbe.Replace("LAB",lab?"true":"false")));
  if(Flag(d,"dialog"))DismissStartupCover();
  if(!Flag(d,"allowed")||!Flag(d,"hit")||Flag(d,"full"))return false;
  double x=Convert.ToDouble(d["x"]),y=Convert.ToDouble(d["y"]);
  if(x<0||y<0||x>web.Width*4||y>web.Height*4)return false;
  await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent",Json.Serialize(new{type="mousePressed",x=x,y=y,button="left",buttons=1,clickCount=1}));
  await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent",Json.Serialize(new{type="mouseReleased",x=x,y=y,button="left",buttons=0,clickCount=1}));
  return true;
 }
 async Task TryEnterPresentation(){
  if(fixture||presentationConfirmed||closed||!slotVisible)return;
  var core=web.CoreWebView2;
  if(await core.ExecuteScriptAsync("!!document.fullscreenElement")=="true"){presentationConfirmed=true;return;}
  if(presentAttempts>=2||DateTime.UtcNow<presentRetry)return;
  // Wait for a rendered, hit-tested official control. Blocked or absent
  // controls leave the teacher's native interaction untouched.
  if(await PresentInput(false)){presentAttempts++;presentRetry=DateTime.UtcNow.AddSeconds(4);}
 }
 async Task VerifyPresentInputFixture(){
  var core=web.CoreWebView2;
  await core.ExecuteScriptAsync("(()=>{const b=document.createElement('button');b.setAttribute('aria-label','전체 화면 프레젠테이션');b.textContent='전체 화면 프레젠테이션';b.style.cssText='position:fixed;left:20px;top:100px;width:180px;height:60px';b.onclick=()=>{document.body.dataset.presented='yes';document.documentElement.requestFullscreen().catch(()=>{})};document.body.append(b);return true})()");
  if(!startupCoverActive||!startupCover.Visible)throw new InvalidOperationException("startup cover missing");
  if(startupText.Text!=StartupMessage(false,requested)||!StartupMessage(true,170).StartsWith("170쪽 펼치는 중…\n\n")||!StartupMessage(true,170).EndsWith("조금 오래 걸릴 수 있어요. 잠시만 기다려 주세요."))throw new InvalidOperationException("startup wait notice missing");
  if(!await PresentInput(true))throw new InvalidOperationException("fixture official Present input missing");
  await Task.Delay(300);
  if(await core.ExecuteScriptAsync("document.body.dataset.presented==='yes'")!="true")throw new InvalidOperationException("fixture trusted Present input not delivered");
  if(await core.ExecuteScriptAsync("!!document.fullscreenElement")!="true")throw new InvalidOperationException("fixture browser presentation not entered");
  await VerifyInteractiveBookmarkFixture();
  if(!startupCoverActive)throw new InvalidOperationException("startup cover dismissed before confirmed resume");
  UpdateStartupCover();if(startupCoverActive||startupCover.Visible)throw new InvalidOperationException("startup cover not dismissed after resume");
  immersive=true;exitFull=false;var escape=new KeyEventArgs(Keys.Escape);InteractiveEscape(web,escape);
  if(!escape.Handled||!exitFull||await core.ExecuteScriptAsync("!!document.fullscreenElement")!="true")throw new InvalidOperationException("interactive escape must restore board controls without exiting Canva");
  immersive=false;exitFull=false;
  Console.WriteLine("HOST INTERACTIVE ESCAPE AND WAIT NOTICE FIXTURE PASS");
  Console.WriteLine("HOST STARTUP COVER AND RESUME FIXTURE PASS");
  await core.ExecuteScriptAsync("document.exitFullscreen().catch(()=>{})");
  // A signed-in editor can expose visible text independently of its accessible name,
  // a split dropdown next to it, and a hidden/offscreen duplicate control.
  await core.ExecuteScriptAsync("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='전체 화면 프레젠테이션');b.setAttribute('aria-label','프레젠테이션 시작 메뉴');b.textContent='프레젠테이션';const d=document.createElement('button');d.textContent='▼';d.setAttribute('aria-label','프레젠테이션 옵션');d.style.cssText='position:fixed;left:205px;top:100px;width:45px;height:60px';d.onclick=()=>document.body.dataset.wrong='yes';document.body.append(d);const clone=b.cloneNode(true);clone.style.left='-9999px';document.body.append(clone);delete document.body.dataset.presented;return true})()");
  await Task.Delay(300);
  await core.ExecuteScriptAsync("(()=>{const d=document.createElement('div');d.id='login-test-dialog';d.setAttribute('role','dialog');d.style.cssText='position:fixed;left:300px;top:100px;width:200px;height:100px';d.textContent='로그인';document.body.append(d);return true})()");
  if(await PresentInput(true))throw new InvalidOperationException("dialog must block automatic Present");
  await core.ExecuteScriptAsync("document.getElementById('login-test-dialog').remove()");
  if(!await PresentInput(true))throw new InvalidOperationException("editor split Present input missing");
  await Task.Delay(300);
  if(await core.ExecuteScriptAsync("document.body.dataset.presented==='yes'&&!document.body.dataset.wrong&&!!document.fullscreenElement")!="true")throw new InvalidOperationException("editor primary Present not entered");
  await core.ExecuteScriptAsync("document.exitFullscreen().catch(()=>{})");
  Console.WriteLine("HOST EDITOR SPLIT PRESENT AND DIALOG GUARD FIXTURE PASS");
  Console.WriteLine("HOST OFFICIAL PRESENT INPUT FIXTURE PASS");
 }

 // Read Canva's native page input, not a screenshot or a private component.
 // The exact registered book and range disambiguate the volume/other sliders.
 const string InteractiveSliderPrefix=@"(()=>{const lab=LAB;if(!lab&&(location.origin!=='https://www.canva.com'||!location.pathname.startsWith('/design/DAHbOZ_XOJI/')||!location.pathname.endsWith('/edit')))return FAIL;if(!document.fullscreenElement||[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].some(e=>e.getClientRects().length))return FAIL;const a=[...document.querySelectorAll('input[type=range]')].filter(e=>Number(e.min)===1&&Number(e.max)===TOTAL&&Number(e.step||1)===1&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');if(a.length!==1)return FAIL;const el=a[0],v=Number(el.value);if(!Number.isInteger(v)||v<1||v>TOTAL)return FAIL;";
 string InteractiveScript(string tail,string fail){return InteractiveSliderPrefix.Replace("LAB",fixture?"true":"false").Replace("TOTAL",pages.ToString(System.Globalization.CultureInfo.InvariantCulture)).Replace("FAIL",fail)+tail+"})()";}
 async Task<int> ReadInteractivePage(){
  int p;var raw=await web.CoreWebView2.ExecuteScriptAsync(InteractiveScript("return v;","0"));
  if(!int.TryParse(raw,out p)||p<1||p>pages)return 0;actualPages=pages;return p;
 }
 async Task<bool> FocusInteractiveSlider(bool focus){
  string tail=focus?"if(el.tabIndex<0)return false;el.focus({preventScroll:true});return document.activeElement===el;":"return document.activeElement===el;";
  return await web.CoreWebView2.ExecuteScriptAsync(InteractiveScript(tail,"false"))=="true";
 }
 async Task InteractiveSliderKey(bool next){await InteractiveSliderInput(next?"ArrowRight":"ArrowLeft",next?39:37);}
 async Task InteractiveSliderInput(string key,int vk){
  var core=web.CoreWebView2;
  await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent",Json.Serialize(new{type="keyDown",key,code=key,windowsVirtualKeyCode=vk,nativeVirtualKeyCode=vk}));
  await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent",Json.Serialize(new{type="keyUp",key,code=key,windowsVirtualKeyCode=vk,nativeVirtualKeyCode=vk}));
 }
 async Task ReleaseInteractiveSlider(){
  if(interactiveSeekFocused){try{await web.CoreWebView2.ExecuteScriptAsync(InteractiveScript("if(document.activeElement===el)el.blur();return true;","false"));}catch{}interactiveSeekFocused=false;}
 }
 async Task BeginInteractiveSeek(int target){
  await ReleaseInteractiveSlider();seekTarget=target;interactiveBookmarkValid=false;previous=0;stable=0;interactiveSeekAt=DateTime.MinValue;interactiveSeekExpected=0;interactiveSeekKeys=0;interactiveSeekFailed=false;interactiveFastPending=false;interactiveFastDisabled=false;interactiveFastKeys=0;
 }
 async Task UpdateInteractiveBookmark(){
  int p=await ReadInteractivePage();
  if(closed)return;
  if(p==0){interactiveBookmarkValid=false;detected=0;previous=0;stable=0;Publish("페이지 정보 없음 · 기존 북마크 유지");return;}
  detected=p;if(p==previous)stable++;else{previous=p;stable=1;}
  if(seekTarget<0)seekTarget=requested;
  if(seekTarget>0){
   interactiveBookmarkValid=false;
   if(p==seekTarget){
    if(stable<2){Publish("이어 읽기 위치 확인 중");return;}
    seekTarget=0;interactiveSeekExpected=0;interactiveFastPending=false;await ReleaseInteractiveSlider();if(!fixture&&web.CanFocus)web.Focus();
   }else{
    if(interactiveSeekAt==DateTime.MinValue)interactiveSeekAt=DateTime.UtcNow;
    if((DateTime.UtcNow-interactiveSeekAt).TotalSeconds>90||interactiveSeekKeys>pages+16)interactiveSeekFailed=true;
    // PageUp/PageDown are native range inputs. Observe their actual effect;
    // never assume a jump size or save any intermediate page.
    if(interactiveFastPending){
     if(!await FocusInteractiveSlider(false)){interactiveSeekFailed=true;}
     else if(p==interactiveFastFrom&&(DateTime.UtcNow-waitingSince).TotalSeconds<2){Publish(seekTarget+"쪽 이동 중");return;}
     else if(stable<2)return;
     else if(p==interactiveFastFrom){interactiveFastDisabled=true;}
     else if((seekTarget>interactiveFastFrom&&p>interactiveFastFrom&&p<=seekTarget)||(seekTarget<interactiveFastFrom&&p<interactiveFastFrom&&p>=seekTarget)){}
     else{interactiveSeekFailed=true;}
     interactiveFastPending=false;interactiveSeekExpected=0;
    }
    if(interactiveSeekExpected!=0&&p!=interactiveSeekExpected){
     if((DateTime.UtcNow-waitingSince).TotalSeconds<2){Publish(seekTarget+"쪽 이동 중");return;}
     interactiveSeekFailed=true;
    }
    if(interactiveSeekFailed){await ReleaseInteractiveSlider();Publish("이어 읽기 위치로 직접 이동 · 기존 북마크 유지");return;}
    if(stable<2)return;
    if(!await FocusInteractiveSlider(!interactiveSeekFocused)){interactiveSeekFailed=true;await ReleaseInteractiveSlider();Publish("이어 읽기 위치로 직접 이동 · 기존 북마크 유지");return;}
    interactiveSeekFocused=true;
    // Leave ample distance for a standard range large step (usually 10%).
    // No-effect fallback uses the previously verified arrow-only algorithm.
    if(!interactiveFastDisabled&&Math.Abs(seekTarget-p)>=Math.Max(50,(pages+9)/10+2)){
     interactiveFastPending=true;interactiveFastFrom=p;interactiveFastKeys++;interactiveSeekKeys++;waitingSince=DateTime.UtcNow;previous=0;stable=0;
     await InteractiveSliderInput(p<seekTarget?"PageUp":"PageDown",p<seekTarget?33:34);
     Publish(seekTarget+"쪽 이동 중");return;
    }
    int count=Math.Min(12,Math.Abs(seekTarget-p));bool next=p<seekTarget;int issued=0;
    for(int i=0;i<count;i++){
     if(closed||!await FocusInteractiveSlider(false)){interactiveSeekFailed=true;break;}
     await InteractiveSliderKey(next);issued++;interactiveSeekKeys++;
    }
    interactiveSeekExpected=p+(next?issued:-issued);waitingSince=DateTime.UtcNow;previous=0;stable=0;
    Publish(seekTarget+"쪽 이동 중");return;
   }
  }
  if(stable<2)return;
  if(closed)return;
  saved=p;interactiveBookmarkValid=true;Publish("자동 저장됨");
 }
 async Task VerifyInteractiveBookmarkFixture(){
  var core=web.CoreWebView2;
  await core.ExecuteScriptAsync("(()=>{const r=document.createElement('input');r.type='range';r.min='1';r.max='"+pages+"';r.step='1';r.value='1';r.style.cssText='position:fixed;top:240px;left:20px;width:300px';document.body.append(r);const noise=document.createElement('input');noise.type='range';noise.min='0';noise.max='100';document.body.append(noise);return true})()");
  if(await ReadInteractivePage()!=1)throw new InvalidOperationException("native range read");
  for(int i=0;i<30&&(!interactiveBookmarkValid||saved!=requested);i++){await UpdateInteractiveBookmark();await Task.Delay(120);}
  if(!interactiveBookmarkValid||saved!=requested||detected!=requested)throw new InvalidOperationException("interactive resume failed");
  await core.ExecuteScriptAsync("document.getElementById('reveal-surface').click()");
  await UpdateInteractiveBookmark();await UpdateInteractiveBookmark();if(saved!=requested)throw new InvalidOperationException("animation changed bookmark");
  if(!await FocusInteractiveSlider(true))throw new InvalidOperationException("slider focus");
  await InteractiveSliderKey(true);await Task.Delay(180);await UpdateInteractiveBookmark();await UpdateInteractiveBookmark();
  if(!interactiveBookmarkValid||saved!=requested+1)throw new InvalidOperationException("auto bookmark failed");
  await core.ExecuteScriptAsync("(()=>{const r=document.querySelector('input[type=range][min=\"1\"]');const copy=r.cloneNode();copy.id='ambiguous';document.body.append(copy);return true})()");
  await UpdateInteractiveBookmark();if(interactiveBookmarkValid||saved!=requested+1)throw new InvalidOperationException("ambiguous range overwrote mark");
  await core.ExecuteScriptAsync("document.getElementById('ambiguous').remove()");
  if(!await FocusInteractiveSlider(true))throw new InvalidOperationException("slider refocus");
  await InteractiveSliderKey(false);await Task.Delay(180);await UpdateInteractiveBookmark();await UpdateInteractiveBookmark();
  if(!interactiveBookmarkValid||saved!=requested)throw new InvalidOperationException("backward bookmark failed");
  int jump=requested>1?1:Math.Min(pages,requested+2);
  await BeginInteractiveSeek(jump);if(interactiveBookmarkValid||saved!=requested)throw new InvalidOperationException("manual jump overwrote saved position");
  for(int i=0;i<40&&(!interactiveBookmarkValid||saved!=jump);i++){await UpdateInteractiveBookmark();await Task.Delay(120);}
  if(!interactiveBookmarkValid||saved!=jump||detected!=jump)throw new InvalidOperationException("manual jump failed");
  await BeginInteractiveSeek(requested);
  for(int i=0;i<40&&(!interactiveBookmarkValid||saved!=requested);i++){await UpdateInteractiveBookmark();await Task.Delay(120);}
  if(!interactiveBookmarkValid||saved!=requested)throw new InvalidOperationException("second manual jump failed");
  Console.WriteLine("HOST MANUAL PAGE SEEK AND BOOKMARK FIXTURE PASS");
  Console.WriteLine("HOST INTERACTIVE AUTO BOOKMARK AND RESUME FIXTURE PASS");
 }
 int seekTarget=-1;
 async Task Poll(){
  if(closed||busy)return;
  if(!fixture&&(File.Exists(Path.Combine(dir,"stop"))||DateTime.UtcNow-File.GetLastWriteTimeUtc(Path.Combine(dir,"lease"))>TimeSpan.FromSeconds(35))){Close();return;}
  UpdateStartupCover();
  if(!ready)return;
  busy=true;
  try{
   await Command();
   if(!fixture&&!slotVisible)return;
   if(interactive){
    // Native Canva owns presentation clicks. Only the official page slider is used for startup resume.
    if(!fixture){await TryEnterPresentation();if(presentationConfirmed)await UpdateInteractiveBookmark();else{interactiveBookmarkValid=false;Publish("Canva 발표 모드 준비 중 · 필요하면 공식 발표 버튼을 눌러 주세요");}UpdateStartupCover();return;}
    if(fixture){
     // Verify pointer and keyboard events on a real top-level WebView2 fixture.
     if(await web.CoreWebView2.ExecuteScriptAsync("(()=>!document.querySelector('iframe')&&document.querySelectorAll('button').length===2)()")!="true")throw new InvalidOperationException("interactive fixture must have no iframe");
     if(!AllowedInteractiveNavigation(AlmondShareUrl)||AllowedInteractiveNavigation("https://www.canva.com/design/DAHbOZ_XOJI/test/view?embed")||AllowedInteractiveNavigation("https://www.canva.com/design/other/test/view"))throw new InvalidOperationException("interactive share URL guard");
     if(await web.CoreWebView2.ExecuteScriptAsync("document.querySelectorAll('.line:not([hidden])').length")!="0")throw new InvalidOperationException("fixture starts revealed");
     for(int i=1;i<=3;i++){await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('reveal-surface').click()");if(await web.CoreWebView2.ExecuteScriptAsync("document.querySelectorAll('.line:not([hidden])').length")!=i.ToString()||await Read()!=1)throw new InvalidOperationException("fixture click reveal step");}
     await web.CoreWebView2.ExecuteScriptAsync("document.querySelectorAll('button')[1].click()");
     if(await Read()!=2)throw new InvalidOperationException("interactive fixture click failed");
     await web.CoreWebView2.ExecuteScriptAsync("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
     if(await Read()!=3)throw new InvalidOperationException("interactive fixture right arrow failed");
     await web.CoreWebView2.ExecuteScriptAsync("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
     if(await Read()!=2)throw new InvalidOperationException("interactive fixture left arrow failed");
     await VerifyPresentInputFixture();
     Console.WriteLine("HOST INTERACTIVE TOP-LEVEL INPUT FIXTURE PASS");Close();
    }
    return;
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
#if TT_LIVE_PROBE
  if(args.Length==2&&args[0]=="--live-probe")return RunLiveProbe(args[1]);
#endif
  try{
   if(args.Length!=2||args[0]!="--session"&&args[0]!="--self-test")return 2;
   bool lab=args[0]=="--self-test";string dir=Path.GetFullPath(args[1]);
   var d=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(dir,"request.json"),Encoding.UTF8));
   using(var f=new BookReader(dir,d,lab)){if(lab){var watchdog=new Timer{Interval=25000};watchdog.Tick+=(s,e)=>{watchdog.Stop();f.Close();};watchdog.Start();Application.Run(f);watchdog.Dispose();return f.saved==f.requested&&f.detected==f.requested?0:1;}f.ShowForBoard();Application.Run(f);}
   return 0;
  }catch(Exception ex){Console.Error.WriteLine(ex.GetType().Name);return 1;}
 }
}
