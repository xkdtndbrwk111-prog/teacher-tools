import pathlib,sys,re,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
rep('''#settings .tt-settings-portrait{flex:1 1 0;min-height:0;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;pointer-events:none}
#settings .tt-settings-portrait img{display:block;max-width:76%;max-height:min(100%,150px);width:auto;height:auto;object-fit:contain;flex-shrink:1}
#settings .tt-settings-portrait img[hidden]{display:none!important}''','''#settings .tt-settings-portrait{flex:1 1 0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;overflow:hidden;pointer-events:none;container-type:size;container-name:ttSettingsPortrait}
#settings .tt-settings-portrait-inner{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:12px;width:100%;max-height:100%;min-height:0;padding:3px 2px 2px;box-sizing:border-box}
#settings .tt-settings-portrait-inner[hidden]{display:none!important}
#settings .tt-settings-portrait img{display:block;max-width:76%;max-height:150px;min-height:0;width:auto;height:auto;object-fit:contain;flex:0 1 auto;align-self:center;margin-left:18px}
/* Same rounded capsule and curved tail geometry as the dashboard speech bubble; white and black for settings. */
#settings .tt-settings-speech{position:relative;box-sizing:border-box;flex:0 0 auto;max-width:100%;margin:0;padding:.48em .85em;background:#fff;color:#111;border:2px solid #111;border-radius:999px;font-size:14px;font-weight:800;text-align:center;line-height:1.35;white-space:pre-line;word-break:keep-all;overflow-wrap:anywhere}
#settings .tt-settings-speech::after{content:"";position:absolute;top:calc(100% - 2px);left:58%;width:22px;height:14px;transform:translateX(-9px);background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='27' height='17' viewBox='0 0 27 17'%3E%3Cpath d='M2 0H25Q18 13 5 15Q2 15 4 12Q10 5 7 0Z' fill='%23fff'/%3E%3Cpath d='M7 0Q10 5 4 12Q2 15 5 15Q18 13 25 0' stroke='%23111' stroke-width='2.5' fill='none' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat;pointer-events:none}
@container ttSettingsPortrait (max-height:110px){#settings .tt-settings-portrait-inner{display:none}}
'''.rstrip())
rep("const img=document.createElement('img');img.alt='';img.hidden=true;box.append(img);", "const inner=document.createElement('div');inner.className='tt-settings-portrait-inner';inner.hidden=true;const speech=document.createElement('div');speech.className='tt-settings-speech';const img=document.createElement('img');img.alt='';inner.append(speech,img);box.append(inner);")
rep("const hoja=Math.random()<.75;const urls=", "const hoja=Math.random()<.75;speech.textContent=hoja?'선생님의 하루를\\n응원해요!':'선생님, 오늘도\\n든든하게 함께할게요.';const urls=")
rep("const id=++seq;img.hidden=true;", "const id=++seq;inner.hidden=true;")
rep("if(i>=urls.length){img.hidden=true;return}", "if(i>=urls.length){inner.hidden=true;return}")
rep("if(id===seq&&dlg.open)img.hidden=false", "if(id===seq&&dlg.open)inner.hidden=false")
rep("seq++;img.hidden=true;img.onload=null;img.onerror=null", "seq++;inner.hidden=true;img.onload=null;img.onerror=null")
s=s.replace('1.64.6','1.64.7')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
