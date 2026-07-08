// 나무링크 실시간 동기화 모듈
//
// 사용법: 페이지에서 이 스크립트 로드하기 전에 supabase-client.js 를 먼저 로드하고,
// 아래처럼 페이지별로 동기화할 localStorage 키를 지정한다.
//
//   <script src="js/supabase-client.js"></script>
//   <script>window._supaLiveKeys = ['children','payments'];
//           window._supaLiveOnLoad = () => renderList();</script>
//   <script src="js/supabase-live.js"></script>
//
// 동작:
//  1) 페이지 로드 직후 지정 키를 Supabase 에서 pull → localStorage 에 저장
//  2) 완료되면 window._supaLiveOnLoad() 호출 (있으면) → UI 재렌더
//  3) localStorage.setItem 을 후킹해서 지정 키에 대한 쓰기를 감지하면
//     500ms 디바운스 후 백그라운드로 Supabase 에 push (upsert)
//  4) 우측 하단에 상태 뱃지 표시 (연결·로드·저장·오류)

(async function() {
  if (!window.Supa) {
    console.warn('supabase-live: window.Supa 미로드');
    return;
  }
  const KEYS = window._supaLiveKeys || ['children'];
  const onLoad = window._supaLiveOnLoad;

  // 상태 뱃지
  const badge = document.createElement('div');
  badge.id = '_supaBadge';
  badge.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:bold;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.2);color:white;font-family:sans-serif;transition:background 0.3s;cursor:default;user-select:none;';
  document.body && document.body.appendChild(badge);
  const setStatus = (text, color, title='') => {
    badge.textContent = text;
    badge.style.background = color;
    badge.title = title || text;
  };

  // 1) 초기 pull
  setStatus('☁️ 로드 중...', '#1565c0');
  // 테이블 없음 오류는 실패로 간주하지 않음 (스키마 재실행 안 된 경우 대비)
  const isMissingTable = (msg) => /does not exist|relation .* does not exist|schema cache|not found|PGRST205/i.test(String(msg||''));
  const loadErrs = [];
  const skipped = [];
  for (const k of KEYS) {
    try { await Supa.pullKey(k); }
    catch (e) {
      if (isMissingTable(e.message)) {
        skipped.push(k);
        console.warn(`[supabase-live] ${k} 테이블 없음 - 스킵 (schema.sql 미실행)`);
      } else {
        loadErrs.push(`${k}: ${e.message}`);
        console.error('[supabase-live] pullKey failed', k, e);
      }
    }
  }
  // child_extras 도 함께
  try { await Supa.pullChildExtras(); } catch(e) {
    if (isMissingTable(e.message)) { skipped.push('child_extras'); console.warn('[supabase-live] child_extras 테이블 없음 - 스킵'); }
    else console.warn('[supabase-live] pullChildExtras failed', e);
  }

  window._supaLoadErrs = loadErrs;
  window._supaSkipped = skipped;

  if (loadErrs.length) {
    const detail = loadErrs.join('\n') + (skipped.length ? '\n\n[스킵된 테이블 (미생성)]\n' + skipped.join(', ') : '');
    setStatus(`⚠️ 부분 실패 (${loadErrs.length})`, '#e65100', detail);
  } else if (skipped.length) {
    setStatus(`⚠️ 미생성 ${skipped.length}개`, '#f57c00', `Supabase 에 아직 없는 테이블:\n${skipped.join(', ')}\n\nsupabase/schema.sql 을 SQL Editor 에서 실행하세요.`);
  } else {
    setStatus('☁️ 동기화됨', '#2e7d32', `Supabase 최신 상태 (${new Date().toLocaleTimeString('ko-KR')})`);
  }
  // 뱃지 클릭 시 상세 오류 alert 로 표시
  badge.addEventListener('click', (ev) => {
    if (ev.detail === 2) return; // 더블클릭은 별도 핸들러
    if (loadErrs.length || skipped.length) {
      alert(
        (loadErrs.length ? `❌ 실패 (${loadErrs.length}):\n${loadErrs.join('\n')}\n\n` : '') +
        (skipped.length ? `⚠️ 미생성 테이블 (${skipped.length}):\n${skipped.join(', ')}\n\n→ Supabase SQL Editor 에서 schema.sql 재실행 필요` : '')
      );
    }
  });

  // 초기 로드 완료 콜백
  if (typeof onLoad === 'function') {
    try { onLoad(); } catch(e) { console.error('_supaLiveOnLoad failed', e); }
  }

  // 2) setItem 후킹 — 지정 키 쓰기 시 push (디바운스)
  const pending = new Map();  // key → timer
  const origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k, v) {
    origSet(k, v);
    // 아동별 확장 데이터
    if (k.startsWith('child_docs_') || k.startsWith('child_timeline_') || k.startsWith('child_parent_memos_')) {
      schedulePush('__extras__', async () => { await Supa.pushChildExtras(); });
      return;
    }
    if (!KEYS.includes(k)) return;
    schedulePush(k, async () => { await Supa.pushKey(k); });
  };
  function schedulePush(key, fn) {
    if (pending.has(key)) clearTimeout(pending.get(key));
    setStatus('☁️ 저장 중...', '#1565c0');
    const t = setTimeout(async () => {
      pending.delete(key);
      try {
        await fn();
        if (!pending.size) setStatus('☁️ 저장됨', '#2e7d32', `마지막 저장: ${new Date().toLocaleTimeString('ko-KR')}`);
      } catch (e) {
        setStatus('⚠️ 저장 실패', '#c62828', e.message);
        console.error('push failed', key, e);
      }
    }, 500);
    pending.set(key, t);
  }

  // 3) 다른 탭·기기에서 변경된 최신 데이터 받아오기 (수동)
  badge.addEventListener('dblclick', async () => {
    setStatus('☁️ 새로고침 중...', '#1565c0');
    for (const k of KEYS) { try { await Supa.pullKey(k); } catch(e) {} }
    try { await Supa.pullChildExtras(); } catch(e) {}
    setStatus('☁️ 갱신 완료', '#2e7d32');
    if (typeof onLoad === 'function') onLoad();
  });
  badge.title += ' · 더블클릭: 서버에서 최신 데이터 다시 받기';
})();
