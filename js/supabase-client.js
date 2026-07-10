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
    'staff':                { table: 'staff',                idKey: 'id' },
    'payments':             { table: 'payments',             idKey: 'id' },
    'records':              { table: 'records',              idKey: 'id',
                              genId: (r) => r.id || `rec_${r.childId||r.child_id||''}_${r.year||''}_${r.month||''}_${r.category||''}` },
    // 센터비용 납부 — key 필드가 자연키 (childId__tIdx__year__month)
    'centerPayments':       { table: 'center_payments',      idKey: 'key',
                              genId: (r) => r.key || (r.childId && r.year && r.month != null && r.tIdx != null
                                ? `${r.childId}__${r.tIdx}__${r.year}__${r.month}` : null) },
    // 환불 내역 — id 는 Date.now() 로 이미 생성됨
    'refunds':              { table: 'refunds',              idKey: 'id',
                              genId: (r) => r.id || `refund_${r.childId||''}_${r.date||''}_${r.amount||''}` },
    'voucher_data':         { table: 'voucher_data',         idKey: false },   // bigserial 자동 채번
    'intake_list':          { table: 'intake_list',          idKey: 'id' },
    'assessment_tokens':    { table: 'assessment_tokens',    idKey: 'id' },
    'initial_assessments':  { table: 'initial_assessments',  idKey: 'id' },
    'assessment_events':    { table: 'assessment_events',    idKey: 'id' },
    'notices':              { table: 'notices',              idKey: 'id' },
    'forms':                { table: 'forms',                idKey: 'id' },
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

  // 싱글톤 — GoTrueClient 중복 인스턴스 경고 방지
  let _clientInstance = null;
  async function getClient() {
    if (_clientInstance) return _clientInstance;
    const sb = await loadSdk();
    _clientInstance = sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _clientInstance;
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

  // 특정 월의 payments 만 Supabase 에서 조회 (인덱스 활용)
  // 실패 시 localStorage 에서 filter 로 fallback
  async function fetchPaymentsByMonth(monthKey) {
    try {
      const client = await getClient();
      const { data, error } = await client
        .from('payments')
        .select('data')
        .eq('data->>monthKey', monthKey);
      if (error) throw error;
      return (data||[]).map(r => r.data);
    } catch (e) {
      console.warn('[fetchPaymentsByMonth] Supabase 실패 → localStorage fallback:', e.message);
      const all = JSON.parse(localStorage.getItem('payments')||'[]');
      return all.filter(p => p.monthKey === monthKey);
    }
  }

  // Supabase 에서 특정 key 데이터 전체 로드 → localStorage 에 저장
  // ⚠️ 안전장치: 원격 = 빈 배열 && 로컬 = 비어있지 않음 → 덮어쓰기 스킵 (데이터 유실 방지)
  //   신규 테이블 최초 로드 시 로컬 데이터가 지워지는 사고를 막고,
  //   이후 setItem 후킹 시 pushKey 가 로컬 데이터를 원격으로 밀어올림.
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
    if (all.length === 0) {
      const localRaw = localStorage.getItem(key);
      if (localRaw && localRaw !== '[]' && localRaw !== 'null') {
        console.warn(`[pullKey] ${cfg.table}: 원격이 비어있어 로컬 보존 (${(JSON.parse(localRaw)||[]).length}건). 다음 저장 시 원격에 push 됩니다.`);
        // 로컬 데이터를 강제로 push (다음 setItem 없이도 원격 동기화)
        try { await pushKey(key); } catch(e) { console.warn(`[pullKey→pushKey] ${key} push 실패:`, e.message); }
        return { table: cfg.table, count: 0, preservedLocal: true };
      }
    }

    // ⭐ payments 는 로컬의 완납 상태를 보존하며 병합 (사용자 저장 유실 방지)
    // 시나리오: 사용자가 결제 완납 처리 → 로컬 저장 → push 진행 중에 다른 렌더가 pull 실행 →
    //          옛 서버 데이터로 로컬 덮어씀 → 저장한 완납 상태 사라짐
    // 해결: 원격 데이터를 로컬에 반영할 때, 로컬에 이미 완납 상태인 record 는 그 상태 유지
    if (key === 'payments') {
      const localArr = JSON.parse(localStorage.getItem(key) || '[]');
      const localPaidMap = new Map();
      localArr.forEach(p => {
        if (p && p.id && (p.basePaid || p.extraPaid || p.paidDate)) {
          localPaidMap.set(p.id, p);
        }
      });
      // 원격 record 순회 → 로컬에 완납 상태 있으면 완납 필드 병합
      all = all.map(remote => {
        if (!remote || !remote.id) return remote;
        const localPaid = localPaidMap.get(remote.id);
        if (!localPaid) return remote;
        return {
          ...remote,
          basePaid: localPaid.basePaid || remote.basePaid,
          extraPaid: localPaid.extraPaid || remote.extraPaid,
          paidDate: localPaid.paidDate || remote.paidDate,
          baseDepositDate: localPaid.baseDepositDate || remote.baseDepositDate,
          extraDepositDate: localPaid.extraDepositDate || remote.extraDepositDate,
          baseDepositorName: localPaid.baseDepositorName || remote.baseDepositorName,
          payMethod: localPaid.payMethod || remote.payMethod,
          payMemo: localPaid.payMemo || remote.payMemo,
          cardApproval: localPaid.cardApproval || remote.cardApproval,
          status: localPaid.status === 'paid' ? 'paid' : (remote.status||localPaid.status),
        };
      });
      // 로컬에만 있는 완납 record (원격에 없음) 는 push 대기 상태 → 로컬에서 유지
      const remoteIds = new Set(all.map(p => p?.id).filter(Boolean));
      let addedLocal = 0;
      localArr.forEach(local => {
        if (local && local.id && !remoteIds.has(local.id) && (local.basePaid || local.extraPaid || local.paidDate)) {
          all.push(local);
          addedLocal++;
        }
      });
      if (addedLocal > 0) console.log(`[pullKey merge] payments: 로컬 완납 record ${addedLocal}건 보존`);
    }

    localStorage.setItem(key, JSON.stringify(all));
    return { table: cfg.table, count: all.length };
  }

  // Supabase 에서 특정 테이블의 row 를 id 로 명시적 삭제
  // 로컬에서 지운 레코드가 pull 시 부활하지 않도록 필수
  async function deleteKey(key, ids) {
    if (!ids || !ids.length) return { table: key, count: 0 };
    const cfg = KEY_TABLE[key];
    if (!cfg) throw new Error('알 수 없는 키: ' + key);
    const client = await getClient();
    // 500개씩 배치
    let count = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i+500).map(String);
      const { error } = await client.from(cfg.table).delete().in('id', chunk);
      if (error) throw new Error(`${cfg.table} delete: ${error.message}`);
      count += chunk.length;
    }
    return { table: cfg.table, count };
  }

  // 아동별 확장 데이터 (child_docs_*, child_timeline_*, child_parent_memos_*) 처리
  // 새 스키마: id = "{childId}::{kind}", data = { child_id, kind, value }
  async function pushChildExtras() {
    const client = await getClient();
    const rows = [];
    Object.keys(localStorage).forEach(k => {
      let kind = null;
      let childId = null;
      let subKey = '';   // 같은 아동/카테고리 안에서 여러 레코드 구분자 (예: year-month, category)
      if (k.startsWith('child_docs_'))              { kind = 'docs';         childId = k.replace(/^child_docs_/, ''); }
      else if (k.startsWith('child_timeline_'))     { kind = 'timeline';     childId = k.replace(/^child_timeline_/, ''); }
      else if (k.startsWith('child_parent_memos_')) { kind = 'parent_memos'; childId = k.replace(/^child_parent_memos_/, ''); }
      else if (k.startsWith('record_develop_')) {
        // record_develop_{childId}_{YYYY}_{MM}
        const m = k.match(/^record_develop_(.+)_(\d{4})_(\d{2})$/);
        if (m) { kind = 'record_develop'; childId = m[1]; subKey = `${m[2]}-${m[3]}`; }
      }
      else if (k.startsWith('record_form_')) {
        // record_form_{childId}_{YYYY}_{MM}_{category}
        const m = k.match(/^record_form_(.+?)_(\d{4})_(\d{2})_(.+)$/);
        if (m) { kind = 'record_form'; childId = m[1]; subKey = `${m[2]}-${m[3]}::${m[4]}`; }
      }
      if (!kind || !childId) return;
      let value;
      try { value = JSON.parse(localStorage.getItem(k)||'null'); } catch(e) { return; }
      const id = subKey ? `${childId}::${kind}::${subKey}` : `${childId}::${kind}`;
      rows.push({
        id,
        data: { child_id: childId, kind, sub_key: subKey || null, ls_key: k, value },
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
      // 저장 시 사용한 원본 localStorage 키가 있으면 그대로 사용, 없으면 구식 매핑
      let key = d.ls_key || null;
      if (!key) {
        if (d.kind === 'docs' || d.kind === 'timeline' || d.kind === 'parent_memos') {
          key = `child_${d.kind}_${d.child_id}`;
        } else if (d.kind === 'record_develop' && d.sub_key) {
          const [ym] = d.sub_key.split('::');
          if (/^\d{4}-\d{2}$/.test(ym||'')) key = `record_develop_${d.child_id}_${ym.slice(0,4)}_${ym.slice(5,7)}`;
        } else if (d.kind === 'record_form' && d.sub_key) {
          const [ym, cat] = d.sub_key.split('::');
          if (/^\d{4}-\d{2}$/.test(ym||'') && cat) key = `record_form_${d.child_id}_${ym.slice(0,4)}_${ym.slice(5,7)}_${cat}`;
        }
      }
      if (!key) return;
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
    pushKey, pullKey, deleteKey,
    fetchPaymentsByMonth,
    pushChildExtras, pullChildExtras,
    pushAll, pullAll,
    testConnection,
    KEYS: Object.keys(KEY_TABLE),
    URL: SUPABASE_URL,
  };
})();
