// 나무링크 치료사 인증 유틸
// - SHA-256 해시 (Web Crypto API)
// - 첫 로그인: initPassword(평문) 비교 후 해시 저장 유도
// - 이후 로그인: passwordHash 비교

(function() {
  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(String(text||''));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // 치료사 비밀번호 검증
  // - passwordHash 있으면 해시 비교
  // - 없으면 initPassword (평문) 비교 → mustChangePassword 유지
  async function verifyTherapistPassword(t, plainPw) {
    if (!t) return false;
    if (t.passwordHash) {
      const h = await sha256Hex(plainPw);
      return h === t.passwordHash;
    }
    if (t.initPassword) {
      return String(plainPw) === String(t.initPassword);
    }
    return false;
  }

  // 비밀번호 변경 (현재 비번 검증 + 새 비번 해시 저장)
  async function changeTherapistPassword(therapistId, currentPw, newPw) {
    if (!newPw || newPw.length < 4) throw new Error('새 비밀번호는 4자 이상이어야 합니다.');
    const arr = JSON.parse(localStorage.getItem('therapists')||'[]');
    const t = arr.find(x => x.id === therapistId);
    if (!t) throw new Error('치료사를 찾을 수 없습니다.');

    // 현재 비번 확인 (첫 변경이면 initPassword, 이후면 passwordHash)
    const ok = await verifyTherapistPassword(t, currentPw);
    if (!ok) throw new Error('현재 비밀번호가 일치하지 않습니다.');

    t.passwordHash = await sha256Hex(newPw);
    t.mustChangePassword = false;
    t.initPassword = null;                // 평문 초기 비번 폐기
    t.passwordChangedAt = new Date().toISOString();

    localStorage.setItem('therapists', JSON.stringify(arr));
    try { if (window.Supa) await window.Supa.pushKey('therapists'); } catch(e) { console.warn('Supabase push 실패', e); }
    return true;
  }

  window.NamuAuth = { sha256Hex, verifyTherapistPassword, changeTherapistPassword };
})();
