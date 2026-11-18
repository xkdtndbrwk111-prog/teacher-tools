using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
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
 const string PageScript="(()=>{if(location.origin!=='https://www.canva.com')return null;const a=[...document.querySelectorAll('[role=slider][aria-valuenow][aria-valuemin][aria-valuemax]')].filter(e=>e.getClientRects().length>0&&e.getAttribute('aria-valuemin')==='1');if(a.length!==1)return null;return {page:Number(a[0].getAttribute('aria-valuenow')),total:Number(a[0].getAttribute('aria-valuemax'))}})()";
 readonly WebView2 web=new WebView2();
 readonly Label caption=new Label();
 readonly NumericUpDown manual=new NumericUpDown();
 readonly Timer timer=new Timer();
 readonly string dir, url, title;
 readonly int pages, requested, initialMark;
 readonly Rectangle screenArea, workingArea;
 int saved,detected,previous,stable,waitingFor,steps,manualMode;
 bool ready,busy,closed,fullscreen=false,fixture;
 DateTime seekStart=DateTime.UtcNow,waitingSince=DateTime.UtcNow;
 string lastState="";
 Button auto,full,mute;
 static int Int(Dictionary<string,object> d,string k){object v;return d.TryGetValue(k,out v)?Convert.ToInt32(v):0;}
 static string Str(Dictionary<string,object> d,string k){object v;return d.TryGetValue(k,out v)?Convert.ToString(v):"";}
 static bool ValidUrl(string u){return u!=null&&u.Length<=500&&UrlPattern.IsMatch(u);}
 static Rectangle Rect(Dictionary<string,object> a,string prefix,Rectangle fallback){try{var r=new Rectangle(Int(a,prefix+"X"),Int(a,prefix+"Y"),Int(a,prefix+"W"),Int(a,prefix+"H"));return r.Width>=400&&r.Height>=300&&r.Width<=16384&&r.Height<=16384?r:fallback;}catch{return fallback;}}
 BookReader(string folder,Dictionary<string,object> config,bool lab){
  dir=folder;fixture=lab;url=Str(config,"url");title=Str(config,"title");pages=Int(config,"pages");requested=Int(config,"start");initialMark=Int(config,"saved");saved=initialMark;
  if(!fixture&&!ValidUrl(url)||pages<1||pages>4095||requested<1||requested>pages||initialMark<0||initialMark>pages||title.Length>80)throw new ArgumentException("invalid book request");
  screenArea=Rect(config,"screen",Screen.PrimaryScreen.Bounds);workingArea=Rect(config,"work",Screen.PrimaryScreen.WorkingArea);
  Text=title+" · 호자보드";StartPosition=FormStartPosition.Manual;FormBorderStyle=FormBorderStyle.None;Bounds=workingArea;BackColor=Color.FromArgb(22,23,25);KeyPreview=true;
  var foot=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=58,WrapContents=false,FlowDirection=FlowDirection.LeftToRight,Padding=new Padding(6),BackColor=Color.FromArgb(35,36,39),AutoScroll=true};
  caption.AutoSize=false;caption.Width=320;caption.Height=42;caption.ForeColor=Color.White;caption.TextAlign=ContentAlignment.MiddleLeft;caption.Font=new Font("맑은 고딕",11,FontStyle.Bold);
  manual.Minimum=1;manual.Maximum=pages;manual.Value=requested;manual.Width=66;manual.Height=42;manual.Font=new Font("맑은 고딕",13);manual.Enabled=true;
  var save=Btn("쪽 저장",()=>{if(!ready)return;manualMode=1;waitingFor=0;seekTarget=0;saved=(int)manual.Value;auto.Text="자동 저장 켜기";Publish("수동 저장됨");});
  auto=Btn("자동 저장 중지",()=>{manualMode=manualMode==0?1:0;waitingFor=0;seekTarget=0;stable=0;previous=0;auto.Text=manualMode==0?"자동 저장 중지":"자동 저장 켜기";Publish(manualMode==0?"자동 판독 중":"수동 모드");});
  full=Btn("전체화면",()=>{fullscreen=!fullscreen;Bounds=fullscreen?screenArea:workingArea;full.Text=fullscreen?"전체화면 해제":"전체화면";});
  mute=Btn("소리 끄기",()=>{if(web.CoreWebView2!=null){web.CoreWebView2.IsMuted=!web.CoreWebView2.IsMuted;mute.Text=web.CoreWebView2.IsMuted?"소리 켜기":"소리 끄기";}});
  foot.Controls.Add(caption);foot.Controls.Add(manual);foot.Controls.Add(save);foot.Controls.Add(auto);foot.Controls.Add(mute);foot.Controls.Add(full);foot.Controls.Add(Btn("책 목록 ✕",Close));
  Controls.Add(web);Controls.Add(foot);web.Dock=DockStyle.Fill;
  KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Escape){Close();e.Handled=true;}};
  timer.Interval=350;timer.Tick+=async(s,e)=>await Poll();
  Shown+=async(s,e)=>await Initialize();
  FormClosing+=(s,e)=>{closed=true;timer.Stop();Publish("종료");};
 }
 static Button Btn(string text,Action click){var b=new Button{Text=text,AutoSize=true,Height=42,FlatStyle=FlatStyle.Flat,ForeColor=Color.White,BackColor=Color.FromArgb(65,69,75),Font=new Font("맑은 고딕",11,FontStyle.Bold),Margin=new Padding(3)};b.Click+=(s,e)=>click();return b;}
 string State(string status){return Json.Serialize(new{page=detected,saved=saved,status=status,closed=closed,ready=ready});}
 void Publish(string status){
  caption.Text=title+"  "+(detected>0?detected.ToString():"–")+"/"+pages+"쪽"+(saved>0?" · "+saved+"쪽 저장":"")+"  "+status;
  string data=State(status);if(data==lastState)return;lastState=data;
  try{string p=Path.Combine(dir,"state.json"),tmp=p+".tmp";File.WriteAllText(tmp,data,Utf8);if(File.Exists(p))File.Replace(tmp,p,null);else File.Move(tmp,p);}catch{}
 }
 async Task Initialize(){
  Publish("불러오는 중");try{
   // Shared runtime, fresh book-only profile. No screen capture or web host objects.
   var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dir,"profile"));
   await web.EnsureCoreWebView2Async(env);var core=web.CoreWebView2;
   core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreHostObjectsAllowed=false;core.Settings.IsWebMessageEnabled=false;
   core.NewWindowRequested+=(s,e)=>e.Handled=true;core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;
   core.DownloadStarting+=(s,e)=>e.Cancel=true;
   core.NavigationStarting+=(s,e)=>{if(!fixture&&!String.Equals(e.Uri,url,StringComparison.Ordinal))e.Cancel=true;};
   core.NavigationCompleted+=(s,e)=>{ready=e.IsSuccess;seekStart=DateTime.UtcNow;Publish(ready?"페이지 판독 중":"책 연결 실패");};
   if(fixture)core.NavigateToString("<!doctype html><div role=slider aria-valuemin=1 aria-valuemax=5 aria-valuenow=1>fixture</div><button aria-label='Previous page'>back</button><button aria-label='Next page'>next</button><script>let s=document.querySelector('[role=slider]');for(let b of document.querySelectorAll('button'))b.onclick=()=>s.setAttribute('aria-valuenow',Math.max(1,Math.min(5,+s.getAttribute('aria-valuenow')+(b.textContent==='next'?1:-1))))</script>");
   else core.Navigate(url);
   timer.Start();
  }catch{Publish("WebView2 시작 실패");MessageBox.Show("책 재생기를 실행하지 못했습니다. 기존 재생기를 사용해 주세요.","호자보드");Close();}
 }
 async Task<int> Read(){
  string script=fixture?PageScript.Replace("if(location.origin!=='https://www.canva.com')return null;",""):PageScript;
  string raw=await web.CoreWebView2.ExecuteScriptAsync(script);
  if(raw=="null")return 0;
  var d=Json.Deserialize<Dictionary<string,object>>(raw);int p=Int(d,"page"),n=Int(d,"total");return n==pages&&p>=1&&p<=pages?p:0;
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
   if(seekTarget<0)seekTarget=requested;
   int p=await Read();if(p==0){stable=0;previous=0;Publish("페이지 정보 없음 · 수동 저장 가능");return;}
   if(p==previous)stable++;else{previous=p;stable=1;}
   if(stable<2)return;
   detected=p;if(manualMode==0)manual.Value=p;
   if(manualMode!=0){Publish("수동 모드");return;}
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
   if(fixture&&saved==requested){Console.WriteLine("HOST FIXTURE PASS "+saved);Close();}
  }catch{Publish("페이지 판독 실패 · 수동 저장 가능");}finally{busy=false;}
 }
 [STAThread] static int Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  try{
   if(args.Length!=2||args[0]!="--session"&&args[0]!="--self-test")return 2;
   bool lab=args[0]=="--self-test";string dir=Path.GetFullPath(args[1]);
   var d=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(dir,"request.json"),Encoding.UTF8));
   using(var f=new BookReader(dir,d,lab)){if(lab){var watchdog=new Timer{Interval=25000};watchdog.Tick+=(s,e)=>{watchdog.Stop();f.Close();};watchdog.Start();Application.Run(f);watchdog.Dispose();return f.saved==f.requested&&f.detected==f.requested?0:1;}Application.Run(f);}
   return 0;
  }catch(Exception ex){Console.Error.WriteLine(ex.GetType().Name);return 1;}
 }
}
