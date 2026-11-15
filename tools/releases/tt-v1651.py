import pathlib,sys,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:80],s.count(a))
 s=s.replace(a,b)
rep('<div class="tt-week-links"><a id="ttWeekNeis"','<div class="tt-week-links" hidden><a hidden id="ttWeekNeis"')
rep('<a id="ttWeekSheet"','<a hidden id="ttWeekSheet"')
rep('.tt-week-links a:focus-visible{','.tt-week-links[hidden],.tt-week-links a[hidden]{display:none!important}\n.tt-week-links a:focus-visible{')
rep("if(valid(d.template))neis.href=url(d.template,'copy');if(valid(d.school?.sheet))sheet.href=url(d.school.sheet,'edit');loaded=true", "if(valid(d.template))neis.href=url(d.template,'copy');if(valid(d.school?.sheet))sheet.href=url(d.school.sheet,'edit');const connected=valid(d.school?.sheet);neis.hidden=!d.school||connected;sheet.hidden=!d.school||!connected;neis.parentElement.hidden=!d.school;loaded=true")
s=s.replace('1.65.0','1.65.1')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
