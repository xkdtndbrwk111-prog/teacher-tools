// Phase 4A: isolated read-only HTTP server, no product port or writes.
using System;
using System.IO;
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
 static string root,release;
 static readonly Encoding Utf8=new UTF8Encoding(false,true);
 static readonly Dictionary<string,string> Assets=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase){
  {"/","dashboard.html"},{"/index.html","dashboard.html"},{"/seating-inbox","seating-inbox.html"},
  {"/coins.js","coins.js"},{"/coins-ui.js","coins-ui.js"},{"/update-ui.js","update-ui.js"},{"/podo.js","podo.js"},{"/handmade-paper.png","handmade-paper.png"}
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
  string dest=Path.Combine(root,"coins.log"),tmp=Path.Combine(root,"coins.log.native-"+Guid.NewGuid().ToString("N")+".tmp");
  try{
   using(var f=new FileStream(tmp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){f.Write(next,0,next.Length);f.Flush(true);}
   if(File.Exists(dest))File.Replace(tmp,dest,null);else File.Move(tmp,dest);
   Reply(s,"200 OK","application/json; charset=utf-8",Utf8.GetBytes("{\"ok\":true}"),"X-TT-Coin-Revision: "+Sha(next)+"\r\n");
  }finally{if(File.Exists(tmp))File.Delete(tmp);}
 }
 static void Serve(TcpClient c){
  c.ReceiveTimeout=1000;c.SendTimeout=10000;NoInherit(c.Client);
  using(var s=c.GetStream()){
   try{
   int budget=32768;string[] req=ReadLine(s,ref budget).Split(' ');
   var h=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
   while(true){string line=ReadLine(s,ref budget);if(line=="")break;int i=line.IndexOf(':');if(i<1||!Regex.IsMatch(line.Substring(0,i),"^[A-Za-z0-9-]+$"))throw new IOException("Header");string k=line.Substring(0,i);if(h.ContainsKey(k))throw new IOException("Duplicate header");h.Add(k,line.Substring(i+1).Trim());}
   if(req.Length!=3||!req[1].StartsWith("/")||req[1].StartsWith("//")||req[1].Contains("\\")||req[1].Contains("%")||req[1].Contains("..")||req[1].Contains("#")||(req[2]!="HTTP/1.1"&&req[2]!="HTTP/1.0")){Json(s,"400 Bad Request","{\"error\":\"request\"}");return;}
   string host=Get(h,"Host"),site=Get(h,"Sec-Fetch-Site"),origin=Get(h,"Origin");
   string path=req[1].Split('?')[0];
   bool write=coinWrites&&req[0]=="POST"&&path=="/api/coins";
   int length=0;
   string cl=Get(h,"Content-Length");
   if(Get(h,"Transfer-Encoding")!=""||(cl!=""&&(!Regex.IsMatch(cl,"^[0-9]{1,8}$")||!Int32.TryParse(cl,out length)))||length>8388608){Json(s,"400 Bad Request","{\"error\":\"request\"}");return;}
   byte[] payload=new byte[length];
   if(length>0){
    if(!write){Json(s,"400 Bad Request","{\"error\":\"request\"}");return;}
    for(int pos=0;pos<length;){int n=s.Read(payload,pos,length-pos);if(n<=0)throw new EndOfStreamException();pos+=n;}
   }
   if(host!="127.0.0.1:"+Port&&host!="localhost:"+Port){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
   if(write){
    if(site!="same-origin"||(origin!=""&&origin!="http://127.0.0.1:"+Port&&origin!="http://localhost:"+Port)){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
    AppendCoins(s,h,payload);return;
   }
   if(req[0]!="GET"){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
   if(path=="/health"){Json(s,"200 OK","{\"service\":\"teacher-tools-local\",\"version\":493,\"release\":\""+release+"\"}");return;}
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
  root=Path.Combine(local,"TeacherToolsLocal");
  if(coinWrites&&!File.Exists(Path.Combine(lab,"coin-write-fixture.flag")))return 2;
  var j=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"release.json")));
  release=(string)j["release"];if(!Regex.IsMatch(release,"^[0-9-]+-V[0-9.]+-STABLE-PILOT$"))return 2;
  var l=new TcpListener(IPAddress.Loopback,Port);l.ExclusiveAddressUse=true;
  try{NoInherit(l.Server);l.Start();NoInherit(l.Server);
   File.WriteAllText(Path.Combine(lab,"native-read-server.ready"),Process.GetCurrentProcess().Id.ToString());
   while(!File.Exists(Path.Combine(lab,"native-read-server.stop"))){
    if(!l.Pending()){Thread.Sleep(20);continue;}
    using(var c=l.AcceptTcpClient()){try{Serve(c);}catch(IOException e){Console.Error.WriteLine("Rejected connection: "+e.GetType().Name);}catch(SocketException e){Console.Error.WriteLine("Socket: "+e.SocketErrorCode);}catch(UnauthorizedAccessException){Console.Error.WriteLine("File access rejected");}}
   }return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}finally{l.Stop();}
 }
}
