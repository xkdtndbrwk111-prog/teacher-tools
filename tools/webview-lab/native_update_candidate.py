"""Build an UNSIGNED native update candidate; never publishes or accesses a key."""
import argparse
import hashlib
import json
import re
from pathlib import Path

MAX_FILE = 16 * 1024 * 1024
MAX_TOTAL = 64 * 1024 * 1024
RELEASE = "local/TeacherToolsLocal/release.json"
RUNTIME = {
    "asset-book-reader-host.zip", "classkit_QR_LICENSE.txt", "coins-ui.js",
    "coins.js", "dashboard.html", "handmade-paper.png", "hoja.ico", "podo.js",
    "presentation-assets.zip", "presentation-board.css", "presentation-board.js",
    "release.json", "school.js", "seating-inbox.html", "update-ui.js",
}
REQUIRED = {
    RELEASE, "local/TeacherToolsLocal/dashboard.html",
    "local/TeacherToolsLocal/asset-book-reader-host.zip",
    "bin/HOJA-Native-Launch-Lab.exe", "bin/HOJA-Native-Server.exe",
    "bin/Microsoft.Web.WebView2.Core.dll", "bin/Microsoft.Web.WebView2.WinForms.dll",
    "bin/WebView2Loader.dll",
}

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def program(path):
    if not isinstance(path, str) or ".." in path:
        return False
    if re.fullmatch(r"bin/(HOJA-Native-(Server|Launch-Lab)\.exe|Microsoft\.Web\.WebView2\.(Core|WinForms)\.dll|WebView2Loader\.dll|LICENSE[A-Za-z0-9_.-]*|ThirdPartyNotices[A-Za-z0-9_.-]*)", path):
        return True
    prefix = "local/TeacherToolsLocal/"
    if not path.startswith(prefix):
        return False
    name = path[len(prefix):]
    return name in RUNTIME or bool(re.fullmatch(r"museum-[A-Za-z0-9-]+\.(webp|png)", name))

def safe_file(root, name):
    root = Path(root)
    require(not root.is_symlink() and root.is_dir(), "package root")
    dest = root
    for part in name.split("/"):
        dest /= part
        require(not dest.is_symlink(), "linked package path")
    require(dest.is_file(), "missing file: " + name)
    return dest

def version(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}", value), "version")
    return tuple(map(int, value.split(".")))

def read_package(root):
    root = Path(root)
    raw = safe_file(root, "manifest.json").read_bytes()
    require(len(raw) <= 65536, "manifest size")
    m = json.loads(raw.decode("utf-8-sig"))
    require(m["schema"] == "HOJA-FIELD-PILOT-1" and m["profile"] == "online", "online package only")
    require(re.fullmatch(r"[a-f0-9]{40}", m["source"]), "source identity")
    files = {}
    folded = set()
    total = 0
    require(1 <= len(m["files"]) <= 128, "file count")
    for entry in m["files"]:
        name = entry["path"]
        require(program(name) and name.casefold() not in folded, "invalid or duplicate program path")
        folded.add(name.casefold())
        file = safe_file(root, "payload/" + name)
        size = file.stat().st_size
        require(0 < size <= MAX_FILE and size == entry["bytes"], "file size")
        total += size
        require(total <= MAX_TOTAL, "total size")
        data = file.read_bytes()
        require(digest(data) == entry["sha256"], "file hash")
        files[name] = data
    require(REQUIRED <= files.keys(), "required inventory missing")
    actual = {p.relative_to(root / "payload").as_posix() for p in (root / "payload").rglob("*") if p.is_file()}
    require(actual == files.keys(), "unlisted payload file")
    current = json.loads(files[RELEASE].decode("utf-8-sig"))["version"]
    version(current)
    return current, files

def build(base, target, output):
    before, old = read_package(base)
    after, new = read_package(target)
    require(version(after) > version(before), "non-increasing target")
    require(old.keys() == new.keys(), "inventory change requires new manual setup")
    require(digest(old[RELEASE]) != digest(new[RELEASE]), "release unchanged")
    entries = [{"path": name, "sha256": digest(data), "bytes": len(data)}
               for name, data in sorted(new.items())]
    manifest = {"schema": "TT-NATIVE-SNAPSHOT-1", "channel": "online-pilot", "kernel": 1,
                "version": after, "bases": [digest(old[RELEASE])], "files": entries}
    payload = json.dumps(manifest, ensure_ascii=True, separators=(",", ":")).encode("ascii")
    require(len(payload) <= 262144, "signed payload limit")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    (output / "blobs").mkdir()
    for data in new.values():
        (output / "blobs" / (digest(data) + ".bin")).write_bytes(data)
    (output / "payload.json").write_bytes(payload)
    changed = [name for name in new if digest(new[name]) != digest(old[name])]
    return {"base": before, "target": after, "payload_sha256": digest(payload),
            "changed_files": sorted(changed), "changed_bytes": sum(len(new[n]) for n in changed)}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.base, args.target, args.output), indent=2))
