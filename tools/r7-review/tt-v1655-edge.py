#!/usr/bin/env python3
"""Clamp edit overlays, without changing stored widget coordinates."""
import hashlib,pathlib,sys
raw=pathlib.Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest() in {'8b9661356ba45fa2a60481e05e7dd6bf692f0a580fbc854bf8492496ad5fcd77','1d8f2341ebb2cff8836973edea36de427785a244ffcb974300abc92d840aa2dc'},'Unexpected input'
s=raw.decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,a[:100]
 s=s.replace(a,b,1)
rep('function railSync(){', '''// Keep the entire tool edit rail in the viewport, even for a narrow edge-aligned card.
function positionToolEditRail(rail,r){
 const pad=4,vw=innerWidth,vh=innerHeight;
 rail.style.transform='none';rail.style.maxWidth=Math.max(0,Math.min(vw-2*pad,Math.max(148,r.width-16)))+'px';
 const w=rail.offsetWidth,h=rail.offsetHeight;
 const clamp=(n,size,limit)=>Math.max(pad,Math.min(n,limit-size-pad));
 rail.style.left=clamp(r.left+(r.width-w)/2,w,vw)+'px';
 const above=r.top-h-4,below=r.bottom+4;
 const y=above>=pad?above:below+h<=vh-pad?below:r.top+4;
 rail.style.top=clamp(y,h,vh)+'px';
}
window.ttPositionToolEditRail=positionToolEditRail;
function railSync(){''')
rep("  rail.style.maxWidth=Math.max(104,r.width-16)+'px';existing.delete(id);", "  rail.style.maxWidth=Math.max(104,r.width-16)+'px';if(id==='tools')positionToolEditRail(rail,r);existing.delete(id);")
rep("if(title)title.style.transform=c.top>=42?'translate(-50%,calc(-100% - 9px))':'translate(-50%,'+Math.round(c.height)+'px)';", "if(title)window.ttPositionToolEditRail?.(title,c);")
rep("  rail.style.left=left+'px';rail.style.top=top+'px';rail.style.width=width+'px';rail.style.height=height+'px';", "  const safeHeight=Math.max(0,Math.min(height,innerHeight-8));width=Math.max(0,Math.min(width,innerWidth-8));\n  left=Math.max(4,Math.min(left,innerWidth-width-4));top=Math.max(4,Math.min(top,innerHeight-safeHeight-4));\n  rail.style.left=left+'px';rail.style.top=top+'px';rail.style.width=width+'px';rail.style.height=safeHeight+'px';")
out=s.encode('utf-8');pathlib.Path(sys.argv[2]).write_bytes(out);print(hashlib.sha256(out).hexdigest())
