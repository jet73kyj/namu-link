// =====================================================================
// nl-trials.js — 체험 수업 칸 (2026-09-16 만듦)
//   쓰는 곳: inquiry.html(신규 아동 관리) · children-new.html(아동 목록)
//   표     : nl_trial_lessons (체험 한 번 = 한 줄)
//            child_id · lesson_date · lesson_time · therapy_type_id · duration_min
//            therapist_id · fee · status(예정/완료/취소) · paid_on · memo
//   잠금   : 8·9·11번 모두 / 담당 선생님은 자기 것 보기만
//   금액   : 담당·수업 시간을 고르면 그 선생님 정규 1회 단가(nl_therapist_fees)를 채운다
//   저장   : 줄마다 오른쪽 단추로 따로 저장 · 예정/완료/취소는 저장된 줄이면 바로 저장
//
//   쓰는 법
//     NLTrials.init(sb, 직원번호)
//     NLTrials.mount(담을 칸, 아동번호, { onChange: 목록 => ... })
//     NLTrials.pendingN()   // 적고 저장 안 한 줄 수 (나갈 때 묻기에 씀)
//     NLTrials.clear()      // 칸 비우기
// =====================================================================
(function () {
  let SB = null, MEID = null;
  let TYPES = null, THS = null, FEES = null;   // 한 번만 읽어 둔다
  let BOX = null, CID = null, ROWS = [], OPT = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
         + '-' + String(d.getDate()).padStart(2, '0');
  }

  function ensureStyle() {
    if (document.getElementById('nlTrialStyle')) return;
    const st = document.createElement('style');
    st.id = 'nlTrialStyle';
    st.textContent = ''
      + '.ntr-wrap{border:1px solid #9cc8e6;border-radius:10px;background:#eef6fb;padding:10px 12px;}'
      + '.ntr-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;}'
      + '.ntr-head b{color:#0c447c;font-size:13.5px;}'
      + '.ntr-head .sub{color:#5a7a92;font-size:12px;}'
      + '.ntr-add{margin-left:auto;width:auto;padding:4px 12px;font-size:12.5px;font-weight:600;'
      +   'background:#fff;border:1px solid #9cc8e6;color:#0c447c;border-radius:6px;cursor:pointer;}'
      + '.ntr-row{background:#fff;border:1px solid #d6e6f2;border-radius:8px;padding:8px 10px;margin-top:6px;'
      +   'display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;}'
      + '.ntr-row.off{opacity:.55;}'
      + '.ntr-row label{display:block;font-size:11.5px;color:#666;margin:0 0 2px;font-weight:normal;}'
      + '.ntr-row input,.ntr-row select{font:inherit;font-size:13px;padding:5px 7px;border:1px solid #ccc;'
      +   'border-radius:5px;margin:0;box-sizing:border-box;}'
      + '.ntr-seg{display:flex;border:1px solid #cfd6cc;border-radius:7px;overflow:hidden;}'
      + '.ntr-seg button{width:auto;margin:0;padding:6px 10px;background:#fff;color:#777;border:none;'
      +   'border-left:1px solid #cfd6cc;font-size:12.5px;cursor:pointer;border-radius:0;}'
      + '.ntr-seg button:first-child{border-left:none;}'
      + '.ntr-seg button.on[data-v="예정"]{background:#d3f5c8;color:#1b5e20;font-weight:bold;}'
      + '.ntr-seg button.on[data-v="완료"]{background:#2e7d32;color:#fff;font-weight:bold;}'
      + '.ntr-seg button.on[data-v="취소"]{background:#9aa19c;color:#fff;font-weight:bold;}'
      + '.ntr-save{margin-left:auto;width:auto;padding:6px 12px;font-size:12.5px;font-weight:700;'
      +   'border-radius:7px;cursor:pointer;background:#e8f3ea;color:#2e7d32;border:1px solid #a9d6b3;}'
      + '.ntr-save.done{background:#2e7d32;color:#fff;border-color:#2e7d32;}'
      + '.ntr-save:disabled{background:#bbb;color:#fff;border-color:#bbb;cursor:default;}'
      + '.ntr-none{color:#7a8f9e;font-size:12.5px;padding:4px 2px;}';
    document.head.appendChild(st);
  }

  async function loadBase() {
    if (TYPES && THS && FEES) return;
    const [tt, th, tf] = await Promise.all([
      SB.from('nl_therapy_types').select('*').order('id'),
      SB.from('nl_therapists').select('id, name, active').lte('id', 7).order('id'),
      SB.from('nl_therapist_fees').select('therapist_id, from_month, fee_40, fee_50, fee_60')
    ]);
    TYPES = (tt.data || []).filter(x => x.active !== false);
    THS   = (th.data || []).filter(x => x.active !== false);
    FEES  = tf.data || [];
  }

  // 그 선생님 · 그 수업 시간의 정규 1회 단가 (그 날짜에 적용되는 것)
  function feeOf(thr, dur, date) {
    const mk = String(date || todayStr()).slice(0, 7);
    const rows = (FEES || []).filter(f => Number(f.therapist_id) === Number(thr)
                                        && String(f.from_month || '') <= mk)
      .sort((a, b) => String(b.from_month).localeCompare(String(a.from_month)));
    if (!rows.length) return '';
    const v = rows[0]['fee_' + (Number(dur) || 40)];
    return v ? Number(v).toLocaleString() : '';
  }

  function setBtn(b, st) {
    b.classList.toggle('done', st === 'done');
    b.disabled = (st === 'saving');
    b.textContent = st === 'saving' ? '저장 중…' : st === 'done' ? '\u2713 저장됨' : '💾 저장 전';
  }

  function rowHtml(t) {
    const typeOpt = '<option value="">-- 치료 --</option>' + TYPES.map(x =>
      '<option value="' + x.id + '"' + (t && t.therapy_type_id === x.id ? ' selected' : '') + '>'
      + esc(x.name) + '</option>').join('');
    const thrOpt = '<option value="">-- 담당 --</option>' + THS.map(x =>
      '<option value="' + x.id + '"' + (t && t.therapist_id === x.id ? ' selected' : '') + '>'
      + esc(x.name) + '</option>').join('');
    const durOpt = [40, 50, 60].map(v =>
      '<option value="' + v + '"' + (Number(t ? t.duration_min : 40) === v ? ' selected' : '') + '>'
      + v + '분</option>').join('');
    const st = (t && t.status) || '예정';
    return '<div class="ntr-row' + (st === '취소' ? ' off' : '') + '" data-id="' + (t ? t.id : '') + '">'
      + '<div><label>체험 날짜</label><input class="t-date" type="date" style="width:140px;" value="'
      +   esc(t && t.lesson_date || '') + '"></div>'
      + '<div><label>시간</label><input class="t-time" type="time" style="width:105px;" value="'
      +   esc(t && t.lesson_time ? String(t.lesson_time).slice(0, 5) : '') + '"></div>'
      + '<div><label>치료 종류</label><select class="t-type" style="width:115px;">' + typeOpt + '</select></div>'
      + '<div><label>수업 시간</label><select class="t-dur" style="width:75px;">' + durOpt + '</select></div>'
      + '<div><label>담당</label><select class="t-thr" style="width:110px;">' + thrOpt + '</select></div>'
      + '<div><label>금액</label><input class="t-fee" type="text" inputmode="numeric" style="width:95px;" value="'
      +   (t && t.fee ? Number(t.fee).toLocaleString() : '') + '"></div>'
      + '<div><label>상태</label><div class="ntr-seg">'
      +   ['예정', '완료', '취소'].map(v =>
            '<button type="button" data-v="' + v + '" class="' + (v === st ? 'on' : '') + '">' + v + '</button>'
          ).join('')
      + '</div></div>'
      + '<button type="button" class="ntr-save' + (t ? ' done' : '') + '">'
      +   (t ? '\u2713 저장됨' : '💾 저장 전') + '</button>'
      + '</div>';
  }

  function wireRow(el) {
    el.dataset.st = el.querySelector('.ntr-seg .on').dataset.v;
    el.dataset.dirty = '';
    const btn = el.querySelector('.ntr-save');
    const dirty = () => { el.dataset.dirty = '1'; setBtn(btn, 'before'); };
    el.addEventListener('input', e => { if (!e.target.closest('.ntr-save')) dirty(); });
    el.addEventListener('change', e => { if (!e.target.closest('.ntr-save')) dirty(); });
    const upd = () => {
      const f = feeOf(el.querySelector('.t-thr').value, el.querySelector('.t-dur').value,
                      el.querySelector('.t-date').value);
      if (f) el.querySelector('.t-fee').value = f;
    };
    el.querySelector('.t-thr').addEventListener('change', upd);
    el.querySelector('.t-dur').addEventListener('change', upd);

    el.querySelectorAll('.ntr-seg button').forEach(b => {
      b.onclick = async () => {
        const v = b.dataset.v, old = el.dataset.st;
        if (v === old) return;
        const paint = x => {
          el.querySelectorAll('.ntr-seg button').forEach(k => k.classList.toggle('on', k.dataset.v === x));
          el.classList.toggle('off', x === '취소');
          el.dataset.st = x;
        };
        paint(v);
        const id = el.dataset.id;
        if (!id) { dirty(); return; }
        const { data, error } = await SB.from('nl_trial_lessons')
          .update({ status: v }).eq('id', Number(id)).select().single();
        if (error) { paint(old); alert('체험 수업 상태를 저장하지 못했습니다.\n' + error.message); return; }
        keep(data);
      };
    });

    btn.onclick = async () => {
      const date = el.querySelector('.t-date').value;
      if (!date) { alert('체험 날짜를 적어 주세요.'); return; }
      const thr = Number(el.querySelector('.t-thr').value) || null;
      if (!thr) { alert('담당 선생님을 골라 주세요.'); return; }
      const fee = parseInt(String(el.querySelector('.t-fee').value).replace(/[^0-9]/g, ''), 10);
      const row = {
        child_id:        CID,
        lesson_date:     date,
        lesson_time:     el.querySelector('.t-time').value || null,
        therapy_type_id: Number(el.querySelector('.t-type').value) || null,
        duration_min:    Number(el.querySelector('.t-dur').value) || 40,
        therapist_id:    thr,
        fee:             isNaN(fee) ? 0 : fee,
        status:          el.dataset.st || '예정'
      };
      setBtn(btn, 'saving');
      const id = el.dataset.id;
      const res = id
        ? await SB.from('nl_trial_lessons').update(row).eq('id', Number(id)).select().single()
        : await SB.from('nl_trial_lessons').insert(row).select().single();
      if (res.error) {
        setBtn(btn, 'before');
        alert('체험 수업을 저장하지 못했습니다.\n' + res.error.message);
        return;
      }
      el.dataset.id = res.data.id;
      el.dataset.dirty = '';
      setBtn(btn, 'done');
      keep(res.data);
    };
  }

  // 저장된 줄을 목록에 담고 알린다
  function keep(t) {
    const k = ROWS.findIndex(x => x.id === t.id);
    if (k >= 0) ROWS[k] = t; else ROWS.push(t);
    if (OPT.onChange) { try { OPT.onChange(ROWS.slice()); } catch (e) {} }
  }

  function draw() {
    if (!BOX) return;
    BOX.innerHTML = '<div class="ntr-wrap">'
      + '<div class="ntr-head"><b>🧸 체험 수업</b>'
      + '<span class="sub">— 정규를 정하기 전 1회 · 치료중 아동도 잡을 수 있음</span>'
      + '<button type="button" class="ntr-add">＋ 체험 줄 추가</button></div>'
      + '<div class="ntr-rows">'
      + (ROWS.length ? '' : '<div class="ntr-none">아직 잡은 체험 수업이 없습니다.</div>')
      + '</div></div>';
    const rows = BOX.querySelector('.ntr-rows');
    ROWS.slice().sort((a, b) => String(a.lesson_date).localeCompare(String(b.lesson_date)))
      .forEach(t => {
        rows.insertAdjacentHTML('beforeend', rowHtml(t));
        wireRow(rows.lastElementChild);
      });
    BOX.querySelector('.ntr-add').onclick = () => {
      const none = rows.querySelector('.ntr-none');
      if (none) none.remove();
      rows.insertAdjacentHTML('beforeend', rowHtml(null));
      wireRow(rows.lastElementChild);
    };
  }

  async function mount(box, cid, opt) {
    ensureStyle();
    BOX = box; CID = Number(cid); OPT = opt || {}; ROWS = [];
    if (!SB || !BOX || !CID) return;
    BOX.innerHTML = '<div class="ntr-wrap"><div class="ntr-none">체험 수업 불러오는 중...</div></div>';
    try {
      await loadBase();
      const { data, error } = await SB.from('nl_trial_lessons').select('*').eq('child_id', CID);
      if (error) throw error;
      if (BOX !== box || CID !== Number(cid)) return;   // 그사이 다른 아동을 열었으면 그만
      ROWS = data || [];
    } catch (e) {
      BOX.innerHTML = '<div class="ntr-wrap"><div class="ntr-none">체험 수업을 불러오지 못했습니다. '
        + esc(e.message || e) + '</div></div>';
      return;
    }
    draw();
  }

  // 적고 저장하지 않은 줄 수 — 새 줄은 날짜를 적었을 때만 센다
  function pendingN() {
    if (!BOX || !BOX.isConnected) return 0;
    return Array.from(BOX.querySelectorAll('.ntr-row')).filter(el =>
      el.dataset.dirty === '1'
      && (el.dataset.id || el.querySelector('.t-date').value)).length;
  }

  function clear() {
    if (BOX) BOX.innerHTML = '';
    BOX = null; CID = null; ROWS = [];
  }

  window.NLTrials = {
    init: function (sb, meId) { SB = sb; MEID = meId; },
    mount: mount,
    pendingN: pendingN,
    clear: clear
  };
})();
