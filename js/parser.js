function cleanSocialPostText(rawText) {
  if (!rawText) return '';
  let text = rawText
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[?(?:图片|视频|微博视频|查看图片|网页链接|秒拍视频|直播|超话|绿洲图片)\]?/g, '')
    .replace(/[\s\S]*?请领取你的小票\s*/g, '')
    .replace(/[「“"]?\.\.\.把文本复制下来[\s\S]*/g, '')
    .replace(/复制打开抖音[\s\S]*|小红书App[\s\S]*|长按复制此条消息[\s\S]*|打开小红书查看[\s\S]*|打开抖音搜索[\s\S]*/g, '')
    .replace(/[0-9a-zA-Z]{8,12}\s*$/g, '')
    .trim();

  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const l1 = lines[0].replace(/[\s\.…。，,!！?？]/g, '');
    const l2 = lines[1].replace(/[\s\.…。，,!！?？]/g, '');
    if (l1 && l2 && (l1 === l2 || l2.startsWith(l1) || l1.startsWith(l2))) {
      lines.splice(0, 1);
    }
  }
  return lines.join(' ');
}

function extractVenueFromText(text) {
  const labelMatch = text.match(/(?:演出地点|演出场馆|活动地点|举办地点|场馆|场地|地址|地点|📍)\s*[：:]?\s*([^\n\r！!。⏰🗓️]+)/);
  if (labelMatch && labelMatch[1].trim().length >= 2) return labelMatch[1].trim();
  const venueRegex = /([\u4e00-\u9fa5A-Za-z0-9·\-\s]{2,28}(?:Live\s*House|LIVE\s*HOUSE|livehouse|OMNI\s*SPACE|HOU\s*LIVE|万代南梦宫|疆进酒|育音堂|声音共和|太空间|纽空间|正火艺术中心|稻香音乐空间|达丰空间|红节奏|不晚|体育中心体育馆|体育中心|体育馆|体育场|演艺中心|文化中心|大剧院|艺术中心|展览中心|会展中心|ECM中心|音乐广场|草坪|公园|营地|度假区|博览园|赛车场|沙滩|生态岛|嬉戏谷))/i;
  const m = text.match(venueRegex);
  return m ? m[1].trim() : '';
}

function extractShowDateRange(text, currentYear) {
  const rangeMatch = text.match(/(?:演出时间|演出日期|活动时间|时间)?\s*[：:]?\s*(?:(\d{4})[年\.\-\/])?(\d{1,2})[月\.\-\/](\d{1,2})[日号]?\s*(?:[（(][^）)]+[）)])?\s*(?:[-~—至、和&]\s*(?:(\d{1,2})[月\.\-\/])?(\d{1,2})[日号]?)/);
  if (rangeMatch) {
    const y = rangeMatch[1] || currentYear;
    const m1 = rangeMatch[2].padStart(2, '0');
    const d1 = rangeMatch[3].padStart(2, '0');
    const m2 = (rangeMatch[4] || rangeMatch[2]).padStart(2, '0');
    const d2 = rangeMatch[5].padStart(2, '0');
    return `${y}-${m1}-${d1} ~ ${m2}-${d2} (连演2天)`;
  }
  const singleMatch = text.match(/(?:演出时间|演出日期|活动时间|时间)[：:]\s*(?:(\d{4})[年\.\-\/])?(\d{1,2})[月\.\-\/](\d{1,2})[日号]?\s*(?:[（(]?(周[一二三四五六日天]|星期[一二三四五六日天])[）)]?)?/);
  if (singleMatch) {
    const y = singleMatch[1] || currentYear;
    const mo = singleMatch[2].padStart(2, '0');
    const da = singleMatch[3].padStart(2, '0');
    const wk = singleMatch[4] ? ` (${singleMatch[4]})` : '';
    return `${y}-${mo}-${da}${wk}`;
  }
  return '';
}

function extractStartTime(text) {
  const labelMatch = text.match(/(?:开场时间|演出开始|开演时间)[：:]?\s*([^\n\r！!。]+)/);
  if (labelMatch) return labelMatch[1].trim();
  const showLine = text.match(/(?:演出时间|演出日期)[：:]\s*([^\n\r]+)/);
  if (showLine) {
    const tMatch = showLine[1].match(/(?:每晚|每日|下午|晚上|晚)?\s*(\d{1,2}[:：]\d{2})/);
    if (tMatch) return `${tMatch[1].replace('：', ':')} 开场`;
  }
  return '';
}

function parseDateFromSnippet(snippet, currentYear) {
  const dateRegex = /(?:(\d{4})[年\.\-\/])?(\d{1,2})[月\.\-\/](\d{1,2})[日号]?\s*(?:[（(]?(?:周[一二三四五六日天]|星期[一二三四五六日天])[）)]?)?\s*(?:上午|中午|下午|晚上)?\s*(\d{1,2})[:：点时](\d{1,2})?/;
  const m = snippet.match(dateRegex);
  if (!m) return '';
  const year = m[1] || currentYear;
  const month = m[2].padStart(2, '0');
  const day = m[3].padStart(2, '0');
  let hour = parseInt(m[4], 10);
  if ((snippet.includes('下午') || snippet.includes('晚上')) && hour < 12) hour += 12;
  const minute = (m[5] || '00').padStart(2, '0');
  return `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}`;
}

function compressImageToDataURL(file, maxWidth = 760, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

function parseMultiShowsFromPlainText(rawText) {
  const currentYear = new Date().getFullYear();
  const themeMatch = rawText.match(/[「《]([^」》]+)[」》]\s*(巡回演唱会|演唱会|巡演|音乐节|嘉年华)?/);
  const defaultTheme = themeMatch ? `「${themeMatch[1]}」${themeMatch[2] || '巡回演唱会'}` : '';

  let artist = 'ONER';
  if (rawText.includes('岳岳') || rawText.includes('PINKRAY')) artist = '岳岳';
  else if (rawText.includes('木子洋') || rawText.includes('KWIN')) artist = '木子洋';
  else if (rawText.includes('灵超') || rawText.includes('DIDI')) artist = '灵超';
  else if (rawText.includes('坤音')) artist = '坤音娱乐';

  const lines = rawText.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const multiRows = [];
  lines.forEach(line => {
    const dMatch = line.match(/(?:(\d{4})[年\.\-\/])?(\d{1,2})[月\.\-\/](\d{1,2})[日号]?/);
    const cMatch = line.match(/(北京|上海|广州|深圳|杭州|南京|合肥|西安|成都|重庆|武汉|长沙|苏州|天津|郑州|青岛|厦门|福州|宁波|昆明|沈阳|大连|哈尔滨|济南|太原|石家庄|南昌|贵阳|南宁|海口|三亚|珠海|佛山|东莞|无锡|常州|温州|兰州|乌鲁木齐|呼和浩特|[\u4e00-\u9fa5]{2,4}站)/);
    if (dMatch && cMatch) {
      const y = dMatch[1] || currentYear;
      const mo = dMatch[2].padStart(2, '0');
      const da = dMatch[3].padStart(2, '0');
      const cityLabel = cMatch[1].endsWith('站') ? cMatch[1] : `${cMatch[1]}站`;
      multiRows.push({
        artist,
        theme: defaultTheme,
        city_or_title: cityLabel,
        date: `${y}-${mo}-${da}`,
        venue: extractVenueFromText(line),
        prices: '',
        slot: '',
        type: /音乐节|嘉年华/.test(line + rawText) ? 'festival' : 'tour'
      });
    }
  });
  if (multiRows.length >= 2) return multiRows;

  const singleDateMatch = rawText.match(/(?:(\d{4})[年\.\-\/])?(\d{1,2})[月\.\-\/](\d{1,2})[日号]?/);
  const singleDate = singleDateMatch ? `${singleDateMatch[1] || currentYear}-${singleDateMatch[2].padStart(2, '0')}-${singleDateMatch[3].padStart(2, '0')}` : '';
  const cityMatch = rawText.match(/[「【\[]?([\u4e00-\u9fa5]{2,5}站)[」】\]]?/);
  const priceNums = [...rawText.matchAll(/(?:￥|RMB|¥)?\s*(\d{3,4})\s*(?:元)?/g)]
    .map(m => Number(m[1]))
    .filter(n => n >= 180 && n <= 2980 && n !== 2024 && n !== 2025 && n !== 2026);
  const uniquePrices = [...new Set(priceNums)].sort((a, b) => a - b);
  const slotMatch = rawText.match(/\b(\d{1,2}:\d{2}\s*[-~—至]\s*\d{1,2}:\d{2})\b/);

  return [{
    artist,
    theme: defaultTheme,
    city_or_title: cityMatch ? cityMatch[1] : (defaultTheme || ''),
    date: singleDate,
    date_display: extractShowDateRange(rawText, currentYear) || singleDate,
    start_time: extractStartTime(rawText),
    venue: extractVenueFromText(rawText),
    prices: uniquePrices.length ? uniquePrices.map(p => `¥${p}`).join(' / ') : '',
    slot: slotMatch ? slotMatch[1] : '',
    type: /音乐节|嘉年华/.test(rawText) ? 'festival' : 'tour'
  }];
}

async function callGeminiVisionWithFallback(apiKey, mimeType, base64Data, promptText) {
  const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3-flash-preview'];
  let lastErr = '';
  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data: base64Data } }] }]
      })
    });
    if (resp.ok) return await resp.json();
    lastErr = `模型 ${modelName} 返回 HTTP ${resp.status}`;
  }
  throw new Error(lastErr || '所有 AI 模型节点均未响应');
}

async function runSmartPosterRecognition(targetMode = 'archive') {
  const imgInputId = targetMode === 'ticket' ? 'cp-tour-poster' : 'arc-poster-url';
  const btnId = targetMode === 'ticket' ? 'cp-ocr-btn' : 'arc-ocr-btn';
  const statusId = targetMode === 'ticket' ? 'cp-ocr-status' : 'arc-ocr-status';
  const imgSrc = document.getElementById(imgInputId).value.trim();
  if (!imgSrc) return alert('请先上传官宣海报图片！');

  const btn = document.getElementById(btnId);
  const statusEl = document.getElementById(statusId);
  btn.disabled = true;
  btn.textContent = '⏳ 识别中...';
  statusEl.classList.remove('hidden');

  const geminiApiKey = localStorage.getItem(GEMINI_KEY_STORAGE);
  try {
    if (geminiApiKey && imgSrc.startsWith('data:image/')) {
      statusEl.textContent = '🤖 正在使用 Gemini 视觉引擎分析海报信息...';
      const base64Data = imgSrc.split(',')[1];
      const mimeType = imgSrc.split(';')[0].split(':')[1] || 'image/jpeg';
      const promptText = `请仔细识别这张演出/巡演/音乐节海报或排期表格图片中的所有场次信息。
如果图片是一张包含多场巡演排期的表格，请把每一场演出拆分为数组中的独立对象；如果只是单场海报，则返回包含1个对象的数组。
严格仅返回纯 JSON 数组（不要加 markdown 代码块标记），字段格式如下：
[{"artist":"","theme":"","city_or_title":"","date":"","date_display":"","start_time":"","venue":"","prices":"","sale_time":"","platform":"","slot":"","type":"tour"}]`;
      const json = await callGeminiVisionWithFallback(geminiApiKey, mimeType, base64Data, promptText);
      const rawOut = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsedShows = JSON.parse(rawOut.replace(/```json|```/gi, '').trim());
      if (targetMode === 'ticket') fillTicketFormFromRecognized(parsedShows);
      else renderRecognizedShowsBatch(parsedShows);
      statusEl.textContent = '✅ AI 视觉识别成功！已自动填充相关字段，请核对后保存。';
      return;
    }

    statusEl.textContent = '🔍 正在增强图片对比度并运行本地中文 OCR...';
    const enhancedImg = imgSrc.startsWith('data:image/') ? await preprocessImageForLocalOCR(imgSrc) : imgSrc;
    const result = await Tesseract.recognize(enhancedImg, 'chi_sim+eng');
    const ocrText = (result.data?.text || '').trim();
    if (!ocrText) {
      statusEl.textContent = '⚠️ 未能识别到清晰文字，建议配置顶部「🔑 AI 识图密钥」或手动填写。';
      return;
    }
    const shows = parseMultiShowsFromPlainText(ocrText);
    if (targetMode === 'ticket') fillTicketFormFromRecognized(shows);
    else renderRecognizedShowsBatch(shows);
    statusEl.textContent = '✅ 本地 OCR 识别完成，请核对微调后保存。';
  } catch (e) {
    statusEl.textContent = `❌ 识别出错：${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 识别海报自动填表';
  }
}
