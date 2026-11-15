#!/usr/bin/env python3
"""Read-only interoperability probe. Never accepts production keys or publishes."""
import base64, gzip, hashlib, io, json, pathlib, re, subprocess, sys, tempfile

MAX_JSON = 4 * 1024 * 1024
MAX_HTML = 16 * 1024 * 1024

def fail(message):
    raise ValueError(message)

def no_duplicates(pairs):
    result = {}
    for k, v in pairs:
        if k in result:
            fail("duplicate JSON key")
        result[k] = v
    return result

def parse(raw):
    if len(raw) > MAX_JSON:
        fail("JSON too large")
    return json.loads(raw, object_pairs_hook=no_duplicates)

def read(path):
    with open(path, "rb") as f:
        return parse(f.read(MAX_JSON + 1))

def b64(value):
    if not isinstance(value, str) or len(value) > MAX_JSON:
        fail("invalid base64 length")
    decoded = base64.b64decode(value, validate=True)
    if base64.b64encode(decoded).decode("ascii") != value:
        fail("noncanonical base64")
    return decoded

def chunks(obj):
    parts = obj["payloadChunks"]
    if not isinstance(parts, list) or not parts or len(parts) > 700:
        fail("invalid chunks")
    if any(not isinstance(p, str) or not 1 <= len(p) <= 6000 for p in parts):
        fail("invalid chunk size")
    return b64("".join(parts))

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def version(s):
    if not isinstance(s, str) or not re.fullmatch(r"[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}", s):
        fail("invalid version")
    return tuple(map(int, s.split(".")))

def check_hash(s):
    if not isinstance(s, str) or not re.fullmatch(r"[0-9a-f]{64}", s):
        fail("invalid SHA-256")

def validate(raw):
    p = parse(raw)
    expected = {"schema","channel","toVersion","bases","afterHtmlSha","afterReleaseSha","releaseBytes","htmlGzip"}
    if set(p) != expected or p["schema"] != "TT-STABLE-CONTENT-SNAPSHOT-3" or p["channel"] != "stable":
        fail("unknown payload")
    target = version(p["toVersion"])
    bases = p["bases"]
    if not isinstance(bases, list) or not 1 <= len(bases) <= 100:
        fail("invalid bases")
    seen = set()
    for b in bases:
        if set(b) != {"version","htmlSha","releaseSha"}:
            fail("invalid base")
        v = version(b["version"])
        if v in seen or v >= target:
            fail("duplicate or non-older base")
        seen.add(v)
        check_hash(b["htmlSha"])
        check_hash(b["releaseSha"])
    release = b64(p["releaseBytes"])
    with gzip.GzipFile(fileobj=io.BytesIO(b64(p["htmlGzip"]))) as z:
        html = z.read(MAX_HTML + 1)
    if len(html) > MAX_HTML or not html:
        fail("invalid HTML length")
    if sha(html) != p["afterHtmlSha"] or sha(release) != p["afterReleaseSha"]:
        fail("content hash mismatch")
    r = parse(release)
    if (r.get("schema"), r.get("version"), r.get("channel"), r.get("updateMode"), r.get("audience")) != (1, p["toVersion"], "stable", "auto-pilot", "owner-field-test"):
        fail("release metadata mismatch")
    html.decode("utf-8", errors="strict")
    return p

def expect_rejection(raw):
    try:
        validate(raw)
    except (ValueError, KeyError, TypeError, OSError, EOFError):
        return
    fail("tampered input accepted")

def run(*args, **kw):
    return subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)

def verify(pub, data, sig):
    return subprocess.run(["openssl","dgst","-sha256","-verify",str(pub),"-signature",str(sig),str(data)],
                          stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0

def main():
    if len(sys.argv) != 3:
        fail("usage: probe.py queue.json published.json")
    q, f = read(sys.argv[1]), read(sys.argv[2])
    if set(q) != {"schema","sha256","payloadChunks"} or q["schema"] != "TT-RELEASE-REQUEST-1":
        fail("unexpected queue")
    raw = chunks(q)
    if sha(raw) != q["sha256"] or raw != chunks(f):
        fail("queue hash or published snapshot mismatch")
    if set(f) != {"payloadChunks","signature"} or len(b64(f["signature"])) != 256:
        fail("published envelope shape mismatch")
    p = validate(raw)
    if p["toVersion"] != "1.63.5":
        fail("probe only supports pinned baseline")
    for field, value in [("afterHtmlSha", "0"*64), ("afterReleaseSha", "0"*64), ("channel", "test"), ("toVersion", p["bases"][0]["version"])]:
        bad = dict(p)
        bad[field] = value
        expect_rejection(json.dumps(bad).encode())
    with tempfile.TemporaryDirectory() as d:
        root = pathlib.Path(d)
        key, pub, data, sig = (root / n for n in ("temp.pem","public.pem","payload.bin","signature.bin"))
        run("openssl","genpkey","-algorithm","RSA","-pkeyopt","rsa_keygen_bits:2048","-out",str(key))
        run("openssl","pkey","-in",str(key),"-pubout","-out",str(pub))
        data.write_bytes(raw)
        run("openssl","dgst","-sha256","-sign",str(key),"-out",str(sig),str(data))
        if len(sig.read_bytes()) != 256 or not verify(pub, data, sig):
            fail("ephemeral signature verification failed")
        data.write_bytes(raw+b" ")
        if verify(pub, data, sig):
            fail("modified payload passed signature verification")
        data.write_bytes(raw)
        run("openssl","genpkey","-algorithm","RSA","-pkeyopt","rsa_keygen_bits:2048","-out",str(key))
        run("openssl","pkey","-in",str(key),"-pubout","-out",str(pub))
        if verify(pub, data, sig):
            fail("wrong public key accepted")
    print("PASS: pinned queue hash, published payload equality, snapshot hashes, version/channel, 4 malformed payload cases, ephemeral RSA sign/verify, tamper and wrong-key rejection")
    print("No production key, feed write, artifact publication, or Windows client compatibility claim.")

if __name__ == "__main__":
    main()
