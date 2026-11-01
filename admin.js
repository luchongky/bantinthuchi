/* Quản trị bản tin: đăng nhập, tải PDF bản tin thu, cập nhật số liệu chi. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const API = window.BANTIN_API;
  const KEY = 'bantin_admin_token';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dmy = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };
  const FIELDS = ['total', 'budget_pct', 'budget', 'ambition', 'ambition_pct', 'domestic', 'domestic_pct', 'customs', 'customs_pct', 'remaining', 'weekly'];
  let token = null, fileB64 = null, pages = 1;
  try { token = sessionStorage.getItem(KEY); } catch (e) {}
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  async function post(body) {
    const res = await fetch(API, { method: 'POST', body: JSON.stringify(body), credentials: 'omit' });
    const j = await res.json();
    if (j.auth === false) { logout(); throw new Error(j.error); }
    if (!j.ok) throw new Error(j.error || 'Lỗi máy chủ');
    return j;
  }
  function msg(el, text, ok) { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); }
  function showAdmin(on) {
    $('#login-panel').hidden = on; $('#admin-area').hidden = !on; $('#logout').hidden = !on;
    if (on) loadLists();
  }
  function logout() { token = null; try { sessionStorage.removeItem(KEY); } catch (e) {} showAdmin(false); }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = $('#login-msg'); msg(m, 'Đang đăng nhập…', true);
    try {
      const j = await post({ action: 'login', user: $('#user').value, pass: $('#pass').value });
      token = j.token; try { sessionStorage.setItem(KEY, token); } catch (e) {}
      $('#pass').value = ''; m.textContent = ''; showAdmin(true);
    } catch (err) { msg(m, err.message, false); }
  });
  $('#logout').onclick = logout;

  /* ---- Đọc PDF ---- */
  const NUM = '(\\d{1,3}(?:\\.\\d{3})*,\\d+|\\d+(?:,\\d+)?)', PCT = '(\\d{1,3}(?:,\\d+)?%)';
  function parseThu(text) {
    const t = text.replace(/\s+/g, ' ');
    const g = (re) => { const m = t.match(new RegExp(re, 'i')); return m ? m.slice(1) : null; };
    const st = {}, set = (k, v) => { if (v) st[k] = v; };
    let m;
    if ((m = g(`THU NỘI ĐỊA \\+ XNK ${NUM} Đạt ${PCT} dự toán HĐND; ${PCT} mục tiêu phấn đấu; Tuần này: \\+ ?${NUM}`))) { set('total', m[0]); set('budget_pct', m[1]); set('ambition_pct', m[2]); set('weekly', m[3]); }
    else if ((m = g(`THU NỘI ĐỊA \\+ XNK ${NUM}`))) set('total', m[0]);
    if ((m = g(`THU NỘI ĐỊA ${NUM} Đạt ${PCT}`))) { set('domestic', m[0]); set('domestic_pct', m[1]); }
    if ((m = g(`THU XUẤT NHẬP KHẨU ${NUM} Đạt ${PCT}`))) { set('customs', m[0]); set('customs_pct', m[1]); }
    if ((m = g(`CÒN PHẢI THU ${NUM}`))) set('remaining', m[0]);
    if ((m = g(`Nội địa \\+ XNK ${NUM} ${NUM}`))) { set('budget', m[0]); set('ambition', m[1]); }
    let date = null;
    if ((m = g('Kỳ báo cáo: (?:tuần đến ngày )?(\\d{1,2})/(\\d{1,2})/(20\\d{2})'))) date = `${m[2]}-${m[1].padStart(2, '0')}-${m[0].padStart(2, '0')}`;
    return { st, date, isThu: /BẢN TIN THU NGÂN SÁCH/i.test(t) };
  }
  function dateFromName(name) {
    const m = name.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }

  async function handleFile(f) {
    const um = $('#up-msg');
    if (!f || f.type !== 'application/pdf') { msg(um, 'Vui lòng chọn tệp PDF.', false); return; }
    if (f.size > 20 * 1024 * 1024) { msg(um, 'Tệp lớn hơn 20 MB.', false); return; }
    msg(um, 'Đang đọc tệp…', true);
    const buf = await f.arrayBuffer();
    let text = '';
    try {
      const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      pages = doc.numPages;
      const c = await (await doc.getPage(1)).getTextContent();
      text = c.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('');
    } catch (e) { pages = 1; }
    const { st, date, isThu } = parseThu(text);
    const nameDate = dateFromName(f.name);
    $('#f-date').value = date || nameDate || '';
    FIELDS.forEach((k) => { $('#f-' + k).value = st[k] || ''; });
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    fileB64 = btoa(bin);
    $('#drop').textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB · ${pages} trang`;
    $('#drop').classList.add('has');
    $('#thu-form').hidden = false;
    const warn = [];
    if (!isThu) warn.push('không thấy tiêu đề "BẢN TIN THU NGÂN SÁCH" trong tệp');
    if (date && nameDate && date !== nameDate) warn.push(`ngày trên tên tệp (${dmy(nameDate)}) khác ngày trong PDF (${dmy(date)})`);
    if (!st.total) warn.push('chưa đọc được chỉ tiêu, hãy nhập tay các ô cần thiết');
    if (warn.length) msg(um, 'Lưu ý: ' + warn.join('; ') + '.', false); else msg(um, 'Đã đọc xong. Kiểm tra lại số liệu rồi bấm Đăng.', true);
  }
  $('#drop').onclick = () => $('#file').click();
  $('#file').onchange = (e) => handleFile(e.target.files[0]);
  $('#drop').addEventListener('dragover', (e) => { e.preventDefault(); });
  $('#drop').addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });
  $('#reset').onclick = () => { fileB64 = null; $('#file').value = ''; $('#thu-form').hidden = true; $('#drop').classList.remove('has'); $('#drop').textContent = 'Bấm để chọn hoặc kéo thả tệp PDF bản tin thu vào đây'; $('#up-msg').textContent = ''; };

  $('#upload').onclick = async () => {
    const um = $('#up-msg'), date = $('#f-date').value;
    if (!fileB64) return msg(um, 'Chưa chọn tệp.', false);
    if (!date) return msg(um, 'Chưa nhập ngày kỳ báo cáo.', false);
    const stats = {}; FIELDS.forEach((k) => { const v = $('#f-' + k).value.trim(); if (v) stats[k] = v; });
    $('#upload').disabled = true; msg(um, 'Đang tải lên…', true);
    try {
      const j = await post({ action: 'uploadThu', token, date, base64: fileB64, pages, stats });
      msg(um, `Đã đăng bản tin thu kỳ ${dmy(date)}${j.replaced ? ' (thay bản cũ)' : ''}.`, true);
      $('#reset').click(); msg(um, `Đã đăng bản tin thu kỳ ${dmy(date)}${j.replaced ? ' (thay bản cũ)' : ''}.`, true);
      loadLists();
    } catch (err) { msg(um, err.message, false); }
    $('#upload').disabled = false;
  };

  $('#refresh-chi').onclick = async () => {
    const m = $('#chi-msg'); $('#refresh-chi').disabled = true; msg(m, 'Đang lấy số liệu…', true);
    try { const j = await post({ action: 'refreshChi', token }); msg(m, `Đã cập nhật kỳ ${j.chi.label}.`, true); loadLists(); }
    catch (err) { msg(m, err.message, false); }
    $('#refresh-chi').disabled = false;
  };

  async function loadLists() {
    try {
      const j = await (await fetch(API + '?api=list', { credentials: 'omit' })).json();
      $('#thu-list').innerHTML = (j.thu || []).map((r) => `<tr><td>${dmy(r.date)}</td><td><a href="https://drive.google.com/file/d/${esc(r.fileId)}/view" target="_blank" rel="noopener">${esc(r.name)}</a></td><td>${esc((r.stats || {}).total || '—')}</td><td>${new Date(r.uploadedAt).toLocaleString('vi-VN')}</td><td><button class="btn danger" data-del="${esc(r.date)}">Xoá</button></td></tr>`).join('') || '<tr><td colspan="5">Chưa có bản tin thu.</td></tr>';
      $('#chi-list').innerHTML = (j.chi || []).map((r) => {
        let D = 0; r.sections.forEach((s) => { D += s.xa[1] + s.so[1]; });
        return `<tr><td>${dmy(r.date)}</td><td>${r.closed ? 'Đã chốt' : 'Đang mở'}</td><td>${(D / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ</td><td>${new Date(r.updatedAt).toLocaleString('vi-VN')}</td><td><button class="btn danger" data-delchi="${esc(r.date)}">Xoá</button></td></tr>`;
      }).join('') || '<tr><td colspan="5">Chưa có số liệu chi.</td></tr>';
    } catch (e) {}
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del],[data-delchi]'); if (!b) return;
    const isChi = !!b.dataset.delchi, date = b.dataset.del || b.dataset.delchi;
    if (!confirm(`Xoá bản tin ${isChi ? 'chi' : 'thu'} kỳ ${dmy(date)}?`)) return;
    try { await post({ action: isChi ? 'deleteChi' : 'deleteThu', token, date }); loadLists(); } catch (err) { alert(err.message); }
  });

  if (!API) { msg($('#login-msg'), 'Chưa cấu hình địa chỉ backend (config.js).', false); }
  showAdmin(!!token);
})();
