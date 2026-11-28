"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const profile = JSON.parse(fs.readFileSync(path.join(__dirname, "phase7a-online-profile.json"), "utf8"));
assert.equal(profile.schema, "HOJA-WEBVIEW2-ONLINE-PROFILE-1");
assert.equal(profile.mode, "online");
assert.deepEqual(profile.staticServerExecutables, []);
for (const key of ["managerOrigin", "gameOrigin", "nativeApiOrigin"]) {
  const url = new URL(profile[key]);
  assert.equal(url.protocol, "https:", `${key} must use HTTPS`);
}
for (const oldOrigin of profile.legacyLocalOrigins) {
  for (const key of ["managerOrigin", "gameOrigin", "nativeApiOrigin"]) {
    assert.ok(!profile[key].includes(oldOrigin), `${key} leaked legacy origin ${oldOrigin}`);
  }
}
assert.equal(profile.contracts.userData, "outside replaceable payload");
console.log("PASS Phase 7A online profile contract");
