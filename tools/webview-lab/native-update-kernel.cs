// Phase 7D-1. Native signed snapshot transaction research.
// This is not the production updater or an Authenticode signer. No live feed is wired.
// A trusted launcher must supply the provisioned key, installed manifest allowlist,
// byte fetcher, exclusive process lock and actual new-host readiness before confirming.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

internal sealed class NativeUpdateKernel {
 const int MaxFile=16*1024*1024,MaxTotal=64*1024*1024,MaxEnvelope=524288;
 const string ReleasePath="local/TeacherToolsLocal/release.json";
 readonly string root,tx;
 readonly HashSet<string> allowed;
 readonly UTF8Encoding utf8=new UTF8Encoding(false,true);
 sealed class Item {public string Path,Before,After;public int Bytes;}
 sealed class Journal {public string Token,Version;public List<Item> Files=new List<Item>();}
 static void Require(bool ok,string why){if(!ok)throw new IOException(why);}
 static bool Match(string s,string p){return s!=null&&Regex.IsMatch(s,p);}
 static bool HashValid(string s){return Match(s,@"\A[a-f0-9]{64}\z");}
 static bool VersionValid(string s){return Match(s,@"\A[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}\z");}
 static bool ProgramPath(string s){
  if(s==null||s.Contains("..")||!Match(s,@"\A[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*\z"))return false;
  if(Match(s,@"\Abin/(HOJA-Native-(Server|Launch-Lab)\.exe|Microsoft\.Web\.WebView2\.(Core|WinForms)\.dll|WebView2Loader\.dll|LICENSE[^/]*|ThirdPartyNotices[^/]*)\z"))return true;
  const string prefix="local/TeacherToolsLocal/";
  if(!s.StartsWith(prefix,StringComparison.Ordinal))return false;
  string name=s.Substring(prefix.Length);
  switch(name){
   case "asset-book-reader-host.zip":case "classkit_QR_LICENSE.txt":case "coins-ui.js":case "coins.js":
   case "dashboard.html":case "handmade-paper.png":case "hoja.ico":case "podo.js":case "presentation-assets.zip":
   case "presentation-board.css":case "presentation-board.js":case "release.json":case "school.js":case "seating-inbox.html":
   case "update-ui.js":return true;
  }
  return Match(name,@"\Amuseum-[A-Za-z0-9-]+\.(webp|png)\z");
 }
 static void Plain(string path){
  if(File.Exists(path)||Directory.Exists(path))Require((File.GetAttributes(path)&FileAttributes.ReparsePoint)==0,"Linked path rejected");
 }
 static void Dir(string path){Plain(path);Directory.CreateDirectory(path);Plain(path);}
 static Dictionary<string,object> Obj(object value){var d=value as Dictionary<string,object>;Require(d!=null,"Invalid JSON object");return d;}
 static object Val(Dictionary<string,object> d,string key){object value;return d.TryGetValue(key,out value)?value:null;}
 static string Text(Dictionary<string,object> d,string key){return Val(d,key) as string;}
 static IEnumerable Seq(Dictionary<string,object> d,string key){var v=Val(d,key) as IEnumerable;Require(v!=null&&!(v is string)&&!(v is IDictionary),"Invalid array");return v;}
 static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=MaxEnvelope,RecursionLimit=16};}
 Dictionary<string,object> Decode(byte[] bytes,int max){Require(bytes!=null&&bytes.Length>0&&bytes.Length<=max,"JSON size");return Obj(Json().DeserializeObject(utf8.GetString(bytes).TrimStart('\uFEFF')));}
 static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static string FileHash(string path){Plain(path);if(!File.Exists(path))return "";using(var h=SHA256.Create())using(var s=File.OpenRead(path))return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
 static byte[] Read(string path,int max){Plain(path);Require(File.Exists(path)&&new FileInfo(path).Length<=max,"Missing or oversized file");return File.ReadAllBytes(path);}
 static void Atomic(string path,byte[] bytes){
  Plain(path);string tmp=path+"."+Guid.NewGuid().ToString("N")+".tmp";
  try{
   using(var stream=new FileStream(tmp,FileMode.CreateNew,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough)){stream.Write(bytes,0,bytes.Length);stream.Flush(true);}
   if(File.Exists(path))File.Replace(tmp,path,null);else File.Move(tmp,path);
  }finally{if(File.Exists(tmp))File.Delete(tmp);}
 }
 string Local(string parent,string name,bool create){
  Require(allowed.Contains(name)&&ProgramPath(name),"Program allowlist");
  Plain(parent);string[] parts=name.Split('/');string current=parent;
  for(int i=0;i<parts.Length-1;i++){current=Path.Combine(current,parts[i]);if(create)Dir(current);else Plain(current);}
  current=Path.Combine(current,parts[parts.Length-1]);Plain(current);Require(!Directory.Exists(current),"Expected file");return current;
 }
 public NativeUpdateKernel(string installation,IEnumerable<string> trustedProgramPaths){
  root=Path.GetFullPath(installation);Require(Directory.Exists(root),"Installation missing");Plain(root);
  tx=Path.Combine(root,"native-update-transaction");Plain(tx);
  allowed=new HashSet<string>(StringComparer.Ordinal);
  var insensitive=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(string p in trustedProgramPaths)Require(ProgramPath(p)&&insensitive.Add(p)&&allowed.Add(p),"Invalid trusted program inventory");
  Require(allowed.Count>=1&&allowed.Count<=128&&allowed.Contains(ReleasePath),"Missing release inventory");
 }
 string Pending{get{return Path.Combine(tx,"pending.json");}}
 string NewRoot{get{return Path.Combine(tx,"new");}}
 string OldRoot{get{return Path.Combine(tx,"old");}}
 void CleanTree(string path){
  if(!Directory.Exists(path))return;Plain(path);
  foreach(string file in Directory.GetFiles(path)){Plain(file);File.Delete(file);}
  foreach(string sub in Directory.GetDirectories(path))CleanTree(sub);
  Directory.Delete(path);
 }
 public void ClearCompleted(){Plain(tx);Require(!File.Exists(Pending),"Unfinished transaction");CleanTree(tx);}
 Journal ReadManifest(byte[] envelope,string publicKey,string currentVersion){
  Require(VersionValid(currentVersion),"Current version");
  var e=Decode(envelope,MaxEnvelope);
  string payloadText=Text(e,"payload"),signatureText=Text(e,"signature");
  Require(payloadText!=null&&signatureText!=null,"Signed envelope");
  byte[] payload=Convert.FromBase64String(payloadText),sig=Convert.FromBase64String(signatureText);
  Require(payload.Length<=262144&&sig.Length==256,"Signature size");
  using(var rsa=new RSACryptoServiceProvider()){rsa.PersistKeyInCsp=false;rsa.FromXmlString(publicKey);Require(rsa.KeySize==2048&&rsa.VerifyData(payload,"SHA256",sig),"Signature rejected");}
  var m=Decode(payload,262144);
  string version=Text(m,"version");
  Require(Text(m,"schema")=="TT-NATIVE-SNAPSHOT-1"&&Text(m,"channel")=="online-pilot"&&Convert.ToInt32(Val(m,"kernel"))==1&&VersionValid(version),"Manifest contract");
  Require(new Version(version)>new Version(currentVersion),"Non-increasing version");
  string release=FileHash(Local(root,ReleasePath,false));Require(HashValid(release),"Installed release missing");
  bool approved=false;int bases=0;
  foreach(object raw in Seq(m,"bases")){string b=raw as string;Require(HashValid(b)&&++bases<=80,"Invalid base list");if(b==release)approved=true;}
  Require(approved,"Unapproved installed release");
  var result=new Journal{Token=Guid.NewGuid().ToString("N"),Version=version};
  var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
  foreach(object raw in Seq(m,"files")){
   var f=Obj(raw);string path=Text(f,"path"),sha=Text(f,"sha256");object size=Val(f,"bytes");
   Require(path!=null&&allowed.Contains(path)&&ProgramPath(path)&&seen.Add(path)&&HashValid(sha)&&size is int,"Invalid snapshot entry");
   int length=(int)size;Require(length>=1&&length<=MaxFile,"Snapshot file limit");total+=length;Require(total<=MaxTotal,"Snapshot total limit");
   string before=FileHash(Local(root,path,false));
   if(before!=sha)result.Files.Add(new Item{Path=path,Before=before,After=sha,Bytes=length});
  }
  Require(seen.Count==allowed.Count&&result.Files.Exists(f=>f.Path==ReleasePath),"Incomplete snapshot or unchanged release");
  return result;
 }
 public string Prepare(byte[] envelope,string publicKey,string currentVersion,Func<string,int,byte[]> fetch){
  Require(!Directory.Exists(tx)&&!File.Exists(tx),"Existing transaction");
  var j=ReadManifest(envelope,publicKey,currentVersion);
  Dir(tx);Dir(NewRoot);Dir(OldRoot);
  try{
   foreach(Item f in j.Files){
    byte[] bytes=fetch(f.After,f.Bytes);Require(bytes!=null&&bytes.Length==f.Bytes&&Hash(bytes)==f.After,"Download integrity");
    Atomic(Local(NewRoot,f.Path,true),bytes);
   }
   var next=Decode(Read(Local(NewRoot,ReleasePath,false),MaxFile),MaxEnvelope);
   Require(Text(next,"version")==j.Version,"Target release version");
   foreach(Item f in j.Files){
    string current=Local(root,f.Path,false);
    Require(FileHash(current)==f.Before,"Installed file changed");
    if(f.Before!=""){
     byte[] bytes=Read(current,MaxFile);Require(Hash(bytes)==f.Before,"Rollback integrity");Atomic(Local(OldRoot,f.Path,true),bytes);
    }
   }
   var files=new List<object>();foreach(Item f in j.Files)files.Add(new Dictionary<string,object>{{"path",f.Path},{"before",f.Before},{"after",f.After},{"bytes",f.Bytes}});
   // Pending is committed only after every staged file and backup is durable.
   Atomic(Pending,utf8.GetBytes(Json().Serialize(new Dictionary<string,object>{{"schema",1},{"token",j.Token},{"version",j.Version},{"files",files}})));
   return j.Token;
  }catch{if(!File.Exists(Pending))ClearCompleted();throw;}
 }
 Journal ReadJournal(){
  Plain(tx);Plain(NewRoot);Plain(OldRoot);
  var d=Decode(Read(Pending,MaxEnvelope),MaxEnvelope);
  string token=Text(d,"token"),version=Text(d,"version");
  Require(Convert.ToInt32(Val(d,"schema"))==1&&Match(token,@"\A[a-f0-9]{32}\z")&&VersionValid(version),"Invalid recovery journal");
  var j=new Journal{Token=token,Version=version};var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(object raw in Seq(d,"files")){
   var f=Obj(raw);string name=Text(f,"path"),before=Text(f,"before"),after=Text(f,"after");object size=Val(f,"bytes");
   Require(name!=null&&allowed.Contains(name)&&seen.Add(name)&&(before==""||HashValid(before))&&HashValid(after)&&size is int&&(int)size>=1&&(int)size<=MaxFile,"Invalid recovery entry");
   Local(root,name,false);
   if(before!="")Require(FileHash(Local(OldRoot,name,false))==before,"Rollback backup corrupted");
   j.Files.Add(new Item{Path=name,Before=before,After=after,Bytes=(int)size});
  }
  Require(j.Files.Count>0&&j.Files.Count<=allowed.Count&&j.Files.Exists(f=>f.Path==ReleasePath),"Empty recovery plan");
  return j;
 }
 public void Apply(string token){
  var j=ReadJournal();Require(j.Token==token,"Transaction token");
  // Prevalidate every staged file and current installed hash before the first write.
  foreach(Item f in j.Files){
   string file=Local(NewRoot,f.Path,false);Require(FileHash(file)==f.After&&new FileInfo(file).Length==f.Bytes,"Staged integrity");
   Require(FileHash(Local(root,f.Path,false))==f.Before,"Installed integrity changed");
  }
  foreach(Item f in j.Files)Atomic(Local(root,f.Path,true),Read(Local(NewRoot,f.Path,false),MaxFile));
  foreach(Item f in j.Files)Require(FileHash(Local(root,f.Path,false))==f.After,"Installed verification");
 }
 public bool Recover(){
  Plain(tx);if(!File.Exists(Pending))return false;
  var j=ReadJournal(); // entire old backup set validated before any rollback writes
  foreach(Item f in j.Files){
   string dest=Local(root,f.Path,false);
   if(f.Before!="")Atomic(Local(root,f.Path,true),Read(Local(OldRoot,f.Path,false),MaxFile));
   else if(File.Exists(dest))File.Delete(dest);
  }
  foreach(Item f in j.Files)Require(FileHash(Local(root,f.Path,false))==f.Before,"Rollback verification");
  File.Delete(Pending);ClearCompleted();return true;
 }
 // Call only after the trusted host supplies an actual readiness proof. A crash
 // before this point leaves pending present, so the next startup restores old.
 public void Confirm(string readyToken,string readyVersion){
  var j=ReadJournal();Require(j.Token==readyToken&&j.Version==readyVersion,"Readiness identity");
  foreach(Item f in j.Files)Require(FileHash(Local(root,f.Path,false))==f.After,"Confirmation integrity");
  File.Delete(Pending);ClearCompleted();
 }
 // Isolated tests use an ephemeral RSA key and synthetic file bytes; no network,
 // executable launch, release key or actual classroom files.
 static int Main(string[] args){
  if(args.Length!=1||args[0]!="--ci-selftest"||Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true")return 2;
  string root=Path.Combine(Path.GetTempPath(),"hoja-native-update-test-"+Guid.NewGuid().ToString("N"));
  try{
   Dir(root);Dir(Path.Combine(root,"bin"));Dir(Path.Combine(root,"local"));Dir(Path.Combine(root,"local","TeacherToolsLocal"));
   string program="bin/HOJA-Native-Server.exe",release=ReleasePath;
   string p=Path.Combine(root,"bin","HOJA-Native-Server.exe"),r=Path.Combine(root,"local","TeacherToolsLocal","release.json"),data=Path.Combine(root,"local","TeacherToolsLocal","seating.json");
   byte[] oldProgram=Encoding.UTF8.GetBytes("old native bytes"),newProgram=Encoding.UTF8.GetBytes("new native bytes"),oldRelease=Encoding.UTF8.GetBytes("{\"version\":\"1.66.43\"}"),newRelease=Encoding.UTF8.GetBytes("{\"version\":\"1.66.44\"}");
   File.WriteAllBytes(p,oldProgram);File.WriteAllBytes(r,oldRelease);File.WriteAllText(data,"classroom-sentinel");
   using(var rsa=new RSACryptoServiceProvider(2048)){
    rsa.PersistKeyInCsp=false;
    var k=new NativeUpdateKernel(root,new[]{program,release});
    Require(!ProgramPath(@"bin/LICENSE\seating.json")&&!ProgramPath("local/TeacherToolsLocal/seating.json"),"Unsafe program path accepted");
    var files=new List<object>{new Dictionary<string,object>{{"path",program},{"sha256",Hash(newProgram)},{"bytes",newProgram.Length}},new Dictionary<string,object>{{"path",release},{"sha256",Hash(newRelease)},{"bytes",newRelease.Length}}};
    var manifest=new Dictionary<string,object>{{"schema","TT-NATIVE-SNAPSHOT-1"},{"channel","online-pilot"},{"kernel",1},{"version","1.66.44"},{"bases",new[]{Hash(oldRelease)}},{"files",files}};
    Func<byte[]> signed=()=>{
     byte[] bytes=Encoding.UTF8.GetBytes(Json().Serialize(manifest));
     return Encoding.UTF8.GetBytes(Json().Serialize(new Dictionary<string,object>{{"payload",Convert.ToBase64String(bytes)},{"signature",Convert.ToBase64String(rsa.SignData(bytes,"SHA256"))}}));
    };
    Func<string,int,byte[]> fetch=(sha,len)=>sha==Hash(newProgram)?newProgram:sha==Hash(newRelease)?newRelease:null;
    string key=rsa.ToXmlString(false);
    Action<Action> reject=action=>{bool denied=false;try{action();}catch(Exception){denied=true;}Require(denied,"Invalid update accepted");};
    byte[] good=signed();
    var bad=Json().Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(good));byte[] sig=Convert.FromBase64String((string)bad["signature"]);sig[0]^=1;bad["signature"]=Convert.ToBase64String(sig);
    reject(()=>k.Prepare(Encoding.UTF8.GetBytes(Json().Serialize(bad)),key,"1.66.43",fetch));
    using(var wrong=new RSACryptoServiceProvider(2048)){wrong.PersistKeyInCsp=false;reject(()=>k.Prepare(good,wrong.ToXmlString(false),"1.66.43",fetch));}
    reject(()=>k.Prepare(good,key,"1.66.44",fetch));
    manifest["bases"]=new[]{new string('0',64)};reject(()=>k.Prepare(signed(),key,"1.66.43",fetch));manifest["bases"]=new[]{Hash(oldRelease)};
    files.Add(new Dictionary<string,object>{{"path","local/TeacherToolsLocal/seating.json"},{"sha256",Hash(newProgram)},{"bytes",newProgram.Length}});
    reject(()=>k.Prepare(signed(),key,"1.66.43",fetch));files.RemoveAt(files.Count-1);
    reject(()=>k.Prepare(good,key,"1.66.43",(sha,len)=>new byte[len]));
    Require(!Directory.Exists(k.tx)&&FileHash(p)==Hash(oldProgram)&&FileHash(r)==Hash(oldRelease),"Rejected update touched files");
    string token=k.Prepare(good,key,"1.66.43",fetch);
    // Simulate power loss after only the first file replacement.
    Atomic(p,newProgram);Require(k.Recover(),"Interrupted transaction recovery");
    Require(FileHash(p)==Hash(oldProgram)&&FileHash(r)==Hash(oldRelease),"Partial rollback failed");
    token=k.Prepare(good,key,"1.66.43",fetch);k.Apply(token);
    reject(()=>k.Confirm(new string('0',32),"1.66.44"));
    Require(k.Recover()&&FileHash(p)==Hash(oldProgram)&&FileHash(r)==Hash(oldRelease),"Unconfirmed rollback failed");
    token=k.Prepare(good,key,"1.66.43",fetch);k.Apply(token);k.Confirm(token,"1.66.44");
    Require(!k.Recover()&&FileHash(p)==Hash(newProgram)&&FileHash(r)==Hash(newRelease)&&File.ReadAllText(data)=="classroom-sentinel","Committed update/data preservation");
    Console.WriteLine("PASS native RSA snapshot, wrong key/signature/base/downgrade/path/blob refusal, interrupted and unconfirmed rollback, committed update, data sentinel");
   }
   return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}finally{if(Directory.Exists(root))Directory.Delete(root,true);}
 }
}
