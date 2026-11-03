// Supabase Edge Function "schoolinfo-plan": a read-only relay for public 학교알리미 data, because the
// browser cannot fetch another site's files. It only finds elementary schools and passes on the public
// "4-가 교과별(학년별) 평가계획" files. No student data, no database, no writes.
//   GET ?action=schools&q=개원          → [{code,name,region,address}]   (needs SCHOOLINFO_API_KEY)
//   GET ?action=plans&code=B100001234   → {school,year,files:[{seq,name}]}
//   GET ?action=file&code=…&seq=4       → the file bytes
// The same file is deployed to two projects; the classroom manager tries the second when the first fails.

const BASE = 'https://www.schoolinfo.go.kr';
const ORIGINS = [/^https:\/\/xkdtndbrwk111-prog\.github\.io$/, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/];
const MAX_FILE = 30 * 1024 * 1024;
const UA = { 'User-Agent': 'Mozilla/5.0 (teacher-tools plan relay)' };

const env = (k: string) => (globalThis as any).Deno?.env.get(k) ?? (globalThis as any).process?.env?.[k] ?? '';
function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ORIGINS.some(r => r.test(o)) ? o : 'null', 'Access-Control-Expose-Headers': 'X-File-Name', Vary: 'Origin' };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function text(url: string) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error('SCHOOLINFO_' + r.status);
  const b = new Uint8Array(await r.arrayBuffer());
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('euc-kr').decode(b); }
}
const unescape = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", nbsp: ' ' } as any)[e]).replace(/\s+/g, ' ').trim();

// School list from the official 학교기본정보 OpenAPI, cached per running instance for a day.
let schools: { at: number; list: any[] } | null = null;
async function schoolList() {
  if (schools && Date.now() - schools.at < 864e5) return schools.list;
  const key = env('SCHOOLINFO_API_KEY');
  if (!key) throw new Error('NO_KEY');
  const r = await fetch(`${BASE}/openApi.do?apiKey=${encodeURIComponent(key)}&apiType=0&schulKndCode=02`, { headers: UA });
  const data = await r.json();
  const rows: any[] = Array.isArray(data) ? data : (Object.values(data || {}).find(v => Array.isArray(v) && (v as any[])[0]?.SCHUL_NM) as any[]) || [];
  if (!rows.length) throw new Error('SCHOOL_LIST_EMPTY');
  const list = rows.filter(x => x.ABSCH_YN !== 'Y').map(x => ({
    code: String(x.SCHUL_CODE || ''), name: String(x.SCHUL_NM || ''), region: String(x.ATPT_OFCDC_ORG_NM || ''),
    address: String(x.SCHUL_RDNMA || x.ADRES_BRKDN || ''),
  })).filter(x => /^[A-Z]\d{9}$/.test(x.code) && x.name);
  schools = { at: Date.now(), list };
  return list;
}

const CODE = /^([A-Z]\d{9}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
async function planItem(code: string) {
  const page = await text(`${BASE}/ei/ss/Pneiss_b01_s0.do?${/^[A-Z]/.test(code) ? 'HG_CD' : 'SHL_IDF_CD'}=${code}`);
  const sid = /SHL_IDF_CD\s*:\s*"([0-9a-f-]{36})"/.exec(page)?.[1];
  if (!sid) throw new Error('SCHOOL_NOT_FOUND');
  const school = /HG_NM\s*:\s*"([^"]+)"/.exec(page)?.[1] || '';
  const year = /JG_YEAR\s*:\s*"(\d{4})"/.exec(page)?.[1] || String(new Date().getFullYear());
  const q = new URLSearchParams({ GS_HANGMOK_CD: '43', GS_HANGMOK_NO: '4-가', GS_HANGMOK_NM: '교과별(학년별) 교수ㆍ학습 및 평가계획에 관한 사항', GS_BURYU_CD: 'JG110', JG_BURYU_CD: 'JG040', JG_HANGMOK_CD: '14', JG_GUBUN: '1', JG_YEAR2: year, HG_NM: school, SHL_IDF_CD: sid, GS_TYPE: 'Y', JG_YEAR: year, SORT: 'BR', CHOSEN_JG_YEAR: year, PRE_JG_YEAR: year, LOAD_TYPE: 'single' });
  const item = await text(`${BASE}/ei/pp/Pneipp_b43_s0p.do?${q}`);
  const files = [...item.matchAll(/getEiFile43\('(\d+)'\);[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({ seq: Number(m[1]), name: unescape(m[2]) }));
  const form = /<form[^>]*id="eiFileDownForm"[\s\S]*?<\/form>/.exec(item)?.[0] || '';
  const fields = Object.fromEntries([...form.matchAll(/name="([A-Z_]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]));
  return { school, year, sid, files, fields };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors(req), 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'content-type' } });
  if (req.method !== 'GET') return json(req, { error: 'METHOD' }, 405);
  const u = new URL(req.url), action = u.searchParams.get('action');
  try {
    if (action === 'ping') return json(req, { ok: true, schools: Boolean(env('SCHOOLINFO_API_KEY')) });
    if (action === 'schools') {
      const q = (u.searchParams.get('q') || '').replace(/\s/g, '');
      if (q.length < 2 || q.length > 30) return json(req, { error: 'QUERY' }, 400);
      const list = await schoolList();
      return json(req, { schools: list.filter(s => s.name.replace(/\s/g, '').includes(q)).slice(0, 30) });
    }
    const code = u.searchParams.get('code') || '';
    if (!CODE.test(code)) return json(req, { error: 'CODE' }, 400);
    const p = await planItem(code);
    if (action === 'plans') return json(req, { school: p.school, year: p.year, files: p.files.map(f => ({ seq: f.seq, name: f.name })) });
    if (action === 'file') {
      const seq = u.searchParams.get('seq') || '';
      const f = p.files.find(x => String(x.seq) === seq);
      if (!f || !p.fields.JG_CHASU) return json(req, { error: 'FILE_NOT_FOUND' }, 404);
      const r = await fetch(`${BASE}/servlets/EiFileDownLoad.do?${new URLSearchParams({ ...p.fields, FILE_SEQ: seq })}`, { headers: UA });
      if (!r.ok) return json(req, { error: 'SCHOOLINFO_' + r.status }, 502);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length > MAX_FILE) return json(req, { error: 'FILE_TOO_BIG' }, 413);
      return new Response(bytes, { headers: { ...cors(req), 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name), 'Cache-Control': 'no-store' } });
    }
    return json(req, { error: 'ACTION' }, 400);
  } catch (e) {
    const m = String((e as Error)?.message || e);
    return json(req, { error: m === 'NO_KEY' || m === 'SCHOOL_NOT_FOUND' || m === 'SCHOOL_LIST_EMPTY' || m.startsWith('SCHOOLINFO_') ? m : 'RELAY_FAILED' }, m === 'NO_KEY' ? 503 : m === 'SCHOOL_NOT_FOUND' ? 404 : 502);
  }
}
if ((globalThis as any).Deno?.serve) (globalThis as any).Deno.serve(handle);
