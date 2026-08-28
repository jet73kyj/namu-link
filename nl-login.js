/* 나무링크 — 로그인 보관 방식
 *
 * 기본은 「탭 안에서만」 유지한다. 탭을 닫으면 로그인이 끊긴다.
 * 센터 공용 컴퓨터에 로그인이 남지 않게 하기 위함이다.
 *
 * 다만 아래 두 경우는 브라우저에 남긴다.
 *   1) 대표(8번) — 화면 파일을 자주 바꾸시는데 그때마다 다시 로그인하기 번거롭다
 *   2) 휴대폰·태블릿에서 연 경우 — 개인 기기로 보고 30일 동안 유지한다
 *      바탕화면 아이콘으로 여실 때 매번 번호를 치지 않으셔도 된다
 *
 * 30일이 지나면 한 번 다시 로그인해야 한다.
 * 휴대폰을 잃어버렸을 때는 관리자가 그 계정 비밀번호를 바꾸면 끊긴다.
 *
 * 쓰는 법 — 화면 파일에서
 *   1) <script src="nl-login.js"></script> 를 supabase-js 다음에 넣는다
 *   2) createClient 의 storage 를 window.sessionStorage → nlStore 로 바꾼다
 *   3) 로그인해서 누구인지 알아낸 뒤 nlKeep(me.id) 를 부른다
 *   4) 로그아웃할 때 nlKeepOff() 를 부른다
 */
(function (w) {
  var KEEP = 'nl_keep_login';      // '1' 이면 브라우저에 남긴다
  var TILL = 'nl_keep_until';      // 언제까지 남길지 (밀리초)
  var BOSS = 8;                    // 대표(은정님) 번호
  var DAYS = 30;                   // 휴대폰에서 로그인을 유지하는 날 수

  // 휴대폰·태블릿인가
  //   화면 너비와 손가락으로 만지는 기기인지를 함께 본다
  w.nlIsMobile = function () {
    try {
      var ua = String(w.navigator.userAgent || '');
      var touch = ('ontouchstart' in w) || (w.navigator.maxTouchPoints > 0);
      var small = Math.min(w.screen.width, w.screen.height) <= 1024;
      var phone = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
      return phone && touch && small;
    } catch (e) { return false; }
  };

  function on() {
    try {
      if (w.localStorage.getItem(KEEP) !== '1') return false;
      // 기한이 지났으면 끊는다
      var till = Number(w.localStorage.getItem(TILL) || 0);
      if (till && Date.now() > till) { w.nlKeepOff(); return false; }
      return true;
    } catch (e) { return false; }
  }

  // supabase 가 쓸 보관함
  w.nlStore = {
    getItem: function (k) {
      if (on()) {
        try { var v = w.localStorage.getItem(k); if (v != null) return v; } catch (e) {}
      }
      try { return w.sessionStorage.getItem(k); } catch (e) { return null; }
    },
    setItem: function (k, v) {
      try { w.sessionStorage.setItem(k, v); } catch (e) {}
      if (on()) { try { w.localStorage.setItem(k, v); } catch (e) {} }
    },
    removeItem: function (k) {
      try { w.sessionStorage.removeItem(k); } catch (e) {}
      try { w.localStorage.removeItem(k); } catch (e) {}
    }
  };

  // 센터 컴퓨터에서만 쓸 수 있는 직원 번호
  //   행정(9번) 화면에는 납부·보호자 연락처가 다 있어
  //   휴대폰에서도, 열쇠가 없는 컴퓨터에서도 열리지 않게 한다
  var PC_ONLY = [9];
  var PCKEY   = 'nl_office_pc';    // 이 컴퓨터가 센터 컴퓨터라는 표시

  // 이 컴퓨터에 열쇠가 심어져 있는가
  w.nlHasPcKey = function () {
    try { return w.localStorage.getItem(PCKEY) === '1'; } catch (e) { return false; }
  };
  // 열쇠 심기 / 빼기 (관리자가 그 컴퓨터에서 한 번만 한다)
  w.nlSetPcKey = function (on) {
    try {
      if (on) w.localStorage.setItem(PCKEY, '1');
      else    w.localStorage.removeItem(PCKEY);
    } catch (e) {}
  };

  // 센터 컴퓨터가 아니면 화면을 막고 로그인을 끊는다
  //   ① 휴대폰·태블릿이거나  ② 열쇠가 안 심어진 컴퓨터
  function blockIfMobile(id) {
    if (PC_ONLY.indexOf(Number(id)) < 0) return false;
    if (!w.nlIsMobile() && w.nlHasPcKey()) return false;
    w.nlKeepOff();
    try {
      for (var i = w.sessionStorage.length - 1; i >= 0; i--) {
        var k = w.sessionStorage.key(i);
        if (k && k.indexOf('sb-') === 0) w.sessionStorage.removeItem(k);
      }
    } catch (e) {}
    try {
      document.body.innerHTML =
        '<div style="max-width:420px;margin:60px auto;padding:28px;'
        + 'background:#fff;border:1px solid #e8ebe4;border-radius:14px;'
        + 'font-family:-apple-system,\'Malgun Gothic\',sans-serif;'
        + 'color:#1c1f1a;line-height:1.8;text-align:center;">'
        + '<div style="font-size:36px;margin-bottom:12px;">🌿</div>'
        + '<div style="font-size:17px;font-weight:600;margin-bottom:14px;">'
        + '센터 컴퓨터에서 이용해 주세요</div>'
        + '<div style="font-size:14px;color:#5a6156;">'
        + '이 화면에는 아동과 보호자의 개인정보가 담겨 있어<br>'
        + '센터 컴퓨터에서만 열 수 있습니다.<br><br>'
        + '휴대폰이나 집 컴퓨터에서는 열리지 않습니다.<br>'
        + '센터 컴퓨터에서 로그인해 주세요.</div>'
        + '</div>';
    } catch (e) {}
    return true;
  }

  // 로그인해서 누구인지 알아낸 뒤 부른다
  w.nlKeep = function (id) {
    if (blockIfMobile(id)) return;
    var keep = (Number(id) === BOSS) || w.nlIsMobile();
    if (!keep) { w.nlKeepOff(); return; }
    try {
      w.localStorage.setItem(KEEP, '1');
      // 대표는 기한 없이, 휴대폰은 30일
      if (Number(id) === BOSS) w.localStorage.removeItem(TILL);
      else w.localStorage.setItem(TILL,
             String(Date.now() + DAYS * 24 * 60 * 60 * 1000));
      // 이미 탭에 담긴 로그인 정보를 브라우저 쪽으로 옮겨 둔다
      for (var i = 0; i < w.sessionStorage.length; i++) {
        var k = w.sessionStorage.key(i);
        if (k && k.indexOf('sb-') === 0) {
          w.localStorage.setItem(k, w.sessionStorage.getItem(k));
        }
      }
    } catch (e) {}
  };

  // 로그아웃할 때 부른다
  w.nlKeepOff = function () {
    try {
      w.localStorage.removeItem(KEEP);
      w.localStorage.removeItem(TILL);
      var kill = [];
      for (var i = 0; i < w.localStorage.length; i++) {
        var k = w.localStorage.key(i);
        if (k && k.indexOf('sb-') === 0) kill.push(k);
      }
      kill.forEach(function (k) { w.localStorage.removeItem(k); });
    } catch (e) {}
  };
})(window);
