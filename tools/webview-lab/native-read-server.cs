// Phase 4A: isolated read-only HTTP server, no product port or writes.
using System;
using System.IO;
using System.IO.Compression;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using System.Threading;
internal static class NativeReadServer {
 static int Port=17450;
 static bool coinWrites;
 static readonly object LocalGate=new object(),WeekGate=new object();
 static readonly SemaphoreSlim ClientSlots=new SemaphoreSlim(16,16),RemoteSlots=new SemaphoreSlim(4,4);
 static string root,release,labRoot;
 static Dictionary<string,object> boardTheme;
 static DateTime themeAt;
 static readonly Encoding Utf8=new UTF8Encoding(false,true);
 static readonly Dictionary<string,string> Assets=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase){
  {"/","dashboard.html"},{"/index.html","dashboard.html"},{"/seating-inbox","seating-inbox.html"},
  {"/school.js","school.js"},{"/coins.js","coins.js"},{"/coins-ui.js","coins-ui.js"},{"/update-ui.js","update-ui.js"},{"/podo.js","podo.js"},{"/handmade-paper.png","handmade-paper.png"}
 };
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr h,uint mask,uint flags);
 static void NoInherit(Socket s){if(!SetHandleInformation(s.Handle,1,0))throw new IOException("Socket inheritance");}
 static string ReadLine(Stream s,ref int budget){
  var b=new List<byte>();while(true){int c=s.ReadByte();if(c<0)throw new EndOfStreamException();if(--budget<0||b.Count>8192)throw new IOException("Header limit");if(c==10){if(b.Count==0||b[b.Count-1]!=13)throw new IOException("CRLF");b.RemoveAt(b.Count-1);return Encoding.ASCII.GetString(b.ToArray());}if(c>127||c==0)throw new IOException("Header encoding");b.Add((byte)c);}
 }
 static string Get(Dictionary<string,string> h,string key){string v;return h.TryGetValue(key,out v)?v:"";}
 static string Sha(byte[] b){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
 static byte[] Read(string name){
  string p=Path.Combine(root,name);if((File.GetAttributes(root)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked root");
  if(!File.Exists(p))return null;var f=new FileInfo(p);if((f.Attributes&FileAttributes.ReparsePoint)!=0||f.Length>64L*1024*1024)throw new IOException("Unsafe file");return File.ReadAllBytes(p);
 }
 static string Type(string name){if(name.EndsWith(".html"))return "text/html; charset=utf-8";if(name.EndsWith(".js"))return "text/javascript; charset=utf-8";if(name.EndsWith(".png"))return "image/png";return "image/webp";}
 static void Reply(Stream s,string status,string type,byte[] bytes,string extra=""){
  byte[] h=Encoding.ASCII.GetBytes("HTTP/1.1 "+status+"\r\nContent-Type: "+type+"\r\nContent-Length: "+bytes.Length+"\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n"+extra+"\r\n");s.Write(h,0,h.Length);s.Write(bytes,0,bytes.Length);s.Flush();
 }
 static void Json(Stream s,string status,string body){Reply(s,status,"application/json; charset=utf-8",Utf8.GetBytes(body));}
 static object Val(Dictionary<string,object> d,string key){object v;return d!=null&&d.TryGetValue(key,out v)?v:null;}
 static Dictionary<string,object> Obj(object v){return v as Dictionary<string,object>;}
 static object[] Arr(object v){return v as object[]??new object[0];}
 static bool Id(object v){return v is string&&Regex.IsMatch((string)v,"^[A-Za-z0-9_-]{1,160}$");}
 static bool Label(object v){return v is string&&!String.IsNullOrWhiteSpace((string)v)&&((string)v).Length<=80;}
 static bool True(object v){return v is bool&&(bool)v;}
 static bool IntValue(object v,long low,long high){return (v is int||v is long)&&Convert.ToInt64(v)>=low&&Convert.ToInt64(v)<=high;}
 static JavaScriptSerializer Serializer(){return new JavaScriptSerializer(){MaxJsonLength=8388608,RecursionLimit=100};}
 // Explicit lab-only crash checkpoint; never used without the disposable write fixture.
 static void CrashCheckpoint(string name,string stage){
  if(!coinWrites||!File.Exists(Path.Combine(labRoot,"coin-write-fixture.flag")))return;
  string control=Path.Combine(labRoot,"native-crash-control");
  if(!File.Exists(control)||File.ReadAllText(control).Trim()!=name+":"+stage)return;
  File.WriteAllText(Path.Combine(labRoot,"native-crash-reached"),name+":"+stage,Utf8);
  // Harness must kill this exact process. Timeout fails closed before any further work.
  Thread.Sleep(15000);throw new IOException("Crash injection timed out");
 }
 static void ClearAbandonedWrites(){
  // Called only after successfully binding the isolated exclusive listener.
  foreach(string name in new[]{"coins.log","seating.json","notice.log","school.json","weather-place.json","weather-cache.json","photos.txt","audio-lab.json","share-input.json"}){
   foreach(string file in Directory.GetFiles(root,name+".native-*.tmp",SearchOption.TopDirectoryOnly)){
    if(!Regex.IsMatch(Path.GetFileName(file),"^"+Regex.Escape(name)+@"\.native-[a-f0-9]{32}\.tmp$"))continue;
    if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked staging file");
    File.Delete(file);
   }
  }
 }
 static void AtomicWrite(string name,byte[] data){
  string dest=Path.Combine(root,name),tmp=dest+".native-"+Guid.NewGuid().ToString("N")+".tmp";
  // Read validates any existing file before replacing it.
  Read(name);
  try{
   using(var f=new FileStream(tmp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){f.Write(data,0,data.Length);f.Flush(true);}
   CrashCheckpoint(name,"before");
   if(File.Exists(dest))File.Replace(tmp,dest,null);else File.Move(tmp,dest);
   CrashCheckpoint(name,"after");
  }finally{if(File.Exists(tmp))File.Delete(tmp);}
 }
 static Dictionary<string,object> MergeRoster(Dictionary<string,object> x,Dictionary<string,object> old){
  if(!IntValue(Val(x,"rosterProtocol"),1,1)||!Id(Val(x,"classId"))||!Label(Val(x,"className")))throw new FormatException("Roster identity");
  var input=Arr(Val(x,"roster"));
  if(input.Length<1||input.Length>100)throw new FormatException("Roster size");
  var ids=new Dictionary<string,Dictionary<string,object>>(StringComparer.Ordinal);
  var nums=new HashSet<long>();var roster=new List<object>();var genders=new Dictionary<string,object>(StringComparer.Ordinal);
  foreach(object value in input){
   var row=Obj(value);object id=Val(row,"id"),name=Val(row,"name"),gender=Val(row,"gender"),excluded=Val(row,"excluded"),number=Val(row,"number");
   if(!Id(id)||!Label(name)||!(gender is string)||((string)gender!="male"&&(string)gender!="female"&&(string)gender!="none")||!(excluded is bool)||!IntValue(number,1,10000)||ids.ContainsKey((string)id)||!nums.Add(Convert.ToInt64(number)))throw new FormatException("Roster member");
   var clean=new Dictionary<string,object>{{"id",id},{"name",name},{"gender",gender},{"excluded",excluded},{"number",number}};
   ids.Add((string)id,clean);roster.Add(clean);genders.Add((string)id,gender);
  }
  var result=new Dictionary<string,object>();
  bool same=old!=null&&String.Equals(Val(old,"classId") as string,(string)Val(x,"classId"),StringComparison.Ordinal)&&Val(old,"layout")!=null&&Arr(Val(old,"assignments")).Length>0;
  bool genderSeats=false;
  if(same){
   foreach(string key in new[]{"layout","groups","teacherAvatar"})if(Val(old,key)!=null)result.Add(key,Val(old,key));
   var assignments=new List<object>();var assigned=new HashSet<string>(StringComparer.Ordinal);
   foreach(object value in Arr(Val(old,"assignments"))){
    var a=Obj(value);string id=Val(a,"studentId") as string;
    if(id!=null&&ids.ContainsKey(id)&&!True(Val(ids[id],"excluded"))){assignments.Add(a);assigned.Add(id);}
   }
   var students=new List<object>();
   foreach(object value in Arr(Val(old,"students"))){
    var student=Obj(value);string id=Val(student,"id") as string;
    if(id!=null&&assigned.Contains(id)){student["name"]=Val(ids[id],"name");students.Add(student);}
   }
   result["assignments"]=assignments;result["students"]=students;
   result["pairReactions"]=new object[0];result["previousAssignments"]=new object[0];result["historyTransition"]=false;result["previousRound"]=null;
   genderSeats=True(Val(Obj(Val(old,"practice")),"genderSeats"));
  }else{
   result["rosterOnly"]=true;result["students"]=new object[0];result["assignments"]=new object[0];result["groups"]=new object[0];
  }
  result["groupProtocol"]=1;result["practice"]=new Dictionary<string,object>{{"genderSeats",genderSeats},{"genders",genders}};
  result["classId"]=Val(x,"classId");result["className"]=Val(x,"className");result["roster"]=roster;
  return result;
 }
 static void SaveSeating(Stream s,byte[] payload,bool roster){
  byte[] next;
  try{
   if(roster&&payload.Length>65536){Json(s,"400 Bad Request","{\"error\":\"size\"}");return;}
   string text=Utf8.GetString(Convert.FromBase64String(Encoding.ASCII.GetString(payload)));
   var json=Serializer();var input=Obj(json.DeserializeObject(text));
   if(roster){
    byte[] old=Read("seating.json");
    var previous=old==null?null:Obj(json.DeserializeObject(Utf8.GetString(old).TrimStart('\uFEFF')));
    next=Utf8.GetBytes(json.Serialize(MergeRoster(input,previous)));
   }else{
    if(Arr(Val(input,"assignments")).Length==0||Arr(Val(input,"students")).Length==0||Obj(Val(input,"layout"))==null){Json(s,"400 Bad Request","{\"error\":\"invalid seating\"}");return;}
    next=Utf8.GetBytes(text);
   }
  }catch(Exception e){if(!(e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;
   if(roster)Json(s,"400 Bad Request","{\"error\":\"roster rejected\"}");
   else Json(s,"502 Bad Gateway","{\"code\":\"UPSTREAM_ERROR\",\"error\":\"온라인 자료를 가져오지 못했습니다. 인터넷 연결 및 나이스 API 상태를 확인하세요.\"}");return;
  }
  AtomicWrite("seating.json",next);Json(s,"200 OK","{\"ok\":true}");
 }
 static void AppendNotice(Stream s,byte[] payload){
  byte[] next;
  try{
   string text=Utf8.GetString(Convert.FromBase64String(Encoding.ASCII.GetString(payload)));
   if(Obj(Serializer().DeserializeObject(text))==null)throw new FormatException("Notice object");
   byte[] old=Read("notice.log")??new byte[0];
   byte[] append=Utf8.GetBytes(text+"\n");
   if(old.LongLength+append.LongLength>64L*1024*1024)throw new FormatException("Notice log limit");
   using(var m=new MemoryStream()){m.Write(old,0,old.Length);m.Write(append,0,append.Length);next=m.ToArray();}
  }catch(Exception e){if(!(e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;Json(s,"502 Bad Gateway","{\"code\":\"UPSTREAM_ERROR\",\"error\":\"온라인 자료를 가져오지 못했습니다. 인터넷 연결 및 나이스 API 상태를 확인하세요.\"}");return;}
  AtomicWrite("notice.log",next);Json(s,"200 OK","{\"ok\":true}");
 }
 static void AppendCoins(Stream s,Dictionary<string,string> h,byte[] payload){
  // One accept loop serializes the revision comparison and the durable atomic replacement.
  byte[] old=Read("coins.log")??new byte[0];
  string revision=Get(h,"X-TT-Coin-Revision"),seat=Get(h,"X-TT-Seating-Revision");
  if(!Regex.IsMatch(revision,"^[a-f0-9]{64}$")){Json(s,"428 Precondition Required","{\"error\":\"revision_required\"}");return;}
  if(revision!=Sha(old)||(Regex.IsMatch(seat,"^[a-f0-9]{64}$")&&seat!=Sha(Read("seating.json")??new byte[0]))){Json(s,"409 Conflict","{\"error\":\"stale_snapshot\"}");return;}
  byte[] next;
  try{
   string text=Utf8.GetString(Convert.FromBase64String(Encoding.ASCII.GetString(payload)));
   var lines=new List<string>();var json=new JavaScriptSerializer(){MaxJsonLength=8388608,RecursionLimit=100};
   foreach(string line in text.Split('\n')){
    if(String.IsNullOrWhiteSpace(line))continue;
    if(!(json.DeserializeObject(line) is Dictionary<string,object>))throw new FormatException("Coin row");
    lines.Add(line);if(lines.Count>1000)throw new FormatException("Batch size");
   }
   if(lines.Count==0)throw new FormatException("Empty batch");
   using(var m=new MemoryStream()){
    m.Write(old,0,old.Length);if(old.Length>0&&old[old.Length-1]!=10)m.WriteByte(10);
    byte[] append=Utf8.GetBytes(String.Join("\n",lines.ToArray())+"\n");
    m.Write(append,0,append.Length);next=m.ToArray();
   }
   if(next.Length>64L*1024*1024)throw new FormatException("Lab ledger limit");
  }catch(Exception e){if(!(e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;Json(s,"502 Bad Gateway","{\"code\":\"UPSTREAM_ERROR\",\"error\":\"온라인 자료를 가져오지 못했습니다. 인터넷 연결 및 나이스 API 상태를 확인하세요.\"}");return;}
  AtomicWrite("coins.log",next);
  Reply(s,"200 OK","application/json; charset=utf-8",Utf8.GetBytes("{\"ok\":true}"),"X-TT-Coin-Revision: "+Sha(next)+"\r\n");
 }
 static bool ManagerOrigin(string o){return o=="https://xkdtndbrwk111-prog.github.io"||o=="http://127.0.0.1:4192"||o=="http://localhost:4192"||o=="http://127.0.0.1:4188"||o=="http://localhost:4188";}
 static string Cors(string origin){return ManagerOrigin(origin)?"Access-Control-Allow-Origin: "+origin+"\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Private-Network: true\r\nVary: Origin, Access-Control-Request-Private-Network\r\n":"";}
 static void CorsJson(Stream s,string status,string body,string origin){Reply(s,status,"application/json; charset=utf-8",Utf8.GetBytes(body),Cors(origin));}
 static Dictionary<string,object> BoardStatus(){
  bool online=false;string mode="";object screen=null;
  try{
   string file=Path.Combine(root,"board-mode.json");
   byte[] raw=Read("board-mode.json");
   if(raw!=null&&(DateTime.UtcNow-File.GetLastWriteTimeUtc(file)).TotalSeconds<13){
    var b=Obj(Serializer().DeserializeObject(Utf8.GetString(raw).TrimStart('\uFEFF')));
    string m=Val(b,"mode") as string;
    if((m=="window"||m=="wallpaper")&&Equals(Val(b,"release"),release)&&IntValue(Val(b,"window"),1,Int64.MaxValue)&&IntValue(Val(b,"pid"),1,Int32.MaxValue)){
     using(var p=Process.GetProcessById(Convert.ToInt32(Val(b,"pid")))){online=!p.HasExited;}
     if(online)mode=m;
    }
   }
  }catch{online=false;mode="";}
  if(online)try{
   byte[] raw=Read("display.txt");string device=raw==null?"":Utf8.GetString(raw).Trim();
   var selected=System.Windows.Forms.Screen.PrimaryScreen;
   foreach(var candidate in System.Windows.Forms.Screen.AllScreens)if(String.Equals(candidate.DeviceName,device,StringComparison.OrdinalIgnoreCase)){selected=candidate;break;}
   if(selected!=null){var r=selected.Bounds;screen=new Dictionary<string,object>{{"left",r.X},{"top",r.Y},{"width",r.Width},{"height",r.Height}};}
  }catch{}
  // Do not advertise presentation until its protocol is implemented and tested.
  return new Dictionary<string,object>{{"service","teacher-tools-local"},{"version",40},{"coinProtocol",3},{"presentationProtocol",1},{"presentationReady",PresentReady()},{"rosterProtocol",1},{"wallpaper",online},{"mode",mode},{"screen",screen}};
 }
 static void PublishTheme(Stream s,byte[] payload){
  if(payload.Length>2048){Json(s,"400 Bad Request","{\"error\":\"size\"}");return;}
  try{
   var x=Obj(Serializer().DeserializeObject(Utf8.GetString(payload)));string theme=Val(x,"theme") as string,font=Val(x,"font") as string;
   if(!IntValue(Val(x,"version"),1,1)||theme==null||Array.IndexOf(new[]{"dark","sky","pink","green","black","custom"},theme)<0||font==null||font.Length>=60||!Regex.IsMatch(font,@"^[\p{L}\p{N} ._()-]*$"))throw new FormatException("Theme");
   var output=new Dictionary<string,object>{{"version",1},{"theme",theme},{"font",font}};
   if(theme=="custom"){
    var colors=new Dictionary<string,object>();var c=Obj(Val(x,"custom"));
    foreach(string k in new[]{"bg","panel","text","accent","modal"}){
     string value=Val(c,k) as string;if(value==null||!Regex.IsMatch(value,"^#[a-fA-F0-9]{6}$"))throw new FormatException("Color");colors[k]=value.ToLowerInvariant();
    }output["custom"]=colors;
   }
   boardTheme=output;themeAt=DateTime.UtcNow;Json(s,"200 OK","{\"ok\":true}");
  }catch(Exception e){if(!(e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;Json(s,"400 Bad Request","{\"error\":\"invalid theme\"}");}
 }
 // Presentation payloads and receipts are transient, never written to disk.
 sealed class Receipt {public string State;public DateTime Time;}
 static readonly Dictionary<string,Receipt> receipts=new Dictionary<string,Receipt>(StringComparer.Ordinal);
 static string presentId;
 static Dictionary<string,object> presentData;
 static DateTime presentUntil,lastBoard;
 static bool PresentReady(){
  try{
   string file=Path.Combine(root,"presentation-assets.zip");
   return coinWrites&&(DateTime.UtcNow-lastBoard).TotalSeconds<5&&File.Exists(file)&&(File.GetAttributes(file)&FileAttributes.ReparsePoint)==0;
  }catch{return false;}
 }
 static bool PresentId(string id){return id!=null&&Regex.IsMatch(id,@"\A[a-f0-9]{32}\z");}
 static void SetReceipt(string id,string state){
  if(!PresentId(id))return;
  DateTime now=DateTime.UtcNow;
  receipts[id]=new Receipt{State=state,Time=now};
  var remove=new List<string>();foreach(var pair in receipts)if((now-pair.Value.Time).TotalMinutes>5)remove.Add(pair.Key);
  foreach(var key in remove)receipts.Remove(key);
  while(receipts.Count>64){
   string oldest=null;DateTime time=DateTime.MaxValue;
   foreach(var pair in receipts)if(pair.Value.Time<time){oldest=pair.Key;time=pair.Value.Time;}
   receipts.Remove(oldest);
  }
 }
 static void ClearPresent(string state){if(presentId!=null)SetReceipt(presentId,state);presentId=null;presentData=null;}
 static void ExpirePresent(){if(presentId!=null&&(DateTime.UtcNow>presentUntil||!PresentReady()))ClearPresent("expired");}
 static string PresentCors(string origin){return ManagerOrigin(origin)?"Access-Control-Allow-Origin: "+origin+"\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\nVary: Origin, Access-Control-Request-Private-Network\r\n":"";}
 static void PresentReply(Stream s,string status,string body,string origin=""){Reply(s,status,"application/json; charset=utf-8",Utf8.GetBytes(body),PresentCors(origin));}
 static void Presentation(Stream s,string path,string target,string method,string site,string origin,byte[] payload){
  const string bad="{\"error\":\"invalid presentation\"}";
  const string denied="{\"error\":\"forbidden\"}";
  bool managerRoute=path=="/api/presentation/send"||path=="/api/presentation/receipt"||path=="/api/presentation/close";
  if(managerRoute){
   if(!ManagerOrigin(origin)){PresentReply(s,"403 Forbidden",denied);return;}
   ExpirePresent();
   if(method=="OPTIONS"){PresentReply(s,"204 No Content","",origin);return;}
   if(path=="/api/presentation/receipt"){
    var m=Regex.Match(target,@"\A/api/presentation/receipt\?id=([a-f0-9]{32})\z");
    if(method!="GET"||!m.Success){PresentReply(s,"400 Bad Request",bad,origin);return;}
    Receipt receipt;string state=receipts.TryGetValue(m.Groups[1].Value,out receipt)?receipt.State:"expired";
    PresentReply(s,"200 OK","{\"state\":\""+state+"\"}",origin);return;
   }
   if(method!="POST"){PresentReply(s,"400 Bad Request",bad,origin);return;}
   if(path=="/api/presentation/close"){
    string id=Encoding.ASCII.GetString(payload);
    if(!PresentId(id)){PresentReply(s,"400 Bad Request",bad,origin);return;}
    if(id==presentId)ClearPresent("closed");
    PresentReply(s,"200 OK","{\"ok\":true}",origin);return;
   }
   if(!PresentReady()){PresentReply(s,"409 Conflict","{\"error\":\"board unavailable\"}",origin);return;}
   try{
    if(payload.Length>240000)throw new FormatException();
    var item=Obj(Serializer().DeserializeObject(Utf8.GetString(Convert.FromBase64String(Encoding.ASCII.GetString(payload)))));
    string id=Val(item,"id") as string,kind=Val(item,"kind") as string;object data=Val(item,"payload");
    if(item==null||item.Count!=3||!PresentId(id)||Array.IndexOf(new[]{"seating","pe","life-qr"},kind)<0||data==null)throw new FormatException();
    if(receipts.ContainsKey(id)){PresentReply(s,"409 Conflict","{\"error\":\"duplicate\"}",origin);return;}
    ClearPresent("superseded");presentId=id;presentData=new Dictionary<string,object>{{"kind",kind},{"payload",data}};presentUntil=DateTime.UtcNow.AddSeconds(35);
    SetReceipt(id,"pending");PresentReply(s,"200 OK","{\"id\":\""+id+"\"}",origin);return;
   }catch(Exception e){if(!(e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;PresentReply(s,"400 Bad Request",bad,origin);return;}
  }
  if(site!="same-origin"||(origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)){PresentReply(s,"403 Forbidden",denied);return;}
  if(path=="/api/presentation/poll"&&method=="GET"){
   ExpirePresent();lastBoard=DateTime.UtcNow;
   PresentReply(s,"200 OK",presentId==null?"{\"id\":null}":Serializer().Serialize(new Dictionary<string,object>{{"id",presentId},{"data",presentData}}));return;
  }
  if(path=="/api/presentation/ack"&&method=="POST"){
   var m=Regex.Match(Encoding.ASCII.GetString(payload),@"\A([a-f0-9]{32}):(displayed|failed|closed)\z");
   if(!m.Success){PresentReply(s,"400 Bad Request",bad);return;}
   if(presentId==null||m.Groups[1].Value!=presentId){PresentReply(s,"409 Conflict","{\"error\":\"stale\"}");return;}
   string state=m.Groups[2].Value;
   if(state=="displayed"){presentUntil=DateTime.UtcNow.AddMinutes(90);SetReceipt(presentId,state);}else ClearPresent(state);
   PresentReply(s,"200 OK","{\"ok\":true}");return;
  }
  PresentReply(s,"400 Bad Request",bad);
 }
 static void PresentationAsset(Stream s,string path,string method,string site){
  if(method!="GET"||(site!=""&&site!="same-origin"&&site!="none")){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  if(!Regex.IsMatch(path,@"\A/presentation(?:-board\.(?:js|css)|/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:html|css|js|mjs|png|svg|txt))\z")||path.Contains("..")){Json(s,"404 Not Found","{\"error\":\"not found\"}");return;}
  string ext=Path.GetExtension(path),mime=ext==".html"?"text/html; charset=utf-8":ext==".css"?"text/css; charset=utf-8":ext==".js"||ext==".mjs"?"text/javascript; charset=utf-8":ext==".png"?"image/png":ext==".svg"?"image/svg+xml":"text/plain; charset=utf-8";
  byte[] data=null;
  if(path=="/presentation-board.js"||path=="/presentation-board.css")data=Read(path.Substring(1));
  else try{
   string zip=Path.Combine(root,"presentation-assets.zip");
   if(File.Exists(zip)&&(File.GetAttributes(zip)&FileAttributes.ReparsePoint)==0){
    using(var archive=ZipFile.OpenRead(zip)){
     string key=path.Substring("/presentation/".Length);
     var entry=archive.GetEntry(key);
     if(entry==null&&Regex.IsMatch(key,@"\Ashared/assets/(?:playback|students|teacher)/[A-Za-z0-9_-]+\.png\z")){
      entry=archive.GetEntry(key.Substring(0,key.Length-4)+".webp");if(entry!=null)mime="image/webp";
     }
     if(entry!=null&&entry.Length<=2097152){
      using(var input=entry.Open())using(var output=new MemoryStream()){
       var buffer=new byte[8192];int n;
       while((n=input.Read(buffer,0,buffer.Length))>0){if(output.Length+n>2097152)throw new InvalidDataException("Asset limit");output.Write(buffer,0,n);}
       data=output.ToArray();
      }
     }
    }
   }
  }catch(InvalidDataException){}catch(IOException){}
  if(data==null){Json(s,"404 Not Found","{\"error\":\"not found\"}");return;}
  Reply(s,"200 OK",mime,data);
 }
 // Phase 4D-1: pure NEIS parsing and school configuration. The lab's provider
 // accepts only exact, pre-seeded fixture responses; never contacts the Internet.
 const string SheetTemplate="1-vejhJz909ivFnhzNRkpbd31BSJsElEPzXUYkONdJRQ";
 static string TextVal(Dictionary<string,object> d,string k){return Val(d,k) as string??"";}
 static bool MatchFull(string value,string pattern){return Regex.IsMatch(value,@"\A(?:"+pattern+@")\z",RegexOptions.CultureInvariant);}
 static Dictionary<string,object> School(){
  byte[] data=Read("school.json");if(data==null)return null;
  try{return Obj(Serializer().DeserializeObject(Utf8.GetString(data).TrimStart('\uFEFF')));}catch(ArgumentException){return null;}catch(InvalidOperationException){return null;}
 }
 static bool ValidSchool(Dictionary<string,object> x){
  return x!=null&&MatchFull(TextVal(x,"office"),"[A-Z][0-9]{2}")&&MatchFull(TextVal(x,"code"),"[0-9]{7}")&&TextVal(x,"name").Length>=1&&TextVal(x,"name").Length<=60&&MatchFull(TextVal(x,"grade"),"[0-9]{0,2}")&&MatchFull(TextVal(x,"cls"),@"[0-9A-Za-z\uAC00-\uD7A3]{0,4}")&&MatchFull(TextVal(x,"sheet"),"[A-Za-z0-9_-]{20,80}|");
 }
 static void SchoolWrite(Stream s,byte[] payload){
  try{
   if(payload.Length>65536)throw new FormatException("School size");
   string raw=Utf8.GetString(Convert.FromBase64String(Encoding.ASCII.GetString(payload)));
   var x=Obj(Serializer().DeserializeObject(raw));
   if(!ValidSchool(x))throw new FormatException("School data");
   AtomicWrite("school.json",Utf8.GetBytes(raw));
   lock(WeekGate){schoolGeneration++;timetableCache.Clear();}
   placeGeneration++;
   string weather=Path.Combine(root,"weather-place.json");
   if(File.Exists(weather)&&(File.GetAttributes(weather)&FileAttributes.ReparsePoint)==0)File.Delete(weather);
   Json(s,"200 OK","{\"ok\":true}");
  }catch(Exception e){if(!(e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;Json(s,"400 Bad Request","{\"error\":\"invalid school\"}");}
 }
 static Dictionary<string,string> Query(string target){
  var q=new Dictionary<string,string>(StringComparer.Ordinal);int i=target.IndexOf('?');
  if(i<0||i==target.Length-1)return q;
  if(target.Length-i>4096)throw new FormatException("Query size");
  foreach(string part in target.Substring(i+1).Split('&')){
   int eq=part.IndexOf('=');if(eq<1)throw new FormatException("Query");
   string key=part.Substring(0,eq),value=part.Substring(eq+1);
   if(!MatchFull(key,"[A-Za-z_]+")||Regex.IsMatch(value,@"%(?![0-9A-Fa-f]{2})")||q.ContainsKey(key))throw new FormatException("Query");
   value=Uri.UnescapeDataString(value.Replace("+","%20"));
   if(Regex.IsMatch(value,@"[\x00-\x1f\x7f]"))throw new FormatException("Query control");
   q.Add(key,value);
  }return q;
 }
 // The provider constructs its own HTTPS URLs. No caller-supplied URL, credentials,
 // redirects, cookies, or certificate-validation bypass.
 const string ForecastTail="&current=temperature_2m,weather_code,wind_speed_10m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=5";
 const string AirTail="&current=pm10,pm2_5&hourly=pm10,pm2_5&timezone=Asia%2FSeoul&forecast_days=5";
 static Uri UpstreamUri(string endpoint,string query){
  if(endpoint=="met"){
   if(!Regex.IsMatch(query,@"\Alat=[0-9]{2}\.[0-9]{4}&lon=[0-9]{3}\.[0-9]{4}\z"))throw new FormatException("MET query");
   return new Uri("https://api.met.no/weatherapi/locationforecast/2.0/compact?"+query);
  }
  if(endpoint=="forecast"||endpoint=="air"){
   string tail=endpoint=="forecast"?ForecastTail:AirTail;
   if(!query.EndsWith(tail,StringComparison.Ordinal)||!Regex.IsMatch(query.Substring(0,query.Length-tail.Length),@"\Alatitude=[0-9]{2}\.[0-9]{4}&longitude=[0-9]{3}\.[0-9]{4}\z"))throw new FormatException("Weather query");
   return new Uri((endpoint=="forecast"?"https://api.open-meteo.com/v1/forecast?":"https://air-quality-api.open-meteo.com/v1/air-quality?")+query);
  }
  if(endpoint=="places"){
   if(query.Length>1024||!Regex.IsMatch(query,@"\Aformat=json&limit=[1-5]&countrycodes=kr&accept-language=ko&q=[A-Za-z0-9_%.-]+\z"))throw new FormatException("Place query");
   return new Uri("https://nominatim.openstreetmap.org/search?"+query);
  }
  if(endpoint=="sheet"){
   if(!Regex.IsMatch(query,@"\A[A-Za-z0-9_-]{20,80}/(?:htmlview|gviz/tq\?tqx=out:json&headers=0&gid=[0-9]{1,20}&range=A1:F30)\z"))throw new FormatException("Sheet route");
   return new Uri("https://docs.google.com/spreadsheets/d/"+query);
  }
  if(Array.IndexOf(new[]{"schoolInfo","mealServiceDietInfo","SchoolSchedule","elsTimetable","misTimetable","hisTimetable"},endpoint)<0)throw new FormatException("NEIS endpoint");
  if(query.Length>4096||!Regex.IsMatch(query,@"\A[A-Za-z0-9_%=&.-]+\z"))throw new FormatException("NEIS query");
  return new Uri("https://open.neis.go.kr/hub/"+endpoint+"?Type=json&pSize=100&"+query);
 }
 [ThreadStatic] static Stopwatch upstreamBudget;
 static string HttpsText(Uri uri){
  if(uri.Scheme!="https"||uri.Port!=443||uri.UserInfo!=""||uri.Fragment!=""||(uri.Host!="open.neis.go.kr"&&uri.Host!="docs.google.com"&&uri.Host!="nominatim.openstreetmap.org"&&uri.Host!="api.open-meteo.com"&&uri.Host!="air-quality-api.open-meteo.com"&&uri.Host!="api.met.no"))throw new FormatException("Upstream origin");
  const int limit=2097152;
  int remaining=upstreamBudget==null?9000:Math.Min(9000,30000-(int)upstreamBudget.ElapsedMilliseconds);
  if(remaining<1)throw new IOException("Upstream budget exhausted");
  var request=(HttpWebRequest)WebRequest.Create(uri);
  request.Method="GET";request.Timeout=remaining;request.ReadWriteTimeout=remaining;
  request.AllowAutoRedirect=false;request.AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate;
  request.UserAgent=uri.Host=="api.met.no"?"HOJA-Board/1.66.5 (contact: xkdtndbrwk111@gmail.com)":uri.Host=="nominatim.openstreetmap.org"?"TeacherTools/1.26 (classroom dashboard)":"TeacherTools-WebView-Lab/1.0";request.Accept="application/json, text/html";
  // Use OS certificate trust and configured proxy. Never opt out of certificate validation.
  request.KeepAlive=false;request.UseDefaultCredentials=false;request.Credentials=null;
  using(var abort=new System.Threading.Timer(_=>{try{request.Abort();}catch{}},null,remaining,Timeout.Infinite)){
   try{
    using(var response=(HttpWebResponse)request.GetResponse()){
     if(response.StatusCode!=HttpStatusCode.OK||response.ContentLength>limit)throw new IOException("Upstream response");
     using(var input=response.GetResponseStream())using(var output=new MemoryStream()){
      byte[] buffer=new byte[8192];int n;
      while((n=input.Read(buffer,0,buffer.Length))>0){if(output.Length+n>limit)throw new IOException("Upstream response too large");output.Write(buffer,0,n);}
      return Utf8.GetString(output.ToArray()).TrimStart('\uFEFF');
     }
    }
   }catch(WebException e){throw new IOException("Upstream unavailable",e);}
  }
 }
 static string ProviderText(string endpoint,string query){
  // Fixtures and live HTTPS are mutually exclusive; no fallback from missing fixture
  // to the real network. Live mode must be explicitly enabled in this isolated root.
  Uri uri=UpstreamUri(endpoint,query);
  bool fixture=File.Exists(Path.Combine(labRoot,"neis-fixture.flag")),live=File.Exists(Path.Combine(labRoot,"neis-live.flag"));
  if(fixture&&live)throw new IOException("Ambiguous upstream provider");
  if(fixture)return NeisFixture(endpoint,query);
  if(coinWrites&&live)return HttpsText(uri);
  throw new IOException("NEIS lab provider not configured");
 }
 static string NeisFixture(string endpoint,string query){
  if(!coinWrites||!File.Exists(Path.Combine(labRoot,"neis-fixture.flag")))throw new IOException("NEIS lab provider not configured");
  string dir=Path.Combine(labRoot,"neis-fixtures");
  if(!Directory.Exists(dir)||(File.GetAttributes(dir)&FileAttributes.ReparsePoint)!=0)throw new IOException("Fixture directory");
  string name=Sha(Utf8.GetBytes(endpoint+"?"+query))+".json",file=Path.Combine(dir,name);
  if(!File.Exists(file))throw new IOException("Missing NEIS fixture");
  var info=new FileInfo(file);if((info.Attributes&FileAttributes.ReparsePoint)!=0||info.Length>2097152)throw new IOException("Unsafe fixture");
  // Delay is lab-only and exact-request scoped; never reachable from HTTP parameters.
  string delay=file+".delay";
  if(File.Exists(delay)){
   int milliseconds;
   if((File.GetAttributes(delay)&FileAttributes.ReparsePoint)!=0||!Int32.TryParse(File.ReadAllText(delay).Trim(),out milliseconds)||milliseconds<0||milliseconds>5000)throw new IOException("Fixture delay");
   File.WriteAllText(file+".entered","entered",Utf8);
   Thread.Sleep(milliseconds);
  }
  return Utf8.GetString(File.ReadAllBytes(file)).TrimStart('\uFEFF');
 }
 sealed class NeisTable {public int Total;public List<Dictionary<string,object>> Rows=new List<Dictionary<string,object>>();}
 static NeisTable Neis(string endpoint,string query,Dictionary<string,object> school=null){
  if(Array.IndexOf(new[]{"schoolInfo","mealServiceDietInfo","SchoolSchedule","elsTimetable","misTimetable","hisTimetable"},endpoint)<0)throw new FormatException("Endpoint");
  if(school!=null){if(!ValidSchool(school))throw new FormatException("School");query="ATPT_OFCDC_SC_CODE="+TextVal(school,"office")+"&SD_SCHUL_CODE="+TextVal(school,"code")+"&"+query;}
  var x=Obj(Serializer().DeserializeObject(ProviderText(endpoint,query)));if(x==null)throw new FormatException("NEIS envelope");
  var result=Obj(Val(x,"RESULT"));if(result!=null&&TextVal(result,"CODE")!="INFO-200")throw new IOException("NEIS response error");
  var table=Arr(Val(x,endpoint));var output=new NeisTable();
  if(table.Length<2)return output;
  var head=Arr(Val(Obj(table[0]),"head"));
  if(head.Length>0){int n;object count=Val(Obj(head[0]),"list_total_count");if(Int32.TryParse(Convert.ToString(count,CultureInfo.InvariantCulture),out n))output.Total=n;}
  foreach(var row in Arr(Val(Obj(table[1]),"row"))){var d=Obj(row);if(d!=null)output.Rows.Add(d);}
  return output;
 }
 static string Ymd(DateTime d){return d.ToString("yyyyMMdd",CultureInfo.InvariantCulture);}
 static bool DateValue(string value,out DateTime date){return DateTime.TryParseExact(value,"yyyyMMdd",CultureInfo.InvariantCulture,DateTimeStyles.None,out date);}
 static bool Weekday(DateTime d){return d.DayOfWeek!=DayOfWeek.Saturday&&d.DayOfWeek!=DayOfWeek.Sunday;}
 static List<Dictionary<string,object>> Meals(List<Dictionary<string,object>> rows,DateTime start){
  var ordered=new SortedDictionary<string,Dictionary<string,object>>(StringComparer.Ordinal);
  foreach(var row in rows){string day=TextVal(row,"MLSV_YMD");DateTime d;if(!DateValue(day,out d)||d<start||!Weekday(d)||String.IsNullOrEmpty(TextVal(row,"DDISH_NM")))continue;if(!ordered.ContainsKey(day))ordered.Add(day,row);}
  return new List<Dictionary<string,object>>(ordered.Values);
 }
 static List<object> MealData(Dictionary<string,object> school,DateTime d){
  var records=new List<Dictionary<string,object>>();Exception error=null;string from=Ymd(d);
  Func<string,string,List<Dictionary<string,object>>> fetch=(a,b)=>Neis("mealServiceDietInfo","MLSV_FROM_YMD="+a+"&MLSV_TO_YMD="+b+"&MMEAL_SC_CODE=2",school).Rows;
  try{records.AddRange(fetch(from,Ymd(d.AddDays(9))));}catch(Exception e){error=e;}
  if(Weekday(d)&&!records.Exists(r=>TextVal(r,"MLSV_YMD")==from))try{records.AddRange(fetch(from,from));}catch(Exception e){if(records.Count==0)error=e;}
  if(Meals(records,d).Count<5)try{records.AddRange(fetch(Ymd(d.AddDays(10)),Ymd(d.AddDays(24))));}catch(Exception e){if(records.Count==0)error=e;}
  if(records.Count==0&&error!=null)throw new IOException("Meal fetch",error);
  var output=new List<object>();
  foreach(var row in Meals(records,d)){
   string menu=Regex.Replace(TextVal(row,"DDISH_NM"),@"<br\s*/?\s*>","\n",RegexOptions.IgnoreCase);
   menu=Regex.Replace(menu,@"\s*\([\d.]+\)","").Replace("&amp;","&");
   output.Add(new Dictionary<string,object>{{"date",TextVal(row,"MLSV_YMD")},{"menu",menu}});if(output.Count==5)break;
  }return output;
 }
 static List<object> EventData(Dictionary<string,object> school,DateTime d){
  var rows=new List<object>();var seen=new HashSet<string>(StringComparer.Ordinal);string cursor=Ymd(d),end=Ymd(d.AddDays(45));int received=0;
  for(int i=0;i<12&&String.CompareOrdinal(cursor,end)<=0;i++){
   List<Dictionary<string,object>> batch;
   try{batch=Neis("SchoolSchedule","AA_FROM_YMD="+cursor+"&AA_TO_YMD="+end,school).Rows;}catch{if(received==0)throw;break;}
   string last=cursor;
   foreach(var row in batch){string date=TextVal(row,"AA_YMD"),name=TextVal(row,"EVENT_NM");DateTime parsed;
    if(!DateValue(date,out parsed)||String.CompareOrdinal(date,cursor)<0||String.CompareOrdinal(date,end)>0)continue;
    if(String.CompareOrdinal(date,last)>0)last=date;
    if(seen.Add(date+"|"+name)){received++;if(name!="토요휴업일")rows.Add(new Dictionary<string,object>{{"date",date},{"name",name}});}
   }
   if(batch.Count<5)break;
   DateTime day;if(String.CompareOrdinal(last,cursor)>0)cursor=last;else if(DateValue(cursor,out day))cursor=Ymd(day.AddDays(1));else break;
  }return rows;
 }
 sealed class WeekException:Exception {public WeekException(string message):base(message){}}
 sealed class CachedWeek {public DateTime Until;public SortedDictionary<int,string[]> Slots;}
 static long schoolGeneration;
 [ThreadStatic] static long requestSchoolGeneration;
 static readonly Dictionary<string,CachedWeek> timetableCache=new Dictionary<string,CachedWeek>(StringComparer.Ordinal);
 static DateTime SeoulToday(){
  string fixture=Path.Combine(labRoot,"neis-today.txt");DateTime today;
  if(coinWrites&&File.Exists(Path.Combine(labRoot,"neis-fixture.flag"))&&File.Exists(fixture)){
   if((File.GetAttributes(fixture)&FileAttributes.ReparsePoint)!=0||!DateValue(File.ReadAllText(fixture).Trim(),out today))throw new FormatException("Fixture date");
   return today;
  }
  return TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow,"Korea Standard Time").Date;
 }
 static DateTime WeekReference(DateTime today){return today.DayOfWeek==DayOfWeek.Saturday?today.AddDays(2):today.DayOfWeek==DayOfWeek.Sunday?today.AddDays(1):today;}
 static string ShortDate(DateTime d){return d.Month.ToString(CultureInfo.InvariantCulture)+"/"+d.Day.ToString(CultureInfo.InvariantCulture);}
 static string[] Five(){return new[]{"","","","",""};}
 static Dictionary<string,object> Lesson(string label,string[] cells,string[] notes){return new Dictionary<string,object>{{"label",label},{"cells",cells},{"notices",notes}};}
 static Dictionary<string,object> WeekResult(string title,string[] dates,List<object> rows,string[] events,DateTime today,DateTime reference){
  return new Dictionary<string,object>{{"title",title},{"dates",dates},{"rows",rows},{"events",events},{"referenceDate",reference.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)},{"selection",today==reference?"today":"next-week"}};
 }
 static Dictionary<string,object> TimetableData(Dictionary<string,object> school,DateTime today,DateTime reference){
  if(school==null||TextVal(school,"cls")==""||TextVal(school,"grade")=="")throw new WeekException("설정에서 학년과 반을 고르면 기본 시간표가 나옵니다.");
  DateTime monday=reference.AddDays(1-(int)reference.DayOfWeek);
  string kind=TextVal(school,"kind"),endpoint=kind=="중학교"?"misTimetable":kind=="고등학교"?"hisTimetable":"elsTimetable";
  string year=(monday.Month<3?monday.Year-1:monday.Year).ToString(CultureInfo.InvariantCulture);
  string query="AY="+year+"&GRADE="+TextVal(school,"grade")+"&CLASS_NM="+Uri.EscapeDataString(TextVal(school,"cls"));
  string key=TextVal(school,"office")+"|"+TextVal(school,"code")+"|"+endpoint+"|"+query+"|"+Ymd(monday);
  CachedWeek cached;SortedDictionary<int,string[]> slots;
  cached=null;lock(WeekGate){if(requestSchoolGeneration==schoolGeneration)timetableCache.TryGetValue(key,out cached);}
  if(cached!=null&&cached.Until>DateTime.UtcNow)slots=cached.Slots;
  else{
   slots=new SortedDictionary<int,string[]>();
   for(int day=0;day<5;day++){
    string q=query+"&ALL_TI_YMD="+Ymd(monday.AddDays(day));var answer=Neis(endpoint,q,school);
    var rows=new List<Dictionary<string,object>>(answer.Rows);
    for(int period=1;period<=8&&rows.Count<answer.Total;period++){
     if(!rows.Exists(r=>Convert.ToString(Val(r,"PERIO"),CultureInfo.InvariantCulture)==period.ToString(CultureInfo.InvariantCulture)))rows.AddRange(Neis(endpoint,q+"&PERIO="+period,school).Rows);
    }
    foreach(var row in rows){
     int period;if(!Int32.TryParse(Convert.ToString(Val(row,"PERIO"),CultureInfo.InvariantCulture),out period)||period<1||period>8)continue;
     if(!slots.ContainsKey(period))slots.Add(period,Five());slots[period][day]=TextVal(row,"ITRT_CNTNT").Trim();
    }
   }
   lock(WeekGate){if(requestSchoolGeneration==schoolGeneration){if(timetableCache.Count>=16)timetableCache.Clear();timetableCache[key]=new CachedWeek{Slots=slots,Until=DateTime.UtcNow.AddHours(1)};}}
  }
  if(slots.Count==0)throw new WeekException("나이스에 이번 주 시간표가 아직 없습니다.");
  var lessons=new List<object>();foreach(var pair in slots)lessons.Add(Lesson(pair.Key+"교시",pair.Value,Five()));
  string[] dates=Five();for(int i=0;i<5;i++)dates[i]=ShortDate(monday.AddDays(i));
  return WeekResult("나이스 기본 시간표",dates,lessons,Five(),today,reference);
 }
 static string[] SliceFive(string[] cells){var result=Five();Array.Copy(cells,1,result,0,5);return result;}
 static Dictionary<string,object> SheetWeek(Dictionary<string,object> school,DateTime today,DateTime reference){
  string sheet=TextVal(school,"sheet");if(!MatchFull(sheet,"[A-Za-z0-9_-]{20,80}"))throw new FormatException("Sheet");
  string page=ProviderText("sheet",sheet+"/htmlview");
  var matches=Regex.Matches(page,@"items\.push\(\{name:\s*(""(?:\\.|[^""\\])*""),\s*pageUrl:[\s\S]*?gid:\s*""(\d+)""");
  string title=null,gid=null;int candidates=0,found=0;
  foreach(Match match in matches){
   string tab=Serializer().Deserialize<string>(match.Groups[1].Value);
   if(tab==null||!Regex.IsMatch(tab,@"주(?:차)?\s*\("))continue;
   candidates++;
   var m=Regex.Match(tab,@"(\d{1,2})\.(\d{1,2})\s*~\s*(\d{1,2})\.(\d{1,2})");if(!m.Success)continue;
   int sm=Int32.Parse(m.Groups[1].Value),sd=Int32.Parse(m.Groups[2].Value),em=Int32.Parse(m.Groups[3].Value),ed=Int32.Parse(m.Groups[4].Value);
   for(int year=reference.Year-1;year<=reference.Year;year++)try{
    DateTime start=new DateTime(year,sm,sd),end=new DateTime(em<sm?year+1:year,em,ed);
    if(reference>=start&&reference<=end){found++;title=tab;gid=match.Groups[2].Value;break;}
   }catch(ArgumentOutOfRangeException){}
  }
  if(candidates==0)throw new FormatException("No public weekly tabs");
  if(found==0)throw new WeekException("시트에 이번 주 탭이 없습니다. 시트에서 이번 주 탭을 만들면 나타납니다.");
  if(found!=1)throw new FormatException("Ambiguous week");
  string raw=ProviderText("sheet",sheet+"/gviz/tq?tqx=out:json&headers=0&gid="+gid+"&range=A1:F30");
  int begin=raw.IndexOf('{'),endIndex=raw.LastIndexOf('}');if(begin<0||endIndex<=begin)throw new FormatException("Sheet response");
  var data=Obj(Serializer().DeserializeObject(raw.Substring(begin,endIndex-begin+1)));
  if(TextVal(data,"status")!="ok")throw new FormatException("Sheet status");
  var rows=new List<string[]>();foreach(var r in Arr(Val(Obj(Val(data,"table")),"rows"))){
   var cells=new string[6];var values=Arr(Val(Obj(r),"c"));
   for(int i=0;i<6;i++){var cell=i<values.Length?Obj(values[i]):null;cells[i]=Convert.ToString(Val(cell,"f")??Val(cell,"v"),CultureInfo.InvariantCulture)??"";}
   rows.Add(cells);
  }
  string[] dates=Five(),events=Five();var lessons=new List<object>();
  for(int r=0;r<rows.Count;r++){
   var cells=rows[r];int datesFound=0;for(int i=1;i<6;i++)if(MatchFull(cells[i],@"\d{1,2}/\d{1,2}"))datesFound++;
   if(datesFound>=3)dates=SliceFive(cells);
   if(r==3)events=SliceFive(cells);
   Match label=Regex.Match(cells[0],@"^[1-7]교시");
   if(label.Success){var notes=Five();if(r+1<rows.Count&&String.IsNullOrWhiteSpace(rows[r+1][0])){notes=SliceFive(rows[r+1]);for(int i=0;i<5;i++)notes[i]=notes[i].Trim();}lessons.Add(Lesson(label.Value,SliceFive(cells),notes));}
  }
  if(Array.IndexOf(dates,ShortDate(reference))<0||lessons.Count==0)throw new FormatException("Week cells mismatch");
  var y=Regex.Match(rows[0][0],@"20\d{2}");
  if(y.Success){int year=Int32.Parse(y.Value);if(year!=reference.Year&&!(reference.Month<3&&year==reference.Year-1))throw new FormatException("Week year mismatch");}
  return WeekResult(title,dates,lessons,events,today,reference);
 }
 static void SchoolData(Stream s,string path,string target,string method,string site,string origin,byte[] payload){
  bool read=method=="GET",localOrigin=origin==""||origin=="http://127.0.0.1:"+Port||origin=="http://localhost:"+Port;
  if(!localOrigin||(site!="same-origin"&&!(read&&(site==""||site=="none")))){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  if(path=="/api/school"&&method=="POST"){SchoolWrite(s,payload);return;}
  if(!read){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
  try{
   Dictionary<string,object> school;lock(LocalGate){school=School();requestSchoolGeneration=schoolGeneration;}var q=Query(target);
   if(path=="/api/school"){Json(s,"200 OK",Serializer().Serialize(new Dictionary<string,object>{{"school",school},{"template",SheetTemplate}}));return;}
   if(path=="/api/school/search"){
    string name=Get(q,"q"),office=Get(q,"office");
    if(name.Length<1||name.Length>60||!MatchFull(office,"[A-Z][0-9]{2}|"))throw new FormatException("School search");
    var table=Neis("schoolInfo","SCHUL_NM="+Uri.EscapeDataString(name)+(office==""?"":"&ATPT_OFCDC_SC_CODE="+office));
    var rows=new List<object>();foreach(var row in table.Rows)rows.Add(new Dictionary<string,object>{{"office",TextVal(row,"ATPT_OFCDC_SC_CODE")},{"code",TextVal(row,"SD_SCHUL_CODE")},{"name",TextVal(row,"SCHUL_NM")},{"kind",TextVal(row,"SCHUL_KND_SC_NM")},{"address",TextVal(row,"ORG_RDNMA")}});
    Json(s,"200 OK",Serializer().Serialize(new Dictionary<string,object>{{"total",table.Total},{"rows",rows}}));return;
   }
   if(path=="/api/week"){DateTime today=SeoulToday(),reference=WeekReference(today);Json(s,"200 OK",Serializer().Serialize(school!=null&&TextVal(school,"sheet")!=""?SheetWeek(school,today,reference):TimetableData(school,today,reference)));return;}
   DateTime d;if(!DateValue(Get(q,"date"),out d))throw new FormatException("Date");
   var output=school==null?new List<object>():path=="/api/meal"?MealData(school,d):EventData(school,d);
   Json(s,"200 OK",Serializer().Serialize(new Dictionary<string,object>{{"rows",output}}));
  }catch(WeekException e){Json(s,"404 Not Found",Serializer().Serialize(new Dictionary<string,object>{{"code","WEEK_NOT_FOUND"},{"error",e.Message}}));}catch(Exception e){
   if(!(e is IOException||e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;
   Json(s,"502 Bad Gateway","{\"code\":\""+(path=="/api/meal"?"MEAL_FETCH_ERROR":"UPSTREAM_ERROR")+"\",\"error\":\"온라인 자료를 가져오지 못했습니다. 인터넷 연결 및 나이스 API 상태를 확인하세요.\"}");
  }
 }
 static readonly string[] KnownPlaceRows=new[]{
  "서울특별시 종로구|37.5735|126.9790",
  "서울특별시 중구|37.5636|126.9976",
  "서울특별시 용산구|37.5326|126.9906",
  "서울특별시 성동구|37.5633|127.0369",
  "서울특별시 광진구|37.5386|127.0823",
  "서울특별시 동대문구|37.5744|127.0400",
  "서울특별시 중랑구|37.6063|127.0928",
  "서울특별시 성북구|37.5894|127.0167",
  "서울특별시 강북구|37.6396|127.0255",
  "서울특별시 도봉구|37.6688|127.0471",
  "서울특별시 노원구|37.6542|127.0568",
  "서울특별시 은평구|37.6027|126.9292",
  "서울특별시 서대문구|37.5791|126.9368",
  "서울특별시 마포구|37.5665|126.9015",
  "서울특별시 양천구|37.5170|126.8665",
  "서울특별시 강서구|37.5509|126.8495",
  "서울특별시 구로구|37.4954|126.8874",
  "서울특별시 금천구|37.4569|126.8955",
  "서울특별시 영등포구|37.5264|126.8962",
  "서울특별시 동작구|37.5124|126.9395",
  "서울특별시 관악구|37.4780|126.9515",
  "서울특별시 서초구|37.4837|127.0324",
  "서울특별시 강남구|37.5172|127.0473",
  "서울특별시 송파구|37.5146|127.1059",
  "서울특별시 강동구|37.5301|127.1238",
  "부산광역시|35.1796|129.0756",
  "대구광역시|35.8714|128.6014",
  "인천광역시|37.4563|126.7052",
  "광주광역시|35.1595|126.8526",
  "대전광역시|36.3504|127.3845",
  "울산광역시|35.5384|129.3114",
  "세종특별자치시|36.4800|127.2890",
  "경기도 수원시|37.2636|127.0286",
  "경기도 성남시|37.4200|127.1265",
  "경기도 고양시|37.6584|126.8320",
  "경기도 용인시|37.2411|127.1776",
  "경기도 화성시|37.1995|126.8312",
  "경기도 안양시|37.3943|126.9568",
  "경기도 안산시|37.3219|126.8309",
  "경기도 부천시|37.5034|126.7660",
  "경기도 광명시|37.4780|126.8640",
  "경기도 남양주시|37.6360|127.2165",
  "경기도 김포시|37.6152|126.7156",
  "경기도 의정부시|37.7381|127.0337",
  "경기도 파주시|37.7603|126.7799",
  "경기도 평택시|36.9920|127.0850",
  "경기도 시흥시|37.3800|126.8030",
  "충청남도 공주시|36.4465|127.1191",
  "충청남도 천안시|36.8151|127.1139",
  "충청남도 아산시|36.7898|127.0018",
  "충청북도 청주시|36.6424|127.4890",
  "충청북도 충주시|36.9910|127.9259",
  "강원특별자치도 춘천시|37.8813|127.7298",
  "강원특별자치도 원주시|37.3422|127.9202",
  "강원특별자치도 강릉시|37.7519|128.8761",
  "전북특별자치도 전주시|35.8242|127.1480",
  "전북특별자치도 익산시|35.9483|126.9576",
  "전북특별자치도 군산시|35.9677|126.7366",
  "전라남도 목포시|34.8118|126.3922",
  "전라남도 순천시|34.9506|127.4872",
  "전라남도 여수시|34.7604|127.6622",
  "경상북도 포항시|36.0190|129.3435",
  "경상북도 구미시|36.1195|128.3446",
  "경상북도 경주시|35.8562|129.2247",
  "경상북도 안동시|36.5684|128.7294",
  "경상남도 창원시|35.2279|128.6811",
  "경상남도 김해시|35.2285|128.8894",
  "경상남도 진주시|35.1803|128.1076",
  "경상남도 거제시|34.8806|128.6210",
  "제주특별자치도 제주시|33.4996|126.5312",
  "제주특별자치도 서귀포시|33.2541|126.5601"
 };
 static Dictionary<string,object> Place(string name,double lat,double lon,bool auto){
  return new Dictionary<string,object>{{"name",name},{"lat",lat},{"lon",lon},{"auto",auto}};
 }
 static bool Coordinate(object value,out double n){
  n=0;return value!=null&&!(value is bool)&&Double.TryParse(Convert.ToString(value,CultureInfo.InvariantCulture),NumberStyles.Float,CultureInfo.InvariantCulture,out n)&&!Double.IsNaN(n)&&!Double.IsInfinity(n);
 }
 static bool ValidPlace(Dictionary<string,object> x){
  double lat,lon;string name=TextVal(x,"name");
  return name.Length>=1&&name.Length<=60&&Coordinate(Val(x,"lat"),out lat)&&lat>32&&lat<39.5&&Coordinate(Val(x,"lon"),out lon)&&lon>124&&lon<132;
 }
 static List<Dictionary<string,object>> KnownPlaces(){
  var result=new List<Dictionary<string,object>>();
  foreach(string row in KnownPlaceRows){string[] fields=row.Split('|');result.Add(Place(fields[0],Double.Parse(fields[1],CultureInfo.InvariantCulture),Double.Parse(fields[2],CultureInfo.InvariantCulture),false));}
  return result;
 }
 static Dictionary<string,object> KnownAddress(string address){
  string[] words=Regex.Split(address.Trim(),@"[\s,]+");if(words.Length==0||words[0]=="")return null;
  string province=words[0],city=words.Length>1?words[1]:"";
  string modern=province.Replace("강원도","강원특별자치도").Replace("전라북도","전북특별자치도");
  foreach(var p in KnownPlaces()){
   string name=TextVal(p,"name");
   if((city!=""&&(name==province+" "+city||name==modern+" "+city))||name==province)return p;
  }return null;
 }
 static readonly object PlaceSearchGate=new object();
 static long placeGeneration;
 static DateTime placeSearchNext;
 static List<Dictionary<string,object>> FindPlaces(string q,int count){
  q=q.Trim();var result=new List<Dictionary<string,object>>();
  if(q==""||q.Length>60)throw new FormatException("Place search");
  string needle=q.Replace("서울시","서울특별시").Replace("서울 ","서울특별시 ").Replace("전북도","전북특별자치도");
  foreach(var p in KnownPlaces()){string name=TextVal(p,"name");if(name.Contains(needle)||name.EndsWith(" "+q,StringComparison.Ordinal)){result.Add(p);if(result.Count==count)break;}}
  if(result.Count>0)return result;
  // Explicit searches or bounded administrative-region lookup only.
  // Automatic resolution never sends a full school street address.
  lock(PlaceSearchGate){
   if(File.Exists(Path.Combine(labRoot,"neis-live.flag"))&&DateTime.UtcNow<placeSearchNext)throw new IOException("Place search interval");
   placeSearchNext=DateTime.UtcNow.AddSeconds(1);
   string query="format=json&limit="+count+"&countrycodes=kr&accept-language=ko&q="+Uri.EscapeDataString(q);
   foreach(var item in Arr(Serializer().DeserializeObject(ProviderText("places",query)))){
    var p=Obj(item);double lat,lon;if(!Coordinate(Val(p,"lat"),out lat)||!Coordinate(Val(p,"lon"),out lon))continue;
    var names=new List<string>();foreach(string name in Regex.Split(TextVal(p,"display_name"),@",\s*"))if(name!=""&&name!="대한민국"&&!Regex.IsMatch(name,@"^\d"))names.Add(name);
    names.Reverse();var place=Place(String.Join(" ",names),lat,lon,false);
    if(ValidPlace(place))result.Add(place);if(result.Count>=count)break;
   }
  }return result;
 }
 static Dictionary<string,object> ReadPlace(){
  byte[] raw=Read("weather-place.json");if(raw==null)return null;
  try{var p=Obj(Serializer().DeserializeObject(Utf8.GetString(raw).TrimStart('\uFEFF')));return ValidPlace(p)?p:null;}catch(ArgumentException){return null;}catch(InvalidOperationException){return null;}
 }
 static void DeletePlace(){
  string file=Path.Combine(root,"weather-place.json");
  if(File.Exists(file)){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked weather place");File.Delete(file);}
 }
 sealed class WeatherLocationException:Exception{
  public string Code;
  public WeatherLocationException(string code,string message):base(message){Code=code;}
 }
 static Dictionary<string,object> ResolveWeatherPlace(){
  Dictionary<string,object> school,p;long generation;
  lock(LocalGate){p=ReadPlace();if(p!=null)return p;school=School();generation=placeGeneration;}
  if(school==null)throw new WeatherLocationException("WEATHER_NO_SCHOOL_ADDRESS","학교 주소를 찾지 못했어요. 설정에서 학교를 다시 선택하거나 날씨 위치를 직접 지정해 주세요.");
  string address=TextVal(school,"address");
  if(address==""){
   try{
    string name=TextVal(school,"name"),office=TextVal(school,"office");
    if(name.Length>0&&name.Length<=60&&MatchFull(office,"[A-Z][0-9]{2}")){
     var result=Neis("schoolInfo","SCHUL_NM="+Uri.EscapeDataString(name)+"&ATPT_OFCDC_SC_CODE="+office);
     foreach(var row in result.Rows)if(TextVal(row,"SD_SCHUL_CODE")==TextVal(school,"code")&&TextVal(row,"ATPT_OFCDC_SC_CODE")==office){address=TextVal(row,"ORG_RDNMA");break;}
    }
   }catch(Exception e){if(!(e is IOException||e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;}
  }
  if(address=="")throw new WeatherLocationException("WEATHER_NO_SCHOOL_ADDRESS","학교 주소를 찾지 못했어요. 설정에서 학교를 다시 선택하거나 날씨 위치를 직접 지정해 주세요.");
  var known=KnownAddress(address);
  string label="";
  if(known!=null)label=TextVal(known,"name")+" (지역 중심)";
  else{
   // Only administrative tokens are sent. No street number or school name.
   var words=Regex.Split(address.Trim(),@"[\s,]+");
   var parts=new List<string>();
   for(int i=0;i<Math.Min(words.Length,3);i++){
    if(!MatchFull(words[i],@"[\uAC00-\uD7A3]{2,20}")||!Regex.IsMatch(words[i],i==0?"(시|도|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)$":"(시|군|구)$"))break;
    parts.Add(words[i]);
   }
   if(parts.Count>0){
    for(int count=parts.Count;count>=1;count=count==1?0:1){
     string query=String.Join(" ",parts.GetRange(0,count));
     try{var hits=FindPlaces(query,1);if(hits.Count>0){known=hits[0];label=query;break;}}
     catch(Exception e){if(!(e is IOException||e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;}
    }
   }
  }
  if(known==null)throw new WeatherLocationException("WEATHER_PLACE_UNAVAILABLE","자동 위치 확인에 실패했어요. 설정의 날씨 위치에서 시·군·구를 선택해 주세요.");
  double lat,lon;Coordinate(Val(known,"lat"),out lat);Coordinate(Val(known,"lon"),out lon);
  p=Place(label,lat,lon,true);
  lock(LocalGate){
   // A late remote result must not overwrite a new school or manual selection.
   if(generation!=placeGeneration){
    var current=ReadPlace();if(current!=null)return current;
    throw new WeatherLocationException("WEATHER_PLACE_UNAVAILABLE","날씨 위치가 변경되었습니다. 다시 시도해 주세요.");
   }
   var existing=ReadPlace();if(existing!=null)return existing;
   AtomicWrite("weather-place.json",Utf8.GetBytes(Serializer().Serialize(p)));
  }return p;
 }
 static Dictionary<string,object> ResolveKnownPlace(){
  // Called only under LocalGate. Slow online resolution is a later checkpoint.
  var p=ReadPlace();if(p!=null)return p;
  var school=School();var known=KnownAddress(TextVal(school,"address"));
  if(known==null)return null;
  double lat,lon;Coordinate(Val(known,"lat"),out lat);Coordinate(Val(known,"lon"),out lon);
  p=Place(TextVal(known,"name")+" (지역 중심)",lat,lon,true);
  AtomicWrite("weather-place.json",Utf8.GetBytes(Serializer().Serialize(p)));
  return p;
 }
 static readonly object WeatherGate=new object();
 static long WeatherNow(){
  // Isolated deterministic test clock, inaccessible through the HTTP request.
  string path=Path.Combine(labRoot,"weather-clock.txt");long n;
  if(File.Exists(Path.Combine(labRoot,"neis-fixture.flag"))&&File.Exists(path)){
   if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0||!Int64.TryParse(File.ReadAllText(path).Trim(),out n)||n<1600000000000L||n>2000000000000L)throw new IOException("Weather fixture clock");
   return n;
  }
  return (long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;
 }
 static long LongVal(Dictionary<string,object> d,string key){long n;return Int64.TryParse(Convert.ToString(Val(d,key),CultureInfo.InvariantCulture),out n)?n:0;}
 static Dictionary<string,object> DictVal(Dictionary<string,object> d,string key){return Obj(Val(d,key));}
 static int CountVal(Dictionary<string,object> d,string key){var a=Val(d,key) as System.Collections.IList;return a==null?0:a.Count;}
 static bool ValidForecast(Dictionary<string,object> data){
  var current=DictVal(data,"current");var hourly=DictVal(data,"hourly");var daily=DictVal(data,"daily");
  int h=CountVal(hourly,"time"),d=CountVal(daily,"time");double number;
  return Coordinate(Val(current,"temperature_2m"),out number)&&Coordinate(Val(current,"weather_code"),out number)&&h>0&&d>0&&CountVal(hourly,"temperature_2m")==h&&CountVal(hourly,"weather_code")==h&&CountVal(daily,"temperature_2m_max")==d&&CountVal(daily,"temperature_2m_min")==d&&CountVal(daily,"weather_code")==d;
 }
 static bool ValidAir(Dictionary<string,object> data){
  var current=DictVal(data,"current");var hourly=DictVal(data,"hourly");int h=CountVal(hourly,"time");double number;
  return (Coordinate(Val(current,"pm10"),out number)||Coordinate(Val(current,"pm2_5"),out number))&&h>0&&CountVal(hourly,"pm10")==h&&CountVal(hourly,"pm2_5")==h;
 }
 static Dictionary<string,object> LoadWeather(){
  byte[] raw=Read("weather-cache.json");
  if(raw!=null&&raw.Length<=4194304)try{
   var data=Obj(Serializer().DeserializeObject(Utf8.GetString(raw).TrimStart('\uFEFF')));
   if(data!=null){var result=new Dictionary<string,object>();foreach(var pair in data)if(Regex.IsMatch(pair.Key,@"\A[0-9]{2}\.[0-9]{4},[0-9]{3}\.[0-9]{4}\z")&&Obj(pair.Value)!=null)result.Add(pair.Key,pair.Value);return result;}
  }catch(ArgumentException){}catch(InvalidOperationException){}
  return new Dictionary<string,object>();
 }
 static bool SaveWeather(Dictionary<string,object> store){
  try{byte[] raw=Utf8.GetBytes(Serializer().Serialize(store));if(raw.Length>4194304)return false;AtomicWrite("weather-cache.json",raw);return true;}
  catch(IOException){return false;}catch(UnauthorizedAccessException){return false;}catch(InvalidOperationException){return false;}
 }
 sealed class WeatherResponse{
  public int Status;public string Text,Modified;public long Retry,Expires;
 }
 static long HeaderDate(string text,long now,bool seconds){
  long n;DateTimeOffset date;
  if(seconds&&Int64.TryParse(text,out n)&&n>=0&&n<=31536000)return now+n*1000;
  return DateTimeOffset.TryParse(text,CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal,out date)?(long)(date.UtcDateTime-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds:0;
 }
 static WeatherResponse FetchWeather(string endpoint,string query,long now,string modified=""){
  Uri uri=UpstreamUri(endpoint,query);
  bool fixture=File.Exists(Path.Combine(labRoot,"neis-fixture.flag")),live=File.Exists(Path.Combine(labRoot,"neis-live.flag"));
  if(fixture&&live)throw new IOException("Ambiguous weather provider");
  if(fixture){
   string raw=NeisFixture(endpoint,query);
   // Lab-only envelope for simulated HTTP status/headers.
   var obj=Obj(Serializer().DeserializeObject(raw));
   if(obj!=null&&Val(obj,"labHttpStatus")!=null){
    return new WeatherResponse{Status=(int)LongVal(obj,"labHttpStatus"),Text=Serializer().Serialize(Val(obj,"data")),Modified=TextVal(obj,"modified"),Retry=LongVal(obj,"retry"),Expires=LongVal(obj,"expires")};
   }
   return new WeatherResponse{Status=200,Text=raw,Modified=""};
  }
  if(!coinWrites||!live)throw new IOException("Weather provider not configured");
  int remaining=upstreamBudget==null?4000:Math.Min(4000,30000-(int)upstreamBudget.ElapsedMilliseconds);
  if(remaining<1)throw new IOException("Weather budget");
  var req=(HttpWebRequest)WebRequest.Create(uri);req.Method="GET";req.Timeout=remaining;req.ReadWriteTimeout=remaining;req.AllowAutoRedirect=false;req.AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate;req.KeepAlive=false;req.Credentials=null;req.UseDefaultCredentials=false;
  req.UserAgent="HOJA-Board/1.66.5 (contact: xkdtndbrwk111@gmail.com)";
  DateTimeOffset since;if(DateTimeOffset.TryParse(modified,CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal,out since))req.IfModifiedSince=since.UtcDateTime;
  using(var abort=new System.Threading.Timer(_=>{try{req.Abort();}catch{}},null,remaining,Timeout.Infinite)){
   HttpWebResponse response=null;
   try{
    try{response=(HttpWebResponse)req.GetResponse();}catch(WebException e){response=e.Response as HttpWebResponse;if(response==null)throw new IOException("Weather unavailable",e);}
    var result=new WeatherResponse{Status=(int)response.StatusCode,Modified=response.Headers["Last-Modified"]??"",Retry=HeaderDate(response.Headers["Retry-After"],now,true),Expires=HeaderDate(response.Headers["Expires"],now,false)};
    if(result.Status==200||result.Status==203){
     if(response.ContentLength>2097152)throw new IOException("Weather response limit");
     using(var input=response.GetResponseStream())using(var output=new MemoryStream()){
      byte[] buffer=new byte[8192];int n;while((n=input.Read(buffer,0,buffer.Length))>0){if(output.Length+n>2097152)throw new IOException("Weather response limit");output.Write(buffer,0,n);}
      result.Text=Utf8.GetString(output.ToArray()).TrimStart('\uFEFF');
     }
    }return result;
   }finally{if(response!=null)response.Dispose();}
  }
 }
 static int? MetCode(string symbol){
  string v=Regex.Replace(symbol??"",@"_(day|night|polartwilight)$","");
  if(v.Contains("thunder"))return 95;if(v.Contains("sleet"))return 66;if(v.Contains("snow"))return v.Contains("heavy")?75:71;
  if(v.Contains("rain"))return v.Contains("heavy")?65:v.Contains("light")?61:63;
  switch(v){case "clearsky":return 0;case "fair":return 1;case "partlycloudy":return 2;case "cloudy":return 3;case "fog":return 45;default:return null;}
 }
 sealed class MetPoint {public long Stamp;public string Time;public double Temp;public int? Code;public object Wind,Rain,Precip,SixRain;}
 static Dictionary<string,object> ConvertMet(Dictionary<string,object> raw,long now){
  var series=Arr(Val(DictVal(raw,"properties"),"timeseries"));if(series.Length<2)throw new FormatException("MET series");
  var points=new List<MetPoint>();
  foreach(var item in series){
   var p=Obj(item);DateTimeOffset timestamp;
   if(!DateTimeOffset.TryParse(TextVal(p,"time"),CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal,out timestamp))continue;
   var data=DictVal(p,"data");var instant=DictVal(DictVal(data,"instant"),"details");double temp,wind;
   if(!Coordinate(Val(instant,"air_temperature"),out temp))continue;
   var one=DictVal(data,"next_1_hours");var six=DictVal(data,"next_6_hours");var part=one??six??DictVal(data,"next_12_hours");
   points.Add(new MetPoint{Stamp=(long)(timestamp.UtcDateTime-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds,Time=timestamp.ToOffset(TimeSpan.FromHours(9)).ToString("yyyy-MM-ddTHH:mm",CultureInfo.InvariantCulture),Temp=temp,Code=MetCode(TextVal(DictVal(part,"summary"),"symbol_code")),Wind=Coordinate(Val(instant,"wind_speed"),out wind)?(object)Math.Round(wind*3.6,1):null,Rain=Val(DictVal(one,"details"),"probability_of_precipitation"),Precip=Val(DictVal(one,"details"),"precipitation_amount"),SixRain=Val(DictVal(six,"details"),"probability_of_precipitation")});
  }
  points.Sort((a,b)=>a.Stamp.CompareTo(b.Stamp));if(points.Count==0)throw new FormatException("MET points");
  MetPoint current=points[0];foreach(var p in points)if(p.Stamp<=now)current=p;else break;
  if(Math.Abs(current.Stamp-now)>21600000||!current.Code.HasValue)throw new FormatException("MET outdated");
  var ht=new List<object>();var htemp=new List<object>();var hc=new List<object>();var hr=new List<object>();
  foreach(var p in points)if(p.Stamp>=now-3600000&&p.Stamp<now+43200000){ht.Add(p.Time);htemp.Add(p.Temp);hc.Add(p.Code);hr.Add(p.Rain);}
  var dt=new List<object>();var dx=new List<object>();var dn=new List<object>();var dc=new List<object>();var dr=new List<object>();
  DateTime local=new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc).AddMilliseconds(now).AddHours(9);
  for(int day=0;day<5;day++){
   string date=local.AddDays(day).ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);double min=Double.MaxValue,max=Double.MinValue,rain=-1;int code=-1;
   foreach(var p in points)if(p.Time.StartsWith(date,StringComparison.Ordinal)){
    min=Math.Min(min,p.Temp);max=Math.Max(max,p.Temp);if(p.Code.HasValue)code=Math.Max(code,p.Code.Value);
    double n;if(Coordinate(p.Rain,out n))rain=Math.Max(rain,n);if(Coordinate(p.SixRain,out n))rain=Math.Max(rain,n);
   }
   if(min==Double.MaxValue)continue;dt.Add(date);dx.Add(max);dn.Add(min);dc.Add(code<0?null:(object)code);dr.Add(rain<0?null:(object)Math.Round(rain));
  }
  if(ht.Count==0||dt.Count==0)throw new FormatException("MET forecast missing");
  return new Dictionary<string,object>{{"current",new Dictionary<string,object>{{"time",current.Time},{"temperature_2m",current.Temp},{"weather_code",current.Code},{"wind_speed_10m",current.Wind},{"precipitation",current.Precip}}},{"hourly",new Dictionary<string,object>{{"time",ht},{"temperature_2m",htemp},{"weather_code",hc},{"precipitation_probability",hr}}},{"daily",new Dictionary<string,object>{{"time",dt},{"temperature_2m_max",dx},{"temperature_2m_min",dn},{"weather_code",dc},{"precipitation_probability_max",dr}}}};
 }
 static bool RefreshMet(Dictionary<string,object> store,Dictionary<string,object> entry,string query,long now){
  if(now<LongVal(entry,"metNext")||(store.Count>12&&DictVal(entry,"met")==null))return false;
  entry["metNext"]=now+10800000;
  // A failed durable write must suppress the provider request.
  if(!SaveWeather(store))return false;
  try{
   var old=DictVal(entry,"met");var r=FetchWeather("met",query,now,TextVal(old,"modified"));
   entry["metNext"]=Math.Max(LongVal(entry,"metNext"),Math.Max(r.Retry,r.Expires));
   if(r.Status==304&&old!=null)old["at"]=now;
   else if(r.Status==200||r.Status==203){
    var raw=Obj(Serializer().DeserializeObject(r.Text));ConvertMet(raw,now);
    entry["met"]=new Dictionary<string,object>{{"data",raw},{"at",now},{"modified",r.Modified??""},{"deprecated",r.Status==203}};
   }
  }catch(Exception e){if(!(e is IOException||e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;}
  return true;
 }
 static bool RefreshWeatherPart(Dictionary<string,object> entry,string part,string nextKey,string query,long now,bool fresh){
  var old=DictVal(entry,part);
  if(now<LongVal(entry,nextKey)||(!fresh&&old!=null&&now-LongVal(old,"at")<1800000))return false;
  entry[nextKey]=now+300000;
  try{
   var response=FetchWeather(part=="weather"?"forecast":"air",query,now);
   entry[nextKey]=Math.Max(LongVal(entry,nextKey),response.Retry);
   if(response.Status!=200)throw new IOException("Weather status");
   var data=Obj(Serializer().DeserializeObject(response.Text));
   if(!(part=="weather"?ValidForecast(data):ValidAir(data)))throw new FormatException("Weather schema");
   entry[part]=new Dictionary<string,object>{{"data",data},{"at",now}};entry[nextKey]=0L;
  }catch(Exception e){
   if(!(e is IOException||e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;
   if(old!=null)old["attemptFailed"]=true;
  }
  return true;
 }
 static void WeatherForecastData(Stream s,string target,string site,string origin){
  if((origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)||(site!=""&&site!="same-origin"&&site!="none")){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  try{
   var q=Query(target);bool fresh=Get(q,"fresh")=="1",allowMet=Get(q,"met")=="1";
   Dictionary<string,object> p=ResolveWeatherPlace();
   double la,lo;Coordinate(Val(p,"lat"),out la);Coordinate(Val(p,"lon"),out lo);
   string lat=(Math.Truncate(la*10000)/10000).ToString("0.0000",CultureInfo.InvariantCulture),lon=(Math.Truncate(lo*10000)/10000).ToString("0.0000",CultureInfo.InvariantCulture);
   string key=lat+","+lon,baseQuery="latitude="+lat+"&longitude="+lon;
   lock(WeatherGate){
    long now=WeatherNow();var store=LoadWeather();var entry=DictVal(store,key);
    bool dirty=false;
    if(entry==null){entry=new Dictionary<string,object>{{"weather",null},{"air",null},{"met",null},{"primaryNext",0L},{"airNext",0L},{"metNext",0L}};store[key]=entry;dirty=true;}
    var expired=new List<string>();foreach(var pair in store){
     if(pair.Key==key)continue;var v=Obj(pair.Value);
     long last=Math.Max(LongVal(v,"metNext"),Math.Max(LongVal(DictVal(v,"weather"),"at"),LongVal(DictVal(v,"air"),"at")));
     if(now-last>86400000)expired.Add(pair.Key);
    }
    foreach(string k in expired){store.Remove(k);dirty=true;}
    if(RefreshWeatherPart(entry,"weather","primaryNext",baseQuery+ForecastTail,now,fresh))dirty=true;
    var primary=DictVal(entry,"weather");
    bool primaryFresh=ValidForecast(DictVal(primary,"data"))&&now-LongVal(primary,"at")<1800000&&!True(Val(primary,"attemptFailed"));
    if(!primaryFresh&&allowMet&&RefreshMet(store,entry,"lat="+lat+"&lon="+lon,now))dirty=true;
    if(RefreshWeatherPart(entry,"air","airNext",baseQuery+AirTail,now,fresh))dirty=true;
    if(dirty)SaveWeather(store);
    var w=DictVal(entry,"weather");var a=DictVal(entry,"air");
    var wd=DictVal(w,"data");var ad=DictVal(a,"data");
    long at=LongVal(w,"at"),airAt=LongVal(a,"at");
    if(!ValidForecast(wd)||now-at>=86400000){wd=null;at=0;}
    if(!ValidAir(ad)||now-airAt>=86400000){ad=null;airAt=0;}
    string source=wd==null?"":"Open-Meteo";bool metDeprecated=false;
    if(!primaryFresh&&allowMet){
     var met=DictVal(entry,"met");long mt=LongVal(met,"at");
     if(met!=null&&now-mt<86400000)try{wd=ConvertMet(DictVal(met,"data"),now);at=mt;source="MET Norway";metDeprecated=True(Val(met,"deprecated"));}catch(FormatException){}
    }
    if(wd==null&&ad==null){Json(s,"502 Bad Gateway","{\"code\":\"WEATHER_API_UNAVAILABLE\",\"error\":\"위치는 확인했지만 날씨 서비스에 연결하지 못했어요.\"}");return;}
    bool stale=wd!=null&&(source=="MET Norway"?now-at>=21600000:now-at>=1800000||True(Val(w,"attemptFailed"))),airStale=ad!=null&&(now-airAt>=1800000||True(Val(a,"attemptFailed")));
    Json(s,"200 OK",Serializer().Serialize(new Dictionary<string,object>{{"place",new Dictionary<string,object>{{"name",Val(p,"name")},{"lat",la},{"lon",lo}}},{"weather",wd},{"air",ad},{"at",at},{"source",source},{"stale",stale},{"airAt",airAt},{"airStale",airStale},{"metDeprecated",metDeprecated}}));
   }
  }catch(WeatherLocationException e){Json(s,"502 Bad Gateway",Serializer().Serialize(new Dictionary<string,object>{{"code",e.Code},{"error",e.Message}}));}catch(Exception e){
   if(!(e is IOException||e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;
   Json(s,"502 Bad Gateway","{\"code\":\"WEATHER_REQUEST_FAILED\",\"error\":\"날씨를 불러오지 못했어요. 다시 시도하거나 날씨 설정을 확인해 주세요.\"}");
  }
 }
 static void WeatherPlaceData(Stream s,string path,string target,string method,string site,string origin,byte[] payload){
  bool read=method=="GET";
  if((origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)||(site!="same-origin"&&!(read&&(site==""||site=="none")))){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  try{
   if(path=="/api/weather/places"&&read){
    var q=Query(target);var rows=FindPlaces(Get(q,"q"),5);
    // Existing list contract exposes name/lat/lon, not internal settings.
    var output=new List<object>();foreach(var p in rows)output.Add(new Dictionary<string,object>{{"name",Val(p,"name")},{"lat",Val(p,"lat")},{"lon",Val(p,"lon")}});
    Json(s,"200 OK",Serializer().Serialize(new Dictionary<string,object>{{"list",output}}));return;
   }
   if(path=="/api/weather/place"&&method=="POST"){
    if(payload.Length>8192)throw new FormatException("Place size");
    var sent=Obj(Serializer().DeserializeObject(Utf8.GetString(Convert.FromBase64String(Encoding.ASCII.GetString(payload)))));
    if(True(Val(sent,"auto")))DeletePlace();
    else{
     if(!ValidPlace(sent))throw new FormatException("Invalid place");
     double lat,lon;Coordinate(Val(sent,"lat"),out lat);Coordinate(Val(sent,"lon"),out lon);
     AtomicWrite("weather-place.json",Utf8.GetBytes(Serializer().Serialize(Place(TextVal(sent,"name"),lat,lon,false))));
    }
    placeGeneration++;
    Json(s,"200 OK","{\"ok\":true}");return;
   }
   // Location-only lab probe, never exposed by the production API. Forecast
   // integration will use this same resolution under the weather endpoint.
   if(path=="/api/weather/place"&&read){
    var p=ResolveKnownPlace();
    if(p==null){Json(s,"502 Bad Gateway","{\"code\":\"WEATHER_NO_SCHOOL_ADDRESS\",\"error\":\"학교 주소 또는 날씨 위치를 지정해 주세요.\"}");return;}
    Json(s,"200 OK",Serializer().Serialize(p));return;
   }
   Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");
  }catch(Exception e){
   if(!(e is IOException||e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;
   Json(s,"502 Bad Gateway","{\"code\":\"WEATHER_REQUEST_FAILED\",\"error\":\"날씨를 불러오지 못했어요. 다시 시도하거나 날씨 설정을 확인해 주세요.\"}");
  }
 }
 // Phase 4D-5a: private album, explicitly selected local lab folder only.
 static readonly object PhotoGate=new object();
 static readonly Dictionary<string,string> PhotoTypes=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase){{".jpg","image/jpeg"},{".jpeg","image/jpeg"},{".png","image/png"},{".webp","image/webp"},{".gif","image/gif"},{".bmp","image/bmp"}};
 static string photoFolder="";
 static List<string> photoFiles=new List<string>();
 static bool SafePhotoPath(string path,bool directory){
  try{
   string full=Path.GetFullPath(path),allowed=Path.GetFullPath(Path.Combine(labRoot,"photo-album")).TrimEnd(Path.DirectorySeparatorChar);
   // Lab isolation is stricter than production: never inspect arbitrary host folders.
   if(!full.Equals(allowed,StringComparison.OrdinalIgnoreCase)&&!full.StartsWith(allowed+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))return false;
   string cursor=full;
   while(true){
    var attr=File.GetAttributes(cursor);if((attr&FileAttributes.ReparsePoint)!=0)return false;
    if(cursor==full&&directory!=((attr&FileAttributes.Directory)!=0))return false;
    if(cursor.Equals(allowed,StringComparison.OrdinalIgnoreCase))break;
    cursor=Path.GetDirectoryName(cursor);if(String.IsNullOrEmpty(cursor))return false;
   }return true;
  }catch(IOException){return false;}catch(UnauthorizedAccessException){return false;}catch(ArgumentException){return false;}
 }
 static string SelectedPhotoFolder(){
  byte[] raw=Read("photos.txt");return raw==null?"":Utf8.GetString(raw).TrimStart('\uFEFF').Trim();
 }
 static Dictionary<string,object> RefreshPhotos(){
  photoFolder=SelectedPhotoFolder();photoFiles=new List<string>();
  int skipped=0;bool missing=false;
  if(photoFolder!=""){
   if(!SafePhotoPath(photoFolder,true))missing=true;
   else{
    var pending=new Stack<string>();pending.Push(Path.GetFullPath(photoFolder));int visited=0;
    var selected=new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
    while(pending.Count>0){
     string dir=pending.Pop();if(!SafePhotoPath(dir,true))continue;
     foreach(string path in Directory.EnumerateFileSystemEntries(dir)){
      if(++visited>100000)throw new IOException("Photo scan limit");
      FileAttributes a;try{a=File.GetAttributes(path);}catch(IOException){continue;}
      if((a&FileAttributes.ReparsePoint)!=0)continue;
      if((a&FileAttributes.Directory)!=0){pending.Push(path);continue;}
      string ext=Path.GetExtension(path);
      if(ext.Equals(".heic",StringComparison.OrdinalIgnoreCase)||ext.Equals(".heif",StringComparison.OrdinalIgnoreCase)){skipped++;continue;}
      if(!PhotoTypes.ContainsKey(ext))continue;
      selected.Add(path);if(selected.Count>3000)selected.Remove(selected.Max);
     }
    }
    photoFiles.AddRange(selected);
   }
  }
  return new Dictionary<string,object>{{"folder",photoFolder},{"count",photoFiles.Count},{"skipped",skipped},{"missing",missing}};
 }
 // Explicitly enabled lab dialog. Run on an STA thread and do not hold the
 // local data lock. A dismissed dialog returns null and preserves the setting.
 static string NativePhotoPicker(){
  string selected=null;Exception failure=null;
  var thread=new Thread(()=>{
   try{
    using(var owner=new System.Windows.Forms.Form())
    using(var dialog=new System.Windows.Forms.FolderBrowserDialog()){
     owner.TopMost=true;owner.ShowInTaskbar=false;owner.Opacity=0;
     owner.StartPosition=System.Windows.Forms.FormStartPosition.CenterScreen;
     dialog.Description="대시보드 사진첩에 표시할 사진 폴더를 고르세요. 하위 폴더의 사진도 함께 표시됩니다.";
     dialog.ShowNewFolderButton=false;
     string old=SelectedPhotoFolder();
     dialog.SelectedPath=SafePhotoPath(old,true)?old:Path.Combine(labRoot,"photo-album");
     owner.Show();owner.Activate();
     if(dialog.ShowDialog(owner)==System.Windows.Forms.DialogResult.OK)selected=dialog.SelectedPath;
     owner.Close();
    }
   }catch(Exception e){failure=e;}
  });
  thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start();thread.Join();
  if(failure!=null)throw new IOException("Photo picker failed",failure);
  return selected;
 }
 static void PhotoData(Stream s,string path,string target,string method,string host,string site,string origin){
  if(host!="127.0.0.1:"+Port||(site!=""&&site!="same-origin")||(origin!=""&&origin!="http://127.0.0.1:"+Port)){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  if(method!="GET"){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
  lock(PhotoGate){
   try{
    if(path=="/api/photos"){Json(s,"200 OK",Serializer().Serialize(RefreshPhotos()));return;}
    if(path=="/api/photos/pick"){
     // No path accepted from HTTP; fixture and interactive picker are mutually exclusive.
     if(Query(target).Count!=0){Json(s,"400 Bad Request","{\"error\":\"invalid picker request\"}");return;}
     string fixture=Path.Combine(labRoot,"photo-picker-result.txt"),interactive=Path.Combine(labRoot,"photo-picker-live.flag");
     bool hasFixture=File.Exists(fixture),hasInteractive=File.Exists(interactive);
     if(hasFixture==hasInteractive||(hasFixture&&(File.GetAttributes(fixture)&FileAttributes.ReparsePoint)!=0)||(hasInteractive&&(File.GetAttributes(interactive)&FileAttributes.ReparsePoint)!=0)){Json(s,"503 Service Unavailable","{\"error\":\"picker unavailable\"}");return;}
     string folder=hasFixture?File.ReadAllText(fixture).Trim():NativePhotoPicker();
     if(!String.IsNullOrEmpty(folder)){
      if(!SafePhotoPath(folder,true)){Json(s,"400 Bad Request","{\"error\":\"invalid folder\"}");return;}
      AtomicWrite("photos.txt",Utf8.GetBytes(Path.GetFullPath(folder)));
     }
     Json(s,"200 OK",Serializer().Serialize(RefreshPhotos()));return;
    }
    if(photoFolder!=SelectedPhotoFolder()||photoFiles.Count==0)RefreshPhotos();
    int index;var q=Query(target);
    if((q.Count!=1&&!(q.Count==2&&q.ContainsKey("t")&&MatchFull(Get(q,"t"),"[0-9]{1,16}")))||!MatchFull(Get(q,"i"),"[0-9]{1,5}")||!Int32.TryParse(Get(q,"i"),out index)||index<0||index>=photoFiles.Count){Json(s,"404 Not Found","{\"error\":\"not found\"}");return;}
    string file=photoFiles[index];
    if(!SafePhotoPath(file,false)||!file.StartsWith(Path.GetFullPath(photoFolder).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)){Json(s,"404 Not Found","{\"error\":\"not found\"}");return;}
    using(var input=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)){
     if(input.Length>62914560){Json(s,"404 Not Found","{\"error\":\"too large\"}");return;}
     byte[] data=new byte[(int)input.Length];int pos=0;while(pos<data.Length){int n=input.Read(data,pos,data.Length-pos);if(n==0)throw new IOException("Photo truncated");pos+=n;}
     Reply(s,"200 OK",PhotoTypes[Path.GetExtension(file)],data);
    }
   }catch(Exception e){
    if(!(e is IOException||e is UnauthorizedAccessException||e is ArgumentException||e is FormatException))throw;
    Json(s,"404 Not Found","{\"error\":\"not found\"}");
   }
  }
 }
 static string[] installedFonts;
 static readonly object SystemGate=new object();
 static string[] InstalledFonts(){
  if(installedFonts!=null)return installedFonts;
  var list=new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
  using(var fonts=new System.Drawing.Text.InstalledFontCollection())foreach(var family in fonts.Families){try{if(!String.IsNullOrWhiteSpace(family.Name))list.Add(family.Name);}finally{family.Dispose();}}
  installedFonts=new List<string>(list).ToArray();return installedFonts;
 }
 static void OpenSystemTarget(string target){
  string fixture=Path.Combine(labRoot,"system-open-fixture.flag"),live=Path.Combine(labRoot,"system-open-live.flag");
  bool fake=File.Exists(fixture),actual=File.Exists(live);
  if(fake==actual)throw new IOException("System open mode unavailable");
  string flag=fake?fixture:live;
  if((File.GetAttributes(flag)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked system mode");
  if(fake){
   string log=Path.Combine(labRoot,"system-open.log");
   if(File.Exists(log)&&(File.GetAttributes(log)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked system log");
   File.AppendAllText(log,Serializer().Serialize(new Dictionary<string,object>{{"target",target}})+"\n",Utf8);
  }else{
   // Explicit interactive lab mode only. Shell association, not a shell command.
   using(var process=Process.Start(new ProcessStartInfo{FileName=target,UseShellExecute=true})){}
  }
 }
 static readonly object AudioGate=new object();
 static Dictionary<string,object> ReadAudioFixture(){
  string flag=Path.Combine(labRoot,"audio-fixture.flag");
  if(!File.Exists(flag)||(File.GetAttributes(flag)&FileAttributes.ReparsePoint)!=0)return null;
  byte[] bytes=Read("audio-lab.json");
  if(bytes==null||bytes.Length>65536)throw new IOException("Audio fixture missing or too large");
  var data=Obj(Serializer().DeserializeObject(Utf8.GetString(bytes)));
  if(data==null)throw new IOException("Audio fixture invalid");
  return data;
 }
 static Dictionary<string,object> AudioVolume(double level,bool muted){
  return new Dictionary<string,object>{{"level",Math.Round(level)},{"muted",muted}};
 }
 // Phase 4E-3a: persist the existing dashboard's input-sharing settings.
 // The helper lifecycle is separate; this endpoint never installs a hook or launches a process.
 static Dictionary<string,object> ShareOptions(Dictionary<string,object> d){
  if(d==null||d.Count!=2||!(Val(d,"keyboard") is bool)||!(Val(d,"cursor") is bool))throw new FormatException("Share options");
  return new Dictionary<string,object>{{"keyboard",Val(d,"keyboard")},{"cursor",Val(d,"cursor")}};
 }
 // 4E-3b1: read only. Status requires fresh helper and matching native launcher ownership.
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 static Dictionary<string,object> FreshShareDocument(string name){
  var bytes=Read(name);
  if(bytes==null||bytes.Length>8192)return null;
  double age=(DateTime.UtcNow-File.GetLastWriteTimeUtc(Path.Combine(root,name))).TotalSeconds;
  if(age< -2||age>5)return null;
  return Obj(Serializer().DeserializeObject(Utf8.GetString(bytes).TrimStart('\uFEFF')));
 }
 static Dictionary<string,object> ShareHelperStatus(){
  var offline=new Dictionary<string,object>{{"running",false},{"hook",false},{"last",""}};
  try{
   var st=FreshShareDocument("share-input-status.json");
   var mode=FreshShareDocument("board-mode.json");
   var proofBytes=Read("native-mode-owner.json");
   if(st==null||mode==null||proofBytes==null||proofBytes.Length>8192)return offline;
   var proof=Obj(Serializer().DeserializeObject(Utf8.GetString(proofBytes).TrimStart('\uFEFF')));
   object pid=Val(st,"pid"),window=Val(mode,"window");
   if(!IntValue(pid,1,Int32.MaxValue)||!IntValue(window,1,Int64.MaxValue)||!Equals(pid,Val(mode,"pid"))||!Equals(pid,Val(proof,"pid"))||!Equals(window,Val(proof,"window"))||TextVal(mode,"mode")!="wallpaper"||TextVal(proof,"mode")!="wallpaper"||TextVal(st,"release")!=release||TextVal(mode,"release")!=release||TextVal(proof,"release")!=release||!(Val(st,"hook") is bool)||!(Val(st,"keyboard") is bool)||!(Val(st,"cursor") is bool))return offline;
   int id=Convert.ToInt32(pid);uint owner;
   if(GetWindowThreadProcessId(new IntPtr(Convert.ToInt64(window)),out owner)==0||owner!=(uint)id)return offline;
   using(var p=Process.GetProcessById(id)){
    if(p.HasExited)return offline;
    string exe=Path.GetFullPath(p.MainModule.FileName);
    if(!exe.StartsWith(labRoot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!String.Equals(Path.GetFileName(exe),"HOJA-Native-Launch-Lab.exe",StringComparison.OrdinalIgnoreCase))return offline;
   }
   return new Dictionary<string,object>{{"running",true},{"hook",Val(st,"hook")},{"keyboard",Val(st,"keyboard")},{"cursor",Val(st,"cursor")},{"release",release},{"last",""}};
  }catch(Exception e){
   if(!(e is IOException||e is UnauthorizedAccessException||e is ArgumentException||e is InvalidOperationException||e is System.ComponentModel.Win32Exception||e is FormatException||e is OverflowException))throw;
   return offline;
  }
 }
 static void ShareHelperData(Stream s,string path,string method,string site,string origin,byte[] payload){
  bool read=method=="GET";
  if((origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)||(site!="same-origin"&&!(read&&(site==""||site=="none")))){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  if((path=="/api/share-input/status"&&!read)||(path=="/api/share-input/restart"&&method!="POST")){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
  var state=ShareHelperStatus();
  if(read){Json(s,"200 OK",Serializer().Serialize(state));return;}
  if(payload.Length!=0){Json(s,"400 Bad Request","{\"error\":\"invalid restart request\"}");return;}
  // A running helper needs no restart. Offline restart awaits the owning native launcher's control channel.
  if(True(Val(state,"running")))Json(s,"200 OK","{\"ok\":true}");
  else Json(s,"503 Service Unavailable","{\"error\":\"helper restart unavailable\"}");
 }
 static void ShareOptionsData(Stream s,string method,string site,string origin,byte[] payload){
  bool read=method=="GET";
  if((origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)||(site!="same-origin"&&!(read&&(site==""||site=="none")))){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  if(!read&&method!="POST"){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
  Dictionary<string,object> options;
  if(read){
   try{
    byte[] bytes=Read("share-input.json");
    if(bytes==null)options=new Dictionary<string,object>{{"keyboard",false},{"cursor",false}};
    else{
     if(bytes.Length>4096)throw new FormatException("Share options size");
     options=ShareOptions(Obj(Serializer().DeserializeObject(Utf8.GetString(bytes).TrimStart('\uFEFF'))));
    }
   }catch(Exception e){
    if(!(e is IOException||e is UnauthorizedAccessException||e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;
    Json(s,"500 Internal Server Error","{\"error\":\"share settings unavailable\"}");return;
   }
  }else{
   try{
    if(payload.Length==0||payload.Length>4096)throw new FormatException("Share options size");
    options=ShareOptions(Obj(Serializer().DeserializeObject(Utf8.GetString(Convert.FromBase64String(Encoding.ASCII.GetString(payload))))));
   }catch(Exception e){
    if(!(e is FormatException||e is ArgumentException||e is InvalidOperationException))throw;
    Json(s,"400 Bad Request","{\"error\":\"invalid share settings\"}");return;
   }
   try{AtomicWrite("share-input.json",Utf8.GetBytes(Serializer().Serialize(options)));}
   catch(Exception e){if(!(e is IOException||e is UnauthorizedAccessException))throw;Json(s,"500 Internal Server Error","{\"error\":\"share settings unavailable\"}");return;}
  }
  Json(s,"200 OK",Serializer().Serialize(options));
 }
 static void AudioData(Stream s,string path,string method,string site,string origin,byte[] payload){
  bool read=method=="GET";
  if((origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)||(site!="same-origin"&&!(read&&(site==""||site=="none")))){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  if((path=="/api/speakers"&&!read)||(path=="/api/speakers/set"&&method!="POST")||(path=="/api/volume"&&!read&&method!="POST")){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
  lock(AudioGate){
   try{
    var fixture=ReadAudioFixture();
    if(!read&&fixture==null){Json(s,"503 Service Unavailable","{\"error\":\"audio mutation disabled\"}");return;}
    var devices=new List<object>();
    if(fixture!=null){foreach(var item in Arr(Val(fixture,"list")))devices.Add(item);}
    else if(path=="/api/speakers"){foreach(var d in TTSpeakers.All())devices.Add(new Dictionary<string,object>{{"id",d.Id},{"name",d.Name},{"current",d.IsDefault}});}
    if(path=="/api/speakers"){Json(s,"200 OK",Serializer().Serialize(new Dictionary<string,object>{{"list",devices}}));return;}
    Dictionary<string,object> body=null;
    if(!read){
     if(payload.Length==0||payload.Length>8192)throw new FormatException("Audio payload");
     body=Obj(Serializer().DeserializeObject(Utf8.GetString(Convert.FromBase64String(Encoding.ASCII.GetString(payload)))));
     if(body==null)throw new FormatException("Audio body");
    }
    if(path=="/api/speakers/set"){
     string id=TextVal(body,"id");bool found=false;
     foreach(var item in devices)if(TextVal(Obj(item),"id")==id)found=true;
     if(id==""||!found)throw new FormatException("Speaker not found");
     foreach(var item in devices){var d=Obj(item);d["current"]=TextVal(d,"id")==id;}
     fixture["list"]=devices;
     AtomicWrite("audio-lab.json",Utf8.GetBytes(Serializer().Serialize(fixture)));
     Json(s,"200 OK","{\"ok\":true}");return;
    }
    double level;bool muted;
    if(fixture!=null){
     if(!Coordinate(Val(fixture,"level"),out level)||!(Val(fixture,"muted") is bool))throw new IOException("Audio fixture volume");
     muted=True(Val(fixture,"muted"));
    }else{level=TTVolume.Level()*100;muted=TTVolume.Muted();}
    if(!read){
     double desired;
     if(Val(body,"level")!=null){if(!Coordinate(Val(body,"level"),out desired))throw new FormatException("Volume level");level=Math.Max(0,Math.Min(100,desired));}
     if(Val(body,"muted")!=null){if(!(Val(body,"muted") is bool))throw new FormatException("Volume mute");muted=True(Val(body,"muted"));}
     fixture["level"]=level;fixture["muted"]=muted;
     AtomicWrite("audio-lab.json",Utf8.GetBytes(Serializer().Serialize(fixture)));
    }
    Json(s,"200 OK",Serializer().Serialize(AudioVolume(level,muted)));
   }catch(Exception e){
    if(e is FormatException||e is ArgumentException){Json(s,"400 Bad Request","{\"error\":\"invalid audio request\"}");return;}
    if(!(e is IOException||e is UnauthorizedAccessException||e is COMException||e is InvalidOperationException||e is System.ComponentModel.Win32Exception))throw;
    Json(s,"500 Internal Server Error","{\"error\":\"audio unavailable\"}");
   }
  }
 }
 static void SystemData(Stream s,string path,string method,string site,string origin,byte[] payload){
  bool read=method=="GET";
  if((origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)||(site!="same-origin"&&!(read&&(site==""||site=="none")))){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
  if((path=="/api/fonts"&&!read)||(path!="/api/fonts"&&method!="POST")){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
  lock(SystemGate){
   try{
    if(path=="/api/fonts"){Json(s,"200 OK",Serializer().Serialize(new Dictionary<string,object>{{"list",InstalledFonts()}}));return;}
    string target;
    if(path=="/api/open-manager")target="https://xkdtndbrwk111-prog.github.io/teacher-tools/seating/";
    else if(path=="/api/open-sheet-copy")target="https://docs.google.com/spreadsheets/d/"+SheetTemplate+"/copy";
    else if(path=="/api/open-sound-settings")target="ms-settings:sound";
    else{
     if(payload.Length==0||payload.Length>8192){Json(s,"400 Bad Request","{\"error\":\"url\"}");return;}
     var body=Obj(Serializer().DeserializeObject(Utf8.GetString(payload)));string url=TextVal(body,"url");Uri uri;
     if(url.Length==0||url.Length>2000||Regex.IsMatch(url,@"[\x00-\x20\x7f]")||!Uri.TryCreate(url,UriKind.Absolute,out uri)||(uri.Scheme!="https"&&uri.Scheme!="http")||uri.UserInfo!=""||String.IsNullOrEmpty(uri.Host)){Json(s,"400 Bad Request","{\"error\":\"url\"}");return;}
     target=uri.AbsoluteUri;
    }
    OpenSystemTarget(target);Json(s,"200 OK","{\"ok\":true}");
   }catch(Exception e){
    if(e is FormatException||e is ArgumentException||e is InvalidOperationException){Json(s,"400 Bad Request","{\"error\":\"url\"}");return;}
    if(!(e is IOException||e is UnauthorizedAccessException||e is System.ComponentModel.Win32Exception))throw;
    Json(s,"503 Service Unavailable","{\"error\":\"system open unavailable\"}");
   }
  }
 }
 static void Serve(TcpClient c){
  c.ReceiveTimeout=1000;c.SendTimeout=10000;NoInherit(c.Client);
  using(var s=c.GetStream()){
   try{
   int budget=32768;string[] req=ReadLine(s,ref budget).Split(' ');
   var h=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
   while(true){string line=ReadLine(s,ref budget);if(line=="")break;int i=line.IndexOf(':');if(i<1||!Regex.IsMatch(line.Substring(0,i),"^[A-Za-z0-9-]+$"))throw new IOException("Header");string k=line.Substring(0,i);if(h.ContainsKey(k))throw new IOException("Duplicate header");h.Add(k,line.Substring(i+1).Trim());}
   if(req.Length!=3||!req[1].StartsWith("/")||req[1].StartsWith("//")||req[1].Split('?')[0].Contains("\\")||req[1].Split('?')[0].Contains("%")||req[1].Split('?')[0].Contains("..")||req[1].Contains("#")||(req[2]!="HTTP/1.1"&&req[2]!="HTTP/1.0")){Json(s,"400 Bad Request","{\"error\":\"request\"}");return;}
   string host=Get(h,"Host"),site=Get(h,"Sec-Fetch-Site"),origin=Get(h,"Origin");
   string path=req[1].Split('?')[0];
   bool write=coinWrites&&req[0]=="POST"&&(path=="/api/coins"||path=="/api/seating"||path=="/api/roster"||path=="/api/notice"||path=="/api/theme/publish"||path=="/api/presentation/send"||path=="/api/presentation/close"||path=="/api/presentation/ack"||path=="/api/school"||path=="/api/weather/place"||path=="/api/open-web"||path=="/api/open-manager"||path=="/api/open-sheet-copy"||path=="/api/open-sound-settings"||path=="/api/speakers/set"||path=="/api/volume"||path=="/api/share-input"||path=="/api/share-input/restart");
   int length=0;
   string cl=Get(h,"Content-Length");
   if(Get(h,"Transfer-Encoding")!=""||(cl!=""&&(!Regex.IsMatch(cl,"^[0-9]{1,8}$")||!Int32.TryParse(cl,out length)))||length>8388608){Json(s,"400 Bad Request","{\"error\":\"request\"}");return;}
   byte[] payload=new byte[length];
   if(length>0){
    if(!write){Json(s,"400 Bad Request","{\"error\":\"request\"}");return;}
    for(int pos=0;pos<length;){int n=s.Read(payload,pos,length-pos);if(n<=0)throw new EndOfStreamException();pos+=n;}
   }
   if(host!="127.0.0.1:"+Port&&host!="localhost:"+Port){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
   if(coinWrites&&(path=="/api/photos"||path=="/api/photos/pick"||path=="/photo")){PhotoData(s,path,req[1],req[0],host,site,origin);return;}
   if(coinWrites&&(path=="/api/speakers"||path=="/api/speakers/set"||path=="/api/volume")){AudioData(s,path,req[0],site,origin,payload);return;}
   if(coinWrites&&(path=="/api/fonts"||path=="/api/open-web"||path=="/api/open-manager"||path=="/api/open-sheet-copy"||path=="/api/open-sound-settings")){SystemData(s,path,req[0],site,origin,payload);return;}
   bool remote=coinWrites&&req[0]=="GET"&&(path=="/api/school/search"||path=="/api/meal"||path=="/api/events"||path=="/api/week"||path=="/api/weather/places"||path=="/api/weather");
   if(remote){
    if(!RemoteSlots.Wait(0)){Json(s,"503 Service Unavailable","{\"error\":\"upstream busy\"}");return;}
    try{upstreamBudget=Stopwatch.StartNew();if(path=="/api/weather")WeatherForecastData(s,req[1],site,origin);else if(path=="/api/weather/places")WeatherPlaceData(s,path,req[1],req[0],site,origin,payload);else SchoolData(s,path,req[1],req[0],site,origin,payload);}finally{upstreamBudget=null;RemoteSlots.Release();}
    return;
   }
   // All local writes, presentation transitions, and revision checks are serialized.
   lock(LocalGate){
   if(coinWrites&&path=="/api/share-input"){ShareOptionsData(s,req[0],site,origin,payload);return;}
   if(coinWrites&&(path=="/api/share-input/status"||path=="/api/share-input/restart")){ShareHelperData(s,path,req[0],site,origin,payload);return;}
   if(coinWrites&&(path=="/api/weather/place"||path=="/api/weather/places")){WeatherPlaceData(s,path,req[1],req[0],site,origin,payload);return;}
   if(coinWrites&&(path=="/api/school"||path=="/api/school/search"||path=="/api/meal"||path=="/api/events"||path=="/api/week")){SchoolData(s,path,req[1],req[0],site,origin,payload);return;}
   if(coinWrites&&path.StartsWith("/api/presentation/",StringComparison.Ordinal)){Presentation(s,path,req[1],req[0],site,origin,payload);return;}
   if(coinWrites&&(path=="/presentation-board.js"||path=="/presentation-board.css"||path.StartsWith("/presentation/",StringComparison.Ordinal))){PresentationAsset(s,path,req[0],site);return;}
   if(write){
    if(site!="same-origin"||(origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
    if(path=="/api/roster"&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
    if(path=="/api/theme/publish"){
     if(origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
     PublishTheme(s,payload);return;
    }
    if(path=="/api/coins")AppendCoins(s,h,payload);else if(path=="/api/notice")AppendNotice(s,payload);else SaveSeating(s,payload,path=="/api/roster");return;
   }
   if(path=="/api/board-status"||path=="/api/theme"){
    bool theme=path=="/api/theme";
    if((theme||origin!="")&&!ManagerOrigin(origin)){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
    if(req[0]=="OPTIONS"){CorsJson(s,"204 No Content","",origin);return;}
    if(req[0]!="GET"){CorsJson(s,"405 Method Not Allowed","{\"error\":\"method\"}",origin);return;}
    if(theme){
     if(boardTheme==null||(DateTime.UtcNow-themeAt).TotalSeconds>45)CorsJson(s,"503 Service Unavailable","{\"error\":\"theme unavailable\"}",origin);
     else CorsJson(s,"200 OK",Serializer().Serialize(boardTheme),origin);
    }else CorsJson(s,"200 OK",Serializer().Serialize(BoardStatus()),origin);
    return;
   }
   if(req[0]!="GET"){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
   if(path=="/health"){Json(s,"200 OK","{\"service\":\"teacher-tools-local\",\"version\":493,\"release\":\""+release+"\"}");return;}
   if(path=="/api/notice"){
    if((site!=""&&site!="same-origin")||(origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
    Reply(s,"200 OK","text/plain; charset=utf-8",Read("notice.log")??new byte[0]);return;
   }
   if(path=="/api/coins"||path=="/api/seating"){
    if((site!=""&&site!="same-origin")||(origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
    bool coin=path=="/api/coins";byte[] data=Read(coin?"coins.log":"seating.json");string extra=(coin?"X-TT-Coin-Revision: ":"X-TT-Seating-Revision: ")+Sha(data??new byte[0])+"\r\n";
    if(!coin&&data==null){Reply(s,"404 Not Found","application/json; charset=utf-8",Utf8.GetBytes("{\"error\":\"none\"}"),extra);return;}
    Reply(s,"200 OK",coin?"text/plain; charset=utf-8":"application/json; charset=utf-8",data??new byte[0],extra);return;
   }
   string name;
   if(!Assets.TryGetValue(path,out name)){
    Match m=Regex.Match(path,"^/museum-clouds/(sky|far|near)$");
    if(m.Success)name=m.Groups[1].Value=="sky"?"museum-sky.webp":"museum-cloud-"+m.Groups[1].Value+".webp";
    else{
     m=Regex.Match(path,"^/museum-sway/(base|sheet)/(spring|summer|autumn|winter)(?:/(left|right))?$");
     if(m.Success){string kind=m.Groups[1].Value,season=m.Groups[2].Value,half=m.Groups[3].Value;
      if(kind=="base"&&half=="")name="museum-sway-"+season+"-base.webp";
      else if(kind=="sheet"&&season=="winter"&&half!="")name="museum-sway-winter-"+half+".png";
      else if(kind=="sheet"&&season!="winter"&&half=="")name="museum-sway-"+season+"-sheet.png";
      else{Json(s,"404 Not Found","{\"error\":\"invalid sway route\"}");return;}
     }
    }
   }
   if(name==null){Json(s,"404 Not Found","{\"error\":\"not found\"}");return;}
   byte[] bytes=Read(name);
   if(bytes==null){Json(s,"404 Not Found","{\"error\":\"missing asset\"}");return;}
   if(name=="dashboard.html"){using(var reader=new StreamReader(new MemoryStream(bytes),Encoding.UTF8,true))bytes=Utf8.GetBytes(reader.ReadToEnd());}
   Reply(s,"200 OK",Type(name),bytes);
   }
   }finally{
    // NetworkStream owns the socket. Half-close before disposing it, never afterward.
    try{c.Client.Shutdown(SocketShutdown.Send);}catch(SocketException){}catch(ObjectDisposedException){}
   }
  }
 }
 static int Main(string[] args){
  if(args.Length!=1||(args[0]!="--lab-read-server"&&args[0]!="--lab-coin-server"))return 2;
  coinWrites=args[0]=="--lab-coin-server";if(coinWrites)Port=17451;
  string lab=Environment.GetEnvironmentVariable("HOJA_LAB_ROOT"),local=Environment.GetEnvironmentVariable("LOCALAPPDATA");
  if(String.IsNullOrEmpty(lab)||String.IsNullOrEmpty(local))return 2;
  lab=Path.GetFullPath(lab);if(!Regex.IsMatch(Path.GetFileName(lab),"^hoja-webview-lab-[a-f0-9]{32}$")||!String.Equals(Path.GetFullPath(local),Path.Combine(lab,"local"),StringComparison.OrdinalIgnoreCase))return 2;
  labRoot=lab;root=Path.Combine(local,"TeacherToolsLocal");
  if(coinWrites&&!File.Exists(Path.Combine(lab,"coin-write-fixture.flag")))return 2;
  var j=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"release.json")));
  release=(string)j["release"];if(!Regex.IsMatch(release,"^[0-9-]+-V[0-9.]+-STABLE-PILOT$"))return 2;
  var l=new TcpListener(IPAddress.Loopback,Port);l.ExclusiveAddressUse=true;
  try{ThreadPool.SetMinThreads(20,20);NoInherit(l.Server);l.Start();NoInherit(l.Server);
   if(coinWrites)ClearAbandonedWrites();
   File.WriteAllText(Path.Combine(lab,"native-read-server.ready"),Process.GetCurrentProcess().Id.ToString());
   while(!File.Exists(Path.Combine(lab,"native-read-server.stop"))){
    if(!l.Pending()){Thread.Sleep(20);continue;}
    if(!ClientSlots.Wait(0)){Thread.Sleep(20);continue;}
    TcpClient c;
    try{c=l.AcceptTcpClient();NoInherit(c.Client);}catch{ClientSlots.Release();throw;}
    ThreadPool.QueueUserWorkItem(_=>{
     try{using(c){Serve(c);}}
     catch(IOException e){Console.Error.WriteLine("Rejected connection: "+e.GetType().Name);}
     catch(SocketException e){Console.Error.WriteLine("Socket: "+e.SocketErrorCode);}
     catch(UnauthorizedAccessException){Console.Error.WriteLine("File access rejected");}
     catch(Exception e){Console.Error.WriteLine("Request rejected: "+e.GetType().Name);}
     finally{ClientSlots.Release();}
    });
   }
   l.Stop();
   // Bounded graceful drain. Never report a clean stop while a writer is active.
   int acquired=0;try{while(acquired<16&&ClientSlots.Wait(10000))acquired++;return acquired==16?0:1;}finally{if(acquired>0)ClientSlots.Release(acquired);}
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}finally{l.Stop();}
 }
}

// Core Audio declarations inherited from runtime-src/system/speaker.ps1.
public class TTSpeakerDevice { public string Id; public string Name; public bool IsDefault; }
[StructLayout(LayoutKind.Sequential)] public struct TTPropertyKey { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit)] public struct TTPropVariant { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr pointer; [FieldOffset(16)] public IntPtr filler; }
[ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTPropertyStore { [PreserveSig] int GetCount(out int count); [PreserveSig] int GetAt(int index, out TTPropertyKey key); [PreserveSig] int GetValue(ref TTPropertyKey key, out TTPropVariant value); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTDevice { [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result); [PreserveSig] int OpenPropertyStore(int access, out ITTPropertyStore store); [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id); [PreserveSig] int GetState(out int state); }
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTDeviceCollection { [PreserveSig] int GetCount(out int count); [PreserveSig] int Item(int index, out ITTDevice device); }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTDeviceEnumerator { [PreserveSig] int EnumAudioEndpoints(int flow, int stateMask, out ITTDeviceCollection devices); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out ITTDevice device); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class TTDeviceEnumerator { }
[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTPolicyConfig {
 [PreserveSig] int GetMixFormat(); [PreserveSig] int GetDeviceFormat(); [PreserveSig] int ResetDeviceFormat(); [PreserveSig] int SetDeviceFormat(); [PreserveSig] int GetProcessingPeriod(); [PreserveSig] int SetProcessingPeriod(); [PreserveSig] int GetShareMode(); [PreserveSig] int SetShareMode(); [PreserveSig] int GetPropertyValue(); [PreserveSig] int SetPropertyValue();
 [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
}
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class TTPolicyConfig { }
public static class TTSpeakers {
 [DllImport("ole32.dll")] static extern int PropVariantClear(ref TTPropVariant value);
 static void Check(int hr) { if (hr != 0) Marshal.ThrowExceptionForHR(hr); }
 static string NameOf(ITTDevice device) {
  ITTPropertyStore store; Check(device.OpenPropertyStore(0, out store));
  TTPropertyKey key = new TTPropertyKey(); key.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); key.pid = 14;
  TTPropVariant value; Check(store.GetValue(ref key, out value));
  string name = value.vt == 31 ? Marshal.PtrToStringUni(value.pointer) : "";
  PropVariantClear(ref value);
  return name;
 }
 public static List<TTSpeakerDevice> All() {
  ITTDeviceEnumerator all = (ITTDeviceEnumerator)new TTDeviceEnumerator();
  string current = null; ITTDevice main;
  if (all.GetDefaultAudioEndpoint(0, 1, out main) == 0 && main != null) Check(main.GetId(out current));
  ITTDeviceCollection devices; Check(all.EnumAudioEndpoints(0, 1, out devices));
  int count; Check(devices.GetCount(out count));
  List<TTSpeakerDevice> result = new List<TTSpeakerDevice>();
  for (int i = 0; i < count; i++) {
   ITTDevice device; Check(devices.Item(i, out device));
   string id; Check(device.GetId(out id));
   TTSpeakerDevice item = new TTSpeakerDevice(); item.Id = id; item.Name = NameOf(device); item.IsDefault = id == current;
   result.Add(item);
  }
  return result;
 }
 public static void Set(string id) {
  ITTPolicyConfig policy = (ITTPolicyConfig)new TTPolicyConfig();
  for (int role = 0; role < 3; role++) Check(policy.SetDefaultEndpoint(id, role));
 }
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTEndpointVolume {
 [PreserveSig] int RegisterControlChangeNotify(IntPtr notify); [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
 [PreserveSig] int GetChannelCount(out uint count); [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid context);
 [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context); [PreserveSig] int GetMasterVolumeLevel(out float db);
 [PreserveSig] int GetMasterVolumeLevelScalar(out float level); [PreserveSig] int SetChannelVolumeLevel(uint channel, float db, ref Guid context);
 [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context); [PreserveSig] int GetChannelVolumeLevel(uint channel, out float db);
 [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level); [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
 [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
// The volume of whichever speaker Windows is using now.
public static class TTVolume {
 static void Check(int hr) { if (hr != 0) Marshal.ThrowExceptionForHR(hr); }
 static ITTEndpointVolume Endpoint() {
  ITTDeviceEnumerator all = (ITTDeviceEnumerator)new TTDeviceEnumerator(); ITTDevice device;
  Check(all.GetDefaultAudioEndpoint(0, 1, out device));
  Guid iid = typeof(ITTEndpointVolume).GUID; object result;
  Check(device.Activate(ref iid, 23, IntPtr.Zero, out result));
  return (ITTEndpointVolume)result;
 }
 public static float Level() { float v; Check(Endpoint().GetMasterVolumeLevelScalar(out v)); return v; }
 public static bool Muted() { bool m; Check(Endpoint().GetMute(out m)); return m; }
 public static void SetLevel(float v) { Guid g = Guid.Empty; Check(Endpoint().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), ref g)); }
 public static void SetMute(bool m) { Guid g = Guid.Empty; Check(Endpoint().SetMute(m, ref g)); }
}
