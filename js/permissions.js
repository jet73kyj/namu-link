// 나무링크 권한 헬퍼
// - IS_ADMIN: 관리자 계정
// - IS_STAFF: 관리자 + 행정 (편집 권한)
// - IS_THERAPIST: 치료사 (본인 담당 아동/기록만)
// - CURRENT_THERAPIST_NAME: 로그인한 치료사 이름 (권한 필터링 기준)

(function() {
  const role = localStorage.getItem('currentUserRole') || '';
  const user = localStorage.getItem('currentUser') || '';
  const therapistId = localStorage.getItem('currentTherapistId') || '';

  const IS_ADMIN = (role === 'admin') || (user === '관리자');
  const IS_STAFF_ROLE = (role === 'staff'); // 순수 행정직원 (관리자 제외)
  const IS_STAFF = IS_ADMIN || IS_STAFF_ROLE; // 편집 권한 (admin+staff)
  const IS_THERAPIST = (role === 'therapist');
  const IS_GUARDIAN = (role === 'guardian');
  // 쓰기 권한 (신규·수정) — admin·staff
  const CAN_WRITE = IS_ADMIN || IS_STAFF_ROLE;
  // 삭제 권한 — admin 만
  const CAN_DELETE = IS_ADMIN;

  // 치료사 로그인 시 본인 이름 (children.therapies 매칭 기준)
  let currentTherapistName = '';
  if (IS_THERAPIST && therapistId) {
    try {
      const arr = JSON.parse(localStorage.getItem('therapists')||'[]');
      const t = arr.find(x => x.id === therapistId);
      if (t) currentTherapistName = t.name || '';
    } catch(e) {}
  }

  // 아동이 본 치료사의 담당인지 확인
  // - IS_ADMIN/IS_STAFF: 항상 true (전체 열람)
  // - IS_THERAPIST: therapies[] 중 하나라도 therapist=본인 이름이면 true
  function isChildVisible(child) {
    if (!child) return false;
    if (IS_ADMIN || IS_STAFF) return true;
    if (IS_THERAPIST) {
      if (!currentTherapistName) return false;
      const ths = child.therapies || [];
      return ths.some(t => (t.therapist||'').trim() === currentTherapistName);
    }
    return false;
  }

  // 치료 기록 · 스케줄 등에서 childId 로 필터
  function isChildIdVisible(childId) {
    if (IS_ADMIN || IS_STAFF) return true;
    const arr = JSON.parse(localStorage.getItem('children')||'[]');
    const c = arr.find(x => x.id === childId);
    return isChildVisible(c);
  }

  window.NamuPerm = {
    IS_ADMIN, IS_STAFF, IS_STAFF_ROLE, IS_THERAPIST, IS_GUARDIAN,
    CAN_WRITE, CAN_DELETE,
    role, user, therapistId, currentTherapistName,
    isChildVisible, isChildIdVisible,
  };

  // 역할별 body 클래스 → CSS 로 UI 노출 제어
  function applyBodyClass() {
    if (!document.body) return;
    if (IS_ADMIN) document.body.classList.add('role-admin');
    if (IS_STAFF_ROLE) document.body.classList.add('role-staff');
    if (IS_THERAPIST) document.body.classList.add('role-therapist');
    if (!CAN_DELETE) document.body.classList.add('no-delete');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBodyClass);
  } else {
    applyBodyClass();
  }
})();
