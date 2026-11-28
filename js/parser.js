// compressImageToDataURL 统一由 js/store.js 提供（store.js 先于 parser.js 加载），此处不再重复声明

function preprocessImageForLocalOCR(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = img.width < 1200 ? 2 : 1.3;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.filter = 'grayscale(100%) contrast(165%) brightness(105%)';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function parseShowsFromOCRText(rawText) {
  const year = new Date().getFullYear();
  let artist = 'ONER';
  if (rawText.includes('岳岳') || /PINKRAY/i.test(rawText)) artist = '岳岳';
  else if (rawText.includes('木子洋') || /KWIN/i.test(rawText)) artist = '木子洋';
  else if (rawText.includes('灵超') || /DIDI/i.test(rawText)) artist = '灵超';
  else if (rawText.includes('坤音')) artist = '坤音娱乐';

  const seriesMatch = rawText.match(/(chillparty\s*plus\+?|chillparty|[「《][^」》]+[」》])/i);
  const theme = seriesMatch ? seriesMatch[1].trim() : '';

  const rows = [];
  rawText.split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(line => {
    const d = line.match(/(?:(\d{4})[年\.\-\/])?(\d{1,2})[月\.\-\/](\d{1,2})[日号]?/);
    const c = line.match(/(北京|上海|广州|深圳|杭州|南京|合肥|西安|成都|重庆|武汉|长沙|苏州|天津|郑州|青岛|厦门|[\u4e00-\u9fa5]{2,4}站)/);
    if (d && c) {
      const y = d[1] || year;
      const m = d[2].padStart(2, '0');
      const day = d[3].padStart(2, '0');
      rows.push({
        artist,
        theme,
        city_or_title: c[1].endsWith('站') ? c[1] : `${c[1]}站`,
        date: `${y}-${m}-${day}`,
        venue: line.replace(c[0], '').trim().slice(0, 24)
      });
    }
  });

  if (rows.length >= 2) return rows;

  const singleDate = rawText.match(/(?:(\d{4})[年\.\-\/])?(\d{1,2})[月\.\-\/](\d{1,2})[日号]?/);
  const dateStr = singleDate ? `${singleDate[1] || year}-${singleDate[2].padStart(2, '0')}-${singleDate[3].padStart(2, '0')}` : '';
  return [{
    artist,
    theme,
    city_or_title: theme || '识别场次',
    date: dateStr,
    venue: ''
  }];
}

async function runPosterOCRRecognition() {
  const posterUrl = (document.getElementById('adm-poster')?.value || '').trim();
  if (!posterUrl) return alert('请先上传或填写海报图片！');

  const statusEl = document.getElementById('adm-ocr-status');
  const btn = document.getElementById('adm-ocr-btn');
  statusEl.classList.remove('hidden');
  btn.disabled = true;
  btn.textContent = '⏳ 识别中...';

const models = ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite'];
  const promptText = '识别海报或排期表中的演出场次，仅返回JSON数组：[{"artist":"","theme":"","city_or_title":"","date":"YYYY-MM-DD","venue":""}]';

  try {
    const apiKey = (localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim();
    let shows = [];
    let aiSucceeded = false;

    if (apiKey && posterUrl.startsWith('data:image/')) {
      const base64 = posterUrl.split(',')[1];
      const mime = posterUrl.split(';')[0].split(':')[1] || 'image/jpeg';

      for (const model of models) {
        statusEl.textContent = `🤖 正在尝试模型 ${model} 识别海报...`;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: promptText },
                { inline_data: { mime_type: mime, data: base64 } }
              ]
            }]
          })
        });
        if (resp.status === 404) continue;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const txt = json.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        shows = JSON.parse(txt.replace(/```json|```/gi, '').trim());
        aiSucceeded = true;
        break;
      }
    }

    if (!aiSucceeded) {
      if (typeof Tesseract === 'undefined') {
        throw new Error('AI 接口返回 404 且本地 OCR 未加载，请检查 AI 密钥或稍后再试');
      }
      statusEl.textContent = '🔍 AI 节点不可用，已自动切换本地中文 OCR 识别...';
      const enhanced = posterUrl.startsWith('data:image/') ? await preprocessImageForLocalOCR(posterUrl) : posterUrl;
      const res = await Tesseract.recognize(enhanced, 'chi_sim+eng');
      shows = parseShowsFromOCRText((res.data?.text || '').trim());
    }

    if (!Array.isArray(shows) || !shows.length) {
      statusEl.textContent = '⚠️ 未识别到明确场次，请手动填写。';
      return;
    }

    const first = shows[0];
    if (first.artist) document.getElementById('adm-artist').value = first.artist;
    document.getElementById('adm-title').value = first.theme && first.city_or_title && !first.city_or_title.includes(first.theme)
      ? `${first.theme} · ${first.city_or_title}`
      : (first.city_or_title || first.theme || '');
    if (first.date) document.getElementById('adm-date').value = first.date.slice(0, 10);
    if (first.venue) document.getElementById('adm-body').value = first.venue;

    renderOCRBatchList(shows);
    statusEl.textContent = `✅ 识别完成（共 ${shows.length} 场），请核对后保存。`;
  } catch (e) {
    statusEl.textContent = `❌ 识图失败：${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 识别海报场次';
  }
}


let ocrBatchDrafts = [];
function renderOCRBatchList(shows) {
  const box = document.getElementById('adm-ocr-batch-box');
  const listEl = document.getElementById('adm-ocr-batch-list');
  if (!box || !listEl) return;
  if (shows.length < 2) { box.classList.add('hidden'); return; }

  ocrBatchDrafts = shows.map((s, idx) => ({
    checked: true,
    artist: s.artist || 'ONER',
    title: s.theme && s.city_or_title && !s.city_or_title.includes(s.theme) ? `${s.theme} · ${s.city_or_title}` : (s.city_or_title || `场次 #${idx + 1}`),
    date: (s.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    venue: s.venue || '场馆待补充'
  }));

  listEl.innerHTML = ocrBatchDrafts.map((item, i) => `
    <label class="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-[11px]">
      <span class="flex items-center gap-1.5 truncate">
        <input type="checkbox" checked onchange="ocrBatchDrafts[${i}].checked = this.checked" />
        <strong>${item.title}</strong>
        <span class="text-slate-400">${item.date} · ${item.venue}</span>
      </span>
    </label>
  `).join('');
  box.classList.remove('hidden');
}

async function importOCRBatchShows() {
  const chosen = ocrBatchDrafts.filter(x => x.checked);
  if (!chosen.length) return alert('请先勾选要导入的场次');
  const type = document.getElementById('adm-type').value === 'archive' ? 'archive' : 'ticket';
  const posterUrl = document.getElementById('adm-poster').value.trim();

  const payloads = chosen.map(item => type === 'archive'
    ? {
        title: `ARCHIVE|${item.artist}|${item.title}|${item.date}`,
        ticket_time: `${item.date}T19:30`,
        platform: `ARCHIVE:${JSON.stringify({ subType: 'tour', venue: item.venue, posterUrl, theme: normalizeSeriesKey(item.title) })}`,
        url: ''
      }
    : {
        title: `${item.artist}|${item.title}|${item.venue}|${item.date}|`,
        ticket_time: `${item.date}T19:30`,
        platform: `META:${JSON.stringify({ rounds: [], posterUrl, theme: normalizeSeriesKey(item.title) })}`,
        url: ''
      }
  );

  try {
    for (const payload of payloads) {
      await adminApi('createTicket', payload);
    }
  } catch (e) {
    return alert(`批量导入失败：${e.message}`);
  }
  document.getElementById('adm-ocr-batch-box').classList.add('hidden');
  alert(`已成功导入 ${payloads.length} 场演出！`);
  await loadTourData();
}

// ================= 音乐节时间表 OCR：识别 ONER / 成员上台时段 =================
function normalizeOCRSlotText(text) {
  return String(text || '')
    .replace(/[：]/g, ':')
    .replace(/[．]/g, '.')
    .replace(/[ \t\u00a0]+/g, ' ');
}

function normalizeSlotClock(matchA, matchB) {
  const pad = v => {
    const [h, m] = String(v).split(/[:.]/);
    return `${String(h).padStart(2, '0')}:${String(m || '00').padStart(2, '0')}`;
  };
  if (matchB) return `${pad(matchA)}-${pad(matchB)}`;
  return pad(matchA);
}

// 从 OCR 全文中找「关键词所在行（或邻近行）」的时间段
// 兼容双行堆叠时间表：开始时间在上、结束时间在下、中间无横杠（如 18:00 / 18:40 上下两行）
function parseArtistTimeSlotFromOCRText(rawText) {
  const text = normalizeOCRSlotText(rawText);
  if (!text) return '';
  const keywords = ['ONER', '岳岳', '木子洋', '灵超', 'PINKRAY', 'KWIN', 'DIDI'];
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const rangeRe = /(\d{1,2}[:.]\d{2})\s*(?:-|~|—|–|至|to)\s*(\d{1,2}[:.]\d{2})/i;
  const singleRe = /(\d{1,2}[:.]\d{2})/g;
  const collectClocks = raw => {
    const out = [];
    let m;
    const re = new RegExp(singleRe.source, 'g');
    while ((m = re.exec(raw)) !== null) out.push(m[1]);
    return out;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!keywords.some(k => line.toUpperCase().includes(k.toUpperCase()))) continue;
    const range = line.match(rangeRe);
    if (range) return normalizeSlotClock(range[1], range[2]);
    // 上下堆叠 / 邻近两行：把关键词行及其后 2 行拼成窗口，优先取完整区间
    const windowLines = [line, lines[i + 1] || '', lines[i + 2] || ''];
    const windowText = windowLines.join(' ');
    const nearRange = windowText.match(rangeRe);
    if (nearRange) return normalizeSlotClock(nearRange[1], nearRange[2]);
    // 无横杠：窗口内相邻两个独立时间点自动拼接为区间（18:00 + 18:40 => 18:00-18:40）
    const clocks = collectClocks(windowText);
    if (clocks.length >= 2) return normalizeSlotClock(clocks[0], clocks[1]);
    const single = line.match(singleRe);
    if (single) return normalizeSlotClock(single[0]);
  }
  // 全文兜底：先找区间，再找上下相邻的两个时间点
  const globalRange = text.match(rangeRe);
  if (globalRange) return normalizeSlotClock(globalRange[1], globalRange[2]);
  const allClocks = collectClocks(text);
  if (allClocks.length >= 2 && allClocks[0] !== allClocks[1]) {
    return normalizeSlotClock(allClocks[0], allClocks[1]);
  }
  return '';
}

function loadImageAsDataURL(src) {
  return new Promise(resolve => {
    if (!/^https?:/i.test(String(src || ''))) return resolve(src);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

async function recognizeTimetableSlot(dataUrl) {
  if (!dataUrl) return '';
  if (typeof Tesseract === 'undefined') return '';
  const normalizedSrc = await loadImageAsDataURL(dataUrl);
  const enhanced = /^data:image\//i.test(normalizedSrc)
    ? await preprocessImageForLocalOCR(normalizedSrc).catch(() => normalizedSrc)
    : normalizedSrc;
  const res = await Tesseract.recognize(enhanced, 'chi_sim+eng');
  return parseArtistTimeSlotFromOCRText(res && res.data ? res.data.text : '');
}
