// 나무링크 Supabase 클라이언트
// 페이지 어디서든 window.Supa 로 접근

(function() {
  const SUPABASE_URL = 'https://mrezaqgfyvgdtukzkidb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZXphcWdmeXZnZHR1a3praWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjMxNjEsImV4cCI6MjA5NzI5OTE2MX0.xNWlRG9XajOg4cE6SgeVne8kFiO8ZiQCatJHRymT6nc';

  // Supabase SDK 로드 (CDN)
  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve(window.supabase);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = () => resolve(window.supabase);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // 스키마 무관 최소 매핑: id(선택) + data(전체 원본) 만 전송.
  // idKey=false 인 테이블은 id 를 서버에서 자동 채번 (voucher_data).
  const KEY_TABLE = {
    'children':             { table: 'children',             idKey: 'id' },
    'therapists':           { table: 'therapists',           idKey: 'id' },
    'payments':             { table: 'payments',             idKey: 'id' },
    'records':              { table: 'records',              idKey: 'id',
                              genId: (r) => r.id || `rec_${r.childId||r.child_id||''}_${r.year||''}_${r.month||''}_${r.category||''}` },
    'voucher_data':         { table: 'voucher_data',         idKey: false },   // bigserial 자동 채번
    'intake_list':          { table: 'intake_list',          idKey: 'id' },
    'assessment_tokens':    { table: 'assessment_tokens',    idKey: 'id' },
    'initial_assessments':  { table: 'initial_assessments',  idKey: 'id' },
  };

  // 각 레코드 → { id, data, updated_at } 형태로 변환
  function toRow(cfg, r) {
    const row = { data: r, updated_at: new Date().toISOString() };
    if (cfg.idKey !== false) {
      const id = cfg.genId ? cfg.genId(r) : r[cfg.idKey];
      if (id != null) row.id = String(id);
    }
    return row;
  }

  async function getClient() {
    const sb = await loadSdk();
    return sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // 배열에서 id 중복 제거 (마지막 값 우선 — 최신 상태 유지)
  // Postgres upsert 는 한 배치 안에 같은 id 가 두 번 이상 있으면
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" 오류.
  function dedupById(rows) {
    const map = new Map();
    let dupCount = 0;
    rows.forEach(r => {
      if (r.id == null || r.id === '') return; // id 없는 건 그대로 유지 (bigserial)
      if (map.has(r.id)) dupCount++;
      map.set(r.id, r);
    });
    const noId = rows.filter(r => r.id == null || r.id === '');
    return { rows: [...map.values(), ...noId], dupCount };
  }

  // localStorage 의 특정 key 를 Supabase 로 업로드 (배열 → 각 row 로 upsert)
  async function pushKey(key) {
    const cfg = KEY_TABLE[key];
    if (!cfg) throw new Error('알 수 없는 키: ' + key);
    const client = await getClient();
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(raw) || !raw.length) return { table: cfg.table, count: 0 };
    let rows = raw.map(r => toRow(cfg, r));
    let dupCount = 0;
    if (cfg.idKey !== false) {
      const dedup = dedupById(rows);
      rows = dedup.rows;
      dupCount = dedup.dupCount;
    }
    // 배치 upsert (500건씩) — id 없는 테이블(voucher_data)은 그냥 insert
    let count = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i+500);
      let res;
      if (cfg.idKey === false) {
        res = await client.from(cfg.table).insert(chunk);
      } else {
        res = await client.from(cfg.table).upsert(chunk, { onConflict: 'id' });
      }
      if (res.error) throw new Error(`${cfg.table}: ${res.error.message}`);
      count += chunk.length;
    }
    return { table: cfg.table, count, dupCount };
  }

  // Supabase 에서 특정 key 데이터 전체 로드 → localStorage 에 저장
  async function pullKey(key) {
    const cfg = KEY_TABLE[key];
    if (!cfg) throw new Error('알 수 없는 키: ' + key);
    const client = await getClient();
    let all = [];
    // 페이지네이션 (1000건씩)
    let from = 0;
    while (true) {
      const { data, error } = await client.from(cfg.table).select('data').range(from, from+999);
      if (error) throw new Error(`${cfg.table}: ${error.message}`);
      if (!data || !data.length) break;
      all = all.concat(data.map(r => r.data));
      if (data.length < 1000) break;
      from += 1000;
    }
    localStorage.setItem(key, JSON.stringify(all));
    return { table: cfg.table, count: all.length };
  }

  // 아동별 확장 데이터 (child_docs_*, child_timeline_*, child_parent_memos_*) 처리
  // 새 스키마: id = "{childId}::{kind}", data = { child_id, kind, value }
  async function pushChildExtras() {
    const client = await getClient();
    const rows = [];
    Object.keys(localStorage).forEach(k => {
      let kind = null;
      if (k.startsWith('child_docs_'))         { kind = 'docs';         }
      else if (k.startsWith('child_timeline_')) { kind = 'timeline';     }
      else if (k.startsWith('child_parent_memos_')) { kind = 'parent_memos'; }
      if (!kind) return;
      const childId = k.replace(/^child_(docs|timeline|parent_memos)_/, '');
      let value;
      try { value = JSON.parse(localStorage.getItem(k)||'[]'); } catch(e) { return; }
      rows.push({
        id: `${childId}::${kind}`,
        data: { child_id: childId, kind, value },
        updated_at: new Date().toISOString(),
      });
    });
    if (!rows.length) return { table: 'child_extras', count: 0 };
    let count = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i+500);
      const { error } = await client.from('child_extras').upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error('child_extras: ' + error.message);
      count += chunk.length;
    }
    return { table: 'child_extras', count };
  }

  async function pullChildExtras() {
    const client = await getClient();
    let all = [];
    let from = 0;
    while (true) {
      const { data, error } = await client.from('child_extras').select('data').range(from, from+999);
      if (error) throw new Error('child_extras: ' + error.message);
      if (!data || !data.length) break;
      all = all.concat(data.map(r => r.data));
      if (data.length < 1000) break;
      from += 1000;
    }
    let count = 0;
    all.forEach(d => {
      if (!d || !d.child_id || !d.kind) return;
      const key = `child_${d.kind}_${d.child_id}`;
      localStorage.setItem(key, JSON.stringify(d.value));
      count++;
    });
    return { table: 'child_extras', count };
  }

  // 전체 push
  async function pushAll(progressFn) {
    const keys = Object.keys(KEY_TABLE);
    const results = [];
    for (const k of keys) {
      progressFn && progressFn(`↑ ${k} 업로드 중...`);
      try { results.push(await pushKey(k)); }
      catch (e) { results.push({ table: k, error: e.message }); }
    }
    progressFn && progressFn('↑ child_extras 업로드 중...');
    try { results.push(await pushChildExtras()); }
    catch (e) { results.push({ table: 'child_extras', error: e.message }); }
    return results;
  }

  // 전체 pull
  async function pullAll(progressFn) {
    const keys = Object.keys(KEY_TABLE);
    const results = [];
    for (const k of keys) {
      progressFn && progressFn(`↓ ${k} 다운로드 중...`);
      try { results.push(await pullKey(k)); }
      catch (e) { results.push({ table: k, error: e.message }); }
    }
    progressFn && progressFn('↓ child_extras 다운로드 중...');
    try { results.push(await pullChildExtras()); }
    catch (e) { results.push({ table: 'child_extras', error: e.message }); }
    return results;
  }

  // 연결 테스트
  async function testConnection() {
    const client = await getClient();
    const { error } = await client.from('children').select('id').limit(1);
    return { ok: !error, error: error?.message };
  }

  window.Supa = {
    getClient,
    pushKey, pullKey,
    pushChildExtras, pullChildExtras,
    pushAll, pullAll,
    testConnection,
    KEYS: Object.keys(KEY_TABLE),
    URL: SUPABASE_URL,
  };
})();
