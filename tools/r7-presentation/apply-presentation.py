"""Apply presentation-only overlay to the final R7 review runtime; no signing or release mutation."""
import argparse, pathlib, re, shutil, json
root=pathlib.Path(__file__).resolve().parents[2]
here=pathlib.Path(__file__).resolve().parent
def once(s,a,b):
    if s.count(a)!=1: raise ValueError('anchor mismatch: '+a[:100])
    return s.replace(a,b,1)
def patch_dashboard(s):
    s,n=re.subn(r'<button\b[^>]*\bdata-app="seating"[^>]*>.*?</button>','',s,count=1,flags=re.S)
    if n!=1: raise ValueError('seating tool anchor')
    s=once(s,"['seating','🪑 자리배치'],","")
    s,n=re.subn(r'<dialog id="seatBoard".*?</dialog>', '<dialog id="ttPresentation" aria-label="학생 발표"><div class="tt-present-head"><h2 id="ttPresentationTitle">학생 발표</h2><button id="ttPresentationClose" type="button">닫기 ✕</button></div><iframe id="ttPresentationFrame" title="학생 발표"></iframe><div id="ttPresentationLoading">발표 화면 준비 중…</div><canvas id="ttPresentationParticles" aria-hidden="true"></canvas></dialog>',s,count=1,flags=re.S)
    if n!=1: raise ValueError('old seat dialog anchor')
    start=s.index('const seatOrigin=');end=s.index("$('#openManager').onclick",start)
    s=s[:start]+s[end:]
    s=once(s,'&&!window.ttHouse?.isOpen?.()&&!window.ttHouse?.away?.()','&&!document.body.classList.contains("tt-presentation-open")&&!window.ttHouse?.isOpen?.()&&!window.ttHouse?.away?.()')
    s=once(s,'</head>','<link rel="stylesheet" href="/presentation-board.css"></head>')
    s=once(s,'</body>','<script src="/presentation-board.js"></script></body>')
    if 'id="openSeating"' in s or 'const seatOrigin=' in s: raise ValueError('old tool still present')
    return s
def patch_server(s):
    s=once(s,". (Join-Path $PSScriptRoot 'runtime.ps1')",". (Join-Path $PSScriptRoot 'runtime.ps1')\n. (Join-Path $PSScriptRoot 'presentation-server.ps1')")
    s=once(s,"$statusCors=($path -eq '/api/board-status' -and $localHost -and $managerOrigin)","$statusCors=($path -eq '/api/board-status' -and $localHost -and $managerOrigin)\n  $presentCors=($localHost -and $managerOrigin -and $path -in @('/api/presentation/send','/api/presentation/receipt','/api/presentation/close'))")
    s=once(s,"   if($path -eq '/api/board-status'){","   if($path -like '/api/presentation/*'){\n    $boardOrigin=$localHost -and $fetchSite -eq 'same-origin' -and (-not $origin -or $origin -in @(\"http://127.0.0.1:$Port\",\"http://localhost:$Port\"))\n    $answer=Invoke-TTPresent $path $parts[0] $localHost $managerOrigin $boardOrigin $bodyText $uri\n    $status=$answer.status;$body=$answer.body\n   }\n   elseif($path -eq '/api/board-status'){")
    s=once(s,"$result=@{service='teacher-tools-local';version=40;coinProtocol=3;wallpaper=$wallpaper;","$result=@{service='teacher-tools-local';version=40;coinProtocol=3;presentationProtocol=1;presentationReady=[bool](Get-TTPresentReady);wallpaper=$wallpaper;")
    s=once(s,"   else {\n   # V1.59:","""   elseif($path -in @('/presentation-board.js','/presentation-board.css') -or $path -like '/presentation/*'){
    if(-not $localHost -or $parts[0] -ne 'GET' -or ($fetchSite -and $fetchSite -notin @('same-origin','none'))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    else{
     $name=$path.TrimStart('/')
     if($name -notmatch '^presentation(?:-board\\.(?:js|css)|/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\\.(?:html|css|js|mjs|png|svg|txt))$' -or $name.Contains('..')){$status='404 Not Found';$body='{"error":"not found"}'}
     else{
      $asset=Join-Path $PSScriptRoot $name
      if(Test-Path -LiteralPath $asset -PathType Leaf){
       $ctype=switch([IO.Path]::GetExtension($asset)){'.html'{'text/html; charset=utf-8'} '.css'{'text/css; charset=utf-8'} '.js'{'text/javascript; charset=utf-8'} '.mjs'{'text/javascript; charset=utf-8'} '.png'{'image/png'} '.svg'{'image/svg+xml'} default{'text/plain; charset=utf-8'}}
       $raw=[IO.File]::ReadAllBytes($asset)
      }else{$status='404 Not Found';$body='{"error":"not found"}'}
     }
    }
   }
   else {
   # V1.59:""")
    s=once(s,"  $headers=\"HTTP/1.1 $status","  if($presentCors){$corsHeaders=\"Access-Control-Allow-Origin: $origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`nVary: Origin, Access-Control-Request-Private-Network`r`n\"}\n  $headers=\"HTTP/1.1 $status")
    return s
def bundle(target):
    dst=target/'presentation'
    if dst.exists(): raise ValueError('already staged')
    for rel in ['seating/index.html','seating/styles.css','seating/pe-v1.css','seating/app.js','seating/pe-v1.js','classroom/host/class-store.js','classroom/host/student-window.css','classroom/host/board-present.js','classroom/host/board-present.css','classroom/host/public-presentation.mjs','classroom/host/presentation-protocol.mjs','classroom/host/life-public-url.mjs','classroom/host/life-cloud-config.mjs','shared/student-roster.css']:
        out=dst/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/rel,out)
    for rel in ['shared/assets','classroom/host/qr-vendor']:
        shutil.copytree(root/rel,dst/rel)
    # No manager login, statistics, grade or cloud-sync scripts in local offline view.
    html=(dst/'seating/index.html').read_text(encoding='utf-8')
    html=re.sub(r'\s*<script src="\.\./usage-stats\.js[^>]*></script>','',html)
    html=re.sub(r'\s*<link rel="stylesheet" href="\.\./classroom/host/(?:grade-mount|life-mount|class-ui|hud-shell|settings-window)\.css[^"]*">','',html)
    html=re.sub(r'\s*<link rel="icon"[^>]*>','',html)
    html=re.sub(r'<script src="\.\./classroom/host/class-bootstrap\.js[^"]*"></script>','<script src="../classroom/host/offline-bootstrap.js"></script>',html)
    (dst/'seating/index.html').write_text(html,encoding='utf-8')
    shutil.copyfile(here/'runtime/offline-bootstrap.js',dst/'classroom/host/offline-bootstrap.js')
def main():
    ap=argparse.ArgumentParser();ap.add_argument('system',type=pathlib.Path);ap.add_argument('--bundle-only',action='store_true');a=ap.parse_args()
    target=a.system;target.mkdir(parents=True,exist_ok=True)
    if not a.bundle_only:
        dash=target/'dashboard.html';server=target/'server.ps1'
        d=patch_dashboard(dash.read_text(encoding='utf-8-sig'));p=patch_server(server.read_text(encoding='utf-8-sig'))
    bundle(target)
    for name in ['presentation-board.js','presentation-board.css','presentation-server.ps1']:
        shutil.copyfile(here/'runtime'/name,target/name)
    if not a.bundle_only:
        dash.write_text(d,encoding='utf-8');server.write_text(p,encoding='utf-8-sig')
    print('R7 presentation staged; regenerate package checksums and sign through normal release gate.')
if __name__=='__main__':main()
