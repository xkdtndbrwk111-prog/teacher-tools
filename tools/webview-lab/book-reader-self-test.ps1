$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$bundlePath=Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'runtime-src/system/asset-book-reader-host.zip'
if((Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne '20666e7d2c9fc7e28c89f4827258dbcd145f0f39176ea5d16335db8f4b473f6c'){throw 'Pinned reader archive hash mismatch'}
$crashRoot=Join-Path $env:RUNNER_TEMP ('book-selftest-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $crashRoot | Out-Null

# Cold runner diagnostics: initialize the exact archived WebView2 SDK once in a
# separate local profile, then run BOTH original self-tests unchanged.
$warm=Join-Path $crashRoot 'webview-warmup'
[IO.Compression.ZipFile]::ExtractToDirectory($bundlePath,$warm)
$warmSource=Join-Path $warm 'Warmup.cs'
@'
using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;
class Warmup {
 [STAThread] static int Main(string[] a) {
  int result=1;
  using(var form=new Form()) using(var web=new WebView2()) using(var timer=new Timer()){
   form.Controls.Add(web);web.Dock=DockStyle.Fill;
   timer.Interval=90000;timer.Tick+=(s,e)=>{Console.Error.WriteLine("Warmup timeout");form.Close();};
   form.Shown+=async(s,e)=>{
    try{
     Console.WriteLine("Runtime "+CoreWebView2Environment.GetAvailableBrowserVersionString());
     var env=await CoreWebView2Environment.CreateAsync(null,a[0]);
     await web.EnsureCoreWebView2Async(env);
     web.CoreWebView2.NavigationCompleted+=async(x,y)=>{
      if(y.IsSuccess&&await web.CoreWebView2.ExecuteScriptAsync("document.title")== "\"local-ready\""){result=0;Console.WriteLine("PASS cold WebView2 local initialization");}
      form.Close();
     };
     web.CoreWebView2.NavigateToString("<!doctype html><title>local-ready</title>");
    }catch(Exception ex){Console.Error.WriteLine(ex.GetType().Name+" "+ex.HResult);form.Close();}
   };
   timer.Start();Application.Run(form);timer.Stop();
  }
  return result;
 }
}
'@ | Set-Content -LiteralPath $warmSource -Encoding UTF8
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /codepage:65001 /target:exe /platform:x64 "/out:$warm\Warmup.exe" "/reference:$warm\Microsoft.Web.WebView2.Core.dll" "/reference:$warm\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll $warmSource
if($LASTEXITCODE -ne 0){throw 'Cold WebView2 diagnostic compilation failed'}
& (Join-Path $warm 'Warmup.exe') (Join-Path $warm 'profile')
if($LASTEXITCODE -ne 0){throw 'Cold WebView2 initialization failed before pinned reader test'}

# Isolate this gate from the much longer board/manager/backup regression suite.
# No retries or substitutions: report the original executable's actual result.
  # 5A-3b: execute the unchanged pinned binary's own WebView2 fixture,
  # not a reimplementation of the page/bookmark/immersive algorithms.
  foreach($case in @(@{name='immersive';request=@{url='';title='Fixture';pages=5;start=3;saved=0};expected=3;interactive=$false},@{name='almond-resume';request=@{url='https://canva.link/9qxk3zuhh93ts2s';title='Almond';interactive=1;pages=394;start=125;saved=125};expected=125;interactive=$true})){
   $fixtureDir=Join-Path $crashRoot ('book-selftest-'+$case.name)
   [IO.Compression.ZipFile]::ExtractToDirectory($bundlePath,$fixtureDir)
   [IO.File]::WriteAllText((Join-Path $fixtureDir 'request.json'),($case.request|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
   $stdout=Join-Path $fixtureDir 'stdout.txt';$stderr=Join-Path $fixtureDir 'stderr.txt'
   $probe=Start-Process -FilePath (Join-Path $fixtureDir 'BookReader.exe') -ArgumentList ('--self-test "'+$fixtureDir+'"') -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
   $null=$probe.Handle
   $finished=$probe.WaitForExit(35000)
   if(!$finished){try{$probe.Kill();$probe.WaitForExit()}catch{}}
   foreach($log in @($stdout,$stderr,(Join-Path $fixtureDir 'state.json'))){if(Test-Path -LiteralPath $log){Write-Host ('Reader diagnostic '+$case.name+' '+[IO.Path]::GetFileName($log));Get-Content -LiteralPath $log -Encoding UTF8}}
   if(!$finished){throw ('Original BookReader self-test timeout '+$case.name)}
   if($probe.ExitCode -ne 0){throw ('Original BookReader self-test failed '+$case.name+' exit='+$probe.ExitCode)}
   $actual=Get-Content -LiteralPath (Join-Path $fixtureDir 'state.json') -Raw|ConvertFrom-Json
   if($actual.page -ne $case.expected -or $actual.saved -ne $case.expected -or !$actual.closed -or ($case.interactive -and !$actual.bookmarkValid)){throw ('Original BookReader bookmark/immersive mismatch '+$case.name)}
   Write-Host ('PASS pinned BookReader original WebView2 '+$case.name+' page '+$case.expected+' bookmark and close')
  }
