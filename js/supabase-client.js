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

  const KEY_TABLE = {
    'children':             { table: 'children',            pickCols: (r) => ({ id: r.id, name: r.name, birth: r.birth, manager_id: r.managerId||null, phase: r.phase||'active', status: r.status||'치료중' }) },
    'therapists':           { table: 'therapists',          pickCols: (r) => ({ id: r.id, name: r.name }) },
    'payments':             { table: 'payments',            pickCols: (r) => ({ id: r.id, child_id: r.childId||r.child_id||null, child_name: r.childName||r.child_name||null, year: r.year||null, month: r.month||null, paid: !!r.paid }) },
    'records':              { table: 'records',             pickCols: (r) => ({ id: r.id || `rec_${r.childId||r.child_id||''}_${r.year||''}_${r.month||''}_${r.category||''}`, child_id: r.childId||r.child_id||null, year: r.year||null, month: r.month||null, category: r.category||null }) },
    'voucher_data':         { table: 'voucher_data',        pickCols: (r) => ({ child_name: r.childName||null, birth: r.birth||null, appr_date: r.apprDate||null }), idKey: false },
    'intake_list':          { table: 'intake_list',         pickCols: (r) => ({ id: r.id, name: r.name }) },
    'assessment_tokens':    { table: 'assessment_tokens',   pickCols: (r) => ({ id: r.id, token: r.token, child_id: r.child_id||null, age_group: r.age_group||null, is_used: !!r.is_used, expires_at: r.expires_at||null }) },
    'initial_assessments':  { table: 'initial_assessments', pickCols: (r) => ({ id: r.id, child_id: r.child_id||null, token_id: r.token_id||null, age_group: r.age_group||null, submitted_at: r.submitted_at||null }) },
  };

  async function getClient() {
    const sb = await loadSdk();
    return sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // localStorage 의 특정 key 를 Supabase 로 업로드 (배열 → 각 row 로 upsert)
  async function pushKey(key) {
    const cfg = KEY_TABLE[key];
    if (!cfg) throw new Error('알 수 없는 키: ' + key);
    const client = await getClient();
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(raw) || !raw.length) return { table: cfg.table, count: 0 };
    const rows = raw.map(r => ({ ...cfg.pickCols(r), data: r, updated_at: new Date().toISOString() }));
    // 배치 upsert (500건씩)
    let count = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i+500);
      const { error } = await client.from(cfg.table).upsert(chunk, { onConflict: cfg.idKey === false ? undefined : 'id' });
      if (error) throw new Error(`${cfg.table}: ${error.message}`);
      count += chunk.length;
    }
    return { table: cfg.table, count };
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
      rows.push({ child_id: childId, kind, data: value, updated_at: new Date().toISOString() });
    });
    if (!rows.length) return { table: 'child_extras', count: 0 };
    const { error } = await client.from('child_extras').upsert(rows, { onConflict: 'child_id,kind' });
    if (error) throw new Error('child_extras: ' + error.message);
    return { table: 'child_extras', count: rows.length };
  }

  async function pullChildExtras() {
    const client = await getClient();
    const { data, error } = await client.from('child_extras').select('child_id, kind, data');
    if (error) throw new Error('child_extras: ' + error.message);
    let count = 0;
    (data||[]).forEach(row => {
      const key = `child_${row.kind}_${row.child_id}`;
      localStorage.setItem(key, JSON.stringify(row.data));
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
