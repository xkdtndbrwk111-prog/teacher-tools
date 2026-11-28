using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Research-only native install/start. No main, stable updater, production data,
// shell scripts, registry changes, elevation, or automatic migration.
internal static class OnlineNativeStart {
 const int Port=17439;
 const string Version="1.66.43-field-a1";
 const string ParentName="TeacherToolsWebView2OnlinePilotNative";
 static readonly string[] Required={"bin/HOJA-Native-Launch-Lab.exe","bin/HOJA-Native-Server.exe","bin/Microsoft.Web.WebView2.Core.dll","bin/Microsoft.Web.WebView2.WinForms.dll","bin/WebView2Loader.dll","local/TeacherToolsLocal/dashboard.html","local/TeacherToolsLocal/asset-book-reader-host.zip"};
 static readonly string[] Forbidden={"bin/HOJA-Field-Static.exe","bin/field-manager.zip","bin/field-game.zip"};
 static void Require(bool ok,string msg){if(!ok)throw new IOException(msg);}
 static void Plain(string path){Require((File.GetAttributes(path)&FileAttributes.ReparsePoint)==0,"Linked path rejected: "+Path.GetFileName(path));}
 static void Dir(string path){Directory.CreateDirectory(path);Plain(path);}
 static string Text(Dictionary<string,object> d,string key){object value;return d.TryGetValue(key,out value)?value as string:null;}
 static string Hash(string file){using(var sha=SHA256.Create())using(var s=File.OpenRead(file))return BitConverter.ToString(sha.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
 sealed class Entry {public string Path,Hash;public long Size;}
 sealed class Manifest {public string Source;public List<Entry> Files=new List<Entry>();}
 static Manifest Load(string filename){
  Plain(filename);Require(new FileInfo(filename).Length<=65536,"Manifest too large");
  var d=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(filename));
  Require(d!=null&&Text(d,"schema")=="HOJA-FIELD-PILOT-1"&&Text(d,"version")==Version&&Text(d,"profile")=="online","Unexpected manifest");
  string source=Text(d,"source");Require(source!=null&&Regex.IsMatch(source,@"\A[a-f0-9]{40}\z"),"Invalid source");
  var m=new Manifest{Source=source};var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(object raw in (IEnumerable)d["files"]){
   var e=raw as Dictionary<string,object>;Require(e!=null,"Manifest entry");
   string name=Text(e,"path"),hash=Text(e,"sha256");long size=Convert.ToInt64(e["bytes"]);
   Require(name!=null&&Regex.IsMatch(name,@"\A(bin|local/TeacherToolsLocal)/[A-Za-z0-9_.-]+\z")&&!name.Contains("..")&&hash!=null&&Regex.IsMatch(hash,@"\A[a-f0-9]{64}\z")&&size>=0&&size<=128*1024*1024&&seen.Add(name),"Invalid package entry");
   m.Files.Add(new Entry{Path=name,Hash=hash,Size=size});
  }
  Require(m.Files.Count>=Required.Length&&m.Files.Count<=128,"Manifest file count");
  foreach(string name in Required)Require(seen.Contains(name),"Missing required package file: "+name);
  foreach(string name in Forbidden)Require(!seen.Contains(name),"Forbidden static package file");
  return m;
 }
 static string LocalPath(string root,string rel){return Path.Combine(root,rel.Replace('/',Path.DirectorySeparatorChar));}
 static void Verify(string root,Manifest m){
  Plain(root);Plain(Path.Combine(root,"bin"));Plain(Path.Combine(root,"local"));Plain(Path.Combine(root,"local","TeacherToolsLocal"));
  foreach(Entry e in m.Files){string f=LocalPath(root,e.Path);Plain(f);Require(new FileInfo(f).Length==e.Size&&Hash(f)==e.Hash,"Package mismatch: "+e.Path);}
  foreach(string name in Forbidden)Require(!File.Exists(LocalPath(root,name))&&!Directory.Exists(LocalPath(root,name)),"Static component present");
 }
 // 7D-2: actual new-host readiness test under a disposable runner only.
 // Ephemeral key, synthetic signed release content, no public feed or release key.
 static byte[] JsonBytes(object data){return new UTF8Encoding(false).GetBytes(new JavaScriptSerializer().Serialize(data));}
 static string HashBytes(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static void CiUpdateCycle(string root,Manifest original){
  Require(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")=="true","CI update cycle only");
  const string releaseRel="local/TeacherToolsLocal/release.json",dashRel="local/TeacherToolsLocal/dashboard.html";
  var paths=new List<string>();foreach(Entry e in original.Files)paths.Add(e.Path);
  var kernel=new NativeUpdateKernel(root,paths);
  string probe=Path.Combine(root,"update-profile-probe"),sentinel=Path.Combine(root,"local","TeacherToolsLocal","native-test-data.keep");
  string originalRelease=LocalPath(root,releaseRel),originalDash=LocalPath(root,dashRel);
  var meta=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(originalRelease));
  string before=(string)meta["version"];Require(before=="1.66.43","Unexpected CI base");
  string after="1.66.44",oldReleaseHash=Hash(originalRelease);
  meta["version"]=after;meta["release"]=((string)meta["release"]).Replace("V"+before+"-","V"+after+"-");
  string dashboard=File.ReadAllText(originalDash);Require(dashboard.Contains(before),"Dashboard version anchor");
  File.WriteAllText(sentinel,"classroom-sentinel");
  File.WriteAllText(probe,"seed");
  Run(root,true,"window");File.WriteAllText(probe,"verify");
  using(var key=new RSACryptoServiceProvider(2048)){
   key.PersistKeyInCsp=false;
   for(int pass=0;pass<2;pass++){
    bool broken=pass==0;
    var snapshot=new Manifest{Source=original.Source};var blobs=new Dictionary<string,byte[]>();
    var entries=new List<object>();
    foreach(Entry e in original.Files){
     byte[] bytes=e.Path==releaseRel?JsonBytes(meta):e.Path==dashRel?new UTF8Encoding(false).GetBytes(broken?"<!doctype html><title>broken CI update</title>":dashboard.Replace(before,after)):File.ReadAllBytes(LocalPath(root,e.Path));
     string hash=HashBytes(bytes);blobs[hash]=bytes;
     snapshot.Files.Add(new Entry{Path=e.Path,Hash=hash,Size=bytes.Length});
     entries.Add(new Dictionary<string,object>{{"path",e.Path},{"sha256",hash},{"bytes",bytes.Length}});
    }
    byte[] payload=JsonBytes(new Dictionary<string,object>{{"schema","TT-NATIVE-SNAPSHOT-1"},{"channel","online-pilot"},{"kernel",1},{"version",after},{"bases",new[]{oldReleaseHash}},{"files",entries}});
    byte[] envelope=JsonBytes(new Dictionary<string,object>{{"payload",Convert.ToBase64String(payload)},{"signature",Convert.ToBase64String(key.SignData(payload,"SHA256"))}});
    string token=kernel.Prepare(envelope,key.ToXmlString(false),before,(sha,length)=>blobs[sha]);
    kernel.Apply(token);Verify(root,snapshot);
    Exception launchFailure=null;
    try{Run(root,true,"window");}catch(Exception e){launchFailure=e;}
    if(broken){
     Require(launchFailure!=null,"Broken signed update unexpectedly reached board readiness");
     Require(kernel.Recover(),"Broken board rollback missing");Verify(root,original);Run(root,true,"window");
     Require(File.ReadAllText(sentinel)=="classroom-sentinel","Rollback lost classroom data");
     File.AppendAllText(Path.Combine(root,"native-update-cycle.result"),"PASS actual broken board rollback and reopened original memo\r\n");
    }else{
     if(launchFailure!=null){kernel.Recover();throw new IOException("Updated board failed readiness",launchFailure);}
     kernel.Confirm(token,after);Require(!kernel.Recover(),"Confirmed update rolled back");
     Verify(root,snapshot);Run(root,true,"wallpaper");
     Require(File.ReadAllText(sentinel)=="classroom-sentinel","Update lost classroom data");
     File.AppendAllText(Path.Combine(root,"native-update-cycle.result"),"PASS actual signed updated board readiness, window/wallpaper reopen, persistent WebView2 memo and classroom data\r\n");
    }
   }
  }
  File.Delete(probe);
 }
 static void PortFree(){foreach(var ep in IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners())Require(ep.Port!=Port,"Port 17439 already in use. No existing process was stopped.");}
 static int ListenerPid(){
  using(var p=Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory,"netstat.exe"),"-ano -p TCP"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true})){
   string output=p.StandardOutput.ReadToEnd();p.WaitForExit();Require(p.ExitCode==0,"Listener lookup failed");
   var m=Regex.Matches(output,@"(?m)^\s*TCP\s+127\.0\.0\.1:17439\s+\S+\s+LISTENING\s+(\d+)\s*$");
   Require(m.Count==1,"Unexpected listener count");return Int32.Parse(m[0].Groups[1].Value);
  }
 }
 [StructLayout(LayoutKind.Sequential)] struct Basic {public long a,b;public uint Flags;public UIntPtr c,d;public uint e;public UIntPtr f;public uint g,h;}
 [StructLayout(LayoutKind.Sequential)] struct Io {public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct Extended {public Basic Basic;public Io Io;public UIntPtr a,b,c,d;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr j,int c,ref Extended i,uint len);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 static Process Start(string root,string name,string args,IntPtr job,bool hidden){
  var i=new ProcessStartInfo(Path.Combine(root,"bin",name),args){UseShellExecute=false,CreateNoWindow=hidden,WorkingDirectory=root};
  i.EnvironmentVariables["LOCALAPPDATA"]=Path.Combine(root,"local");i.EnvironmentVariables["HOJA_LAB_ROOT"]=root;
  var p=Process.Start(i);
  if(p==null)throw new IOException("Child start failed");
  try{Require(AssignProcessToJobObject(job,p.Handle),"Child job assignment failed");return p;}
  catch{try{if(!p.HasExited)p.Kill();}finally{p.Dispose();}throw;}
 }
 static void Ready(Process p,string file,int timeout){
  var timer=Stopwatch.StartNew();
  while(!File.Exists(file)&&timer.ElapsedMilliseconds<timeout){Require(!p.HasExited,"Child exited: "+p.ProcessName);Thread.Sleep(100);}
  Require(!p.HasExited&&File.Exists(file),"Child readiness timeout");
 }
 static void Stop(Process p,string flag,int ms){
  if(p==null)return;
  try{if(!p.HasExited){File.WriteAllText(flag,"stop");if(!p.WaitForExit(ms)){p.Kill();p.WaitForExit(5000);}}}finally{p.Dispose();}
 }
 static void WriteFlag(string root,string name){File.WriteAllText(Path.Combine(root,name),"native-online-pilot");}
 static void ClearFlags(string root){
  foreach(string name in new[]{"native-launch.ready","native-launch.stop","native-launch.result","native-read-server.ready","native-read-server.stop","field-smoke.flag","field-manager-roster.pass","field-coin-smoke.trigger","field-presentation-smoke.trigger","field-book-live.flag","media-download-live.flag","field-provider-live.flag","field-audio-live.flag","field-system-live.flag","system-open-live.flag","field-transfer-live.flag","photo-picker-live.flag","neis-live.flag","field-manager-live.flag","book-state-fixture.flag","book-session-fixture.flag","book-bundle-fixture.flag","book-reader-process-fixture.flag","media-download-fixture.flag","neis-fixture.flag","audio-fixture.flag"}){
   string file=Path.Combine(root,name);if(File.Exists(file)){Plain(file);File.Delete(file);}
  }
 }
 static void Run(string root,bool ci,string mode){
  PortFree();ClearFlags(root);
  foreach(string name in new[]{"field-pilot.flag","field-online.flag","coin-write-fixture.flag","media-read-fixture.flag","media-write-fixture.flag"})WriteFlag(root,name);
  if(!ci)foreach(string name in new[]{"field-provider-live.flag","neis-live.flag","field-book-live.flag","field-audio-live.flag","field-system-live.flag","system-open-live.flag","photo-picker-live.flag","field-manager-live.flag","field-transfer-live.flag"})WriteFlag(root,name);
  // Live download remains off until the native media worker is implemented.
  IntPtr job=CreateJobObject(IntPtr.Zero,null);Require(job!=IntPtr.Zero,"Create owned job failed");
  Process server=null,board=null;
  try{
   var info=new Extended();info.Basic.Flags=0x2000;
   Require(SetInformationJobObject(job,9,ref info,(uint)Marshal.SizeOf(typeof(Extended))),"Job limits failed");
   server=Start(root,"HOJA-Native-Server.exe","--lab-coin-server",job,true);
   string sr=Path.Combine(root,"native-read-server.ready");Ready(server,sr,30000);
   Require(File.ReadAllText(sr).Trim()==server.Id.ToString()&&ListenerPid()==server.Id,"Server ownership mismatch");
   board=Start(root,"HOJA-Native-Launch-Lab.exe","--lab-launch "+mode,job,false);
   string br=Path.Combine(root,"native-launch.ready");Ready(board,br,60000);
   string[] ready=File.ReadAllText(br).Trim().Split(' ');
   Require(ready.Length==3&&ready[0]==mode&&ready[1]==board.Id.ToString(),"Board ownership mismatch");
   if(ci)File.WriteAllText(Path.Combine(root,"native-launch.stop"),"stop");
   while(!board.WaitForExit(200))Require(!server.HasExited,"Owned server exited");
   Require(board.ExitCode==0,"Board failed");
  }finally{
   try{Stop(board,Path.Combine(root,"native-launch.stop"),5000);}
   finally{try{Stop(server,Path.Combine(root,"native-read-server.stop"),15000);}finally{CloseHandle(job);}}
  }
 }
 [STAThread] static int Main(string[] args){
  bool ci=args.Length==2&&args[0]=="--ci-smoke"&&(args[1]=="window"||args[1]=="wallpaper")&&Environment.GetEnvironmentVariable("GITHUB_ACTIONS")=="true";
  bool ciUpdate=args.Length==1&&args[0]=="--ci-update-cycle"&&Environment.GetEnvironmentVariable("GITHUB_ACTIONS")=="true";
  bool installed=args.Length==1&&args[0]=="--start";
  if(!ci&&!ciUpdate&&!installed&&args.Length!=0)return 2;
  string root=null;
  try{
   string package=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar);
   string manifest=Path.Combine(package,"manifest.json");Plain(package);var m=Load(manifest);
   string local=Environment.GetEnvironmentVariable("LOCALAPPDATA");Require(!String.IsNullOrEmpty(local)&&Path.IsPathRooted(local),"Missing local profile");
   local=Path.GetFullPath(local);Dir(local);string parent=Path.Combine(local,ParentName);Dir(parent);
   root=Path.Combine(parent,"hoja-webview-lab-"+m.Source.Substring(0,32));
   Require(!installed||String.Equals(package,root,StringComparison.OrdinalIgnoreCase),"Wrong installed start location");
   using(var guard=new FileStream(Path.Combine(parent,"pilot.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)){
    PortFree();
    if(!installed){
     string payload=Path.Combine(package,"payload");Verify(payload,m);
     if(!Directory.Exists(root)){
      string stage=Path.Combine(parent,"stage-"+Guid.NewGuid().ToString("N"));Dir(stage);
      try{
       foreach(Entry e in m.Files){string dest=LocalPath(stage,e.Path);Directory.CreateDirectory(Path.GetDirectoryName(dest));File.Copy(LocalPath(payload,e.Path),dest);}
       Verify(stage,m);File.Copy(manifest,Path.Combine(stage,"manifest.json"));
       File.Copy(Application.ExecutablePath,Path.Combine(stage,"Setup.exe"));Directory.Move(stage,root);
      }finally{if(Directory.Exists(stage))Directory.Delete(stage,true);}
     }
    }
    Verify(root,m);
    Require(Hash(Path.Combine(root,"manifest.json"))==Hash(manifest),"Installed manifest mismatch");
    if(ciUpdate)CiUpdateCycle(root,m);
    else Run(root,ci,ci?args[1]:"window");
    if(ci)File.WriteAllText(Path.Combine(root,"native-start-smoke.result"),"PASS native install/start/close "+args[1]);
   }
   return 0;
  }catch(Exception e){
   if(ci||ciUpdate){if(root!=null&&Directory.Exists(root))try{File.WriteAllText(Path.Combine(root,"native-start-smoke.result"),"FAIL "+e.GetType().Name+": "+e.Message);}catch{}}
   else MessageBox.Show(e.Message,"HOJA WebView2 online pilot",MessageBoxButtons.OK,MessageBoxIcon.Error);
   return 1;
  }
 }
}
