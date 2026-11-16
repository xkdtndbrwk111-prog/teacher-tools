"""Stage the R8 bootstrap on a verified R7 full install candidate. Never publish a feed."""
import argparse, hashlib, json, pathlib, shutil
HERE=pathlib.Path(__file__).resolve().parent
def once(s,a,b):
    if s.count(a)!=1: raise ValueError('anchor mismatch: '+a[:80])
    return s.replace(a,b,1)
def stage(root,version,release):
    for name in ('launch.ps1','install.ps1','runtime.ps1','release.json','update-public.xml','server.ps1'):
        if not (root/name).is_file(): raise ValueError('missing '+name)
    if (root/'board-launch.ps1').exists(): raise ValueError('already staged')
    if not all((root/n).is_file() for n in ['presentation-board.js','presentation-board.css','presentation-server.ps1','presentation-assets.zip']): raise ValueError('R7 presentation payload missing; assemble R7 first')
    launch=(root/'launch.ps1').read_text(encoding='utf-8-sig')
    launch=once(launch,'[switch]$RecoveryRetry)','[switch]$RecoveryRetry,[string]$R8ReadyToken)')
    start=launch.index('  # An interrupted staged install')
    end=launch.index('  [void][System.Windows.Forms.MessageBox]',start)
    launch=launch[:start]+launch[end:]
    start=launch.index('if ($ManualUpdate -or')
    end=launch.index('if (-not (Test-LocalServer))',start)
    launch=launch[:start]+launch[end:]
    mark="""if($R8ReadyToken -cmatch '^[a-f0-9]{32}$'){
  . (Join-Path $dir 'r8-kernel.ps1')
  $journal=Read-R8Journal $dir
  if($journal -and $journal.token -ceq $R8ReadyToken){
    Write-R8Json (Join-Path $dir 'r8-transaction\\ready.json') @{token=$R8ReadyToken;release=$TTRelease}
  }
}"""
    anchor='if(Get-Command Complete-TTPilotWindow -ErrorAction SilentlyContinue){Complete-TTPilotWindow}'
    if launch.count(anchor)!=2: raise ValueError('readiness anchors')
    launch=launch.replace(anchor,mark)
    # Both launch paths (normal and manual) continue using the same stable launch.ps1.
    installer=(root/'install.ps1').read_text(encoding='utf-8-sig')
    installer=once(installer,"'launch.ps1','start-teacher-tools.ps1'","'launch.ps1','board-launch.ps1','r8-kernel.ps1','start-teacher-tools.ps1'")
    # Locks before reading installed release. Never install across an interrupted transaction.
    anchor='# Manual pilot install may replace TEST only after explicit confirmation.'
    guard="""if(!(Test-Path -LiteralPath $TTInstallDir)){New-Item -ItemType Directory -Path $TTInstallDir -Force|Out-Null}
$r8Lock=[IO.File]::Open((Join-Path $TTInstallDir 'r8-update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$oldUpdateLock=[IO.File]::Open((Join-Path $TTInstallDir 'stable-pilot.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$oldLaunchLock=[IO.File]::Open((Join-Path $TTInstallDir 'stable-pilot-launch.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
if((Test-Path -LiteralPath (Join-Path $TTInstallDir 'stable-pilot-rollback\\pending.json')) -or (Test-Path -LiteralPath (Join-Path $TTInstallDir 'r8-transaction\\pending.json'))){throw '먼저 호자보드를 정상 종료하고 복구를 완료하세요.'}
"""
    installer=once(installer,anchor,guard+anchor)
    installer=once(installer,"Start-TTHidden -ScriptPath (Join-Path $TTInstallDir 'launch.ps1')","$oldLaunchLock.Dispose();$oldUpdateLock.Dispose();$r8Lock.Dispose()\nStart-TTHidden -ScriptPath (Join-Path $TTInstallDir 'launch.ps1')")
    uninstall=(root/'uninstall.ps1').read_text(encoding='utf-8-sig')
    uninstall=once(uninstall,"'launch.ps1','start-teacher-tools.ps1'","'launch.ps1','board-launch.ps1','r8-kernel.ps1','start-teacher-tools.ps1'")
    uninstall=once(uninstall,'Stop-TTBrowser',"$r8Lock=[IO.File]::Open((Join-Path $TTInstallDir 'r8-update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)\nif(Test-Path -LiteralPath (Join-Path $TTInstallDir 'r8-transaction\\pending.json')){throw 'Pending update recovery required.'}\nStop-TTBrowser")
    # Keep old updater/key file provisioned for manual migration; never call old updater from R8.
    meta=json.loads((root/'release.json').read_text(encoding='utf-8-sig'))
    import re
    if not re.fullmatch(r'\d{1,3}\.\d{1,3}\.\d{1,4}',version) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}-V'+re.escape(version)+r'-STABLE-PILOT',release): raise ValueError('invalid release')
    if tuple(map(int,version.split('.')))<=tuple(map(int,meta['version'].split('.'))): raise ValueError('new version required')
    dashboard=(root/'dashboard.html').read_text(encoding='utf-8-sig')
    old_version=meta['version']
    if ('V'+old_version) not in dashboard: raise ValueError('dashboard label does not match base release metadata')
    dashboard=dashboard.replace('V'+old_version,'V'+version)
    meta.update(version=version,release=release,runtimeProtocol=1,updateMode='auto-pilot')
    (root/'dashboard.html').write_text(dashboard,encoding='utf-8')
    (root/'board-launch.ps1').write_text(launch,encoding='utf-8-sig')
    for name in ('launch.ps1','r8-kernel.ps1'):
        (root/name).write_text((HERE/'runtime'/name).read_text(encoding='utf-8-sig'),encoding='utf-8-sig')
    (root/'install.ps1').write_text(installer,encoding='utf-8-sig')
    (root/'uninstall.ps1').write_text(uninstall,encoding='utf-8-sig')
    (root/'release.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Existing installer validates the complete payload; regenerate only on the intended package directory.
    old=json.loads((root/'checksums.json').read_text(encoding='utf-8-sig'))
    names=set(old)|{'board-launch.ps1','r8-kernel.ps1','presentation-board.js','presentation-board.css','presentation-server.ps1','presentation-assets.zip'}
    missing=[n for n in names if not (root/n).is_file()]
    if missing: raise ValueError('incomplete installer payload: '+', '.join(missing))
    hashes={n:hashlib.sha256((root/n).read_bytes()).hexdigest().upper() for n in sorted(names)}
    (root/'checksums.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('system',type=pathlib.Path);p.add_argument('--version',required=True);p.add_argument('--release',required=True)
    a=p.parse_args();stage(a.system,a.version,a.release)
