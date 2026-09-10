// =====================================================================
// nl-evaldocs.js — 평가보고서 올리기·보기 (2026-09-11 만듦)
//   쓰는 곳: inquiry.html(신규 아동 관리) · children-new.html(아동 목록)
//   파일    : Supabase 저장소 nl-evaldocs / 아동번호 / 영어이름.jpg
//   목록 표 : nl_eval_docs (파일 한 개 = 한 줄)
//   보는 사람: 8·9번 + 그 아동 담당 치료사 / 올리기·지우기: 8·9번만 (표·저장소 잠금)
//   사진은 긴 쪽 2,000픽셀 · 화질 80% 로 줄여 올린다. PDF 는 그대로.
// =====================================================================
(function () {
  const BUCKET = 'nl-evaldocs';
  const MAXPX  = 2000;          // 사진 긴 쪽
  const QUAL   = 0.8;           // 사진 화질
  const SMALL  = 600 * 1024;    // 이보다 작은 사진은 그대로 올린다
  const LIMIT  = 50 * 1024 * 1024;  // 무료 요금제 파일 한 개 한도
  const SHOWN  = 5;             // 묶음마다 처음에 보여줄 파일 수

  let SB = null, MEID = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function kb(n) {
    n = Number(n) || 0;
    return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB';
  }
  function extOf(name) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/);
    return m ? m[1] : 'bin';
  }
  function isPdf(r) { return /\.pdf$/i.test(r.file_path || '') || /\.pdf$/i.test(r.file_name || ''); }
  function md(d) {
    if (!d) return '날짜 없음';
    const p = String(d).split('-');
    return Number(p[0]) + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일';
  }

  // 사진 줄이기 — 실패하면 원래 파일 그대로
  async function shrink(file) {
    const orig = { blob: file, ext: extOf(file.name), type: file.type || 'application/octet-stream' };
    if (!/^image\//.test(file.type || '')) return orig;
    if (file.size < SMALL) return orig;
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((ok, no) => {
        const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url;
      });
      let w = img.naturalWidth, h = img.naturalHeight;
      const r = Math.min(1, MAXPX / Math.max(w, h));
      w = Math.round(w * r); h = Math.round(h * r);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', QUAL));
      if (!blob || blob.size >= file.size) return orig;
      return { blob: blob, ext: 'jpg', type: 'image/jpeg' };
    } catch (e) { return orig; }
  }

  // ---------- 꾸밈 (화면의 button·input 기본 꾸밈을 이긴다) ----------
  function ensureStyle() {
    if (document.getElementById('nlDocStyle')) return;
    const st = document.createElement('style');
    st.id = 'nlDocStyle';
    st.textContent =
      '#nlDocWrap{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 12px;box-sizing:border-box;}'
    + '#nlDocWrap .dk{background:#fff;border-radius:12px;max-width:760px;width:100%;padding:18px 20px;box-sizing:border-box;font-size:14px;color:#333;}'
    + '#nlDocWrap h3{margin:0 0 4px;font-size:17px;color:#1b5e20;}'
    + '#nlDocWrap .sub{color:#777;font-size:12.5px;margin-bottom:12px;}'
    + '#nlDocWrap .up{border:1px solid #cfe0d0;background:#f6faf5;border-radius:9px;padding:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;}'
    + '#nlDocWrap label{display:block;font-size:12px;color:#666;margin-bottom:3px;}'
    + '#nlDocWrap input[type=text],#nlDocWrap input[type=date]{width:auto;padding:8px 10px;border:1px solid #ccc;border-radius:7px;font-size:14px;margin:0;}'
    + '#nlDocWrap input[type=file]{width:auto;padding:6px 0;border:none;font-size:13px;margin:0;}'
    + '#nlDocWrap button{width:auto;margin:0;padding:7px 13px;border-radius:7px;border:1px solid #cfd6cc;background:#fff;color:#444;font-size:13px;font-weight:normal;cursor:pointer;}'
    + '#nlDocWrap button.go{background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:bold;}'
    + '#nlDocWrap button.del{color:#c62828;}'
    + '#nlDocWrap button:disabled{background:#bbb;border-color:#bbb;color:#fff;}'
    + '#nlDocWrap .msg{margin-top:10px;font-size:13px;white-space:pre-wrap;}'
    + '#nlDocWrap .grp{border:1px solid #e0e5df;border-radius:9px;margin-top:12px;overflow:hidden;}'
    + '#nlDocWrap .gh{background:#f1f8e9;padding:9px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}'
    + '#nlDocWrap .gh b{flex:1;min-width:200px;color:#33691e;}'
    + '#nlDocWrap .it{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid #eee;}'
    + '#nlDocWrap .it small{color:#999;margin-left:6px;}'
    + '#nlDocWrap .more{padding:7px 12px;border-top:1px solid #eee;color:#2e7d32;cursor:pointer;font-size:13px;}'
    + '#nlDocWrap .none{color:#999;padding:16px 4px;}';
    document.head.appendChild(st);
  }

  // ---------- 개수 세기 (단추에 붙일 숫자) ----------
  // 돌려주는 것: { byEval: {평가번호: 파일수}, other: 타기관 파일수 }
  async function count(cid) {
    const out = { byEval: {}, other: 0 };
    if (!SB || !cid) return out;
    const { data, error } = await SB.from('nl_eval_docs')
      .select('eval_id, source').eq('child_id', Number(cid));
    if (error || !data) return out;
    data.forEach(r => {
      if (r.source === '타기관') out.other++;
      else if (r.eval_id) out.byEval[r.eval_id] = (out.byEval[r.eval_id] || 0) + 1;
    });
    return out;
  }

  // ---------- 창 열기 ----------
  // o = { cid, kid(아동 이름·번호 표시용), source:'센터'|'타기관', evalId, title, date, onChange }
  async function open(o) {
    ensureStyle();
    close();
    const isCenter = o.source === '센터';
    const wrap = document.createElement('div');
    wrap.id = 'nlDocWrap';
    wrap.innerHTML =
      '<div class="dk">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
      +   '<div><h3>' + (isCenter ? '평가보고서 (우리 센터)' : '타기관 평가보고서') + '</h3>'
      +   '<div class="sub">' + esc(o.kid || (o.cid + '번 아동'))
      +     (isCenter && o.title ? ' · ' + esc(o.title) : '') + '</div></div>'
      +   '<button type="button" data-a="close">닫기</button>'
      + '</div>'
      + (canUse()
        ? '<div class="up">'
          + '<div><label>' + (isCenter ? '문서 이름' : '기관·문서 이름') + '</label>'
          +   '<input type="text" class="t" style="width:230px;" placeholder="'
          +   (isCenter ? '언어평가 결과보고서' : '○○대학병원 발달평가') + '" value="' + esc(o.title || '') + '"></div>'
          + '<div><label>평가 받은 날</label><input type="date" class="d" value="' + esc(o.date || '') + '"></div>'
          + '<div><label>파일 (사진·PDF · 여러 개 한꺼번에)</label>'
          +   '<input type="file" class="f" multiple accept="image/*,.pdf,application/pdf"></div>'
          + '<button type="button" class="go" data-a="up">올리기</button>'
          + '</div>'
        : '')
      + '<div class="msg"></div>'
      + '<div class="list"><div class="none">불러오는 중…</div></div>'
      + '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', ev => { if (ev.target === wrap) close(); });
    wrap.querySelector('[data-a="close"]').onclick = close;

    const say = (t, ok) => {
      const m = wrap.querySelector('.msg');
      m.textContent = t || '';
      m.style.color = ok === false ? '#b71c1c' : '#1b5e20';
    };

    let ROWS = [];
    async function load() {
      let q = SB.from('nl_eval_docs').select('*').eq('child_id', Number(o.cid));
      q = isCenter ? q.eq('eval_id', Number(o.evalId)) : q.eq('source', '타기관');
      const { data, error } = await q;
      if (error) { say('❌ 목록을 불러오지 못했습니다.\n' + error.message, false); ROWS = []; }
      else ROWS = data || [];
      draw();
    }

    function draw() {
      const box = wrap.querySelector('.list');
      if (!ROWS.length) { box.innerHTML = '<div class="none">아직 올린 보고서가 없습니다.</div>'; return; }
      // 같은 이름·같은 날짜끼리 한 묶음
      const G = {};
      ROWS.forEach(r => {
        const k = (r.title || '') + '|' + (r.doc_date || '');
        (G[k] = G[k] || []).push(r);
      });
      const keys = Object.keys(G).sort((a, b) => {
        const da = G[a][0].doc_date || '', db = G[b][0].doc_date || '';
        return db.localeCompare(da);        // 최근 것 위로
      });
      box.innerHTML = keys.map((k, gi) => {
        const L = G[k].sort((a, b) => (a.page_no || 0) - (b.page_no || 0) || a.id - b.id);
        const nImg = L.filter(r => !isPdf(r)).length, nPdf = L.length - nImg;
        const kind = [nImg ? '사진 ' + nImg + '장' : '', nPdf ? 'PDF ' + nPdf + '개' : ''].filter(Boolean).join(' · ');
        return '<div class="grp" data-g="' + gi + '">'
          + '<div class="gh"><b>' + esc(L[0].title || '(이름 없음)') + ' · ' + md(L[0].doc_date) + ' · ' + kind + '</b>'
          +   '<button type="button" data-a="all" data-g="' + gi + '">한꺼번에 보기</button>'
          +   (canUse() ? '<button type="button" class="del" data-a="gdel" data-g="' + gi + '">묶음 지우기</button>' : '')
          + '</div>'
          + L.map((r, i) =>
              '<div class="it"' + (i >= SHOWN ? ' data-hide="1" style="display:none;"' : '') + '>'
              + '<span>' + (r.page_no ? r.page_no + '. ' : '') + esc(r.file_name) + '<small>' + kb(r.file_size) + '</small></span>'
              + '<span style="display:flex;gap:6px;">'
              +   '<button type="button" data-a="one" data-id="' + r.id + '">보기</button>'
              +   (canUse() ? '<button type="button" class="del" data-a="del" data-id="' + r.id + '">지우기</button>' : '')
              + '</span></div>').join('')
          + (L.length > SHOWN ? '<div class="more" data-a="more">나머지 ' + (L.length - SHOWN) + '개 펼치기</div>' : '')
          + '</div>';
      }).join('');
      box._groups = keys.map(k => G[k]);
    }

    // 목록 안의 단추들
    wrap.querySelector('.list').addEventListener('click', async ev => {
      const b = ev.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a, box = wrap.querySelector('.list');
      if (a === 'more') {
        b.parentNode.querySelectorAll('[data-hide]').forEach(x => x.style.display = '');
        b.remove(); return;
      }
      if (a === 'one') {
        const r = ROWS.find(x => x.id === Number(b.dataset.id));
        if (!r) return;
        const w = window.open('', '_blank');           // 먼저 창을 열어야 막히지 않는다
        const { data, error } = await SB.storage.from(BUCKET).createSignedUrl(r.file_path, 600);
        if (error || !data) { if (w) w.close(); say('❌ 파일을 열지 못했습니다.\n' + (error ? error.message : ''), false); return; }
        if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
        return;
      }
      if (a === 'all') {
        const L = box._groups[Number(b.dataset.g)] || [];
        const w = window.open('', '_blank');
        const { data, error } = await SB.storage.from(BUCKET)
          .createSignedUrls(L.map(r => r.file_path), 1800);
        if (error || !data) { if (w) w.close(); say('❌ 파일을 열지 못했습니다.\n' + (error ? error.message : ''), false); return; }
        const url = {}; data.forEach(d => { url[d.path] = d.signedUrl; });
        const body = L.map(r => {
          const u = url[r.file_path] || '';
          return isPdf(r)
            ? '<p style="margin:18px 0;"><a href="' + esc(u) + '" target="_blank" style="font-size:16px;">📄 ' + esc(r.file_name) + ' 열기 (PDF)</a></p>'
            : '<div style="margin:0 0 18px;"><div style="color:#888;font-size:12px;margin-bottom:4px;">'
              + (r.page_no || '') + '. ' + esc(r.file_name) + '</div>'
              + '<img src="' + esc(u) + '" style="max-width:100%;border:1px solid #ddd;"></div>';
        }).join('');
        if (w) {
          w.document.open();
          w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'
            + esc(L[0] ? L[0].title : '평가보고서') + '</title></head>'
            + '<body style="font-family:sans-serif;max-width:900px;margin:20px auto;padding:0 12px;">'
            + '<h2 style="font-size:18px;">' + esc(L[0] ? L[0].title : '') + ' · ' + md(L[0] && L[0].doc_date) + '</h2>'
            + '<p style="color:#b71c1c;font-size:12px;">이 창의 주소는 30분 뒤 만료됩니다. 민감한 자료이니 다 보신 뒤 창을 닫아 주세요.</p>'
            + body + '</body></html>');
          w.document.close();
        }
        return;
      }
      if (a === 'del' || a === 'gdel') {
        const L = a === 'del'
          ? ROWS.filter(x => x.id === Number(b.dataset.id))
          : (box._groups[Number(b.dataset.g)] || []);
        if (!L.length) return;
        if (!confirm(a === 'del'
            ? '「' + L[0].file_name + '」 파일을 지웁니다. 되돌릴 수 없습니다.\n계속할까요?'
            : '「' + L[0].title + '」 묶음의 파일 ' + L.length + '개를 모두 지웁니다. 되돌릴 수 없습니다.\n계속할까요?')) return;
        const { error: e1 } = await SB.storage.from(BUCKET).remove(L.map(r => r.file_path));
        if (e1) { say('❌ 파일을 지우지 못했습니다.\n' + e1.message, false); return; }
        const { error: e2 } = await SB.from('nl_eval_docs').delete().in('id', L.map(r => r.id));
        if (e2) { say('❌ 목록에서 지우지 못했습니다.\n' + e2.message, false); return; }
        say('✅ ' + L.length + '개를 지웠습니다.', true);
        await load();
        if (o.onChange) o.onChange();
      }
    });

    // 올리기
    const upBtn = wrap.querySelector('[data-a="up"]');
    if (upBtn) upBtn.onclick = async () => {
      const title = wrap.querySelector('.t').value.trim();
      const dd    = wrap.querySelector('.d').value || null;
      const files = Array.from(wrap.querySelector('.f').files || []);
      if (!title)        { say('⚠️ ' + (isCenter ? '문서 이름' : '기관·문서 이름') + '을 적어 주세요.', false); return; }
      if (!files.length) { say('⚠️ 올릴 파일을 골라 주세요.', false); return; }
      // 파일 이름 차례대로 (1쪽, 2쪽 … 이 섞이지 않게)
      files.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));

      // 같은 묶음에 이미 있으면 그 뒤로 이어 번호를 매긴다
      const already = ROWS.filter(r => (r.title || '') === title && (r.doc_date || null) === dd);
      let pno = already.reduce((m, r) => Math.max(m, r.page_no || 0), 0);

      upBtn.disabled = true;
      let okN = 0, fail = [];
      const stamp = Date.now();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        say('올리는 중… ' + (i + 1) + ' / ' + files.length + '\n(창을 닫지 마세요)', true);
        const s = await shrink(f);
        if (s.blob.size > LIMIT) { fail.push(f.name + ' — 50MB가 넘어 올릴 수 없습니다'); continue; }
        const path = o.cid + '/' + stamp + '_' + String(i + 1).padStart(3, '0') + '.' + s.ext;
        const u = await SB.storage.from(BUCKET).upload(path, s.blob, { contentType: s.type, upsert: false });
        if (u.error) { fail.push(f.name + ' — ' + u.error.message); continue; }
        pno++;
        const ins = await SB.from('nl_eval_docs').insert({
          child_id: Number(o.cid),
          eval_id: isCenter ? Number(o.evalId) : null,
          source: isCenter ? '센터' : '타기관',
          title: title, doc_date: dd,
          file_path: path, file_name: f.name,
          file_size: s.blob.size, page_no: pno,
          uploaded_by: MEID
        });
        if (ins.error) {
          await SB.storage.from(BUCKET).remove([path]);   // 목록에 못 적었으면 파일도 거둔다
          pno--;
          fail.push(f.name + ' — ' + ins.error.message);
          continue;
        }
        okN++;
      }
      upBtn.disabled = false;
      wrap.querySelector('.f').value = '';
      say((okN ? '✅ ' + okN + '개를 올렸습니다.' : '')
        + (fail.length ? '\n❌ 못 올린 것 ' + fail.length + '개\n' + fail.join('\n') : ''), !fail.length);
      await load();
      if (o.onChange) o.onChange();
    };

    await load();
  }

  function close() {
    const w = document.getElementById('nlDocWrap');
    if (w) w.remove();
  }

  function canUse() { return MEID === 8 || MEID === 9; }

  window.NLDocs = {
    init: function (sb, meId) { SB = sb; MEID = Number(meId) || null; },
    canUse: canUse,
    count: count,
    open: open,
    close: close
  };
})();
