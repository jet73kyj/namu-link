/* 나무링크 — 로그인 보관 방식
 *
 * 기본은 「탭 안에서만」 유지한다. 탭을 닫으면 로그인이 끊긴다.
 * 공용 PC(치료사·행정)에 로그인이 남지 않게 하기 위함이다.
 *
 * 다만 대표(8번)는 브라우저에 남긴다.
 * 화면 파일을 자주 바꾸시는데, 그때마다 탭을 닫고 다시 로그인하시는 것이
 * 너무 번거롭기 때문이다.
 *
 * 쓰는 법 — 화면 파일에서
 *   1) <script src="nl-login.js"></script> 를 supabase-js 다음에 넣는다
 *   2) createClient 의 storage 를 window.sessionStorage → nlStore 로 바꾼다
 *   3) 로그인해서 누구인지 알아낸 뒤 nlKeep(me.id) 를 부른다
 *   4) 로그아웃할 때 nlKeepOff() 를 부른다
 */
(function (w) {
  var KEEP = 'nl_keep_login';      // '1' 이면 브라우저에 남긴다
  var BOSS = 8;                    // 대표(은정님) 번호

  function on() {
    try { return w.localStorage.getItem(KEEP) === '1'; } catch (e) { return false; }
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
    if (Number(id) !== BOSS) { w.nlKeepOff(); return; }
    try {
      w.localStorage.setItem(KEEP, '1');
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
      var kill = [];
      for (var i = 0; i < w.localStorage.length; i++) {
        var k = w.localStorage.key(i);
        if (k && k.indexOf('sb-') === 0) kill.push(k);
      }
      kill.forEach(function (k) { w.localStorage.removeItem(k); });
    } catch (e) {}
  };
})(window);
