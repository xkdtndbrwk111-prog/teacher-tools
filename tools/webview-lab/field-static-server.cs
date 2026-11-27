using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

// One read-only loopback server per origin. No API, no filesystem paths from requests,
// no remote proxy. The package manifest verifies the archive before this process runs.
internal static class FieldStaticServer {
    static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
    static readonly Regex PathPattern=new Regex(@"\A/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+\z",RegexOptions.CultureInvariant);
    static string Mime(string name){
        switch(Path.GetExtension(name).ToLowerInvariant()){
        case ".html":return "text/html; charset=utf-8";
        case ".js":case ".mjs":return "text/javascript; charset=utf-8";
        case ".css":return "text/css; charset=utf-8";
        case ".json":return "application/json; charset=utf-8";
        case ".png":return "image/png";case ".webp":return "image/webp";
        case ".svg":return "image/svg+xml";case ".jpg":case ".jpeg":return "image/jpeg";
        case ".woff":return "font/woff";case ".woff2":return "font/woff2";
        case ".txt":return "text/plain; charset=utf-8";
        default:return null;
        }
    }
    static string Line(Stream s,ref int budget){
        var b=new StringBuilder();
        while(true){int v=s.ReadByte();if(v<0||++budget>16384||b.Length>4096)throw new IOException("header");
            if(v==10)return b.ToString().TrimEnd('\r');
            if(v>127||(v<32&&v!=13&&v!=9))throw new IOException("header");b.Append((char)v);}
    }
    static void Send(Stream s,string status,string mime,byte[] bytes,bool head,bool game){
        string policy=game?
            "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'none'; frame-src 'none'; frame-ancestors http://127.0.0.1:17451; base-uri 'none'; form-action 'none'; object-src 'none'":
            "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self' http://127.0.0.1:17451; frame-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
        string headers="HTTP/1.1 "+status+"\r\nContent-Type: "+mime+"\r\nContent-Length: "+bytes.Length.ToString(CultureInfo.InvariantCulture)+"\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: "+policy+"\r\nConnection: close\r\n\r\n";
        byte[] h=Encoding.ASCII.GetBytes(headers);s.Write(h,0,h.Length);if(!head)s.Write(bytes,0,bytes.Length);
    }
    static void Serve(TcpClient c,int port,bool game,Dictionary<string,byte[]> files){
        c.ReceiveTimeout=2000;c.SendTimeout=5000;
        using(c)using(var s=c.GetStream()){
            int budget=0;var request=Line(s,ref budget).Split(' ');var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
            while(true){string l=Line(s,ref budget);if(l=="")break;int i=l.IndexOf(':');if(i<1||headers.ContainsKey(l.Substring(0,i)))throw new IOException("header");headers.Add(l.Substring(0,i),l.Substring(i+1).Trim());}
            string host;headers.TryGetValue("Host",out host);
            bool head=request.Length==3&&request[0]=="HEAD";
            if(request.Length!=3||request[2]!="HTTP/1.1"||host!="127.0.0.1:"+port||headers.ContainsKey("Transfer-Encoding")||(headers.ContainsKey("Content-Length")&&headers["Content-Length"]!="0")){
                Send(s,"403 Forbidden","text/plain",new byte[0],head,game);return;}
            if(request[0]!="GET"&&!head){Send(s,"405 Method Not Allowed","text/plain",new byte[0],false,game);return;}
            string p=request[1].Split('?')[0];
            if(game){if(p=="/hoja-minigames/")p="/index.html";}
            else if(p=="/seating/")p="/seating/index.html";
            else if(p.EndsWith("/",StringComparison.Ordinal)&&p!="/")p+="index.html";
            if(p.Contains("..")||!PathPattern.IsMatch(p)){Send(s,"404 Not Found","text/plain",new byte[0],head,game);return;}
            byte[] b;string mime=Mime(p);
            if(mime==null||!files.TryGetValue(p.Substring(1),out b)){Send(s,"404 Not Found","text/plain",new byte[0],head,game);return;}
            Send(s,"200 OK",mime,b,head,game);
        }
    }
    static Dictionary<string,byte[]> Load(string archive,bool game){
        var d=new Dictionary<string,byte[]>(StringComparer.Ordinal);long total=0;
        using(var input=File.OpenRead(archive))using(var z=new ZipArchive(input,ZipArchiveMode.Read)){
            foreach(var e in z.Entries){
                if(e.FullName.EndsWith("/"))continue;
                if(!PathPattern.IsMatch("/"+e.FullName)||e.FullName.Contains("..")||Mime(e.FullName)==null||e.Length<0||e.Length>12000000||(total+=e.Length)>32000000||d.Count>=1500||d.ContainsKey(e.FullName))throw new IOException("archive entry");
                using(var stream=e.Open())using(var buffer=new MemoryStream()){stream.CopyTo(buffer);if(buffer.Length!=e.Length)throw new IOException("archive size");d.Add(e.FullName,buffer.ToArray());}
            }
        }
        if(!d.ContainsKey(game?"index.html":"seating/index.html"))throw new IOException("entry missing");return d;
    }
    static int Main(string[] args){
        if(args.Length!=2||(args[0]!="manager"&&args[0]!="game"))return 2;
        string root=Environment.GetEnvironmentVariable("HOJA_LAB_ROOT"),local=Environment.GetEnvironmentVariable("LOCALAPPDATA");
        if(String.IsNullOrEmpty(root)||String.IsNullOrEmpty(local))return 2;
        root=Path.GetFullPath(root);
        if(!Regex.IsMatch(Path.GetFileName(root),@"\Ahoja-webview-lab-[a-f0-9]{32}\z")||Path.GetFullPath(local)!=Path.Combine(root,"local")||!File.Exists(Path.Combine(root,"field-pilot.flag")))return 2;
        bool game=args[0]=="game";int port=game?4189:4188;
        string archive=Path.Combine(root,"bin",game?"field-game.zip":"field-manager.zip"),ready=Path.Combine(root,args[0]+".static.ready"),stop=Path.Combine(root,args[0]+".static.stop");
        int parent;if(!Int32.TryParse(args[1],out parent)||parent<=0)return 2;
        using(var owner=Process.GetProcessById(parent)){
            var files=Load(archive,game);var l=new TcpListener(IPAddress.Loopback,port);l.ExclusiveAddressUse=true;
            var slots=new SemaphoreSlim(8,8);
            try{l.Start();File.WriteAllText(ready,Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture));
                while(!owner.HasExited&&!File.Exists(stop)){
                    if(!l.Pending()||!slots.Wait(0)){Thread.Sleep(25);continue;}
                    TcpClient c;try{c=l.AcceptTcpClient();}catch{slots.Release();throw;}
                    ThreadPool.QueueUserWorkItem(_=>{try{Serve(c,port,game,files);}catch(IOException){}catch(SocketException){}finally{c.Dispose();slots.Release();}});
                }
                return 0;
            }finally{l.Stop();try{File.Delete(ready);}catch{}}
        }
    }
}
