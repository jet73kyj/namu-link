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
    // 아동별 확장 데이터 (문서·타임라인·학부모메모·발달재활 결과보고서·치료기록지)
    if (k.startsWith('child_docs_') || k.startsWith('child_timeline_') || k.startsWith('child_parent_memos_')
        || k.startsWith('record_develop_') || k.startsWith('record_form_')) {
      schedulePush('__extras__', async () => { await Supa.pushChildExtras(); });
      return;
    }
    if (!KEYS.includes(k)) return;
    schedulePush(k, async () => { await Supa.pushKey(k); });
  };
  // [N단계] 즉시 push + 재시도 3회 (500ms 디바운스 제거)
  // pending 은 key → fn(재시도용). 진행중 push 는 pendingFns 로 추적
  const pendingFns = new Map();
  async function pushWithRetry(key, fn) {
    for (let i = 0; i < 3; i++) {
      try {
        await fn();
        return;
      } catch (e) {
        if (i === 2) throw e;
        await new Promise(r => setTimeout(r, 800 * (i+1)));   // 800·1600ms 대기
      }
    }
  }
  function schedulePush(key, fn) {
    // 진행중이든 아니든 새 요청 도착 시 최신 데이터로 재시작
    pending.set(key, fn);
    pendingFns.set(key, fn);
    setStatus('☁️ 저장 중...', '#1565c0');
    (async () => {
      try {
        await pushWithRetry(key, fn);
        pendingFns.delete(key);
        pending.delete(key);
        if (!pendingFns.size) setStatus('☁️ 저장됨', '#2e7d32', `마지막 저장: ${new Date().toLocaleTimeString('ko-KR')}`);
      } catch (e) {
        setStatus('⚠️ 저장 실패 (재시도 3회 실패)', '#c62828', e.message);
        console.error('push failed after retries', key, e);
      }
    })();
  }

  // [beforeunload 안전망] 페이지 종료 시 pending push 를 마지막으로 시도
  // - 대부분 push 는 이미 완료. 미완료된 것만 강제 실행
  window.addEventListener('beforeunload', () => {
    if (!pendingFns.size) return;
    // sendBeacon 은 REST API 인증 헤더 자유롭지 못하므로 sync XHR 대신 fire-and-forget async 만 시도
    // (일부 브라우저는 unload 중 network 요청 취소 · 성공 보장은 못하지만 확률은 높임)
    pendingFns.forEach((fn) => { try { fn(); } catch(e) {} });
  });

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
