"use strict";
// Pre-launch contract: no requests, increments, or visible metric UI.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("launch switch is OFF and immutable",()=>{
 const ctx={window:{}};
 vm.runInNewContext(read("launch-metrics-config.js"),ctx);
 assert.equal(ctx.window.TT_LAUNCH_METRICS.enabled,false);
 assert.equal(ctx.window.TT_LAUNCH_METRICS.metricsVersion,2);
 assert.equal(Object.isFrozen(ctx.window.TT_LAUNCH_METRICS),true);
});

test("standby tracker performs ZERO network requests",()=>{
 let calls=0;
 const target={hidden:true,textContent:""};
 const ctx={
  window:{TT_LAUNCH_METRICS:{enabled:false}},
  location:{hostname:"xkdtndbrwk111-prog.github.io",search:""},
  document:{currentScript:{dataset:{usageApp:"SEATING",usageDisplay:"usageStatsLine"}},getElementById:()=>target},
  fetch:()=>{calls++;throw new Error("PRELAUNCH_NETWORK");},
  sessionStorage:{getItem:()=>{throw new Error("PRELAUNCH_SESSION");}},
  URLSearchParams,AbortController,setTimeout,clearTimeout
 };
 vm.runInNewContext(read("usage-stats.js"),ctx);
 assert.equal(calls,0);
 assert.equal(target.hidden,true);
 assert.equal(target.textContent,"");
 assert.equal(ctx.window.TTLaunchMetrics,undefined);
});

test("website uses V2 tracker while refusing to load launch switch before release",()=>{
 for(const p of ["index.html","seating/index.html","hanja/index.html"]){
  const html=read(p);
  assert.ok(html.includes("usage-stats.js?v=launch-v2-standby"),p);
  assert.ok(!html.includes("launch-metrics-config.js?"),p);
  assert.ok(!html.includes("usage-stats.js?v=usage-1"),p);
 }
});

test("new SQL initializes zero and denies anonymous writes before release",()=>{
 const sql=read("docs/usage-migrations/20261121_launch_metrics_v2_prelaunch.sql");
 for(const key of ["classroom_visit","hoja_download","hoja_update"]){
  assert.ok(sql.includes("('"+key+"', 0)"),key);
 }
 assert.ok(sql.includes("values ('main', false, null)"));
 assert.match(sql,/revoke all on function public.record_public_launch_v2\(text\) from public, anon, authenticated/i);
 assert.match(sql,/grant execute on function public.record_verified_hoja_update_v2\(uuid\) to service_role/i);
 assert.doesNotMatch(sql,/^grant execute on function public.record_public_launch_v2\(text\) to anon,authenticated;/im);
 assert.ok(sql.includes("Asia/Seoul"));
 assert.ok(sql.includes("receipt_id uuid primary key"));
});

test("official Hoja download is not linked before launch",()=>{
 const hub=read("hub.js");
 assert.match(hub,/id:\s*"dashboard"/);
 assert.match(hub,/url:\s*null,\s*\/\/ Stable release only/);
 assert.match(hub,/download:\s*false/);
 assert.ok(hub.includes("TTLaunchMetrics?.recordOfficialDownload?.()"));
});

test("historical usage rows are not imported into V2",()=>{
 const newStats=read("usage-stats.js");
 assert.doesNotMatch(newStats,/record_app_usage_v1|get_app_usage_totals_v1/);
 assert.ok(newStats.includes("get_launch_metrics_v2"));
 assert.ok(newStats.includes("record_public_launch_v2"));
});
