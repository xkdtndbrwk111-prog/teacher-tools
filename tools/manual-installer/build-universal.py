#!/usr/bin/env python3
"""Build the immutable v1 universal installer candidate, independently of the release feed.
The existing reviewed seed and fixed R8 bootstrap are retained. No release publication.
"""
import base64
import hashlib
import io
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "tools/manual-installer/1.66.33-seed.b64"
SEED_SHA = "3eaeb50cd666bbe607dd6adc885a59e1ebdbd4027835ed23fbf2c0aec2c24bb7"
PACKAGE = "HOJA_Board_Installer.zip"
SCRIPT = "INSTALL_HOJA_BOARD.ps1"
CMD = "호자보드 설치.cmd"
NOTE = "설치가 안되면 열어보세요.txt"
MIN_VERSION = "1.66.42"

def replace_once(s, old, new):
    assert s.count(old) == 1, "unexpected reviewed seed: " + old[:80]
    return s.replace(old, new, 1)

def sources():
    seed = base64.b64decode("".join(SEED.read_text(encoding="ascii").split()), validate=True)
    assert hashlib.sha256(seed).hexdigest() == SEED_SHA
    with zipfile.ZipFile(io.BytesIO(seed)) as z:
        assert set(z.namelist()) == {SCRIPT, CMD, NOTE}
        s = z.read(SCRIPT).decode("utf-8-sig")
        cmd = z.read(CMD).decode("utf-8-sig")
    s = replace_once(s, "# HOJA Board 1.66.33 - manually provisioned R8 installer (Windows PowerShell 5.1)", "# HOJA Board universal installer, format 1 (Windows PowerShell 5.1)")
    s = replace_once(s, "# Tested by static review only; the signed publisher, not this wrapper, defines the program bytes.", "# The signed publisher, not this immutable wrapper, defines the program bytes.")
    s = replace_once(s, "# Preserves user data; downloads pinned, signed program snapshots, and installs in LocalAppData.", "# Preserves user data; verifies signed stable snapshots, then installs in LocalAppData.")
    s = replace_once(s, "$Version = '1.66.33'\n$ManifestPayloadSha = 'ad2164eb3148868fbdaea01f9c7ede3adb423a93e87827f7d1621c2bd25af09d'\n$RepoCommit = '0d2b58c47109fb959bf43de002caf7898bdde986'", "$Version = $null\n$MinimumVersion = [version]'"+MIN_VERSION+"'")
    s = replace_once(s, "$FallbackRoot = 'https://raw.githubusercontent.com/xkdtndbrwk111-prog/teacher-tools/' + $RepoCommit + '/stable/runtime-v1/'", "$FallbackRoot = 'https://raw.githubusercontent.com/xkdtndbrwk111-prog/teacher-tools/main/stable/runtime-v1/'")
    s = replace_once(s, "'HOJA-Board-Manual-Installer/1.66.33'", "'HOJA-Board-Universal-Installer/1'")
    s = replace_once(s, """            if ((Hash-Bytes $payload 'SHA256') -cne $ManifestPayloadSha) {
                throw 'Not the pinned HOJA Board 1.66.33 manifest.'
            }
""", "")
    s = replace_once(s, """            if ($manifest.version -cne $Version -or $manifest.schema -cne 'TT-RUNTIME-SNAPSHOT-1' -or
                $manifest.channel -cne 'stable' -or $manifest.kernel -ne 1) {
                throw 'Unexpected manifest contract.'
            }
""", """            if ([string]$manifest.version -cnotmatch '^[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}$' -or
                $manifest.schema -cne 'TT-RUNTIME-SNAPSHOT-1' -or
                $manifest.channel -cne 'stable' -or $manifest.kernel -ne 1) {
                throw 'Unexpected manifest contract.'
            }
            if ([version]([string]$manifest.version) -lt $MinimumVersion) {
                throw 'Signed release is older than the supported installer floor.'
            }
""")
    s = replace_once(s, """    $currentRelease = Join-Path $Destination 'release.json'
""", """    Write-Host 'Getting the signed stable HOJA Board manifest...'
    $manifest = Get-SignedFeed
    $Version = [string]$manifest.version
    $currentRelease = Join-Path $Destination 'release.json'
""")
    s = replace_once(s, """    Write-Host ('Getting signed HOJA Board ' + $Version + ' manifest...')
    $manifest = Get-SignedFeed
""", """    Write-Host ('Verified stable release: ' + $Version)
""")
    # Retain the user's login-start preference; cleanup only desktop links.
    s = replace_once(s, """    $otherFolders = @($desktop, [Environment]::GetFolderPath('CommonDesktopDirectory'),
      [Environment]::GetFolderPath('Startup')) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique""", """    $otherFolders = @($desktop, [Environment]::GetFolderPath('CommonDesktopDirectory')) |
      Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique""")
    # Recheck downgrade immediately before replacements, after lengthy downloads.
    s = replace_once(s, """    Assert-Closed
    $backupName = 'hoja-manual-backup-'""", """    Assert-Closed
    if (Test-Path -LiteralPath $currentRelease) {
        Assert-Plain $currentRelease
        $nowInstalled = Get-Content -LiteralPath $currentRelease -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([version]([string]$nowInstalled.version) -gt ([version]$Version)) {
            throw 'A newer version was installed during download. Downgrading is not allowed.'
        }
    }
    $backupName = 'hoja-manual-backup-'""")
    cmd = replace_once(cmd, "title HOJA Board 1.66.33 - Installer", "title HOJA Board - Universal Installer")
    note = """호자보드 공용 설치파일 안내
=========================
1. 호자보드를 완전히 종료한 뒤 압축을 풀고 [호자보드 설치.cmd]를 실행하세요.
2. 인터넷 연결이 필요합니다. 설치기는 공식 stable 배포본의 전자서명과 파일 해시를 확인합니다.
3. 이미 설치된 학생 데이터, 설정 및 로그인 자동 실행 선택은 유지됩니다.
4. 바탕화면의 호자보드 바로가기를 이용하세요.
5. Windows 보안에서 차단하면 보안 기능을 끄거나 파일을 실행하려 하지 말고,
   차단 화면과 오류 내용을 개발자에게 알려주세요.

설치기 규격: 1 (호자보드 프로그램 버전과 독립)
설치 위치: %LOCALAPPDATA%\\TeacherToolsLocal
"""
    assert "1.66.33" not in s and "ManifestPayloadSha" not in s and "RepoCommit" not in s
    assert "VerifyData($payload, 'SHA256', $signature)" in s and "File]::Replace" in s
    assert "GetFolderPath('Startup')" not in s
    return {CMD: cmd, SCRIPT: s, NOTE: note}

def build():
    # ZIP_STORED and fixed metadata avoid compression-library drift.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as z:
        for name, content in sources().items():
            i = zipfile.ZipInfo(name, date_time=(2024, 1, 1, 0, 0, 0))
            i.create_system = 0
            i.external_attr = 0x20
            z.writestr(i, content.encode("utf-8-sig"))
    data = buf.getvalue()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        assert set(z.namelist()) == {SCRIPT, CMD, NOTE}
    return data

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    data = build()
    assert data == build()
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / PACKAGE
    target.write_bytes(data)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            print(hashlib.sha256(z.read(name)).hexdigest(), name)
    print(hashlib.sha256(data).hexdigest(), target)
