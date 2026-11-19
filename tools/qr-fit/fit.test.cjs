const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../runtime-src/system/dashboard.html'),'utf8');
const start=html.indexOf('const ttQrId='),end=html.indexOf('function ttSquareRect(',start);
assert.ok(start>=0&&end>start);
const ctx=vm.createContext({GRID_ROWS:27,GRID_COLS:48});vm.runInContext(html.slice(start,end),ctx);
const call=(name,...args)=>JSON.parse(JSON.stringify(vm.runInContext(name+'('+args.map(x=>JSON.stringify(x)).join(',')+')',ctx)));
test('old QR slots and all corner resize directions retain equal integer spans',()=>{
 assert.deepEqual(call('ttQrSquareRect',{x:2,y:5,w:20,h:16,z:4,off:false}),{x:2,y:5,w:16,h:16,z:4,off:false});
 assert.deepEqual(call('ttQrSquareRect',{x:0,y:21,w:8,h:6}),{x:0,y:19,w:8,h:8});
 for(const dx of [-1,1])for(const dy of [-1,1])for(const cx of [-100,-11,-3,0,2,12,100])for(const cy of [-100,-7,0,5,100]){
  const before={x:10,y:8,w:10,h:10},r=call('ttQrResize',before,dx,dy,cx,cy,48,27);
  assert.equal(r.w,r.h);assert.ok(Number.isInteger(r.w)&&r.w>=8);
  assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=48&&r.y+r.h<=27);
  assert.equal(dx<0?r.x+r.w:r.x,dx<0?20:10);assert.equal(dy<0?r.y+r.h:r.y,dy<0?18:8);
 }
});
test('white plate allocates maximum integer QR module size with separate label band',()=>{
 for(const modules of [21,33,57,97])for(const [w,h] of [[100,110],[300,200],[900,800],[512,512],[140,140]]){
  const m=call('ttQrPlateMetrics',w,h,modules);
  assert.equal(m.side,Math.min(w,h));assert.ok(m.code+m.band<=m.side);
  assert.equal(m.code,m.unit*(modules+8));assert.ok(m.code+modules+8+m.band>m.side);
 }
 assert.ok(call('ttQrPlateMetrics',800,800,33).code>call('ttQrPlateMetrics',300,300,33).code);
 assert.ok(html.includes('plate.append(cv,lb)'));
 assert.ok(html.includes('const quiet=4,n=(matrix.length+quiet*2)*unit'));
 assert.ok(html.includes('n=ttQrResize(s,d.dx,d.dy,cx,cy)'));
});
