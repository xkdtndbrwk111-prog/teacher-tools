using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;

[assembly: AssemblyTitle("HOJA Board Installer")]
[assembly: AssemblyDescription("HOJA Board universal installer")]
[assembly: AssemblyCompany("HOJA Board")]
[assembly: AssemblyProduct("HOJA Board")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

internal sealed class Installer {
    const string Pages="https://xkdtndbrwk111-prog.github.io/teacher-tools/stable/runtime-v1/";
    const string Raw="https://raw.githubusercontent.com/xkdtndbrwk111-prog/teacher-tools/main/stable/runtime-v1/";
    const string Bootstrap="https://raw.githubusercontent.com/xkdtndbrwk111-prog/teacher-tools/734e494fad3c81033a786b4b7a5acc5c3ebcd424/tools/r8-updater/runtime/";
    const string Key="<RSAKeyValue><Modulus>uJWav5jiIgqwKanGoBnw1QWyhpxsyjkWu8l2RdlxipSygIpnJk2eWHUT5B88i+3fOAvo72NYaEtNZYLkmCVue0Ex2tzzPa9VAgbMyer0VxG2Mort6P2qGilNu3hX0wgtgUbJC5ee75MOO0bUTUwoZRiSnDoWif5c8JCvM6ALvYskFbVkHjqP9ydpcMGura726q1wLLD7Iw+DtQgWP9g083VN+fhFFd2+z/lfmHkR8ljwkBrFbMwpHnEYU8oblcS0gkq/Es/9pldZ7idrG8iYxiXim68594CZBzvoMo9G5/axig/9A/pxrG23fP7posJBvN7ZF4vKRQqkEp/E1swZ7Q==</Modulus><Exponent>AQAB</Exponent></RSAKeyValue>";
    static readonly string[] Origins={Pages,Raw};
    static readonly Version Floor=new Version("1.66.42");
    static readonly Dictionary<string,string> Fixed=new Dictionary<string,string>{
        {"launch.ps1","d6f0289779d6fcdd2bad5a2ad79925913f1fb9c7"},
        {"r8-kernel.ps1","ecb4eaa4d40c68b4b20bcb3b1e1d7801c3a836e0"}};
    static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
    readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=524288};
    readonly string root,journal;
    readonly Action<string> log;
    readonly bool noShortcut;
    public sealed class Envelope {public string payload{get;set;} public string signature{get;set;}}
    public sealed class Item {public string name{get;set;} public string sha256{get;set;} public int bytes{get;set;}}
    public sealed class Manifest {public string version{get;set;} public string schema{get;set;} public string channel{get;set;} public int kernel{get;set;} public Item[] files{get;set;}}
    public sealed class Release {public string version{get;set;} public string channel{get;set;} public int runtimeProtocol{get;set;} public string updateMode{get;set;}}
    public sealed class Record {public string name{get;set;} public bool existed{get;set;}}
    public sealed class Journal {public int schema{get;set;} public string backupFolder{get;set;} public Record[] files{get;set;} public string version{get;set;}}
    sealed class Verified {public Manifest manifest;public string hash;}
    Installer(Action<string> logger,bool skipShortcut){
        log=logger;noShortcut=skipShortcut;
        string local=Environment.GetEnvironmentVariable("LOCALAPPDATA");
        Check(!String.IsNullOrWhiteSpace(local)&&Path.IsPathRooted(local),"LocalAppData is unavailable.");
        root=Path.Combine(Path.GetFullPath(local),"TeacherToolsLocal");
        journal=Path.Combine(root,"hoja-manual-install.pending.json");
    }
    static void Check(bool ok,string error){if(!ok)throw new IOException(error);}
    static string Hex(byte[] b){return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();}
    static string Hash(byte[] b){using(var h=SHA256.Create())return Hex(h.ComputeHash(b));}
    static string GitHash(byte[] b){using(var h=SHA1.Create())return Hex(h.ComputeHash(Encoding.ASCII.GetBytes("blob "+b.Length+"\0").Concat(b).ToArray()));}
    static void Plain(string p){try{Check((File.GetAttributes(p)&FileAttributes.ReparsePoint)==0,"Linked path refused: "+p);}catch(FileNotFoundException){}catch(DirectoryNotFoundException){}}
    static bool ProgramName(string n){
        if(n==null||n.Length>100||!Regex.IsMatch(n,@"\A[a-zA-Z0-9][a-zA-Z0-9._-]*\z")||n.EndsWith(".")||Regex.IsMatch(n,@"\A(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|\z)",RegexOptions.IgnoreCase))return false;
        if(n.Equals("release.json",StringComparison.OrdinalIgnoreCase))return true;
        return new[]{".ps1",".js",".html",".css",".png",".webp",".ico",".zip",".vbs",".cmd",".dll",".exe",".xml",".txt"}.Contains(Path.GetExtension(n).ToLowerInvariant())
            && !new[]{"browser.txt","display.txt","photos.txt","update-public.xml","launch.ps1","r8-kernel.ps1"}.Contains(n,StringComparer.OrdinalIgnoreCase);
    }
    static bool InstallName(string n){return ProgramName(n)||Fixed.ContainsKey(n)||n=="update-public.xml";}
    static byte[] Download(string url,int limit){
        Check(Origins.Any(x=>url.StartsWith(x,StringComparison.Ordinal))||url.StartsWith(Bootstrap,StringComparison.Ordinal),"Unapproved download origin.");
        var req=(HttpWebRequest)WebRequest.Create(url);
        req.AllowAutoRedirect=false;req.Timeout=20000;req.ReadWriteTimeout=20000;req.UserAgent="HOJA-Board-Universal-Installer/EXE-1";req.Headers[HttpRequestHeader.CacheControl]="no-cache";
        using(var resp=(HttpWebResponse)req.GetResponse())using(var ms=new MemoryStream()){
            Check(resp.StatusCode==HttpStatusCode.OK&&resp.ContentLength<=limit,"Unexpected HTTP response.");
            using(var s=resp.GetResponseStream()){byte[] buf=new byte[32768];int n;while((n=s.Read(buf,0,buf.Length))>0){Check(ms.Length+n<=limit,"Download limit exceeded.");ms.Write(buf,0,n);}}
            return ms.ToArray();
        }
    }
    Verified ParseFeed(byte[] bytes){
        var w=json.Deserialize<Envelope>(Utf8.GetString(bytes).TrimStart('\uFEFF'));
        byte[] p=Convert.FromBase64String(w.payload),s=Convert.FromBase64String(w.signature);
        Check(p.Length>=100&&p.Length<=262144&&s.Length==256,"Invalid signed envelope.");
        using(var rsa=new RSACryptoServiceProvider()){rsa.PersistKeyInCsp=false;rsa.FromXmlString(Key);Check(rsa.KeySize==2048&&rsa.VerifyData(p,"SHA256",s),"Release signature verification failed.");}
        var m=json.Deserialize<Manifest>(Utf8.GetString(p));
        Check(m!=null&&m.version!=null&&Regex.IsMatch(m.version,@"\A[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}\z")&&new Version(m.version)>=Floor&&m.schema=="TT-RUNTIME-SNAPSHOT-1"&&m.channel=="stable"&&m.kernel==1,"Unsupported signed release contract.");
        Check(m.files!=null&&m.files.Length>=38&&m.files.Length<=128,"Invalid signed inventory.");
        var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
        foreach(var f in m.files){Check(f!=null&&ProgramName(f.name)&&names.Add(f.name)&&f.sha256!=null&&Regex.IsMatch(f.sha256,@"\A[a-f0-9]{64}\z")&&f.bytes>0&&f.bytes<=16777216,"Invalid signed file metadata.");total+=f.bytes;Check(total<=67108864,"Inventory exceeds limit.");}
        foreach(var n in new[]{"release.json","dashboard.html","server.ps1","board-launch.ps1","runtime.ps1"})Check(names.Contains(n),"Missing program: "+n);
        return new Verified{manifest=m,hash=Hash(p)};
    }
    Verified Latest(){
        var list=new List<Verified>();
        foreach(var b in Origins)try{list.Add(ParseFeed(Download(b+"latest.json",524288)));}catch(Exception e){log("배포 서버 확인: "+e.Message);}
        Check(list.Count>0,"No signed stable release could be verified.");
        var best=list.OrderByDescending(x=>new Version(x.manifest.version)).First();
        Check(!list.Any(x=>new Version(x.manifest.version)==new Version(best.manifest.version)&&x.hash!=best.hash),"Conflicting signed manifests.");
        return best;
    }
    static byte[] Blob(Item f){
        foreach(var b in Origins)try{var d=Download(b+"blobs/"+f.sha256+".bin",f.bytes);if(d.Length==f.bytes&&Hash(d)==f.sha256)return d;}catch(WebException){}catch(IOException){}
        throw new IOException("Signed file cannot be verified: "+f.name);
    }
    FileStream Lock(string n){var p=Path.Combine(root,n);Plain(p);return new FileStream(p,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);}
    void Closed(){
        Check(!IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(x=>x.Port==17439),"Close HOJA Board and its local service before installing.");
        using(var q=new ManagementObjectSearcher("SELECT Name,CommandLine,ExecutablePath FROM Win32_Process WHERE Name='msedge.exe' OR Name='chrome.exe' OR Name='BookReader.exe' OR Name='msedgewebview2.exe' OR Name='powershell.exe' OR Name='pwsh.exe'"))
        using(var rows=q.Get())foreach(ManagementObject x in rows)using(x){
            string cmd=Convert.ToString(x["CommandLine"]),exe=Convert.ToString(x["ExecutablePath"]);
            Check(!new[]{"ChromeProfile","EdgeProfile","book-reader-profile","book-reader-sessions","server.ps1","board-launch.ps1"}.Any(n=>cmd.IndexOf(Path.Combine(root,n),StringComparison.OrdinalIgnoreCase)>=0)&&!exe.StartsWith(Path.Combine(root,"book-reader-sessions")+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase),"HOJA Board is still running.");
        }
        foreach(var n in new[]{@"r8-transaction\pending.json",@"stable-pilot-rollback\pending.json"}){string p=Path.Combine(root,n);Plain(Path.GetDirectoryName(p));Plain(p);Check(!File.Exists(p),"Existing update recovery is pending.");}
    }
    void NoDowngrade(Version target){string p=Path.Combine(root,"release.json");Plain(p);if(File.Exists(p)){var r=json.Deserialize<Release>(File.ReadAllText(p,Encoding.UTF8));Check(r!=null&&r.version!=null&&new Version(r.version)<=target,"Downgrading is not allowed.");}}
    static void WriteNew(string p,byte[] bytes){Plain(p);using(var f=new FileStream(p,FileMode.CreateNew,FileAccess.Write,FileShare.None)){f.Write(bytes,0,bytes.Length);f.Flush(true);}}
    static void Replace(string p,byte[] bytes){Plain(p);string tmp=p+".hoja-new";WriteNew(tmp,bytes);if(File.Exists(p))File.Replace(tmp,p,null);else File.Move(tmp,p);}
    void Recover(){
        Plain(journal);if(!File.Exists(journal))return;
        var j=json.Deserialize<Journal>(File.ReadAllText(journal,Encoding.UTF8));
        Check(j!=null&&j.schema==1&&j.backupFolder!=null&&Regex.IsMatch(j.backupFolder,@"\Ahoja-manual-backup-[a-f0-9]{32}\z")&&j.files!=null&&j.files.Length<=131,"Invalid recovery journal.");
        string b=Path.Combine(root,j.backupFolder);Plain(b);
        var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach(var r in j.files){Check(r!=null&&r.name!=null&&InstallName(r.name)&&seen.Add(r.name),"Invalid recovery path.");string p=Path.Combine(root,r.name);Plain(p);Plain(p+".hoja-new");Plain(Path.Combine(b,r.name));if(r.existed)Check(File.Exists(Path.Combine(b,r.name)),"Missing recovery backup: "+r.name);}
        foreach(var r in j.files){string p=Path.Combine(root,r.name);File.Delete(p+".hoja-new");if(r.existed)Replace(p,File.ReadAllBytes(Path.Combine(b,r.name)));else File.Delete(p);}
        File.Delete(journal);log("중단된 설치를 복구했습니다.");
    }
    void Shortcuts(){
        if(noShortcut)return;
        string desk=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);Check(Directory.Exists(desk),"Desktop not available.");
        dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell",true));
        string path=Path.Combine(desk,"호자보드.lnk"),tmp=Path.Combine(desk,"hoja-"+Guid.NewGuid().ToString("N")+".lnk");
        try{
            Plain(path);dynamic link=shell.CreateShortcut(tmp);
            link.TargetPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe");
            link.Arguments="-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(root,"launch.ps1")+"\"";
            link.WorkingDirectory=root;link.Description="호자보드";link.IconLocation=Path.Combine(root,"hoja.ico")+",0";link.Save();
            Check(File.Exists(tmp),"Shortcut creation failed.");
            if(File.Exists(path))File.Replace(tmp,path,null);else File.Move(tmp,path);
        }finally{if(File.Exists(tmp))File.Delete(tmp);}
        foreach(var folder in new[]{desk,Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory)}.Distinct(StringComparer.OrdinalIgnoreCase)){
            if(!Directory.Exists(folder))continue;
            foreach(var file in Directory.GetFiles(folder,"*.lnk")){
                if(String.Equals(file,path,StringComparison.OrdinalIgnoreCase)||!Regex.IsMatch(Path.GetFileName(file),@"\A(?:호자보드(?: \(.*\))?|HOJA Board(?: .*)?|Teacher Tools Desktop)\.lnk\z",RegexOptions.IgnoreCase))continue;
                try{Plain(file);dynamic old=shell.CreateShortcut(file);string cmd=(string)old.TargetPath+" "+(string)old.Arguments;if(cmd.IndexOf(root,StringComparison.OrdinalIgnoreCase)>=0||cmd.IndexOf(Path.Combine(Path.GetDirectoryName(root),"TeacherToolsDesktop"),StringComparison.OrdinalIgnoreCase)>=0)File.Delete(file);}catch(Exception e){log("기존 바로가기 정리 생략: "+e.Message);}
            }
        }
    }
    string Run(){
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        Plain(root);Directory.CreateDirectory(root);
        using(Lock("r8-update.lock"))using(Lock("stable-pilot.lock"))using(Lock("stable-pilot-launch.lock")){
            Closed();Recover();log("최신 정식 배포본의 서명을 확인합니다.");
            var m=Latest().manifest;NoDowngrade(new Version(m.version));
            var data=new Dictionary<string,byte[]>(StringComparer.OrdinalIgnoreCase);int i=0;
            foreach(var f in m.files){log("다운로드 및 검증 "+(++i)+"/"+m.files.Length+": "+f.name);data.Add(f.name,Blob(f));}
            foreach(var f in Fixed){byte[] b=Download(Bootstrap+f.Key,65536);Check(GitHash(b)==f.Value,"Fixed bootstrap checksum mismatch.");data.Add(f.Key,b);}
            data.Add("update-public.xml",Utf8.GetBytes(Key));
            var r=json.Deserialize<Release>(Utf8.GetString(data["release.json"]).TrimStart('\uFEFF'));
            Check(r!=null&&r.version==m.version&&r.channel=="stable"&&r.runtimeProtocol==1&&r.updateMode=="auto-pilot","Signed release metadata mismatch.");
            Closed();NoDowngrade(new Version(m.version));
            string backupName="hoja-manual-backup-"+Guid.NewGuid().ToString("N"),backup=Path.Combine(root,backupName);
            Directory.CreateDirectory(backup);
            var records=new List<Record>();
            foreach(var f in data){
                string p=Path.Combine(root,f.Key);Plain(p);Plain(p+".hoja-new");
                Check(!Directory.Exists(p)&&!File.Exists(p+".hoja-new")&&!Directory.Exists(p+".hoja-new"),"Unexpected destination: "+f.Key);
                bool exists=File.Exists(p);if(exists)File.Copy(p,Path.Combine(backup,f.Key),false);
                records.Add(new Record{name=f.Key,existed=exists});
            }
            string jt=journal+".tmp";WriteNew(jt,Utf8.GetBytes(json.Serialize(new Journal{schema=1,backupFolder=backupName,files=records.ToArray(),version=m.version})));File.Move(jt,journal);
            try{log("검증 완료. 프로그램을 설치합니다.");foreach(var f in data)Replace(Path.Combine(root,f.Key),f.Value);foreach(var f in data)Check(Hash(File.ReadAllBytes(Path.Combine(root,f.Key)))==Hash(f.Value),"Post-install checksum mismatch.");File.Delete(journal);}catch{Recover();throw;}
            Shortcuts();log("설치 완료: "+m.version);return m.version;
        }
    }
    [STAThread]static int Main(string[] args){
        if(args.SequenceEqual(new[]{"--quiet","--no-shortcut"})){try{new Installer(x=>Console.WriteLine(x),true).Run();return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
        if(args.Length!=0)return 2;
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        int result=1;bool busy=false;
        using(var form=new Form{Text="호자보드 설치",Size=new Size(610,410),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false}){
            var heading=new Label{Text="호자보드 공용 설치기",Font=new Font("맑은 고딕",19,FontStyle.Bold),Bounds=new Rectangle(22,15,550,45)};
            var status=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Bounds=new Rectangle(24,75,548,232),Text="최신 정식 버전을 설치합니다.\r\n기존 학생 데이터와 설정은 유지됩니다."};
            var button=new Button{Text="설치",Bounds=new Rectangle(452,320,120,38)};
            form.Controls.AddRange(new Control[]{heading,status,button});
            form.FormClosing+=(sender,e)=>{if(busy)e.Cancel=true;};
            button.Click+=(sender,e)=>{
                if(busy)return;if(result==0){form.Close();return;}busy=true;button.Enabled=false;status.Clear();
                try{string v=new Installer(s=>{status.AppendText(s+"\r\n");Application.DoEvents();},false).Run();result=0;heading.Text="설치 완료 · "+v;button.Text="닫기";}
                catch(Exception ex){status.AppendText("\r\n설치 실패: "+ex.Message+"\r\n보안 경고가 있다면 설정을 변경하지 말고 개발자에게 알려주세요.");button.Text="다시 시도";}
                finally{busy=false;button.Enabled=true;}
            };
            Application.Run(form);
        }
        return result;
    }
}
