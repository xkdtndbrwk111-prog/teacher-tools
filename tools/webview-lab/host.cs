using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Phase 1 research only. No production directory, updater, host objects or native bridge.
internal sealed class Lab : Form {
    const string Origin = "http://127.0.0.1:17449";
    readonly WebView2 view = new WebView2();
    readonly string profile, result;
    readonly Timer watchdog = new Timer();
    Rectangle previous;
    bool immersive, finished;
    int exitCode = 1;
    internal int ExitCode { get { return exitCode; } }
    internal Lab(string profile, string result) {
        this.profile=profile; this.result=result;
        Text="HOJA WebView2 Lab - isolated test"; StartPosition=FormStartPosition.CenterScreen;
        ClientSize=new Size(1280,720); MinimumSize=new Size(800,480);
        view.Dock=DockStyle.Fill; Controls.Add(view);
        watchdog.Interval=90000; watchdog.Tick+=(s,e)=>Fail("timeout");
        Shown+=async (s,e)=>{watchdog.Start();try{await Run();}catch(Exception ex){Fail(ex.GetType().Name+": "+ex.Message);}};
        KeyPreview=true;
        KeyDown+=(s,e)=>{if(e.KeyCode==Keys.F11){SetImmersive(!immersive);e.SuppressKeyPress=true;}else if(e.KeyCode==Keys.Escape && immersive){SetImmersive(false);e.SuppressKeyPress=true;}};
    }
    static bool Local(string raw) {
        Uri u;
        return Uri.TryCreate(raw,UriKind.Absolute,out u) && u.Scheme=="http" && u.Host=="127.0.0.1" && u.Port==17449 && String.IsNullOrEmpty(u.UserInfo);
    }
    static bool Allowed(string raw,string method) {
        if(!Local(raw))return false;
        var p=new Uri(raw).AbsolutePath;
        if(method=="POST")return p=="/api/coins" || p=="/api/seating";
        if(method!="GET" && method!="HEAD")return false;
        if(p.StartsWith("/api/",StringComparison.Ordinal))return p=="/api/coins"||p=="/api/seating"||p=="/api/board-status"||p=="/api/theme";
        return p=="/"||p=="/index.html"||p=="/health"||
            p.EndsWith(".js",StringComparison.OrdinalIgnoreCase)||p.EndsWith(".css",StringComparison.OrdinalIgnoreCase)||
            p.EndsWith(".png",StringComparison.OrdinalIgnoreCase)||p.EndsWith(".webp",StringComparison.OrdinalIgnoreCase)||p.EndsWith(".ico",StringComparison.OrdinalIgnoreCase);
    }
    void SetImmersive(bool on) {
        if(on==immersive)return;
        if(on){previous=Bounds;FormBorderStyle=FormBorderStyle.None;Bounds=Screen.FromControl(this).Bounds;}
        else{FormBorderStyle=FormBorderStyle.Sizable;Bounds=previous;}
        immersive=on;
    }
    static void Require(bool ok,string what){if(!ok)throw new InvalidOperationException(what);}
    async Task LoadBoard() {
        var t=new TaskCompletionSource<bool>();
        EventHandler<CoreWebView2NavigationCompletedEventArgs> handler=(s,e)=>t.TrySetResult(e.IsSuccess);
        view.CoreWebView2.NavigationCompleted+=handler;
        try{view.CoreWebView2.Navigate(Origin+"/");Require(await t.Task,"dashboard navigation");}
        finally{view.CoreWebView2.NavigationCompleted-=handler;}
    }
    async Task Run() {
        Require(!Local("http://127.0.0.1:17439/")&&!Allowed(Origin+"/api/update/apply","POST")&&!Allowed("https://example.com","GET"),"isolation rules");
        var env=await CoreWebView2Environment.CreateAsync(null,profile);
        await view.EnsureCoreWebView2Async(env);
        var core=view.CoreWebView2;
        core.Settings.AreDevToolsEnabled=false;
        core.Settings.AreDefaultContextMenusEnabled=false;
        core.Settings.IsWebMessageEnabled=false;
        core.Settings.AreHostObjectsAllowed=false;
        core.NavigationStarting+=(s,e)=>{if(!Local(e.Uri))e.Cancel=true;};
        core.NewWindowRequested+=(s,e)=>{e.Handled=true;};
        core.PermissionRequested+=(s,e)=>{e.State=CoreWebView2PermissionState.Deny;};
        core.DownloadStarting+=(s,e)=>{e.Cancel=true;};
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=(s,e)=>{
            if(!Allowed(e.Request.Uri,e.Request.Method))
                e.Response=env.CreateWebResourceResponse(new MemoryStream(),403,"Lab blocked","Content-Type: text/plain");
        };
        core.ProcessFailed+=(s,e)=>Fail("renderer failure: "+e.ProcessFailedKind);
        await LoadBoard();
        Require(await core.ExecuteScriptAsync("document.body.innerText.includes('1.66.43') || document.documentElement.outerHTML.includes('1.66.43')")=="true","exact dashboard version");
        // ExecuteScriptAsync does not await a Promise: publish an asynchronous result to DOM state.
        await core.ExecuteScriptAsync("(async()=>{try{let r=await fetch('/api/coins');let t=await r.text();let s=await fetch('/api/seating');document.documentElement.dataset.hojaLab=(r.ok&&r.headers.has('X-TT-Coin-Revision')&&t.includes('LAB_SENTINEL')&&s.ok&&(await s.text()).includes('LAB_STUDENT'))?'ok':'bad'}catch(e){document.documentElement.dataset.hojaLab='error'}})();");
        string status="";
        for(int i=0;i<100;i++){status=await core.ExecuteScriptAsync("document.documentElement.dataset.hojaLab || ''");if(status!="\"\"")break;await Task.Delay(200);}
        Require(status=="\"ok\"","real coin and seating API reads");
        Require(await core.ExecuteScriptAsync("localStorage.setItem('hoja-webview-lab','persist');localStorage.getItem('hoja-webview-lab')")=="\"persist\"","storage write");
        await LoadBoard();
        Require(await core.ExecuteScriptAsync("localStorage.getItem('hoja-webview-lab')")=="\"persist\"","storage reload");
        Rectangle old=Bounds;SetImmersive(true);Require(FormBorderStyle==FormBorderStyle.None&&Bounds==Screen.FromControl(this).Bounds,"native fullscreen");
        SetImmersive(false);Require(FormBorderStyle==FormBorderStyle.Sizable&&Bounds==old,"native restore");
        core.Navigate("http://127.0.0.1:17439/");
        await Task.Delay(500);
        Require(Local(core.Source),"production origin rejected");
        Finish(0,"PASS: actual 1.66.43 dashboard, coin and seating API, isolated storage reload, native fullscreen and restore, production-origin block");
    }
    void Fail(string why){Finish(1,"FAIL: "+why);}
    void Finish(int code,string message){
        if(finished)return;finished=true;exitCode=code;watchdog.Stop();
        File.WriteAllText(result,message);Close();
    }
    [STAThread] static int Main(string[] args){
        if(args.Length!=3||args[0]!="--self-test")return 2;
        // Only the isolated CI harness is supported in this milestone.
        string root=Environment.GetEnvironmentVariable("HOJA_LAB_ROOT");
        if(String.IsNullOrEmpty(root))return 2;
        root=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
        string p=Path.GetFullPath(args[1]),r=Path.GetFullPath(args[2]);
        if(!p.StartsWith(root,StringComparison.OrdinalIgnoreCase)||!r.StartsWith(root,StringComparison.OrdinalIgnoreCase))return 2;
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        using(var form=new Lab(p,r)){Application.Run(form);return form.ExitCode;}
    }
}
