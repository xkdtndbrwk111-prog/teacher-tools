#!/usr/bin/env python3
"""Publish a stable, versioned Windows installer from the *same signed R8 feed*.

The seed ZIP is the checked-in, reviewed 1.66.33 manual installer. Each future
release substitutes only the version, signed payload SHA-256 and exact snapshot
commit. This job cannot change the signed runtime program files.
"""
import base64
import hashlib
import io
import json
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
FEED = ROOT / "stable/runtime-v1/latest.json"
SOURCE = ROOT / "tools/manual-installer/1.66.33-seed.b64"
PUBLIC_KEY = ROOT / "tools/r8-publisher/public-key.xml"
WEB = ROOT / "hoja-board"
SEED_SHA = "3eaeb50cd666bbe607dd6adc885a59e1ebdbd4027835ed23fbf2c0aec2c24bb7"
OLD_VERSION = "1.66.33"
OLD_MANIFEST = "ad2164eb3148868fbdaea01f9c7ede3adb423a93e87827f7d1621c2bd25af09d"
OLD_REPO = "0d2b58c47109fb959bf43de002caf7898bdde986"
REQUIRED = {"호자보드 설치.cmd", "INSTALL_HOJA_BOARD.ps1", "설치가 안되면 열어보세요.txt"}
SHA256_DIGESTINFO = bytes.fromhex("3031300d060960864801650304020105000420")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def verified_feed():
    wrap = json.loads(FEED.read_text(encoding="utf-8"))
    payload = base64.b64decode(wrap["payload"], validate=True)
    sig = base64.b64decode(wrap["signature"], validate=True)
    key = ET.parse(PUBLIC_KEY).getroot()
    n = int.from_bytes(base64.b64decode(key.findtext("Modulus")), "big")
    exp = int.from_bytes(base64.b64decode(key.findtext("Exponent")), "big")
    assert n.bit_length() == 2048 and exp == 65537 and len(sig) == 256, "unexpected signing key"
    em = pow(int.from_bytes(sig, "big"), exp, n).to_bytes(256, "big")
    split = em.find(b"\x00", 2)
    assert em[:2] == b"\x00\x01" and split >= 10, "invalid RSA PKCS#1 signature padding"
    assert em[2:split] == b"\xff" * (split - 2), "invalid RSA signature padding"
    assert em[split + 1:] == SHA256_DIGESTINFO + hashlib.sha256(payload).digest(), "invalid signed feed signature"
    m = json.loads(payload)
    version = m["version"]
    assert re.fullmatch(r"\d+\.\d+\.\d+", version), "unsafe version"
    assert m["schema"] == "TT-RUNTIME-SNAPSHOT-1" and m["channel"] == "stable" and m["kernel"] == 1
    assert 38 <= len(m["files"]) <= 128, "unexpected runtime file count"
    assert any(f["name"] == "release.json" for f in m["files"]), "signed release metadata missing"
    assert tuple(map(int, version.split("."))) >= (1, 66, 33), "manual publisher cannot downgrade"
    return version, sha(payload)


def feed_commit():
    # Exact commit that contains the signed feed and all its content-addressed blobs.
    result = subprocess.run(["git", "log", "-n1", "--format=%H", "--", str(FEED.relative_to(ROOT))],
                            cwd=ROOT, capture_output=True, text=True, check=True)
    commit = result.stdout.strip()
    assert re.fullmatch(r"[0-9a-f]{40}", commit), "signed feed snapshot git commit missing"
    return commit


def build(version, manifest_sha, commit):
    encoded = "".join(SOURCE.read_text(encoding="ascii").split())
    seed = base64.b64decode(encoded, validate=True)
    assert sha(seed) == SEED_SHA, "manual installer seed mutated"
    with zipfile.ZipFile(io.BytesIO(seed)) as z:
        assert set(z.namelist()) == REQUIRED, "unreviewed installer entry"
        src = {name: z.read(name).decode("utf-8-sig") for name in REQUIRED}
    script = src["INSTALL_HOJA_BOARD.ps1"]
    assert script.count(OLD_VERSION) >= 3 and script.count(OLD_MANIFEST) == 1
    assert script.count(OLD_REPO) == 1, "unexpected fallback pin"
    assert "$Version = '" + OLD_VERSION + "'" in script
    assert "$ManifestPayloadSha = '" + OLD_MANIFEST + "'" in script
    assert "$RepoCommit = '" + OLD_REPO + "'" in script
    assert "Update-HojaShortcut" in script and "File]::Replace" in script
    script = script.replace(OLD_VERSION, version).replace(OLD_MANIFEST, manifest_sha).replace(OLD_REPO, commit)
    cmd = src["호자보드 설치.cmd"].replace(OLD_VERSION, version)
    note = src["설치가 안되면 열어보세요.txt"].replace(OLD_VERSION, version)
    assert "차단 해제" in note and "호자보드.lnk" in script
    assets = {
        "호자보드 설치.cmd": cmd,
        "INSTALL_HOJA_BOARD.ps1": script,
        "설치가 안되면 열어보세요.txt": note,
    }
    # Fixed metadata makes identical source+feed reproducibly yield identical archive bytes.
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, content in assets.items():
            info = zipfile.ZipInfo(name, date_time=(2024, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.flag_bits |= 0x800
            z.writestr(info, content.encode("utf-8-sig"), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    output = memory.getvalue()
    with zipfile.ZipFile(io.BytesIO(output)) as z:
        assert set(z.namelist()) == REQUIRED and z.testzip() is None, "archive integrity"
        assert f"$Version = '{version}'" in z.read("INSTALL_HOJA_BOARD.ps1").decode("utf-8-sig")
        assert manifest_sha in z.read("INSTALL_HOJA_BOARD.ps1").decode("utf-8-sig")
    return output


def publish():
    version, manifest_sha = verified_feed()
    commit = feed_commit()
    package = build(version, manifest_sha, commit)
    filename = f"호자보드_{version}_설치파일.zip"
    relative = Path("downloads") / filename
    out = WEB / relative
    current_path = WEB / "release.json"
    old = json.loads(current_path.read_text(encoding="utf-8"))
    if old.get("status") == "ready":
        old_v = tuple(map(int, old["version"].split(".")))
        new_v = tuple(map(int, version.split(".")))
        assert new_v >= old_v, "refusing to unpublish a newer installer"
        if old_v == new_v:
            assert old.get("sha256") == sha(package), (
                "same-version published installer is immutable; wait for the next signed runtime")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(package)
    release = {
        "schema": 1,
        "status": "ready",
        "channel": "stable",
        "version": version,
        "url": "https://xkdtndbrwk111-prog.github.io/teacher-tools/hoja-board/downloads/"
               + quote(filename),
        "sha256": sha(package),
        "signedManifestSha256": manifest_sha,
        "feedSnapshotCommit": commit,
        "note": "Signed stable runtime; installer generated from the identical R8 auto-update feed.",
    }
    current_path.write_text(json.dumps(release, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"version": version, "filename": str(relative), "sha256": sha(package),
                      "signedManifest": manifest_sha, "commit": commit}, ensure_ascii=False))


if __name__ == "__main__":
    publish()
