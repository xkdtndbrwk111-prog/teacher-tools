using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Phase 3A research launcher. This executable accepts only the CI isolation root.
// The existing server remains a separate process. No production profile or updater access.
internal sealed class NativeBoardLaunch : Form {
    const string Origin="http://127.0.0.1:17449";
    const string Release="2026-11-25-V1.66.43-STABLE-PILOT";
    readonly string root,runtime,mode,modeFile,stopFile,resultFile;
    readonly WebView2 browser=new WebView2();
    readonly Timer heartbeat=new Timer();
    bool published,closing; int exitCode=1; long ownedWindow;
    Rectangle lastBounds;
    [DllImport("user32.dll",SetLastError=true)] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
    [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr h,int index);
    [DllImport("user32.dll",EntryPoint="SetWindowLongW")] static extern int SetWindowLong(IntPtr h,int index,int value);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    NativeBoardLaunch(string root,string runtime,string mode){
        this.root=root;this.runtime=runtime;this.mode=mode;
        modeFile=Path.Combine(runtime,"board-mode.json");
        stopFile=Path.Combine(root,"native-launch.stop");
        resultFile=Path.Combine(root,"native-launch.result");
        Text="HOJA native launcher lab";
        StartPosition=FormStartPosition.Manual;
        Screen screen=TargetScreen();
        Bounds=mode=="wallpaper"?screen.Bounds:new Rectangle(screen.WorkingArea.X+40,screen.WorkingArea.Y+40,Math.Min(1000,screen.WorkingArea.Width-80),Math.Min(700,screen.WorkingArea.Height-80));
        if(mode=="wallpaper"){FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;}
        browser.Dock=DockStyle.Fill;Controls.Add(browser);
        Shown+=async(s,e)=>{try{await StartBoard();}catch(Exception ex){Finish(1,"FAIL "+ex.Message);}};
        FormClosed+=(s,e)=>{heartbeat.Stop();RemoveOwnedMode();};
        heartbeat.Interval=1000;heartbeat.Tick+=(s,e)=>{try{
            if(File.Exists(stopFile)){Finish(0,"PASS native close "+mode);return;}
            if(mode=="wallpaper"&&!IsIconic(Handle)){
                Rectangle next=TargetScreen().Bounds;
                if(next!=lastBounds){if(!SetWindowPos(Handle,IntPtr.Zero,next.X,next.Y,next.Width,next.Height,0x0014))throw new IOException("display resize");lastBounds=next;}
            }
            Publish();
        }catch(Exception ex){Finish(1,"FAIL heartbeat "+ex.Message);}};
    }
    Screen TargetScreen(){
        string path=Path.Combine(runtime,"display.txt");
        string device=File.Exists(path)?File.ReadAllText(path).Trim():"";
        foreach(Screen s in Screen.AllScreens)if(s.DeviceName==device)return s;
        return Screen.PrimaryScreen;
    }
    static void Require(bool ok,string msg){if(!ok)throw new InvalidOperationException(msg);}
    static string Health(){
        var req=(HttpWebRequest)WebRequest.Create(Origin+"/health");
        req.Proxy=null;req.AllowAutoRedirect=false;req.Timeout=2000;req.ReadWriteTimeout=2000;
        using(var res=(HttpWebResponse)req.GetResponse())
        using(var reader=new StreamReader(res.GetResponseStream()))return reader.ReadToEnd();
    }
    async Task StartBoard(){
        string health=await Task.Run(()=>Health());
        var json=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(health);
        Require(json.ContainsKey("service")&&(string)json["service"]=="teacher-tools-local"&&json.ContainsKey("release")&&(string)json["release"]==Release,"isolated health mismatch");
        var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(root,"native-profile"));
        await browser.EnsureCoreWebView2Async(env);
        var core=browser.CoreWebView2;
        core.Settings.AreHostObjectsAllowed=false;core.Settings.IsWebMessageEnabled=false;
        core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;
        core.NavigationStarting+=(s,e)=>{if(!Lab.Local(e.Uri))e.Cancel=true;};
        core.FrameNavigationStarting+=(s,e)=>{if(!Lab.Local(e.Uri)&&e.Uri!="about:blank")e.Cancel=true;};
        core.NewWindowRequested+=(s,e)=>{e.Handled=true;};
        core.PermissionRequested+=(s,e)=>{e.State=CoreWebView2PermissionState.Deny;};
        core.DownloadStarting+=(s,e)=>{e.Cancel=true;};
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=(s,e)=>{if(!Lab.Allowed(e.Request.Uri,e.Request.Method))e.Response=env.CreateWebResourceResponse(new MemoryStream(),403,"Lab blocked","Content-Type: text/plain");};
        core.ProcessFailed+=(s,e)=>Finish(1,"FAIL renderer "+e.ProcessFailedKind);
        if(mode=="wallpaper"){
            var screen=TargetScreen();var area=screen.Bounds;var work=screen.WorkingArea;
            int ex=GetWindowLong(Handle,-20);
            SetWindowLong(Handle,-20,(ex|0x00000080)&~0x00040000);
            Require(SetWindowPos(Handle,new IntPtr(1),area.X,area.Y,area.Width,area.Height,0x0070),"wallpaper position");
            lastBounds=area;
        }
        string url=Origin+"/";
        if(mode=="wallpaper"){var s=TargetScreen();var a=s.Bounds;var w=s.WorkingArea;url+="?inset="+(w.X-a.X)+","+(w.Y-a.Y)+","+(a.Right-w.Right)+","+(a.Bottom-w.Bottom);}
        var loaded=new TaskCompletionSource<bool>();
        core.NavigationCompleted+=(s,e)=>loaded.TrySetResult(e.IsSuccess);
        core.Navigate(url);
        Require(await Task.WhenAny(loaded.Task,Task.Delay(15000))==loaded.Task&&await loaded.Task,"dashboard navigation");
        Require(await core.ExecuteScriptAsync("!!document.getElementById('openMiniGames')&&document.documentElement.outerHTML.includes('1.66.43')")=="true","real dashboard identity");
        if(mode=="wallpaper")Require(FormBorderStyle==FormBorderStyle.None&&Bounds==TargetScreen().Bounds&&!ShowInTaskbar,"wallpaper geometry/frame");
        else Require(FormBorderStyle==FormBorderStyle.Sizable&&ShowInTaskbar,"windowed geometry/frame");
        Publish();heartbeat.Start();
        File.WriteAllText(Path.Combine(root,"native-launch.ready"),mode+" "+Process.GetCurrentProcess().Id+" "+Handle.ToInt64());
    }
    string ModeJson(){return "{\"mode\":\""+mode+"\",\"window\":"+Handle.ToInt64()+",\"pid\":"+Process.GetCurrentProcess().Id+",\"release\":\""+Release+"\"}";}
    void Publish(){
        ownedWindow=Handle.ToInt64();
        string tmp=modeFile+".native-tmp";
        File.WriteAllText(tmp,ModeJson(),new UTF8Encoding(false));
        if(File.Exists(modeFile))File.Replace(tmp,modeFile,null);else File.Move(tmp,modeFile);
        published=true;
    }
    void RemoveOwnedMode(){
        if(!published)return;
        try{
            if(File.Exists(modeFile)){
                var json=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(modeFile));
                if(Convert.ToInt64(json["window"])==ownedWindow&&Convert.ToInt32(json["pid"])==Process.GetCurrentProcess().Id)File.Delete(modeFile);
            }
        }catch{}
    }
    void Finish(int code,string message){if(closing)return;closing=true;exitCode=code;heartbeat.Stop();RemoveOwnedMode();File.WriteAllText(resultFile,message);Close();}
    [STAThread] static int Main(string[] args){
        if(args.Length!=2||args[0]!="--lab-launch"||(args[1]!="window"&&args[1]!="wallpaper"))return 2;
        string root=Environment.GetEnvironmentVariable("HOJA_LAB_ROOT"),local=Environment.GetEnvironmentVariable("LOCALAPPDATA");
        if(String.IsNullOrEmpty(root)||String.IsNullOrEmpty(local))return 2;
        root=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
        if(!String.Equals(Path.GetFullPath(local),Path.Combine(root,"local"),StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(root).StartsWith("hoja-webview-lab-",StringComparison.Ordinal))return 2;
        string runtime=Path.Combine(local,"TeacherToolsLocal");
        if(!File.Exists(Path.Combine(runtime,"dashboard.html")))return 2;
        FileStream guard;
        try{guard=new FileStream(Path.Combine(runtime,"native-launch.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);}catch(IOException){return 3;}
        using(guard){
            if(File.Exists(Path.Combine(runtime,"board-mode.json")))return 4;
            Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
            using(var form=new NativeBoardLaunch(root,runtime,args[1])){Application.Run(form);return form.exitCode;}
        }
    }
}
