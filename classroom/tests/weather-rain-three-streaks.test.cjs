"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.resolve(__dirname,"../../runtime-src/system/dashboard.html"),"utf8");

test("light rain source and drizzle retain the same three streaks",()=>{
  assert.match(html,/ICON\.drizzle=ICON\.light_rain;/);
  const drizzle=html.match(/if\(name==='drizzle'\)\{\s*([\s\S]*?)\n\s*\}/);
  assert.ok(drizzle,"drizzle processing is present");
  assert.match(drizzle[1],/o\.speed=\.5;/);
  // Do not crop away the rightmost streak or replace original pixel artwork.
  assert.doesNotMatch(drizzle[1],/clearRect|drawImage|putImageData|globalCompositeOperation|filter\s*=/);
  assert.match(html,/g\.drawImage\(o\.fall,0,s\);g\.drawImage\(o\.fall,0,s-h\);/);
});
