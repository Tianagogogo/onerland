/* ================= 📣 应援词典：应援口令速查 + 本地熟练度标签 + 长图 / PDF 导出 =================
   规范：
   1) 熟练度标签只存本机 localStorage，匿名、无需登录，再次点击同一标签即取消；
   2) 长图走纯 Canvas 2D（devicePixelRatio ≥ 2），不引用任何跨域图片；
   3) PDF 走原生 window.print() + 专用打印排版，无第三方库。
   文案与配色统一复用站内浅银灰 / 暖红琥珀体系。 */

// ===== 曲目数据（应援口令速查，非完整歌词；chant=true 为高亮跟喊行）=====
const CHANT_SONGS = [
  {
    id: 'rgnyyzgy',
    title: '如果你也这样过',
    album: 'ONER · 收录曲',
    category: '全场大合唱',
    tip: '副歌前奏有一拍空档，跟喊要卡在鼓点上',
    lines: [
      { text: '前奏 · 灯光转暗时保持安静，等第一句起拍', chant: false },
      { text: '第一段主歌 · 只在句尾轻跟「ONER」', chant: true },
      { text: '预副歌 · 全员抬手应援棒调成常亮白', chant: false },
      { text: '副歌第一遍 ·「如果你也这样过」整句跟唱', chant: true },
      { text: '副歌第二遍 · 尾字拖长两拍，别抢拍', chant: true },
      { text: '间奏 · 喊口号「ONER！ONER！」三遍', chant: true },
      { text: '最后一遍副歌 · 收尾静音一拍再鼓掌', chant: false }
    ]
  },
  {
    id: 'cunzai',
    title: '存在感',
    album: 'ONER · 主打',
    category: '节奏跟喊',
    tip: '这首歌的应援点密集，建议先跟着节拍器练 3 遍',
    lines: [
      { text: '开场鼓点 4 拍 · 第 3 拍起喊「存在感」', chant: true },
      { text: '主歌 · 每句尾字跟喊一次，音量压在主唱之下', chant: true },
      { text: '预副歌 · 应援棒切成呼吸闪', chant: false },
      { text: '副歌 · 整句跟唱，尾字结束后立刻收声', chant: true },
      { text: '桥段 · 只保留鼓点，安静听清人声', chant: false },
      { text: '末段副歌 · 跟唱 + 抬手比手势', chant: true }
    ]
  },
  {
    id: 'power',
    title: 'POWER',
    album: 'ONER · 舞台常驻',
    category: '高燃应援',
    tip: '高音段落不要跟着吼，容易压住现场收音',
    lines: [
      { text: '前奏 · 跟着低频节奏跺脚，不要提前喊', chant: false },
      { text: '第一段 ·「POWER」出现时短促跟喊一次', chant: true },
      { text: '副歌 · 整段跟唱，句间换气不拖音', chant: true },
      { text: '舞段落 · 只打拍子不出声', chant: false },
      { text: '尾段 · 三连「POWER」逐次加强，最后一拍同时收', chant: true }
    ]
  },
  {
    id: 'attention',
    title: 'Attention',
    album: 'ONER · 收录曲',
    category: '轻跟唱',
    tip: '适合新手的第一首，节奏慢、留白多',
    lines: [
      { text: '前奏 · 安静等第一句', chant: false },
      { text: '主歌 · 每句结尾跟「Attention」', chant: true },
      { text: '副歌 · 整句跟唱，不要抢半拍', chant: true },
      { text: '间奏 · 应援棒调成慢速摆动', chant: false },
      { text: '尾声 · 最后一句只挥手不喊', chant: false }
    ]
  },
  {
    id: 'tianma',
    title: '天马行空',
    album: 'ONER · 收录曲',
    category: '全场大合唱',
    tip: '副歌音区偏高，用气声跟更容易合上',
    lines: [
      { text: '前奏钢琴 · 保持安静', chant: false },
      { text: '第一遍副歌 · 轻声跟唱', chant: true },
      { text: '第二遍副歌 · 全场放开音量', chant: true },
      { text: '桥段 · 只留人声，别加口号', chant: false },
      { text: '收尾 · 最后一个字拖长后一起停', chant: true }
    ]
  },
  {
    id: 'wutiaojian',
    title: '无条件',
    album: 'ONER · 抒情曲',
    category: '抒情跟唱',
    tip: '抒情段落不需要口号，跟唱要轻',
    lines: [
      { text: '前奏 · 应援棒常亮暖白', chant: false },
      { text: '主歌 · 句尾轻跟两个字', chant: true },
      { text: '副歌 · 整段轻跟唱，音量低于主唱', chant: true },
      { text: '间奏 · 不出声，只挥手', chant: false },
      { text: '末段 · 跟唱到最后一个字一起收', chant: true }
    ]
  },
  {
    id: 'guomin',
    title: '过敏',
    album: 'ONER · 节奏曲',
    category: '节奏跟喊',
    tip: '鼓点切分多，先数清 8 拍再跟',
    lines: [
      { text: '前奏 8 拍 · 第 5 拍起喊「过敏」', chant: true },
      { text: '主歌 · 每两小节跟一次', chant: true },
      { text: '预副歌 · 只打拍子', chant: false },
      { text: '副歌 · 整句跟唱 + 手势', chant: true },
      { text: '尾奏 · 跟随鼓点逐渐收声', chant: false }
    ]
  },
  {
    id: 'ehren',
    title: '恶人',
    album: 'ONER · 舞台常驻',
    category: '高燃应援',
    tip: '低音段落适合男声跟喊，女声用气声',
    lines: [
      { text: '开场 · 等低频第一下再喊', chant: false },
      { text: '主歌 ·「恶人」两字短促跟喊', chant: true },
      { text: '副歌 · 整段跟唱，注意句尾收干净', chant: true },
      { text: '舞段落 · 只打拍子不出声', chant: false },
      { text: '尾段 · 三连跟喊后一起停', chant: true }
    ]
  }
];

// 熟练度（仅本机）
const CHANT_DIFFICULTY_KEY = 'onerland_chant_difficulty';
const CHANT_DIFFICULTIES = [
  { key: 'easy', label: '🌱 新手入门', short: '🌱 新手', toast: '🌱 新手入门' },
  { key: 'medium', label: '🔥 进阶跟喊', short: '🔥 进阶', toast: '🔥 进阶跟喊' },
  { key: 'mastered', label: '👑 倒背如流', short: '👑 熟记', toast: '👑 倒背如流' }
];

const chantState = {
  filter: 'all',
  activeId: ''
};

function getChantDifficultyMap() {
  try {
    const raw = localStorage.getItem(CHANT_DIFFICULTY_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    return {};
  }
}

function saveChantDifficultyMap(map) {
  try {
    localStorage.setItem(CHANT_DIFFICULTY_KEY, JSON.stringify(map || {}));
    return true;
  } catch (e) {
    return false;
  }
}

function getChantDifficulty(songId) {
  const map = getChantDifficultyMap();
  const val = map[String(songId || '')];
  return CHANT_DIFFICULTIES.some(d => d.key === val) ? val : '';
}

function setChantDifficulty(songId, level) {
  const id = String(songId || '');
  if (!id) return '';
  const map = getChantDifficultyMap();
  const next = map[id] === level ? '' : level;
  if (next) map[id] = next;
  else delete map[id];
  saveChantDifficultyMap(map);
  return next;
}

function chantDifficultyMeta(key) {
  return CHANT_DIFFICULTIES.find(d => d.key === key) || null;
}

// ===== 列表视图 =====
function renderChantFilterBar() {
  const box = document.getElementById('chant-difficulty-filter');
  if (!box) return;
  const map = getChantDifficultyMap();
  const unmarked = CHANT_SONGS.filter(s => !map[s.id]).length;
  const options = [
    { key: 'all', label: '全部难度', count: CHANT_SONGS.length },
    ...CHANT_DIFFICULTIES.map(d => ({ key: d.key, label: d.label, count: CHANT_SONGS.filter(s => map[s.id] === d.key).length })),
    { key: 'unset', label: '未标记', count: unmarked }
  ];
  box.innerHTML = `
    <span class="chant-filter-label">我的熟练度</span>
    ${options.map(opt => `<button type="button" class="chant-filter-chip ${chantState.filter === opt.key ? 'is-active' : ''}" data-chant-filter="${opt.key}" onclick="setChantFilter('${opt.key}')">${travelEsc(opt.label)}<span class="chant-filter-count">${opt.count}</span></button>`).join('')}
  `;
}

function chantSongCardHtml(song) {
  const level = getChantDifficulty(song.id);
  const meta = chantDifficultyMeta(level);
  const chantCount = song.lines.filter(l => l.chant).length;
  return `
    <button type="button" class="chant-song-card" onclick="openChantSong('${song.id}')">
      <span class="chant-song-main">
        <span class="chant-song-title">${travelEsc(song.title)}</span>
        <span class="chant-song-meta">${travelEsc(song.album)} · ${travelEsc(song.category)}</span>
        <span class="chant-song-sub">🎯 ${chantCount} 处跟喊点</span>
      </span>
      ${meta ? `<span class="chant-song-level is-${meta.key}" title="我的熟练度：${travelEsc(meta.label)}">${travelEsc(meta.short)}</span>` : ''}
    </button>`;
}

function renderChantPage() {
  const listView = document.getElementById('chant-list-view');
  const detailView = document.getElementById('chant-detail-view');
  if (!listView || !detailView) return;

  if (chantState.activeId) {
    const song = CHANT_SONGS.find(s => s.id === chantState.activeId);
    if (song) {
      listView.classList.add('hidden');
      detailView.classList.remove('hidden');
      if (!detailView.dataset.song || detailView.dataset.song !== song.id) renderChantDetail(song);
      return;
    }
    chantState.activeId = '';
  }

  detailView.classList.add('hidden');
  listView.classList.remove('hidden');
  renderChantFilterBar();

  const map = getChantDifficultyMap();
  const songs = CHANT_SONGS.filter(song => {
    if (chantState.filter === 'all') return true;
    if (chantState.filter === 'unset') return !map[song.id];
    return map[song.id] === chantState.filter;
  });
  const grid = document.getElementById('chant-song-grid');
  if (!grid) return;
  grid.innerHTML = songs.length
    ? songs.map(chantSongCardHtml).join('')
    : `<div class="chant-empty">该熟练度下还没有曲目，去详情页给歌曲打个标记吧～</div>`;
}

function setChantFilter(key) {
  chantState.filter = String(key || 'all');
  renderChantPage();
}

function openChantSong(songId) {
  chantState.activeId = String(songId || '');
  renderChantPage();
  const box = document.getElementById('view-chant-page');
  if (box && typeof box.scrollIntoView === 'function') {
    try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
  }
}

function closeChantDetail() {
  chantState.activeId = '';
  renderChantPage();
}

// ===== 详情视图 =====
function chantDifficultyChipsHtml(song) {
  const level = getChantDifficulty(song.id);
  return CHANT_DIFFICULTIES.map(d => `
    <button type="button" class="chant-level-chip ${level === d.key ? 'is-active' : ''}" aria-pressed="${level === d.key ? 'true' : 'false'}"
      data-chant-level="${d.key}" onclick="toggleChantDifficulty('${song.id}', '${d.key}')">${travelEsc(d.label)}</button>`).join('');
}

function chantLinesHtml(song) {
  return song.lines.map(line => line.chant
    ? `<p class="chant-line is-chant"><span class="chant-line-mark">应援</span>${travelEsc(line.text)}</p>`
    : `<p class="chant-line">${travelEsc(line.text)}</p>`).join('');
}

function renderChantDetail(song) {
  const box = document.getElementById('chant-detail-view');
  if (!box) return;
  box.dataset.song = song.id;
  const level = getChantDifficulty(song.id);
  const meta = chantDifficultyMeta(level);
  box.innerHTML = `
    <div class="chant-detail-card">
      <div class="chant-detail-head">
        <button type="button" class="chant-back-btn" onclick="closeChantDetail()">← 返回曲目</button>
        <span class="chant-detail-tip">💾 熟练度只存本机 · 无需登录</span>
      </div>
      <h3 class="chant-detail-title">${travelEsc(song.title)}</h3>
      <p class="chant-detail-meta">${travelEsc(song.album)} · ${travelEsc(song.category)}</p>
      <div class="chant-level-row" id="chant-level-row">${chantDifficultyChipsHtml(song)}</div>
      ${meta ? `<p class="chant-level-hint">当前标记：${travelEsc(meta.label)}（再次点击该标签可取消）</p>` : `<p class="chant-level-hint">尚未标记熟练度，点击上方标签即可记录</p>`}
      <div class="chant-detail-legend">
        <span class="chant-legend-swatch"></span> 高亮部分为粉丝应援词
        ${song.tip ? `<span class="chant-legend-tip">💡 ${travelEsc(song.tip)}</span>` : ''}
      </div>
      <div class="chant-lyrics">${chantLinesHtml(song)}</div>
      <div class="chant-detail-actions">
        <button type="button" class="chant-action-btn" onclick="copyChantLyrics('${song.id}')">📋 复制本首应援词</button>
        <button type="button" class="chant-action-btn is-primary" onclick="saveChantLongImage('${song.id}')">🖼️ 保存长图</button>
        <button type="button" class="chant-action-btn" onclick="exportChantPdf('${song.id}')">📄 导出 PDF</button>
      </div>
    </div>
  `;
}

function toggleChantDifficulty(songId, level) {
  const next = setChantDifficulty(songId, level);
  const song = CHANT_SONGS.find(s => s.id === songId);
  const meta = chantDifficultyMeta(next);
  if (meta) {
    if (typeof showToast === 'function') showToast(`已标记为「${meta.toast}」`);
  } else if (typeof showToast === 'function') {
    showToast('已取消该曲的熟练度标记');
  }
  if (song) {
    const row = document.getElementById('chant-level-row');
    const hint = document.querySelector('.chant-level-hint');
    if (row) row.innerHTML = chantDifficultyChipsHtml(song);
    if (hint) {
      hint.textContent = meta ? `当前标记：${meta.label}（再次点击该标签可取消）` : '尚未标记熟练度，点击上方标签即可记录';
    }
  }
  renderChantFilterBar();
}

function chantPlainText(song) {
  if (!song) return '';
  const head = `📣 ${song.title} · ${song.album} · ${song.category}`;
  const body = song.lines.map(line => line.chant ? `【应援】${line.text}` : line.text).join('\n');
  return `${head}\n\n${body}\n\nONERLAND · ONER时光典藏纪念册`;
}

function copyChantLyrics(songId) {
  const song = CHANT_SONGS.find(s => s.id === songId);
  if (!song) return;
  const text = chantPlainText(song);
  const done = () => { if (typeof showToast === 'function') showToast('已复制本首应援词'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopyChant(text, done));
  } else {
    fallbackCopyChant(text, done);
  }
}

function fallbackCopyChant(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok && typeof done === 'function') done();
    else if (typeof toastError === 'function') toastError('复制失败，请手动选择文字复制');
  } catch (e) {
    if (typeof toastError === 'function') toastError('复制失败，请手动选择文字复制');
  }
}

// ===== 🖼️ 长图：纯 Canvas 2D 矢量排版（DPR ≥ 2）=====
function chantWrapLines(ctx, text, maxWidth) {
  const chars = Array.from(String(text || ''));
  const lines = [];
  let current = '';
  chars.forEach(ch => {
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function chantRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function buildChantLongImage(song) {
  if (!song) return '';
  const dpr = Math.max(2, Math.min(3, Math.round((window.devicePixelRatio || 1) * 1.5)));
  const W = 900;
  const padX = 64;
  const innerW = W - padX * 2;
  const measure = document.createElement('canvas').getContext('2d');

  const titleFont = '700 44px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const metaFont = '400 24px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const bodyFont = '400 28px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const legendFont = '500 22px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  measure.font = bodyFont;
  const blocks = song.lines.map(line => ({
    chant: !!line.chant,
    wrapped: chantWrapLines(measure, line.text, line.chant ? innerW - 44 : innerW)
  }));

  const headTop = 92;
  const metaY = headTop + 66;
  const legendY = metaY + 54;
  const bodyStart = legendY + 56;
  const bodyLineH = 48;
  let cursor = bodyStart;
  blocks.forEach(b => {
    cursor += b.chant ? 18 : 0;
    cursor += b.wrapped.length * bodyLineH;
    cursor += 16;
  });
  const footY = cursor + 24;
  const H = Math.round(footY + 78);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 底色：浅色高对比阅读纸感
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fdfdfb');
  bg.addColorStop(0.55, '#f7f7f4');
  bg.addColorStop(1, '#eef0f3');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 顶部暖色细线 + 标题
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(padX, headTop - 34, 64, 6);

  ctx.fillStyle = '#1f2937';
  ctx.font = titleFont;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(song.title, padX, headTop + 20);

  ctx.fillStyle = '#6b7280';
  ctx.font = metaFont;
  ctx.fillText(`${song.album} · ${song.category}`, padX, metaY);

  // 图例
  ctx.fillStyle = 'rgba(214, 122, 60, 0.22)';
  chantRoundRect(ctx, padX, legendY - 18, 92, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#9a3b1f';
  ctx.font = legendFont;
  ctx.fillText('应援词', padX + 14, legendY + 4);
  ctx.fillStyle = '#6b7280';
  ctx.fillText('高亮部分为粉丝应援词', padX + 108, legendY + 4);

  // 正文
  ctx.font = bodyFont;
  let y = bodyStart + bodyLineH - 12;
  blocks.forEach(b => {
    if (b.chant) {
      const blockH = b.wrapped.length * bodyLineH + 6;
      ctx.fillStyle = 'rgba(224, 122, 63, 0.16)';
      chantRoundRect(ctx, padX - 14, y - bodyLineH + 6, innerW + 28, blockH, 12);
      ctx.fill();
    }
    ctx.fillStyle = b.chant ? '#9a3412' : '#374151';
    b.wrapped.forEach(textLine => {
      ctx.fillText(textLine, padX, y);
      y += bodyLineH;
    });
    y += b.chant ? 30 : 16;
  });

  // 底部水印
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, footY - 8);
  ctx.lineTo(W - padX, footY - 8);
  ctx.stroke();
  ctx.fillStyle = '#9ca3af';
  ctx.font = '400 20px "PingFang SC", "Hiragino Sans GB", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ONERLAND · ONER时光典藏纪念册', W / 2, footY + 30);
  ctx.textAlign = 'left';

  try {
    return canvas.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

function chantDataUrlToFile(dataUrl, fileName) {
  try {
    const parts = String(dataUrl).split(',');
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const bin = atob(parts[1] || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], fileName, { type: mime });
  } catch (e) {
    return null;
  }
}

function saveChantLongImage(songId) {
  const song = CHANT_SONGS.find(s => s.id === songId);
  if (!song) return;
  const dataUrl = buildChantLongImage(song);
  if (!dataUrl) {
    if (typeof toastError === 'function') toastError('长图生成失败，请刷新页面后重试');
    return;
  }
  window.__chantImageDataUrl = dataUrl;
  window.__chantImageName = `ONERLAND-应援词-${song.title}-${Date.now()}.png`;
  openChantImageModal(dataUrl, song);
}

function openChantImageModal(dataUrl, song) {
  document.getElementById('chant-image-modal')?.remove();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canShareFiles = typeof navigator.canShare === 'function' && typeof File === 'function';
  const modal = document.createElement('div');
  modal.id = 'chant-image-modal';
  modal.className = 'ticket-save-overlay chant-image-overlay';
  modal.innerHTML = `
    <div class="ticket-save-card chant-image-card" role="dialog" aria-modal="true" aria-label="应援词长图已生成">
      <button type="button" class="ticket-save-close" aria-label="关闭" onclick="closeChantImageModal()">✕</button>
      <div class="ticket-save-title">🖼️ 应援词长图已生成 · ${travelEsc(song ? song.title : '')}</div>
      <div class="ticket-save-imgbox chant-image-box">
        <img src="${dataUrl}" alt="ONERLAND 应援词长图" style="width:100%;display:block;border-radius:14px;-webkit-touch-callout:default" />
      </div>
      <p class="ticket-save-hint">📱 长按图片即可保存到相册${isIOS ? '（Safari：长按后选「存储到“照片”」）' : '；桌面端可右键「将图像存储为…」'}</p>
      <div class="ticket-save-actions">
        ${canShareFiles ? `<button type="button" class="ticket-save-share" onclick="shareChantImage()">📤 系统分享 / 存图</button>` : `<button type="button" class="ticket-save-share" onclick="downloadChantImage()">⬇️ 下载长图</button>`}
        <button type="button" class="ticket-save-done" onclick="closeChantImageModal()">完成</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', ev => { if (ev.target === modal) closeChantImageModal(); });
  document.body.appendChild(modal);
}

function closeChantImageModal() {
  const el = document.getElementById('chant-image-modal');
  if (!el) return;
  el.classList.add('is-hiding');
  setTimeout(() => el.remove(), 200);
}

function downloadChantImage() {
  const dataUrl = window.__chantImageDataUrl;
  if (!dataUrl) return;
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = window.__chantImageName || `ONERLAND-应援词-${Date.now()}.png`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    if (typeof toastError === 'function') toastError('下载失败，请长按图片保存');
  }
}

async function shareChantImage() {
  const dataUrl = window.__chantImageDataUrl;
  if (!dataUrl) return;
  const file = chantDataUrlToFile(dataUrl, window.__chantImageName || `ONERLAND-应援词-${Date.now()}.png`);
  if (!file || typeof navigator.share !== 'function') {
    downloadChantImage();
    if (typeof showToast === 'function') showToast('当前浏览器不支持直接分享，已尝试下载长图');
    return;
  }
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      downloadChantImage();
      return;
    }
    await navigator.share({ files: [file], title: 'ONERLAND 应援词长图' });
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    downloadChantImage();
    if (typeof toastError === 'function') toastError('分享未完成，已尝试下载长图');
  }
}

// ===== 📄 导出 PDF：原生 print + 专用打印排版 =====
function buildChantPrintRoot(song) {
  const root = document.createElement('div');
  root.id = 'chant-print-root';
  root.className = 'chant-print-root';
  root.innerHTML = `
    <div class="chant-print-head">
      <div class="chant-print-brand">ONERLAND · 应援词典</div>
      <h1 class="chant-print-title">${travelEsc(song.title)}</h1>
      <p class="chant-print-meta">${travelEsc(song.album)} · ${travelEsc(song.category)}</p>
    </div>
    <div class="chant-print-legend"><span class="chant-print-swatch"></span> 高亮部分为粉丝应援词</div>
    <div class="chant-print-lines">
      ${song.lines.map(line => line.chant
        ? `<p class="chant-print-line is-chant">${travelEsc(line.text)}</p>`
        : `<p class="chant-print-line">${travelEsc(line.text)}</p>`).join('')}
    </div>
    <div class="chant-print-foot">ONERLAND · ONER时光典藏纪念册 · 本页仅供线下应援学习使用</div>
  `;
  return root;
}

function cleanupChantPrint() {
  document.body.classList.remove('chant-printing');
  document.body.style.overflow = '';
  document.getElementById('chant-print-root')?.remove();
  window.removeEventListener('afterprint', cleanupChantPrint);
}

function exportChantPdf(songId) {
  const song = CHANT_SONGS.find(s => s.id === songId);
  if (!song) return;
  cleanupChantPrint();
  const modal = document.getElementById('chant-image-modal');
  if (modal) modal.classList.add('is-hiding');
  const root = buildChantPrintRoot(song);
  document.body.appendChild(root);
  document.body.classList.add('chant-printing');
  window.addEventListener('afterprint', cleanupChantPrint);
  if (typeof showToast === 'function') {
    showToast('已打开打印面板：桌面选「另存为 PDF」，iOS 双指放大后存储到「文件」');
  }
  // 等待样式应用后再唤起打印，避免 Safari 首帧空白
  setTimeout(() => {
    try {
      window.print();
    } catch (e) {
      if (typeof toastError === 'function') toastError('当前浏览器不支持直接打印，请换用系统浏览器');
      cleanupChantPrint();
      return;
    }
    setTimeout(cleanupChantPrint, 60000);
  }, 120);
}

window.renderChantPage = renderChantPage;
window.setChantFilter = setChantFilter;
window.openChantSong = openChantSong;
window.closeChantDetail = closeChantDetail;
window.toggleChantDifficulty = toggleChantDifficulty;
window.copyChantLyrics = copyChantLyrics;
window.saveChantLongImage = saveChantLongImage;
window.openChantImageModal = openChantImageModal;
window.closeChantImageModal = closeChantImageModal;
window.shareChantImage = shareChantImage;
window.downloadChantImage = downloadChantImage;
window.exportChantPdf = exportChantPdf;
window.getChantDifficultyMap = getChantDifficultyMap;
