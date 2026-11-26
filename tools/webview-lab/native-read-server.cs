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
 const int Port=17450;
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
 static void Serve(TcpClient c){
  c.ReceiveTimeout=1000;c.SendTimeout=10000;NoInherit(c.Client);
  using(var s=c.GetStream()){
   int budget=32768;string[] req=ReadLine(s,ref budget).Split(' ');
   if(req.Length!=3||!req[1].StartsWith("/")||req[1].StartsWith("//")||req[1].Contains("\\")||req[1].Contains("%")||req[1].Contains("..")||req[1].Contains("#")||(req[2]!="HTTP/1.1"&&req[2]!="HTTP/1.0")){Json(s,"400 Bad Request","{\"error\":\"request\"}");return;}
   var h=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
   while(true){string line=ReadLine(s,ref budget);if(line=="")break;int i=line.IndexOf(':');if(i<1||!Regex.IsMatch(line.Substring(0,i),"^[A-Za-z0-9-]+$"))throw new IOException("Header");string k=line.Substring(0,i);if(h.ContainsKey(k))throw new IOException("Duplicate header");h.Add(k,line.Substring(i+1).Trim());}
   string host=Get(h,"Host"),site=Get(h,"Sec-Fetch-Site"),origin=Get(h,"Origin");
   if(host!="127.0.0.1:"+Port&&host!="localhost:"+Port){Json(s,"403 Forbidden","{\"error\":\"forbidden\"}");return;}
   if(req[0]!="GET"){Json(s,"405 Method Not Allowed","{\"error\":\"method\"}");return;}
   if(Get(h,"Transfer-Encoding")!=""||(Get(h,"Content-Length")!=""&&Get(h,"Content-Length")!="0")){Json(s,"400 Bad Request","{\"error\":\"request\"}");return;}
   string path=req[1].Split('?')[0];
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
  }
 }
 static int Main(string[] args){
  if(args.Length!=1||args[0]!="--lab-read-server")return 2;
  string lab=Environment.GetEnvironmentVariable("HOJA_LAB_ROOT"),local=Environment.GetEnvironmentVariable("LOCALAPPDATA");
  if(String.IsNullOrEmpty(lab)||String.IsNullOrEmpty(local))return 2;
  lab=Path.GetFullPath(lab);if(!Regex.IsMatch(Path.GetFileName(lab),"^hoja-webview-lab-[a-f0-9]{32}$")||!String.Equals(Path.GetFullPath(local),Path.Combine(lab,"local"),StringComparison.OrdinalIgnoreCase))return 2;
  root=Path.Combine(local,"TeacherToolsLocal");
  var j=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"release.json")));
  release=(string)j["release"];if(!Regex.IsMatch(release,"^[0-9-]+-V[0-9.]+-STABLE-PILOT$"))return 2;
  var l=new TcpListener(IPAddress.Loopback,Port);l.ExclusiveAddressUse=true;
  try{NoInherit(l.Server);l.Start();NoInherit(l.Server);
   File.WriteAllText(Path.Combine(lab,"native-read-server.ready"),Process.GetCurrentProcess().Id.ToString());
   while(!File.Exists(Path.Combine(lab,"native-read-server.stop"))){
    if(!l.Pending()){Thread.Sleep(20);continue;}
    using(var c=l.AcceptTcpClient()){try{Serve(c);}catch(IOException){}catch(SocketException){}catch(UnauthorizedAccessException){}}
   }return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}finally{l.Stop();}
 }
}
