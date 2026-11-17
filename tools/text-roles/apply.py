import pathlib,re,sys,collections
root=pathlib.Path(sys.argv[1]);here=pathlib.Path(__file__).parent
groups={
'primary':'#edf4fc #bfe3ff #d7eeff #4b5662 #475461 #435467 #405567 #385761 #405868 #415263 #453326 #3a2a20 #3d342b #172c28 #111 #352100 #6a3d05 #673222 #665d4e #332716 #fbfbf0 #fff8e6 #fff7e0 #f3f8ff #e7f0ff #e6f7ff #f2f5fa',
'secondary':'#a8b6ca #cad9ed #9cb3cc #b9c7da #e5e7cf #798692 #6c7d87 #738994 #71858d #8796a1',
'accent':'#9bc7ff #8abaff #8edec5 #679458 #fff8d8 #fff365 #f0e65f',
'alert':'#ffce93 #fbbf24 #f0b429 #ff8a7a #ffcf6a #fff3c4 #c43e43 #c24141 #fda4af',
'on-fill':'#fff white #ffffff'}
roles={v:k for k,vs in groups.items() for v in vs.split()}
legacy={'--text':'primary','--sub':'secondary','--accent':'accent','--current':'accent','--control-text':'on-fill','--picker-ink':'primary','--picker-button-ink':'on-fill','--picker-accent-ink':'on-fill'}
pattern=re.compile(r'(?<![\w-])color\s*:\s*(#[\da-fA-F]{3,8}\b|white\b|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*\.(?:45|64|75)\s*\)|var\(--(?:text(?:,#[\da-fA-F]+)?|sub(?:,#[\da-fA-F]+)?|accent|current|control-text(?:,var\(--text\))?|picker-ink,var\(--text\)|picker-button-ink,var\(--control-text\)|picker-accent-ink,#fff)\))',re.I)
counts=collections.Counter();unknown=[]
def replace(m):
 v=m.group(1).lower()
 role='secondary' if v.startswith('rgba(') else legacy.get(v[4:].split(',')[0].rstrip(')')) if v.startswith('var(') else roles.get(v)
 if not role:unknown.append(v);return m.group(0)
 counts[role]+=1
 return 'color:var(--text-'+role+')'
for name in ['dashboard.html','podo.js','coins-ui.js','presentation-board.css','seating-inbox.html']:
 p=root/name;raw=p.read_bytes();s=raw.decode('utf-8');before=counts.copy();s=pattern.sub(replace,s)
 if name=='dashboard.html':
  s=s.replace("mini.style.color=hudGrade==='normal'?'#402d00':'#fff';","mini.style.color='var(--text-on-fill)';")
  old='color:'+'$'+'{t.text}'
  assert s.count(old)==1
  s=s.replace(old,'--text-on-fill:'+'$'+'{window.ttTextRoles?.ink(t.text,[t.panel])||t.text};color:var(--text-on-fill)')
  s=s.replace('var(--tt-glass-alpha,.78)','var(--tt-ink-glass-alpha,var(--tt-glass-alpha,.78))').replace('var(--tt-modal-alpha,.78)','var(--tt-ink-modal-alpha,var(--tt-modal-alpha,.78))').replace('rgba(var(--tt-glass-inner-rgb),.88)','rgba(var(--tt-glass-inner-rgb),var(--tt-ink-inner-alpha,.88))')
  s=s.replace('V1.66.5 STABLE PILOT','V1.66.6 STABLE PILOT')
  assert s.count('</body>')==1
  s=s.replace('</body>','<style id="tt-text-roles-v1666">\n'+(here/'roles.css').read_text()+'\n</style><script id="tt-text-role-engine">\n'+(here/'roles.js').read_text()+'\n</script></body>')
 elif name=='seating-inbox.html':s=s.replace('body{margin:0;', 'body{--text-on-fill:#ffffff;margin:0;',1)
 if s.encode()!=raw:p.write_bytes(s.encode())
 print(name,dict(counts-before))
if unknown:raise SystemExit('Unclassified literal foreground colors: '+str(sorted(set(unknown))))
p=root/'release.json';s=p.read_text();assert '"version": "1.66.5"' in s;p.write_bytes(s.replace('1.66.5','1.66.6').encode())
print('TOTAL',dict(counts),'sum=',sum(counts.values()))
