import json
import tempfile
import unittest
from pathlib import Path
from native_update_candidate import build, digest, REQUIRED, RELEASE, read_package

class CandidateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
    def tearDown(self):
        self.tmp.cleanup()
    def package(self, name, version, extra=None):
        root = self.root / name
        root.mkdir()
        files = {n: b"fixed bytes" for n in REQUIRED}
        files[RELEASE] = json.dumps({"version": version}).encode()
        if extra:
            files.update(extra)
        entries = []
        for rel, data in files.items():
            p = root / "payload" / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
            entries.append({"path": rel, "sha256": digest(data), "bytes": len(data)})
        (root / "manifest.json").write_text(json.dumps({
            "schema": "HOJA-FIELD-PILOT-1", "profile": "online", "source": "a"*40,
            "files": entries}), encoding="utf8")
        return root
    def test_delta(self):
        base = self.package("base", "1.66.43")
        next = self.package("next", "1.66.44", {"bin/HOJA-Native-Server.exe": b"changed native"})
        out = self.root / "out"
        report = build(base, next, out)
        self.assertEqual(set(report["changed_files"]), {RELEASE, "bin/HOJA-Native-Server.exe"})
        data = (out / "payload.json").read_bytes()
        m = json.loads(data)
        self.assertEqual(m["channel"], "online-pilot")
        self.assertEqual(m["bases"], [digest((base / "payload" / RELEASE).read_bytes())])
        self.assertEqual(report["payload_sha256"], digest(data))
        self.assertFalse((out / "latest.json").exists())
        for e in m["files"]:
            self.assertEqual(digest((out / "blobs" / (e["sha256"]+".bin")).read_bytes()), e["sha256"])
    def test_data_and_static_excluded(self):
        for i, name in enumerate(["local/TeacherToolsLocal/coins.log",
            "bin/field-game.zip", "bin/HOJA-Field-Static.exe", "bin/field-manager.zip",
            "local/TeacherToolsLocal/seating.json"]):
            p = self.package(str(i), "1.66.43", {name:b"private"})
            with self.assertRaises(ValueError):
                read_package(p)
    def test_tamper(self):
        p = self.package("base", "1.66.43")
        (p / "payload" / RELEASE).write_bytes(b"tamper")
        with self.assertRaises(ValueError):
            read_package(p)
    def test_inventory_drift_and_replay(self):
        base = self.package("base", "1.66.43")
        same = self.package("same", "1.66.43")
        new = self.package("new", "1.66.44", {"bin/LICENSE.txt":b"license"})
        for p in (same, new):
            with self.assertRaises(ValueError):
                build(base, p, self.root / "out")
        self.assertFalse((self.root / "out").exists())

if __name__ == "__main__":
    unittest.main()
