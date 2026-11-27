using System;
using System.Text.RegularExpressions;

// Narrow, opt-in field provider policy. Top-level dashboard remains loopback-only.
// Never allow the published mini-game until its board-origin contract is migrated.
internal static class FieldProviderPolicy {
    static bool Https(string raw,out Uri u){
        return Uri.TryCreate(raw,UriKind.Absolute,out u)&&u.Scheme=="https"&&u.Port==443&&u.UserInfo==""&&!raw.Contains("\\");
    }
    static bool Domain(string host,string domain){
        return host==domain||host.EndsWith("."+domain,StringComparison.Ordinal);
    }
    internal static bool Frame(string raw){
        Uri u;if(!Https(raw,out u))return false;
        if(u.Host=="canva.link")return Regex.IsMatch(u.AbsolutePath,@"\A/[A-Za-z0-9_-]+/?\z");
        if(u.Host=="www.canva.com"||u.Host=="canva.com")
            return Regex.IsMatch(u.AbsolutePath,@"\A/(?:design/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/view|d/[A-Za-z0-9_-]+)/?\z");
        return (u.Host=="www.youtube.com"||u.Host=="www.youtube-nocookie.com")&&Regex.IsMatch(u.AbsolutePath,@"\A/embed/[A-Za-z0-9_-]{11}\z");
    }
    internal static bool Resource(string raw,string method,bool document){
        if(document)return method=="GET"&&Frame(raw);
        Uri u;if(!Https(raw,out u))return false;
        bool provider=u.Host=="www.canva.com"||u.Host=="canva.com"||u.Host=="www.youtube.com"||u.Host=="www.youtube-nocookie.com";
        bool cdn=Domain(u.Host,"canva.cn")||Domain(u.Host,"canva.com")||Domain(u.Host,"canvausercontent.com")||Domain(u.Host,"canvacdn.com")||Domain(u.Host,"ytimg.com")||Domain(u.Host,"googlevideo.com");
        // Resource hosts are providers and their content CDNs, not arbitrary
        // Google accounts, analytics, private hosts or all of github.io.
        if(method=="GET"||method=="HEAD")return provider||cdn||u.Host=="canva.link";
        return method=="POST"&&provider&&(u.Host.EndsWith("canva.com",StringComparison.Ordinal)||u.AbsolutePath.StartsWith("/youtubei/v1/",StringComparison.Ordinal));
    }
    internal static bool Backup(string uri,string suggested,string origin){
        return uri!=null&&uri.StartsWith("blob:"+origin+"/",StringComparison.Ordinal)&&Regex.IsMatch(uri.Substring(("blob:"+origin+"/").Length),@"\A[0-9a-fA-F-]{36}\z")&&String.Equals(System.IO.Path.GetExtension(suggested),".ttbackup",StringComparison.OrdinalIgnoreCase);
    }
#if FIELD_POLICY_TEST
    static void Expect(bool value,string message){if(!value)throw new Exception(message);}
    static int Main(){
        Expect(Frame("https://www.canva.com/design/abc/xyz/view?embed"),"Canva view");
        Expect(Frame("https://www.youtube.com/embed/sVoh_DAt9is"),"YouTube embed");
        foreach(string bad in new[]{"http://www.youtube.com/embed/sVoh_DAt9is","https://www.youtube.com.evil.example/embed/sVoh_DAt9is","https://www.canva.com/design/abc/xyz/edit","https://user@www.canva.com/design/abc/xyz/view","https://www.canva.com:444/design/abc/xyz/view","https://xkdtndbrwk111-prog.github.io/hoja-minigames/","http://127.0.0.1:17439/"})Expect(!Frame(bad),"Frame accepted "+bad);
        Expect(Resource("https://r1.googlevideo.com/videoplayback","GET",false),"Media CDN");
        Expect(Resource("https://www.youtube.com/youtubei/v1/player","POST",false),"Player API");
        Expect(!Resource("https://www.youtube.com/upload","POST",false),"Upload");
        Expect(!Resource("https://ytimg.com.evil.example/a","GET",false),"Suffix guard");
        Expect(!Resource("https://accounts.google.com/","GET",false),"Account domain");
        Expect(!Resource("https://www.canva.com/design/abc/xyz/edit","GET",true),"Document editor");
        string o="http://127.0.0.1:17451",b="blob:"+o+"/00000000-0000-0000-0000-000000000000";
        Expect(Backup(b,"board.ttbackup",o),"Backup");
        Expect(!Backup(b,"board.exe",o)&&!Backup(b.Replace("17451","17439"),"board.ttbackup",o),"Backup scope");
        Console.WriteLine("PASS field provider and backup capability policy");
        return 0;
    }
#endif
}
