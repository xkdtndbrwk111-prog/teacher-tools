# Offline media server candidate. Windows PowerShell 5.1 / .NET Framework.
# Isolated process only: never serve media from the board's synchronous HTTP loop.
function Start-TTYoutubeMediaServer([string]$MediaPath,[string]$SessionDir,[string]$Token,[int]$BoardPort=17439,[int]$MaxSeconds=14400,[int]$ParentPid=0){
 if($Token -cnotmatch '^[a-f0-9]{32}$' -or $BoardPort -lt 1 -or $BoardPort -gt 65535 -or $MaxSeconds -lt 1 -or $MaxSeconds -gt 14400){throw 'media server parameters'}
 $item=Get-Item -LiteralPath $MediaPath -ErrorAction Stop
 if($item.PSIsContainer -or $item.Name -cne 'video.mp4' -or $item.Length -le 0 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'invalid media file'}
 if(!(Test-Path -LiteralPath $SessionDir -PathType Container)){throw 'missing session directory'}
 if(-not ('TTOfflineMediaServer' -as [type])){
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Globalization;
using System.Collections.Generic;
using System.Threading;
using System.Diagnostics;

public static class TTOfflineMediaServer {
 static string ReadLine(Stream s, ref int total) {
  var line = new StringBuilder();
  while (true) {
   int b = s.ReadByte();
   if (b < 0) throw new EndOfStreamException();
   if (++total > 8192 || line.Length > 4096) throw new IOException("header limit");
   if (b == 10) return line.ToString().TrimEnd('\r');
   if (b > 127 || (b < 32 && b != 13 && b != 9)) throw new IOException("invalid header");
   line.Append((char)b);
  }
 }
 static void Header(Stream s, string status, long length, string extra) {
  byte[] bytes = Encoding.ASCII.GetBytes("HTTP/1.1 "+status+"\r\nContent-Type: video/mp4\r\nContent-Length: "+length.ToString(CultureInfo.InvariantCulture)+"\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nCross-Origin-Resource-Policy: same-site\r\nAccept-Ranges: bytes\r\n"+extra+"\r\n");
  s.Write(bytes,0,bytes.Length);
 }
 static bool ByteRange(string value, long size, out long first, out long last) {
  first=0;last=size-1;
  if(String.IsNullOrEmpty(value))return true;
  if(!value.StartsWith("bytes=",StringComparison.Ordinal)||value.IndexOf(',')>=0)return false;
  string[] p=value.Substring(6).Split('-');
  if(p.Length!=2)return false;
  long a,b;
  if(p[0].Length==0) {
   if(!Int64.TryParse(p[1],NumberStyles.None,CultureInfo.InvariantCulture,out b)||b<=0)return false;
   first=Math.Max(0,size-b);return true;
  }
  if(!Int64.TryParse(p[0],NumberStyles.None,CultureInfo.InvariantCulture,out a)||a<0||a>=size)return false;
  first=a;
  if(p[1].Length!=0){
   if(!Int64.TryParse(p[1],NumberStyles.None,CultureInfo.InvariantCulture,out b)||b<a)return false;
   last=Math.Min(last,b);
  }
  return true;
 }
 static void Serve(TcpClient client, string path, string token, int port, int boardPort, string stop, DateTime end, Process parent) {
  client.ReceiveTimeout=5000;client.SendTimeout=5000;
  using(client)using(var s=client.GetStream()) {
   int total=0;string[] req=ReadLine(s,ref total).Split(' ');
   var h=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
   while(true){
    string line=ReadLine(s,ref total);if(line.Length==0)break;
    int colon=line.IndexOf(':');if(colon<1)throw new IOException("invalid header");
    string key=line.Substring(0,colon);
    if(h.ContainsKey(key))throw new IOException("duplicate header");
    h.Add(key,line.Substring(colon+1).Trim());
   }
   string host, origin, referer, site, range, mode;
   h.TryGetValue("Host",out host);h.TryGetValue("Origin",out origin);h.TryGetValue("Referer",out referer);h.TryGetValue("Sec-Fetch-Site",out site);h.TryGetValue("Range",out range);h.TryGetValue("Sec-Fetch-Mode",out mode);
   string board="http://127.0.0.1:"+boardPort.ToString(CultureInfo.InvariantCulture);
   string local="http://localhost:"+boardPort.ToString(CultureInfo.InvariantCulture);
   bool boardRef=referer==board+"/" || referer==local+"/" || referer==board+"/index.html" || referer==local+"/index.html";
   bool boardOrigin=origin==board || origin==local;
   if(req.Length!=3 || req[2]!="HTTP/1.1" || host!="127.0.0.1:"+port.ToString(CultureInfo.InvariantCulture) || req[1]!="/"+token+"/video.mp4" || (site=="cross-site"&&!boardOrigin) || (origin!=null&&!boardOrigin) || (!boardRef&&!boardOrigin) || mode=="navigate"){
    Header(s,"403 Forbidden",0,"");return;
   }
   if(req[0]!="GET"&&req[0]!="HEAD"){Header(s,"405 Method Not Allowed",0,"Allow: GET, HEAD\r\n");return;}
   using(var f=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)) {
    long first,last,size=f.Length;
    if(size<=0||!ByteRange(range,size,out first,out last)){Header(s,"416 Range Not Satisfiable",0,"Content-Range: bytes */"+size.ToString(CultureInfo.InvariantCulture)+"\r\n");return;}
    long length=last-first+1;
    string extra=String.IsNullOrEmpty(range)?"":"Content-Range: bytes "+first.ToString(CultureInfo.InvariantCulture)+"-"+last.ToString(CultureInfo.InvariantCulture)+"/"+size.ToString(CultureInfo.InvariantCulture)+"\r\n";
    // Exact validated board origin only; anonymous CORS permits the private port even when Chromium treats loopback ports as different sites.
    if(boardOrigin)extra+="Access-Control-Allow-Origin: "+origin+"\r\nVary: Origin\r\n";
    Header(s,String.IsNullOrEmpty(range)?"200 OK":"206 Partial Content",length,extra);
    if(req[0]=="HEAD")return;
    f.Position=first;byte[] buffer=new byte[65536];
    while(length>0&&!File.Exists(stop)&&DateTime.UtcNow<end&&(parent==null||!parent.HasExited)){
     int n=f.Read(buffer,0,(int)Math.Min(buffer.Length,length));
     if(n==0)break;s.Write(buffer,0,n);length-=n;
    }
   }
  }
 }
 public static void Run(string path,string session,string token,int boardPort,int maxSeconds,int parentPid) {
  string stop=Path.Combine(session,"stop");
  var listener=new TcpListener(IPAddress.Loopback,0);
  Process parent=parentPid==0?null:Process.GetProcessById(parentPid);
  try {
   listener.Start(8);
   int port=((IPEndPoint)listener.LocalEndpoint).Port;
   DateTime end=DateTime.UtcNow.AddSeconds(maxSeconds);
   File.WriteAllText(Path.Combine(session,"port.tmp"),port.ToString(CultureInfo.InvariantCulture),Encoding.ASCII);
   File.Move(Path.Combine(session,"port.tmp"),Path.Combine(session,"port"));
   while(DateTime.UtcNow<end&&!File.Exists(stop)&&(parent==null||!parent.HasExited)) {
    if(!listener.Pending()){Thread.Sleep(100);continue;}
    try{Serve(listener.AcceptTcpClient(),path,token,port,boardPort,stop,end,parent);}
    catch(IOException){}catch(SocketException){}catch(UnauthorizedAccessException){}
   }
  } finally{listener.Stop();if(parent!=null)parent.Dispose();}
 }
}
'@
 }
 [TTOfflineMediaServer]::Run($item.FullName,[IO.Path]::GetFullPath($SessionDir),$Token,$BoardPort,$MaxSeconds,$ParentPid)
}
