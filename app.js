/* Cổng bản tin Thu - Chi NSNN Cao Bằng. Đọc dữ liệu công khai từ backend Apps Script. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s) || document.createElement('div');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf = (v, d = 1) => new Intl.NumberFormat('vi-VN', {minimumFractionDigits: d, maximumFractionDigits: d}).format(v);
  const ty = (trieu) => nf((Number(trieu) || 0) / 1000);
  const pct = (a, b) => b > 0 ? nf(a / b * 100) + '%' : '–';
  const pnum = (v) => Number(String(v || '').replace('%', '').replace(/\./g, '').replace(',', '.'));
  const dmy = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };
  const drive = {
    preview: (id) => `https://drive.google.com/file/d/${id}/preview`,
    view: (id) => `https://drive.google.com/file/d/${id}/view`,
    download: (id) => `https://drive.google.com/uc?export=download&id=${id}`
  };

  let DATA = { thu: [], chi: [] };
  let periods = [];
  let current = null;

  function timeProgress(iso) {
    const d = new Date(iso + 'T00:00:00');
    const y = d.getFullYear();
    const start = new Date(y, 0, 1), end = new Date(y, 11, 31);
    const days = Math.round((end - start) / 864e5) + 1;
    const passed = Math.round((d - start) / 864e5) + 1;
    return { y, days, passed, left: days - passed, pct: passed / days * 100 };
  }

  function chiTotals(s) {
    let P = 0, D = 0, XP = 0, XD = 0, SP = 0, SD = 0;
    s.sections.forEach((r) => { XP += r.xa[0]; XD += r.xa[1]; SP += r.so[0]; SD += r.so[1]; });
    P = XP + SP; D = XD + SD;
    return { P, D, XP, XD, SP, SD };
  }

  /* Bản tin thu: giữ bản gần nhất (ngày <= kỳ đang xem) cho đến khi có bản mới hơn. */
  function thuFor(p) {
    return DATA.thu.filter((r) => r.date && r.date <= p).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
  }

  /* ---------- Tổng quan ---------- */
  function renderOverview() {
    const thu = thuFor(current);
    const chi = DATA.chi.find((r) => r.date === current);
    $('#latest-date').textContent = dmy(current);
    $('#latest-availability').textContent = thu && chi ? 'Đã có cả bản tin thu và chi' : thu ? 'Mới có bản tin thu' : chi ? 'Mới có bản tin chi' : 'Chưa có tài liệu';
    $('#hero-year').textContent = current.slice(0, 4);
    const st = (thu && thu.stats) || {};
    $('#hero-income').textContent = st.budget_pct || (thu ? 'Xem PDF' : 'Chưa đăng');
    $('#income-total').textContent = st.total || (thu ? 'Xem PDF' : 'Chưa đăng');
    $('#income-rate').textContent = st.budget_pct || '—';
    $('#income-target').textContent = st.budget ? `Dự toán HĐND: ${st.budget} tỷ đồng` : 'Dự toán: xem trong PDF';
    const ir = pnum(st.budget_pct);
    $('#income-progress').style.width = Number.isFinite(ir) ? Math.min(100, ir) + '%' : '0%';
    $('#income-context').textContent = st.weekly ? `Thu trong tuần: +${st.weekly} tỷ đồng` : `Kỳ ${dmy(thu ? thu.date : current)}`;
    $('#income-facts').innerHTML = facts(thu ? [['Thu nội địa', st.domestic], ['Thu xuất nhập khẩu', st.customs], ['Còn phải thu (DT HĐND)', st.remaining]] : null);

    if (chi) {
      const t = chiTotals(chi);
      const rate = t.D / t.P * 100;
      $('#hero-expense').textContent = nf(rate) + '%';
      $('#expense-total').textContent = ty(t.D);
      $('#expense-rate').textContent = nf(rate) + '%';
      $('#expense-target').textContent = `Dự toán theo dõi: ${ty(t.P)} tỷ đồng`;
      $('#expense-progress').style.width = Math.min(100, rate) + '%';
      $('#expense-context').textContent = `Đã báo cáo: ${chi.counts.xaSent}/${chi.counts.xa} xã · ${chi.counts.soSent}/${chi.counts.so} sở, ngành`;
      $('#expense-facts').innerHTML = facts([['Khối xã, phường', ty(t.XD)], ['Khối sở, ngành', ty(t.SD)], ['Còn phải giải ngân', ty(t.P - t.D)]]);
    } else {
      ['#hero-expense', '#expense-total'].forEach((s) => ($(s).textContent = 'Chưa có'));
      $('#expense-rate').textContent = '—'; $('#expense-progress').style.width = '0%';
      $('#expense-target').textContent = 'Dự toán: —'; $('#expense-context').textContent = '—';
      $('#expense-facts').innerHTML = facts(null);
    }
  }
  const facts = (arr) => (arr || [['—', '—'], ['—', '—'], ['—', '—']]).map(([l, v]) => `<div class="sub-metric"><strong>${esc(v || '—')}</strong><span>${esc(l)}</span></div>`).join('');

  /* ---------- Bản tin chi ---------- */
  function barsSvg(items, timePct) {
    const W = 380, H = 30 + items.length * 26, x0 = 128, x1 = 350, sc = (p) => x0 + (x1 - x0) * Math.min(p, 100) / 100;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Tỷ lệ giải ngân theo nguồn">`;
    [0, 25, 50, 75, 100].forEach((p) => { s += `<line x1="${sc(p)}" x2="${sc(p)}" y1="14" y2="${H - 18}" stroke="#e3e8ee"/><text x="${sc(p)}" y="${H - 5}" font-size="9" fill="#7a8b99" text-anchor="middle">${p}%</text>`; });
    items.forEach(([n, p], i) => {
      const y = 18 + i * 26, col = i === 0 ? '#11314d' : p < 30 ? '#e8692e' : '#2f7bd8';
      s += `<text x="${x0 - 6}" y="${y + 12}" font-size="10" text-anchor="end" fill="#22313f"${i === 0 ? ' font-weight="700"' : ''}>${esc(n)}</text><rect x="${x0}" y="${y}" width="${Math.max(1, sc(p) - x0)}" height="16" rx="2" fill="${col}"/><text x="${sc(p) + 4}" y="${y + 12}" font-size="10" font-weight="700" fill="#22313f">${nf(p)}%</text>`;
    });
    s += `<line x1="${sc(timePct)}" x2="${sc(timePct)}" y1="10" y2="${H - 18}" stroke="#c0392b" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${sc(timePct) - 3}" y="9" font-size="8.5" fill="#c0392b" text-anchor="end">Thời gian đã qua ${nf(timePct)}%</text></svg>`;
    return s;
  }
  function distSvg(dist) {
    const W = 380, H = 190, labs = ['Dưới 30%', '30–50%', '50–70%', 'Từ 70% trở lên'], cols = ['#e8692e', '#f2a541', '#5b9be6', '#1f6fc7'], mx = Math.max(1, ...dist);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Số xã theo mức giải ngân">`;
    dist.forEach((v, i) => {
      const x = 36 + i * 86, h = (H - 62) * v / mx, y = H - 30 - h;
      s += `<rect x="${x}" y="${y}" width="58" height="${h}" rx="2" fill="${cols[i]}"/><text x="${x + 29}" y="${y - 5}" font-size="12" font-weight="700" text-anchor="middle" fill="#22313f">${v} xã</text><text x="${x + 29}" y="${H - 13}" font-size="10" text-anchor="middle" fill="#43525f">${labs[i]}</text>`;
    });
    return s + `<line x1="26" x2="${W - 8}" y1="${H - 30}" y2="${H - 30}" stroke="#9aa7b2"/></svg>`;
  }
  const short = (n) => n.replace('Chi thường xuyên giao đầu năm', 'Giao đầu năm').replace('Bổ sung có mục tiêu trong năm', 'Bổ sung có mục tiêu').replace('Khoa học công nghệ (NQ 57-NQ/TW)', 'KHCN (NQ 57)').replace('Chương trình MTQG', 'CTMTQG').replace('Dự phòng ngân sách', 'Dự phòng NS');
  const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const r = (u) => (u.P > 0 ? u.D / u.P * 100 : 0);
  const listNames = (arr) => arr.map((u) => `${u.n} (${nf(r(u))}%)`).join(', ');

  function chiHtml(s) {
    const t = chiTotals(s), tp = timeProgress(s.date), weeks = tp.left / 7;
    const rate = t.D / t.P * 100, xr = t.XD / t.XP * 100, sr = t.SP ? t.SD / t.SP * 100 : 0;
    const remain = t.P - t.D, perWeek = weeks > 0 ? remain / 1000 / weeks : 0;
    const secs = s.sections.map((x) => ({ ...x, P: x.xa[0] + x.so[0], D: x.xa[1] + x.so[1] }));
    const rows = secs.map((x) => `<tr><td class="l">${x.code}. ${esc(x.name)}</td><td>${ty(x.P)}</td><td>${ty(x.D)}</td><td><b>${pct(x.D, x.P)}</b></td><td>${pct(x.xa[1], x.xa[0])}</td><td>${pct(x.so[1], x.so[0])}</td><td>${ty(x.P - x.D)}</td></tr>`).join('');
    const sorted = secs.filter((x) => x.P > 0).sort((a, b) => a.D / a.P - b.D / b.P);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    const big = s.bigSo && s.bigSo[0];
    const c = s.counts;
    const pace = rate < tp.pct - 10 ? 'còn chậm nhiều so với tiến độ thời gian' : rate < tp.pct ? 'chậm hơn tiến độ thời gian' : 'đạt tiến độ thời gian';
    const ins = [
      `<li><b>Giải ngân ${pace}:</b> đã giải ngân ${ty(t.D)} tỷ đồng, đạt ${nf(rate)}% dự toán trong khi thời gian đã qua ${nf(tp.pct)}%. Còn ${ty(remain)} tỷ đồng phải giải ngân trong khoảng ${nf(weeks)} tuần, bình quân khoảng ${nf(perWeek, 0)} tỷ đồng mỗi tuần.</li>`,
      `<li><b>Khối ${sr < xr ? 'sở, ban, ngành chậm hơn khối xã' : 'xã chậm hơn khối sở, ban, ngành'}:</b> khối xã, phường đạt ${nf(xr)}%, khối sở, ban, ngành đạt ${nf(sr)}%.${big ? ` ${esc(big.n)} có dự toán lớn nhất (${ty(big.P)} tỷ) đạt ${nf(r(big))}%.` : ''}${s.zeroSo && s.zeroSo.length ? ` Chưa giải ngân: ${esc(s.zeroSo.join(', '))}.` : ''}</li>`,
      lo && hi ? `<li><b>Theo nguồn:</b> ${esc(lc(hi.name))} đạt cao nhất (${pct(hi.D, hi.P)}); ${esc(lc(lo.name))} thấp nhất (${pct(lo.D, lo.P)}).</li>` : '',
      `<li><b>Xã giải ngân thấp:</b> ${s.dist[0]}/${c.xa} xã, phường dưới 30%${s.lowXa.length ? `; thấp nhất: ${esc(listNames(s.lowXa.slice(0, 5)))}` : ''}.</li>`,
      `<li><b>Báo cáo kỳ này:</b> ${c.xa - c.xaSent} xã, phường và ${c.so - c.soSent} sở, ban, ngành chưa gửi${c.xaLate || c.soLate ? `; ${c.xaLate} xã và ${c.soLate} sở, ngành gửi sau giờ chốt` : ''}.</li>`
    ].join('');
    const items = [['Tổng cộng', rate]].concat(secs.map((x) => [`${x.code}. ${short(x.name)}`, x.P ? x.D / x.P * 100 : 0]));
    const status = s.closed ? `Số liệu chốt kỳ ${esc(s.label)}` : `Kỳ đang mở – cập nhật ${new Date(s.updatedAt).toLocaleString('vi-VN', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'})}`;
    return `
    <div class="b-hd"><div class="b-org">UBND TỈNH CAO BẰNG<br><b>SỞ TÀI CHÍNH</b></div>
      <div class="b-t"><h3>BẢN TIN CHI NGÂN SÁCH NHÀ NƯỚC NĂM ${tp.y}</h3><div>Tiến độ giải ngân kinh phí chi thường xuyên · Kỳ báo cáo: tuần đến ngày ${esc(s.label)} · Đơn vị: tỷ đồng</div></div></div>
    <div class="b-src">Nguồn: hệ thống Theo dõi giải ngân xã, phường và sở, ban, ngành (${c.xa} xã, phường; ${c.so} sở, ban, ngành). ${status}. Đơn vị chưa gửi: lấy số liệu gần nhất trên hệ thống.<br>
      Thời gian năm đã qua: <b>${nf(tp.pct)}%</b> (${tp.passed}/${tp.days} ngày); còn ${tp.left} ngày (khoảng ${nf(weeks)} tuần) đến ngày 31/12/${tp.y}.</div>
    <h4>I. Kết quả giải ngân</h4>
    <div class="b-kpi">
      <div class="k n"><span>Tổng đã giải ngân</span><strong>${ty(t.D)}</strong><em>Đạt <b>${nf(rate)}%</b> dự toán ${ty(t.P)} tỷ</em></div>
      <div class="k"><span>Khối xã, phường</span><strong>${ty(t.XD)}</strong><em>Đạt <b>${nf(xr)}%</b> dự toán ${ty(t.XP)} tỷ; ${c.xaSent}/${c.xa} đơn vị đã gửi</em></div>
      <div class="k o"><span>Khối sở, ban, ngành</span><strong>${ty(t.SD)}</strong><em>Đạt <b>${nf(sr)}%</b> dự toán ${ty(t.SP)} tỷ; ${c.soSent}/${c.so} đơn vị đã gửi</em></div>
      <div class="k r"><span>Còn phải giải ngân</span><strong>${ty(remain)}</strong><em>Bình quân cần <b>khoảng ${nf(perWeek, 0)} tỷ/tuần</b> đến 31/12</em></div>
    </div>
    <div class="b-tablewrap"><table class="b-table"><thead><tr><th class="l">Nguồn kinh phí</th><th>Dự toán</th><th>Đã giải ngân</th><th>Tỷ lệ</th><th>Tỷ lệ khối xã</th><th>Tỷ lệ khối sở</th><th>Còn lại</th></tr></thead>
      <tbody><tr class="tot"><td class="l">Tổng cộng (I–V)</td><td>${ty(t.P)}</td><td>${ty(t.D)}</td><td>${nf(rate)}%</td><td>${nf(xr)}%</td><td>${t.SP ? nf(sr) + '%' : '–'}</td><td>${ty(remain)}</td></tr>${rows}</tbody></table></div>
    ${s.baoLu ? `<div class="b-note"><b>Riêng kinh phí bão lũ nguồn NSTW năm ${tp.y}</b> (theo dõi riêng, không cộng vào tổng trên): dự toán ${ty(s.baoLu.plan)} tỷ, đã thực hiện ${ty(s.baoLu.spent)} tỷ, đạt ${pct(s.baoLu.spent, s.baoLu.plan)}.</div>` : ''}
    <div class="b-charts">
      <div><h5>Tỷ lệ giải ngân theo nguồn kinh phí</h5>${barsSvg(items, tp.pct)}<p>Cột cam: nguồn đạt dưới 30%. Đường đỏ: tiến độ thời gian.</p></div>
      <div><h5>${c.xa} xã, phường theo mức giải ngân</h5>${distSvg(s.dist)}<p>${s.dist[0] + s.dist[1]}/${c.xa} xã, phường giải ngân dưới 50%; ${s.dist[3]} đơn vị đạt từ 70% trở lên.</p></div>
    </div>
    <h4>II. Nhận định</h4><ul>${ins}</ul>
    <h4>III. Đơn vị cần lưu ý</h4><ul>
      <li><b>Xã, phường giải ngân thấp nhất:</b> ${esc(listNames(s.lowXa)) || '—'}.</li>
      <li><b>Sở, ban, ngành giải ngân thấp</b> (dự toán từ 5 tỷ trở lên): ${esc(listNames(s.lowSo)) || '—'}.</li>
      <li><b>Chưa gửi báo cáo kỳ này:</b> ${s.notSentXa.length ? 'xã, phường ' + esc(s.notSentXa.join(', ')) : 'các xã, phường đã gửi đủ'}${s.notSentSo.length ? '; sở, ngành: ' + esc(s.notSentSo.join(', ')) : ''}.</li>
    </ul>
    <div class="b-ft">Bản tin chi NSNN tuần đến ${esc(s.label)} · Sở Tài chính tỉnh Cao Bằng · Số liệu tự động từ hệ thống theo dõi giải ngân</div>`;
  }

  function renderChi() {
    const s = DATA.chi.find((x) => x.date === current);
    $('#chi-bulletin').innerHTML = s ? chiHtml(s) : `<div class="document-empty">Chưa có số liệu chi cho kỳ ${dmy(current)}.</div>`;
    $('#print-chi').disabled = !s;
  }

  /* ---------- Bản tin thu ---------- */
  function renderThu() {
    const t = thuFor(current);
    $('#viewer-date').textContent = `Kỳ ${dmy(t ? t.date : current)}`;
    $('#thu-empty').hidden = !!t;
    $('#pdf-frame').hidden = !t;
    $('#download-pdf').hidden = !t; $('#open-pdf').hidden = !t;
    if (!t) { $('#pdf-frame').removeAttribute('src'); return; }
    $('#pdf-frame').src = drive.preview(t.fileId);
    $('#download-pdf').href = drive.download(t.fileId);
    $('#open-pdf').href = drive.view(t.fileId);
    $('#viewer-subtitle').textContent = `${t.name} · ${t.pages || 1} trang`;
  }

  /* ---------- Lưu trữ ---------- */
  function renderArchive() {
    const years = [...new Set(periods.map((p) => p.slice(0, 4)))];
    $('#year').innerHTML = '<option value="all">Tất cả</option>' + years.map((y) => `<option>${y}</option>`).join('');
    $('#archive-counter').textContent = `${periods.length} kỳ báo cáo`;
    const draw = () => {
      const y = $('#year').value, q = $('#search').value.trim().toLowerCase();
      const list = periods.filter((p) => (y === 'all' || p.startsWith(y)) && (!q || `${dmy(p)} ${p}`.includes(q)));
      $('#archive-list').innerHTML = list.map((p) => {
        const hasT = DATA.thu.some((x) => x.date === p), hasC = DATA.chi.some((x) => x.date === p);
        const title = hasT && hasC ? 'Đầy đủ bản tin thu và chi' : hasT ? 'Đã có bản tin thu · Chưa có bản tin chi' : 'Đã có bản tin chi · Chưa có bản tin thu';
        return `<article class="archive-item"><div class="archive-time"><small>KỲ BÁO CÁO</small><strong>${dmy(p)}</strong></div>
          <div class="archive-desc"><h3>${title}</h3><p>Lưu trữ năm ${p.slice(0, 4)}</p></div>
          <div class="archive-actions">${hasT ? `<button class="archive-action" data-p="${p}" data-go="ban-tin-thu">Xem bản tin thu ↗</button>` : ''}${hasC ? `<button class="archive-action chi" data-p="${p}" data-go="ban-tin-chi">Xem bản tin chi ↗</button>` : ''}</div></article>`;
      }).join('');
      $('#no-match').hidden = list.length > 0;
    };
    $('#year').onchange = draw; $('#search').oninput = draw;
    $('#archive-list').onclick = (e) => {
      const b = e.target.closest('button[data-p]'); if (!b) return;
      setPeriod(b.dataset.p); document.getElementById(b.dataset.go).scrollIntoView({behavior: 'smooth'});
    };
    draw();
  }

  function setPeriod(p) {
    current = p; $('#period').value = p;
    renderOverview(); renderChi(); renderThu();
  }

  async function load() {
    $('#footer-year').textContent = new Date().getFullYear();
    if (!window.BANTIN_API) { $('#sync-mark').textContent = 'CHƯA CẤU HÌNH BACKEND'; return; }
    try {
      const res = await fetch(window.BANTIN_API + '?api=list', {credentials: 'omit'});
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Lỗi dữ liệu');
      DATA = { thu: j.thu || [], chi: j.chi || [] };
    } catch (err) {
      $('#sync-mark').textContent = 'KHÔNG TẢI ĐƯỢC SỐ LIỆU';
      $('#hero-date').textContent = 'Không kết nối được máy chủ dữ liệu. Vui lòng tải lại trang sau ít phút.';
      $('#chi-bulletin').innerHTML = '<div class="document-empty">Không tải được số liệu.</div>';
      return;
    }
    periods = [...new Set(DATA.thu.map((x) => x.date).concat(DATA.chi.map((x) => x.date)))].filter(Boolean).sort().reverse();
    $('#sync-mark').textContent = 'CẬP NHẬT HẰNG TUẦN';
    if (!periods.length) { $('#hero-date').textContent = 'Chưa có kỳ báo cáo.'; return; }
    $('#period').innerHTML = periods.map((p) => `<option value="${p}">${dmy(p)}</option>`).join('');
    $('#period').onchange = () => setPeriod($('#period').value);
    $('#hero-date').textContent = `Kỳ gần nhất: ${dmy(periods[0])} · ${periods.length} kỳ đang lưu trữ`;
    $('#print-chi').onclick = () => { document.body.classList.add('print-chi'); window.print(); setTimeout(() => document.body.classList.remove('print-chi'), 500); };
    renderArchive();
    setPeriod(periods[0]);
  }
  load();
})();
