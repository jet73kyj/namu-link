// nl-live-alert.js — 학부모 결석 요청을 직원 화면에 실시간으로 띄운다 (2026-09-22)
//   쓰는 법: 로그인이 끝난 뒤  NLLive.start(sb, 직원번호, { onRead, onNew })
//     onRead  — 「확인했습니다」로 읽음 처리한 뒤 (🔔 숫자 다시 세기 등)
//     onNew   — 새 알림이 들어왔을 때 (결석 확인 화면 목록 다시 부르기 등)
//   받는 것: 알림 표(nl_alerts)의 「결석신청」 「요청취소」 가운데 자기 앞으로 온 것
//     (표 잠금 nl_alerts_read 가 자기 것만 내려준다)
//   실시간(Realtime)이 끊겨도 1분마다 한 번 다시 살핀다
(function () {
  const KINDS = ['결석신청', '요청취소'];
  let SB = null, ME = null, OPT = {}, START = null;
  let SHOWN = {}, QUEUE = [], TIMER = null, STARTED = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function css() {
    if (document.getElementById('nlLiveCss')) return;
    const st = document.createElement('style');
    st.id = 'nlLiveCss';
    st.textContent =
        '#nlLiveBg{position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;'
      + 'align-items:center;justify-content:center;z-index:99999;padding:16px;}'
      + '#nlLiveBox{background:#fff;border-radius:12px;width:420px;max-width:100%;'
      + 'max-height:80vh;display:flex;flex-direction:column;overflow:hidden;'
      + 'border:1px solid #ECE8E3;font-family:inherit;color:#2F2926;}'
      + '#nlLiveHd{background:#F8F1E8;border-bottom:2px solid #C9A27E;padding:12px 16px;'
      + 'display:flex;justify-content:space-between;align-items:center;gap:8px;}'
      + '#nlLiveTt{font-size:15px;font-weight:700;}'
      + '#nlLiveTm{font-size:12px;color:#7D7670;}'
      + '#nlLiveRows{padding:4px 16px;overflow:auto;}'
      + '.nlLiveRow{padding:10px 0;border-bottom:1px solid #ECE8E3;font-size:13.5px;line-height:1.5;}'
      + '.nlLiveRow:last-child{border-bottom:0;}'
      + '.nlLiveTag{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;'
      + 'border-radius:10px;margin-right:6px;background:#FDF3E6;color:#A9701C;}'
      + '.nlLiveTag.cx{background:#EEF1F4;color:#5A6B7B;}'
      + '#nlLiveBtns{padding:10px 16px 14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}'
      + '#nlLiveBtns button{width:auto;margin:0;padding:8px 14px;border-radius:8px;font-size:13.5px;'
      + 'border:1px solid #E4E0DA;background:#fff;color:#2F2926;cursor:pointer;font-family:inherit;}'
      + '#nlLiveBtns button.ok{background:#B07A4A;border-color:#B07A4A;color:#fff;font-weight:700;}';
    document.head.appendChild(st);
  }

  function box() {
    let bg = document.getElementById('nlLiveBg');
    if (bg) return bg;
    css();
    bg = document.createElement('div');
    bg.id = 'nlLiveBg';
    bg.innerHTML =
        '<div id="nlLiveBox">'
      + '<div id="nlLiveHd"><span id="nlLiveTt"></span><span id="nlLiveTm"></span></div>'
      + '<div id="nlLiveRows"></div>'
      + '<div id="nlLiveBtns">'
      + '<button id="nlLiveLater">나중에</button>'
      + '<button id="nlLiveOpen">결석 확인 화면 열기</button>'
      + '<button id="nlLiveOk" class="ok">확인했습니다</button>'
      + '</div></div>';
    document.body.appendChild(bg);
    // 결석 확인 화면이 아닌 곳에서만 「열기」 단추를 보인다
    if (/absence\.html/.test(location.pathname)) bg.querySelector('#nlLiveOpen').style.display = 'none';
    // 선생님(1~7번)은 결석 확인 화면을 쓰지 않는다
    if (ME >= 1 && ME <= 7) bg.querySelector('#nlLiveOpen').style.display = 'none';
    bg.querySelector('#nlLiveLater').onclick = () => { hide(); };
    bg.querySelector('#nlLiveOpen').onclick = () => {
      window.open('absence.html', '_blank');
    };
    bg.querySelector('#nlLiveOk').onclick = async () => {
      const ids = QUEUE.map(a => a.id);
      const b = bg.querySelector('#nlLiveOk');
      b.disabled = true;
      try {
        if (ids.length) {
          await SB.from('nl_alerts').update({ read_at: new Date().toISOString() }).in('id', ids);
        }
      } catch (e) { console.error('실시간 알림 읽음 처리 실패', e); }
      b.disabled = false;
      hide();
      if (typeof OPT.onRead === 'function') { try { await OPT.onRead(); } catch (e) {} }
    };
    return bg;
  }

  function hide() {
    const bg = document.getElementById('nlLiveBg');
    if (bg) bg.style.display = 'none';
    QUEUE = [];
  }

  function beep() {
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      const ac = new A();
      [0, 0.18].forEach(t => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ac.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.15);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.16);
      });
      setTimeout(() => { try { ac.close(); } catch (e) {} }, 800);
    } catch (e) {}
  }

  function draw() {
    if (!QUEUE.length) return;
    const bg = box();
    QUEUE.sort((a, b) => a.id - b.id);
    const nAbs = QUEUE.filter(a => a.kind === '결석신청').length;
    const nCx  = QUEUE.length - nAbs;
    bg.querySelector('#nlLiveTt').textContent =
      nAbs && nCx ? '새 결석 알림 ' + QUEUE.length + '건'
      : nAbs      ? '새 결석 요청 ' + nAbs + '건'
      :             '결석 요청 취소 ' + nCx + '건';
    const d = new Date();
    bg.querySelector('#nlLiveTm').textContent =
      '방금 들어옴 · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    bg.querySelector('#nlLiveRows').innerHTML = QUEUE.map(a =>
      '<div class="nlLiveRow"><span class="nlLiveTag' + (a.kind === '요청취소' ? ' cx' : '') + '">'
      + esc(a.kind) + '</span>' + esc(a.body) + '</div>').join('');
    bg.style.display = 'flex';
    beep();
  }

  // 몇 초 안에 여러 건이 들어오면 (묶음 요청 등) 한 창에 모은다
  function push(a) {
    if (!a || !a.id || SHOWN[a.id]) return;
    if (KINDS.indexOf(a.kind) < 0) return;
    if (a.read_at) return;
    if (a.to_therapist_id != null && Number(a.to_therapist_id) !== ME) return;
    SHOWN[a.id] = 1;
    QUEUE.push(a);
    clearTimeout(TIMER);
    TIMER = setTimeout(() => {
      draw();
      if (typeof OPT.onNew === 'function') { try { OPT.onNew(); } catch (e) {} }
    }, 1500);
  }

  // 실시간이 끊겼을 때를 위해 1분마다 한 번 살핀다
  async function poll() {
    try {
      const { data, error } = await SB.from('nl_alerts')
        .select('id, kind, body, created_at, to_therapist_id, read_at')
        .is('read_at', null)
        .in('kind', KINDS)
        .gt('created_at', START)
        .order('id', { ascending: true })
        .limit(50);
      if (error) return;
      (data || []).forEach(push);
    } catch (e) {}
  }

  async function start(client, staffId, opt) {
    if (STARTED) return;
    if (!client || !staffId) return;
    STARTED = true;
    SB = client; ME = Number(staffId); OPT = opt || {};
    // 화면을 연 때부터 들어온 것만 띄운다 (그 전 것은 홈·시간표가 열 때 이미 보여 준다)
    START = new Date().toISOString();
    try {
      const { data } = await SB.auth.getSession();
      const tok = data && data.session && data.session.access_token;
      if (tok && SB.realtime && SB.realtime.setAuth) SB.realtime.setAuth(tok);
    } catch (e) {}
    try {
      SB.channel('nl-live-' + ME)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'nl_alerts', filter: 'to_therapist_id=eq.' + ME },
            p => push(p && p.new))
        .subscribe();
    } catch (e) { console.error('실시간 연결 실패', e); }
    setInterval(poll, 60000);
  }

  window.NLLive = { start };
})();
