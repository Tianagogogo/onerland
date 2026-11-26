function renderHomeDashboard() {
  renderAnniversaryCard();
  renderUpcomingMiniTimeline();
  renderFeedBriefCard();
}

function renderAnniversaryCard() {
  const box = document.getElementById('home-anniversary-box');
  if (!box) return;
  const { firstMeetDate, fanNickname, customEvents } = AppState.anniversary;
  const start = new Date(firstMeetDate.replace(/-/g, '/'));
  const meetDays = isNaN(start) ? 0 : Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000));

  const now = new Date();
  const curYear = now.getFullYear();
  const upcomingFestivals = (customEvents || []).map(ev => {
    let target = new Date(`${curYear}-${ev.date}T00:00:00`);
    if (target.getTime() + 86400000 < now.getTime()) {
      target = new Date(`${curYear + 1}-${ev.date}T00:00:00`);
    }
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / 86400000);
    return { ...ev, diffDays };
  }).sort((a, b) => a.diffDays - b.diffDays);

  const nextEv = upcomingFestivals[0];
  const nextEvText = nextEv
    ? (nextEv.diffDays === 0 ? `🎉 今天是「${nextEv.title}」！` : `距离「${nextEv.title}」还有 ${nextEv.diffDays} 天`)
    : '可在足迹页自定义纪念日';

  box.innerHTML = `
    <div class="p-4 sm:p-5 rounded-2xl chronicle-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="space-y-1">
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <span class="px-2 py-0.5 rounded-full obsidian-btn text-white font-semibold">✨ 时光提醒</span>
          <span>你好，${fanNickname || '万能人'}</span>
        </div>
        <div class="text-base sm:text-lg font-bold text-slate-900">
          与 ONER 相识的第 <span class="underline decoration-slate-400 underline-offset-4">${meetDays}</span> 天 · 已点亮线下 <span class="underline decoration-slate-400 underline-offset-4">${AppState.footprints.length}</span> 面
        </div>
        <p class="text-xs text-slate-600">${nextEvText}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button type="button" onclick="switchMainTab('footprint')" class="px-3 py-1.5 rounded-xl liquid-silver-btn text-xs font-semibold">
          🎫 生成纪念票根
        </button>
      </div>
    </div>
  `;
}

function renderUpcomingMiniTimeline() {
  const box = document.getElementById('home-upcoming-timeline');
  if (!box) return;
  const list = AppState.cloudTickets.slice(0, 4);
  if (!list.length) {
    box.innerHTML = `<div class="p-4 rounded-xl metal-card text-xs text-slate-400">近期暂无待开演场次，去「档案」看看往期巡演回顾吧。</div>`;
    return;
  }

  box.innerHTML = list.map(item => {
    const badge = (ARTIST_COLORS[item.artist] || ARTIST_COLORS['ONER']).bg;
    const safeTitle = String(item.city || '').replace(/['"<>]/g, '');
    return `
      <div class="p-3.5 rounded-xl metal-card flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-12 h-12 poster-square-box shrink-0">
            ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${safeTitle}" />` : `<div class="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">ONER</div>`}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] px-1.5 py-0.5 rounded text-white font-semibold shrink-0" style="background:${badge}">${item.artist}</span>
              <span class="font-bold text-sm text-slate-900 truncate">${safeTitle}</span>
            </div>
            <p class="text-xs text-slate-500 truncate mt-0.5">🗓️ ${item.show_date} · 📍 ${item.venue}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" onclick="exportShowICS(${item.cloudId})" class="px-2.5 py-1 rounded-lg liquid-silver-btn text-xs font-medium" title="导出日历提醒">📅 日历</button>
          <button type="button" onclick="switchMainTab('shows')" class="px-2.5 py-1 rounded-lg obsidian-btn text-xs font-medium">详情</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderFeedBriefCard() {
  const box = document.getElementById('home-feed-brief');
  if (!box) return;
  const weekAgo = Date.now() - 7 * 86400000;
  const weekPosts = AppState.allPosts.filter(p => p.timestamp >= weekAgo);
  const byArtist = {};
  weekPosts.forEach(p => { byArtist[p.artistName] = (byArtist[p.artistName] || 0) + 1; });

  const summaryPills = Object.entries(byArtist)
    .map(([name, cnt]) => `<span class="px-2 py-0.5 rounded-full bg-white border border-slate-300 text-[11px] text-slate-700">${name} <strong>${cnt}</strong>条</span>`)
    .join('');

  const latest = AppState.allPosts[0];
  box.innerHTML = `
    <div class="p-4 rounded-2xl metal-card space-y-2.5">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <span class="text-xs font-bold text-slate-800">📰 本周全平台动态简报（共 ${weekPosts.length} 条）</span>
        <div class="flex items-center gap-1.5 flex-wrap">${summaryPills || '<span class="text-[11px] text-slate-400">近7日暂无新抓取</span>'}</div>
      </div>
      ${latest ? `
        <div class="p-2.5 rounded-xl bg-white/90 border border-slate-200 flex items-center justify-between gap-2 text-xs">
          <div class="truncate text-slate-700">
            <span class="font-bold text-slate-900">[${latest.artistName} · ${latest.platformName}]</span> ${latest.text}
          </div>
          <button type="button" onclick="switchMainTab('feeds')" class="text-slate-700 font-semibold shrink-0 hover:underline">查看全部 ↗</button>
        </div>
      ` : ''}
    </div>
  `;
}
