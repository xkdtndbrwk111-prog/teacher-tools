import pathlib,sys,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
rep(' #sceneSection .tt-glass-demo-modal{background:rgba(var(--tt-glass-modal-rgb,var(--tt-glass-rgb)),var(--tt-modal-alpha,.78))}\n','')
rep('<figcaption>실시간 미리보기 · 예시 배경</figcaption><div class="tt-glass-demo-bg"><div class="tt-glass-demo-card"><b>위젯</b>1교시 · 국어</div><div class="tt-glass-demo-card tt-glass-demo-modal"><b>설정창·모달</b>배경과 글자 미리보기</div></div>', '<figcaption>위젯 실시간 미리보기 · 예시 배경</figcaption><div class="tt-glass-demo-bg"><div class="tt-glass-demo-card"><b>오늘의 시간표</b><small>11/16 · 월요일</small><div>1교시 · 국어</div><div>2교시 · 수학</div></div></div>')
rep(' #sceneSection .tt-glass-demo-card b{display:block;font-size:13px}', ' #sceneSection .tt-glass-demo-card b{display:block;font-size:13px}\n #sceneSection .tt-glass-demo-card small{color:var(--text);font-weight:600}\n #sceneSection .tt-glass-demo-bg{align-content:center;min-height:100px}')
rep('</body></html>', '''<style id="tt-text-readability">
/* Secondary text remains secondary by size, not washed-out color. */
.card :is(.sub,.muted,.weekday,.period-time,.event-item small,.wx-range,.wx-place,.wx-wait,.tt-dash-empty),
.card .schedule td:first-child,
.card .schedule th small,
.grid>.card[data-widget="dday"] .tt-dash-body small,
#nowClass span,
#settings :is(.sub,.muted,.scene-tip),
#sceneSection .tt-glass-demo figcaption{
 color:var(--text);opacity:1;
}
.card .schedule th small,.card .row>.sub{font-weight:600}
.card .schedule .period-time{font-weight:500}
.card .schedule tr:has(td.current) .period-time{font-weight:800;color:var(--text)}
</style></body></html>''')
s=s.replace('1.64.8','1.64.9')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode('utf-8')).hexdigest())
