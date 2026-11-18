using System;
using System.IO;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Probe {
 static int code=1;
 [STAThread] static int Main(string[] args) {
  Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
  using(var form=new Form()) using(var view=new WebView2()) {
   form.Text="HOJA book isolated WebView2 lab";
   form.ClientSize=new Size(960,540); view.Dock=DockStyle.Fill; form.Controls.Add(view);
   form.Shown+=async (s,e)=>{string profile=Path.Combine(Path.GetTempPath(),"tt-book-lab-"+Guid.NewGuid().ToString("N"));
    try {
     Console.WriteLine("RUNTIME "+CoreWebView2Environment.GetAvailableBrowserVersionString());
     var env=await CoreWebView2Environment.CreateAsync(null,profile);
     await view.EnsureCoreWebView2Async(env); var core=view.CoreWebView2;
     core.Settings.AreDevToolsEnabled=false; core.Settings.AreDefaultContextMenusEnabled=false;
     core.Settings.AreHostObjectsAllowed=false; core.Settings.IsWebMessageEnabled=false;
     core.NewWindowRequested+=(a,b)=>b.Handled=true;
     core.PermissionRequested+=(a,b)=>b.State=CoreWebView2PermissionState.Deny;
     const string fixture="<!doctype html><style>html,body{margin:0;background:#798baa}#strip{position:fixed;bottom:0;left:0;right:0;height:1.11vh;display:flex}i{flex:1}</style><div id=strip></div><script>function draw(p){let c=0;for(let b of [p>>8,p&255]){c^=b;for(let j=0;j<8;j++)c=((c<<1)^((c&128)?7:0))&255}let bits='10110010'+p.toString(2).padStart(12,'0')+c.toString(2).padStart(8,'0')+'0101';strip.replaceChildren(...Array.from(bits,b=>{let e=document.createElement('i');e.style.background=b==='1'?'white':'black';return e}))}draw(1)</script>";
     await Navigate(core,()=>core.NavigateToString(fixture));
     foreach(int p in new[]{1,2,5,2}){
      await core.ExecuteScriptAsync("draw("+p+")");
      await Task.Delay(350);
      int actual=await ReadMarker(core);
      if(actual!=p)throw new InvalidOperationException("fixture marker expected="+p+" actual="+actual);
      Console.WriteLine("FIXTURE marker="+actual);
     }
     Console.WriteLine("FIXTURE PASS: native preview, no screen-sharing permission, 1/2/5/2");
     if(Array.IndexOf(args,"--live")>=0){
      const string url="https://www.canva.com/design/DAHbOpoUrrg/d0A5Phk1p8VRXhaj5raOWg/view?embed";
      try{
       core.NavigationStarting+=(a,b)=>{Uri u;if(!Uri.TryCreate(b.Uri,UriKind.Absolute,out u)||u.Scheme!="https"||u.Host!="www.canva.com")b.Cancel=true;};
       await Navigate(core,()=>core.Navigate(url)); await Task.Delay(7000);
       Console.WriteLine("LIVE initial marker="+await ReadMarker(core));
       const string scan="(()=>{if(location.origin!=='https://www.canva.com')return null;return {ready:document.readyState,buttons:document.querySelectorAll('button,[role=button]').length,frames:document.querySelectorAll('iframe').length,pageHints:Array.from(document.querySelectorAll('[aria-current],[aria-valuenow],[data-page-index],[data-page-number]')).slice(0,40).map(e=>({current:e.getAttribute('aria-current'),number:['aria-valuenow','data-page-index','data-page-number'].map(k=>e.getAttribute(k)).filter(v=>v!==null&&/^\\d{1,4}$/.test(v))})),navigation:Array.from(document.querySelectorAll('button,[role=button]')).map(e=>e.getAttribute('aria-label')||'').filter(t=>/^(next|previous)( page| slide)?$/i.test(t)).slice(0,8)}})()";
       Console.WriteLine("LIVE DOM "+await core.ExecuteScriptAsync(scan));
       Console.WriteLine("LIVE diagnostic only: verify visible navigation on school PC before integration.");
      }catch(Exception ex){Console.WriteLine("LIVE INCONCLUSIVE "+ex.GetType().Name);}
     }
     code=0;
    }catch(Exception ex){Console.WriteLine("PROBE FAIL "+ex.GetType().Name+" "+ex.Message);}
    finally{form.Close();}
   };
   Application.Run(form);
  }
  return code;
 }
 static async Task Navigate(CoreWebView2 core,Action start){
  var done=new TaskCompletionSource<bool>();
  EventHandler<CoreWebView2NavigationCompletedEventArgs> handler=(s,e)=>done.TrySetResult(e.IsSuccess);
  core.NavigationCompleted+=handler;
  try{start();if(await Task.WhenAny(done.Task,Task.Delay(25000))!=done.Task||!await done.Task)throw new InvalidOperationException("navigation failed or timed out");}
  finally{core.NavigationCompleted-=handler;}
 }
 static int CRC(int p){int c=0;foreach(int b in new[]{p>>8,p&255}){c^=b;for(int j=0;j<8;j++)c=((c<<1)^((c&128)!=0?7:0))&255;}return c;}
 static async Task<int> ReadMarker(CoreWebView2 core){
  using(var m=new MemoryStream()){
   await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,m);
   m.Position=0;
   using(var bmp=new Bitmap(m)){
    var found=new System.Collections.Generic.HashSet<int>();
    int w=bmp.Width,h=bmp.Height;
    for(int y=Math.Max(0,h-(int)Math.Ceiling(h*0.0112)-3);y<h;y++){
     string bits="";
     for(int i=0;i<32;i++){
      var values=new int[5];for(int j=0;j<5;j++){var px=bmp.GetPixel(Math.Min(w-1,(int)((i+0.3+j*0.1)*w/32)),y);values[j]=(px.R*54+px.G*183+px.B*19)/256;}
      Array.Sort(values);bits+=values[2]<=65?"0":values[2]>=190?"1":"?";
     }
     if(bits.IndexOf('?')>=0||!bits.StartsWith("10110010")||!bits.EndsWith("0101"))continue;
     int p=Convert.ToInt32(bits.Substring(8,12),2);
     if(p>=1&&p<=4095&&CRC(p)==Convert.ToInt32(bits.Substring(20,8),2))found.Add(p);
    }
    if(found.Count==1)foreach(int p in found)return p;
    return -1;
   }
  }
 }
}
