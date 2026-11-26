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
    string fixture, realGame;
    bool useRealGame;
    CoreWebView2Frame gameFrame;
    readonly System.Collections.Generic.List<CoreWebView2Frame> liveFrames=new System.Collections.Generic.List<CoreWebView2Frame>();
    void Trace(string message){File.AppendAllText(Path.Combine(Environment.GetEnvironmentVariable("HOJA_LAB_ROOT"),"real-game.trace"),DateTime.UtcNow.ToString("o")+" "+message+Environment.NewLine);}
    readonly Timer watchdog = new Timer();
    readonly Timer heartbeat = new Timer();
    string modeFile;
    Rectangle previous;
    bool immersive, finished;
    int exitCode = 1;
    internal int ExitCode { get { return exitCode; } }
    internal Lab(string profile, string result) {
        this.profile=profile; this.result=result;
        fixture=File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"mini-fixture.html"));
        realGame=File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"real-mini.html"));
        string original="const DASHBOARD_ORIGIN='http://127.0.0.1:17439';";
        Require(realGame.IndexOf(original,StringComparison.Ordinal)>=0&&realGame.IndexOf(original,StringComparison.Ordinal)==realGame.LastIndexOf(original,StringComparison.Ordinal),"exact real game origin anchor");
        realGame=realGame.Replace(original,"const DASHBOARD_ORIGIN='http://127.0.0.1:17449';");
        // Actual game state is lexical inside one IIFE. Read-only observation, no game/coin state writes.
        string start="<script>(() => {";
        Require(realGame.IndexOf(start,StringComparison.Ordinal)>=0&&realGame.IndexOf(start,StringComparison.Ordinal)==realGame.LastIndexOf(start,StringComparison.Ordinal),"real main script anchor");
        realGame=realGame.Replace(start,"<script>window.__labErrors=[];addEventListener('error',e=>{if(e.message)__labErrors.push(e.message)});addEventListener('unhandledrejection',e=>__labErrors.push(String(e.reason)));</script>"+start);
        string end="})();";
        int tail=realGame.LastIndexOf(end,StringComparison.Ordinal);
        Require(tail>0&&realGame.Substring(tail+end.Length).TrimStart().StartsWith("</script>",StringComparison.Ordinal),"real main closure end");
        string probe=@"window.__labInput=[];for(const type of ['keydown','keyup','pointerdown','pointerup','focus','blur'])addEventListener(type,e=>{if(__labInput.length<60)__labInput.push({type,key:e.key,code:e.code,pointer:e.pointerType,pid:e.pointerId,trusted:e.isTrusted,focus:document.hasFocus(),target:e.target?.id})},true);
window.__labObserve=()=>({focus:document.hasFocus(),active:document.activeElement?.id,input:window.__labInput.slice(-12),ready:COIN.ready,classId:COIN.classId,balance:COIN.students.find(s=>s.id==='lab1')?.balance,balance2:COIN.students.find(s=>s.id==='lab2')?.balance,idx2:ST.players[1]?.idx,refunds:COIN.refunds.size,charged:!!round?.charge,on:ST.on,phase:ST.phase,n:ST.players.length,idx:ST.players[0]?.idx,canvas:stCanvas.width>0&&stCanvas.height>0&&stCanvas.getBoundingClientRect().width>200&&ST.hits.length>2});
window.__labNext=()=>stNextDir(ST.players[0].idx)===ST.players[0].dir?'d':'a';
window.__labTouch=(i=0)=>{const p=ST.players[i],h=ST.hits.find(h=>h.key===(stNextDir(p.idx)===p.dir?'c':'t')+i),r=stCanvas.getBoundingClientRect();return [r.left+(h.x+h.w/2)/ST.W*r.width,r.top+(h.y+h.h/2)/ST.H*r.height].join(',')};";
        realGame=realGame.Insert(tail,probe+Environment.NewLine);
        Text="HOJA WebView2 Lab - isolated test"; StartPosition=FormStartPosition.CenterScreen;
        ClientSize=new Size(1280,720); MinimumSize=new Size(800,480);
        view.Dock=DockStyle.Fill; Controls.Add(view);
        watchdog.Interval=180000; watchdog.Tick+=(s,e)=>Fail("timeout");
        Shown+=async (s,e)=>{watchdog.Start();try{await Run();}catch(Exception ex){Fail(ex.GetType().Name+": "+ex.Message);}};
        KeyPreview=true;
        KeyDown+=(s,e)=>{if(e.KeyCode==Keys.F11){SetImmersive(!immersive);e.SuppressKeyPress=true;}else if(e.KeyCode==Keys.Escape && immersive){SetImmersive(false);e.SuppressKeyPress=true;}};
    }
    static bool Local(string raw) {
        Uri u;
        return Uri.TryCreate(raw,UriKind.Absolute,out u) && u.Scheme=="http" && u.Host=="127.0.0.1" && u.Port==17449 && String.IsNullOrEmpty(u.UserInfo);
    }
    static bool GameFixture(string raw) {
        Uri u; return Uri.TryCreate(raw,UriKind.Absolute,out u) && u.Scheme=="https" && u.Host=="xkdtndbrwk111-prog.github.io" && u.Port==443 && String.IsNullOrEmpty(u.UserInfo) && u.AbsolutePath=="/hoja-minigames/" && u.Query.StartsWith("?mode=board&embed=dashboard&coin=4&fresh=",StringComparison.Ordinal);
    }
    static bool Allowed(string raw,string method) {
        if(!Local(raw))return false;
        var p=new Uri(raw).AbsolutePath;
        if(method=="POST")return p=="/api/coins" || p=="/api/seating" || p=="/api/presentation/ack";
        if(method!="GET" && method!="HEAD")return false;
        if(p.StartsWith("/api/",StringComparison.Ordinal))return p=="/api/coins"||p=="/api/seating"||p=="/api/board-status"||p=="/api/theme"||p=="/api/presentation/poll";
        if(p.StartsWith("/presentation/",StringComparison.Ordinal))return !p.Contains("..") && System.Text.RegularExpressions.Regex.IsMatch(p,@"^/presentation/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:html|css|js|mjs|png|svg|txt)$");
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
        core.FrameCreated+=(s,e)=>{
            var f=e.Frame;liveFrames.Add(f);Trace("frame created count="+liveFrames.Count);
            f.Destroyed+=(a,b)=>{liveFrames.Remove(f);if(Object.ReferenceEquals(gameFrame,f))gameFrame=null;Trace("frame destroyed count="+liveFrames.Count);};
            f.NavigationStarting+=(a,b)=>{if(GameFixture(b.Uri)){gameFrame=f;Trace("game frame navigation real="+useRealGame);}};
        };
        core.NavigationStarting+=(s,e)=>{if(!Local(e.Uri))e.Cancel=true;};
        core.FrameNavigationStarting+=(s,e)=>{if(!Local(e.Uri)&&!GameFixture(e.Uri)&&e.Uri!="about:blank")e.Cancel=true;};
        core.NewWindowRequested+=(s,e)=>{e.Handled=true;};
        core.PermissionRequested+=(s,e)=>{e.State=CoreWebView2PermissionState.Deny;};
        core.DownloadStarting+=(s,e)=>{e.Cancel=true;};
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=(s,e)=>{
            if(GameFixture(e.Request.Uri)&&e.Request.Method=="GET"){
                Trace("serve game real="+useRealGame);
                string csp=useRealGame?"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'":"default-src 'none'; script-src 'unsafe-inline'";
                e.Response=env.CreateWebResourceResponse(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(useRealGame?realGame:fixture)),200,"OK","Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: "+csp);
            }else if(!Allowed(e.Request.Uri,e.Request.Method))
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
        await VerifyGame(core);
        await VerifyRealGame(core);
        await VerifyManager(core);
        Rectangle old=Bounds;SetImmersive(true);Require(FormBorderStyle==FormBorderStyle.None&&Bounds==Screen.FromControl(this).Bounds,"native fullscreen");
        SetImmersive(false);Require(FormBorderStyle==FormBorderStyle.Sizable&&Bounds==old,"native restore");
        core.Navigate("http://127.0.0.1:17439/");
        await Task.Delay(500);
        Require(Local(core.Source),"production origin rejected");
        Finish(0,"PASS: actual 1.66.43 dashboard, coin and seating API, isolated storage reload, native fullscreen and restore, production-origin block; mini V4 roster, grant, spend, duplicate, refund, stale revision, close/reopen and invalid origin; real stairs solo and duo trusted input and coin spend/refund; Chrome manager seating and offline seating/PE presentation");
    }
    async Task<string> WaitResult(CoreWebView2 core,string expression) {
        for(int i=0;i<100;i++){
            string value=await core.ExecuteScriptAsync(expression);
            if(value!="\"\""&&value!="null")return value;
            await Task.Delay(200);
        }
        return "timeout";
    }
    async Task VerifyGame(CoreWebView2 core) {
        await core.ExecuteScriptAsync(@"(async()=>{try{
          const C=TTCoins,s=await C.snapshot(true),old=await C.snapshot(true),cls=s.roster.cls,at=new Date().toISOString();
          if(cls!=='LAB_CLASS'||s.roster.students[0].id!=='lab1')throw Error('roster');
          const g=C.grant(C.stateOf(s.events,cls),{cls,students:[s.roster.students[0]],amount:4,source:'lab',at});
          await C.commit(s,g.events);
          let rejected=false;try{await C.commit(old,g.events)}catch(e){rejected=e.message.includes('다른 코인 작업')}
          if(!rejected||C.balanceOf(C.stateOf((await C.snapshot()).events,cls),'lab1')!==14)throw Error('grant/revision');
          document.documentElement.dataset.labGrant='ok';
        }catch(e){document.documentElement.dataset.labGrant='error:'+e.message}})()");
        string grant=await WaitResult(core,"document.documentElement.dataset.labGrant||''");
        Require(grant=="\"ok\"","grant and stale revision: "+grant);
        await core.ExecuteScriptAsync(@"window.labGameResult='';
          addEventListener('message',e=>{if(e.origin==='https://xkdtndbrwk111-prog.github.io'&&e.source===document.getElementById('miniFrame').contentWindow&&e.data?.type==='lab-result')window.labGameResult=e.data.result});
          for(const d of document.querySelectorAll('dialog[open]'))d.close();
          document.getElementById('openMiniGames').click()");
        string response=await WaitResult(core,"window.labGameResult||''");
        Require(response=="\"ok\"","actual board mini protocol: "+response);
        Require(await core.ExecuteScriptAsync("document.getElementById('miniGames').open&&document.getElementById('miniNotice').hidden")=="true","mini visible and ready");
        await core.ExecuteScriptAsync(@"window.postMessage({type:'hoja-coin-spend',sessionId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',coinUnit:2,classId:'LAB_CLASS',ids:['lab1'],game:'lab',txId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},location.origin)");
        await Task.Delay(500);
        await core.ExecuteScriptAsync(@"(async()=>{try{const s=await TTCoins.snapshot();const e=s.events.filter(x=>x.cls==='LAB_CLASS');const balance=TTCoins.balanceOf(TTCoins.stateOf(e,'LAB_CLASS'),'lab1');document.documentElement.dataset.labLedger=balance===14&&e.filter(x=>x.type==='spend').length===1&&e.filter(x=>x.type==='refund').length===1?'ok':'bad'}catch(e){document.documentElement.dataset.labLedger='error'}})()");
        Require(await WaitResult(core,"document.documentElement.dataset.labLedger||''")=="\"ok\"","single spend/refund and forged origin rejection");
        await core.ExecuteScriptAsync("document.getElementById('miniBack').click()");
        Require(await core.ExecuteScriptAsync("!document.getElementById('miniGames').open&&!document.getElementById('miniFrame').hasAttribute('src')")=="true","mini close");
        await core.ExecuteScriptAsync("window.labGameResult='';document.getElementById('openMiniGames').click()");
        Require(await WaitResult(core,"window.labGameResult||''")=="\"ok\"","mini reopen");
        await core.ExecuteScriptAsync("document.getElementById('miniBack').click()");
    }
    async Task GameWait(string expression,string label,int count=120) {
        string actual="",lastError="";
        for(int i=0;i<count;i++){
            foreach(var f in liveFrames.ToArray()){
                try{
                    string location=await f.ExecuteScriptAsync("location.href");
                    if(location==null||!location.Contains("xkdtndbrwk111-prog.github.io/hoja-minigames/"))continue;
                    gameFrame=f;
                    actual=await f.ExecuteScriptAsync(expression);
                    if(actual=="true"){Trace("PASS "+label);return;}
                }catch(Exception ex){lastError=ex.GetType().Name+": "+ex.Message;}
            }
            await Task.Delay(100);
        }
        string probe="unavailable";
        if(gameFrame!=null)try{probe=await gameFrame.ExecuteScriptAsync("JSON.stringify({href:location.href,ready:document.readyState,observe:typeof __labObserve,state:typeof __labObserve==='function'?__labObserve():null,errors:window.__labErrors,menu:!!document.getElementById('menuScreen')})");}catch(Exception ex){probe=ex.Message;}
        string outer=await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({src:document.getElementById('miniFrame').getAttribute('src'),open:document.getElementById('miniGames').open,notice:document.getElementById('miniNotice').hidden,msg:window.__labMessages})");
        Trace("FAIL "+label+" frames="+liveFrames.Count+" last="+actual+" exception="+lastError+" probe="+probe+" board="+outer);
        throw new InvalidOperationException(label+" last="+actual+" probe="+probe+" frames="+liveFrames.Count+" exception="+lastError);
    }
    async Task GameAction(string script) {
        Require(await gameFrame.ExecuteScriptAsync(script+";true")=="true","real game action "+script);
    }
    async Task FocusRealGame(CoreWebView2 core) {
        Activate();view.Focus();
        // Focus the real cross-origin document using browser input, not a synthetic DOM key event.
        await core.ExecuteScriptAsync("document.getElementById('miniFrame').focus()");
        string raw=await gameFrame.ExecuteScriptAsync("(()=>{const r=document.getElementById('stCanvas').getBoundingClientRect();return [r.left+r.width*.5,r.top+r.height*.16].join(',')})()");
        string offset=await core.ExecuteScriptAsync("(()=>{const f=document.getElementById('miniFrame'),r=f.getBoundingClientRect();return [r.left+f.clientLeft,r.top+f.clientTop].join(',')})()");
        var inv=System.Globalization.CultureInfo.InvariantCulture;string[] xy=raw.Trim('"').Split(','),off=offset.Trim('"').Split(',');
        string x=(double.Parse(xy[0],inv)+double.Parse(off[0],inv)).ToString(inv),y=(double.Parse(xy[1],inv)+double.Parse(off[1],inv)).ToString(inv);
        string point=",\"x\":"+x+",\"y\":"+y+",\"button\":\"left\",\"clickCount\":1";
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent","{\"type\":\"mousePressed\""+point+"}");
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent","{\"type\":\"mouseReleased\""+point+"}");
        Trace("focus board="+await core.ExecuteScriptAsync("JSON.stringify({focused:document.hasFocus(),active:document.activeElement?.id})")+" game="+await gameFrame.ExecuteScriptAsync("JSON.stringify(__labObserve())"));
        await GameWait("__labObserve().focus&&__labObserve().idx===0","real game focused without advancing",15);
    }
    async Task SendKey(CoreWebView2 core,string key,string code) {
        string p="\"key\":\""+key+"\",\"code\":\""+code+"\",\"windowsVirtualKeyCode\":"+(key=="Escape"?27:key.ToUpperInvariant()[0])+",\"nativeVirtualKeyCode\":"+(key=="Escape"?27:key.ToUpperInvariant()[0]);
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent","{\"type\":\"rawKeyDown\","+p+"}");
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent","{\"type\":\"keyUp\","+p+"}");
    }
    async Task VerifyRealGame(CoreWebView2 core) {
        // Keep the earlier fixture regression and its exact ledger independent.
        string ledger=Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA"),"TeacherToolsLocal","coins.log");
        Require(File.ReadAllLines(ledger).Length==7,"fixture exact seven ledger rows with second student seed");
        useRealGame=true;
        await core.ExecuteScriptAsync("window.__labMessages=[];addEventListener('message',e=>{if(e.origin==='https://xkdtndbrwk111-prog.github.io'&&e.source===document.getElementById('miniFrame').contentWindow&&e.data?.type)window.__labMessages.push(e.data.type)});document.getElementById('openMiniGames').click()");
        Trace("requested real game; existing frames="+liveFrames.Count);
        await GameWait("typeof __labObserve==='function'&&__labObserve().ready&&__labObserve().classId==='LAB_CLASS'&&__labObserve().balance===14","real game coin handshake",200);
        await GameAction("if(document.getElementById('hofFirstLater'))document.getElementById('hofFirstLater').click()");
        await GameWait("!document.getElementById('menuScreen').hidden&&!document.getElementById('openStairs').hidden","real menu");
        await GameAction("document.getElementById('openStairs').click()");
        await GameWait("!document.getElementById('choiceScreen').hidden","stairs selection");
        await GameAction("document.querySelector('#stageList .stage-card').click();document.getElementById('choiceStart').click()");
        await GameWait("!document.getElementById('hofPicker').hidden&&!!document.querySelector('[data-student=lab1]:not([disabled])')","real coin picker");
        await GameAction("document.querySelector('[data-student=lab1]').click()");
        await GameWait("__labObserve().on&&__labObserve().phase==='run'&&__labObserve().n===1&&__labObserve().charged&&__labObserve().balance===12","real stairs start and spend",180);
        await GameWait("__labObserve().canvas","stairs rendered canvas/hit controls",30);
        await FocusRealGame(core);
        string key=await gameFrame.ExecuteScriptAsync("__labNext()");
        Require(key=="\"a\""||key=="\"d\"","stairs next key");
        string k=key.Trim('"');await SendKey(core,k,"Key"+k.ToUpperInvariant());
        await GameWait("__labObserve().idx===1&&__labObserve().input.some(e=>e.type==='keydown'&&e.trusted&&e.code==='Key"+k.ToUpperInvariant()+"')","CDP keyboard actually moves player",20);
        string raw=await gameFrame.ExecuteScriptAsync("__labTouch()");
        string offset=await core.ExecuteScriptAsync("(()=>{const r=document.getElementById('miniFrame').getBoundingClientRect();return [r.left,r.top].join(',')})()");
        var inv=System.Globalization.CultureInfo.InvariantCulture;string[] xy=raw.Trim('"').Split(','),off=offset.Trim('"').Split(',');
        string x=(double.Parse(xy[0],inv)+double.Parse(off[0],inv)).ToString(inv),y=(double.Parse(xy[1],inv)+double.Parse(off[1],inv)).ToString(inv);
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchTouchEvent","{\"type\":\"touchStart\",\"touchPoints\":[{\"x\":"+x+",\"y\":"+y+",\"id\":1}]}");
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchTouchEvent","{\"type\":\"touchEnd\",\"touchPoints\":[]}");
        await GameWait("__labObserve().idx===2&&__labObserve().input.some(e=>e.type==='pointerdown'&&e.pointer==='touch'&&e.trusted)","CDP touch actually moves player",20);
        await SendKey(core,"Escape","Escape");
        await GameWait("__labObserve().phase==='paused'&&!document.getElementById('stOverlay').hidden&&__labObserve().input.some(e=>e.type==='keydown'&&e.code==='Escape'&&e.trusted)","real keyboard pause",20);
        await GameAction("[...document.querySelectorAll('#stOverlayActions button')].find(b=>b.textContent.includes('모음집')).click()");
        await GameWait("!document.getElementById('menuScreen').hidden&&__labObserve().refunds===0&&__labObserve().balance===14","real refund and return",100);
        await core.ExecuteScriptAsync("document.getElementById('miniBack').click()");
        Require(await core.ExecuteScriptAsync("!document.getElementById('miniGames').open&&!document.getElementById('miniFrame').hasAttribute('src')")=="true","real game board return");
        await VerifyDuo(core);
        useRealGame=false;
        File.WriteAllText(Path.Combine(Environment.GetEnvironmentVariable("HOJA_LAB_ROOT"),"real-game.pass"),"PASS pinned real stairs solo and reopened two-player round, simultaneous trusted touch, coin spend/refund, keyboard, pause, return");
    }
    async Task VerifyDuo(CoreWebView2 core) {
        await core.ExecuteScriptAsync("document.getElementById('openMiniGames').click()");
        await GameWait("typeof __labObserve==='function'&&__labObserve().ready&&__labObserve().balance===14&&__labObserve().balance2===10","real reopened two-player roster",150);
        await GameAction("if(document.getElementById('hofFirstLater'))document.getElementById('hofFirstLater').click()");
        await GameWait("!document.getElementById('menuScreen').hidden","real reopened menu");
        await GameAction("document.getElementById('openStairs').click()");
        await GameWait("!document.getElementById('choiceScreen').hidden","duo selection");
        await GameAction("[...document.querySelectorAll('#stageList .stage-card')].find(b=>b.textContent.includes('2인 경주')).click();document.getElementById('choiceStart').click()");
        await GameWait("!document.getElementById('hofPicker').hidden&&!!document.querySelector('[data-student=lab1]:not([disabled])')","duo first student");
        await GameAction("document.querySelector('[data-student=lab1]').click()");
        await GameWait("!!document.querySelector('[data-student=lab2]:not([disabled])')&&document.querySelector('[data-student=lab1]').disabled","duo distinct second student");
        await GameAction("document.querySelector('[data-student=lab2]').click()");
        await GameWait("__labObserve().on&&__labObserve().phase==='run'&&__labObserve().n===2&&__labObserve().charged&&__labObserve().balance===13&&__labObserve().balance2===9","duo actual one coin per player",180);
        await GameWait("__labObserve().canvas","duo canvas/hit regions");
        string offset=await core.ExecuteScriptAsync("(()=>{const f=document.getElementById('miniFrame'),r=f.getBoundingClientRect();return [r.left+f.clientLeft,r.top+f.clientTop].join(',')})()");
        var inv=System.Globalization.CultureInfo.InvariantCulture;string[] off=offset.Trim('"').Split(',');
        string[] points=new string[2];
        for(int i=0;i<2;i++){
            string raw=await gameFrame.ExecuteScriptAsync("__labTouch("+i+")");
            string[] xy=raw.Trim('"').Split(',');
            string x=(double.Parse(xy[0],inv)+double.Parse(off[0],inv)).ToString(inv),y=(double.Parse(xy[1],inv)+double.Parse(off[1],inv)).ToString(inv);
            points[i]="{\"x\":"+x+",\"y\":"+y+",\"id\":"+(i+1)+"}";
        }
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchTouchEvent","{\"type\":\"touchStart\",\"touchPoints\":["+String.Join(",",points)+"]}");
        await GameWait("__labObserve().idx===1&&__labObserve().idx2===1&&new Set(__labObserve().input.filter(e=>e.type==='pointerdown'&&e.pointer==='touch'&&e.trusted).map(e=>e.pid)).size===2","two simultaneous trusted contacts advance both players",20);
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchTouchEvent","{\"type\":\"touchEnd\",\"touchPoints\":[]}");
        await SendKey(core,"Escape","Escape");
        await GameWait("__labObserve().phase==='paused'&&!document.getElementById('stOverlay').hidden","duo pause",20);
        await GameAction("[...document.querySelectorAll('#stOverlayActions button')].find(b=>b.textContent.includes('모음집')).click()");
        await GameWait("!document.getElementById('menuScreen').hidden&&__labObserve().refunds===0&&__labObserve().balance===14&&__labObserve().balance2===10","duo refund restores both balances",100);
        await core.ExecuteScriptAsync("document.getElementById('miniBack').click()");
        Require(await core.ExecuteScriptAsync("!document.getElementById('miniGames').open&&!document.getElementById('miniFrame').hasAttribute('src')")=="true","duo return to board");
    }
    void PublishMode() {
        string tmp=modeFile+".tmp";
        string json="{\"mode\":\"window\",\"release\":\"2026-11-25-V1.66.43-STABLE-PILOT\",\"window\":"+Handle.ToInt64()+",\"pid\":"+System.Diagnostics.Process.GetCurrentProcess().Id+"}";
        File.WriteAllText(tmp,json,new System.Text.UTF8Encoding(false));
        if(File.Exists(modeFile))File.Replace(tmp,modeFile,null);else File.Move(tmp,modeFile);
    }
    async Task VerifyManager(CoreWebView2 core) {
        string root=Environment.GetEnvironmentVariable("HOJA_LAB_ROOT");
        modeFile=Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA"),"TeacherToolsLocal","board-mode.json");
        Require(!File.Exists(modeFile),"unexpected existing board mode");
        PublishMode();
        heartbeat.Interval=3000;heartbeat.Tick+=(s,e)=>{try{PublishMode();}catch(Exception ex){Fail("heartbeat: "+ex.Message);}};
        heartbeat.Start();
        File.WriteAllText(Path.Combine(root,"manager.ready"),"ready");
        bool closeObserved=false;
        for(int i=0;i<480;i++){
            if(File.Exists(Path.Combine(root,"manager.close"))&&!closeObserved){
                Require(await core.ExecuteScriptAsync("document.getElementById('ttPresentation').open&&document.getElementById('ttPresentationLoading').hidden&&document.getElementById('ttPresentation').dataset.kind==='pe'")=="true","actual PE dialog ready");
                await core.ExecuteScriptAsync("document.getElementById('ttPresentationClose').click()");
                closeObserved=true;
            }
            if(File.Exists(Path.Combine(root,"manager.done")))break;
            await Task.Delay(200);
        }
        Require(closeObserved&&File.Exists(Path.Combine(root,"manager.done")),"Chrome manager handshake");
        await core.ExecuteScriptAsync(@"(async()=>{try{const s=await (await fetch('/api/seating')).json();document.documentElement.dataset.labManager=s.classId==='LAB_CLASS_2'&&s.students.length===2&&s.students.some(x=>x.id==='m2'&&x.name==='LAB_MANAGER_TWO')&&s.assignments.length===2?'ok':'bad'}catch(e){document.documentElement.dataset.labManager='error'}})()");
        Require(await WaitResult(core,"document.documentElement.dataset.labManager||''")=="\"ok\"","WebView2 reads real manager seating");
        Require(await core.ExecuteScriptAsync("!document.getElementById('ttPresentation').open")=="true","presentation closed");
        heartbeat.Stop();File.Delete(modeFile);modeFile=null;
    }
    void Fail(string why){Finish(1,"FAIL: "+why);}
    void Finish(int code,string message){
        if(finished)return;finished=true;exitCode=code;watchdog.Stop();heartbeat.Stop();if(modeFile!=null&&File.Exists(modeFile))File.Delete(modeFile);
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
