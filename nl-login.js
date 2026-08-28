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

  // 로그인해서 누구인지 알아낸 뒤 부른다
  w.nlKeep = function (id) {
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
