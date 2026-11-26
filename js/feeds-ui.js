function renderFeedsSectionOnly() {
  const artistOptions = [
    { id: 'ALL', name: '全部成员', bg: COLOR_METAL_DEFAULT },
    ...Object.entries(ARTIST_COLORS).map(([name, meta]) => ({ id: meta.id, name, bg: meta.bg }))
  ];

  const artistBox = document.getElementById('feed-artist-pills');
  if (artistBox) {
    artistBox.innerHTML = artistOptions.map(a => {
      const active = AppState.activeArtistId === a.id;
      return `<button type="button" onclick="AppState.activeArtistId='${a.id}'; AppState.activeAccountId='ALL'; renderFeedsSectionOnly();"
        style="${active ? `background:${a.bg}` : ''}"
        class="px-3 py-1 rounded-full text-xs font-medium border transition ${active ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-300'}">${a.name}</button>`;
    }).join('');
  }

  const artistPosts = AppState.activeArtistId === 'ALL'
    ? AppState.allPosts
    : AppState.allPosts.filter(p => p.artistId === AppState.activeArtistId);

  // 本周 / 本月内存分组统计概览
  const now = Date.now();
  const weekCnt = artistPosts.filter(p => p.timestamp >= now - 7 * 86400000).length;
  const monthCnt = artistPosts.filter(p => p.timestamp >= now - 30 * 86400000).length;
  const statsEl = document.getElementById('feed-period-stats');
  if (statsEl) {
    statsEl.textContent = `📊 本周更新 ${weekCnt} 条 ｜ 本月累计 ${monthCnt} 条`;
  }

  // 平台筛选胶囊
  const platCounts = new Map();
  artistPosts.forEach(p => platCounts.set(p.platformName, (platCounts.get(p.platformName) || 0) + 1));
  const platTabs = [{ id: 'ALL', label: `全部平台 (${artistPosts.length})` }, ...[...platCounts.entries()].map(([k, v]) => ({ id: k, label: `${k} (${v})` }))];

  const platBox = document.getElementById('platform-tabs');
  if (platBox) {
    platBox.innerHTML = platTabs.map(t => {
      const active = AppState.activeAccountId === t.id;
      return `<button type="button" onclick="AppState.activeAccountId='${t.id}'; renderFeedsSectionOnly();"
        class="px-3 py-1 rounded-full text-xs font-medium border transition ${active ? 'obsidian-btn text-white border-transparent' : 'bg-white text-slate-600 border-slate-300'}">${t.label}</button>`;
    }).join('');
  }

  renderTimeline();
}

function renderTimeline() {
  const kw = (document.getElementById('keyword-filter')?.value || '').trim().toLowerCase();
  const list = AppState.allPosts.filter(p => {
    if (AppState.activeArtistId !== 'ALL' && p.artistId !== AppState.activeArtistId) return false;
    if (AppState.activeAccountId !== 'ALL' && p.platformName !== AppState.activeAccountId) return false;
    if (kw && !p.text.toLowerCase().includes(kw)) return false;
    return true;
  });

  const box = document.getElementById('timeline-list');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = `<div class="text-center py-8 text-xs text-slate-400">暂无符合筛选条件的动态记录</div>`;
    return;
  }

  box.innerHTML = list.map(p => {
    const timeStr = new Date(p.timestamp).toLocaleString('zh-CN', { hour12: false });
    return `
      <article class="p-3.5 sm:p-4 rounded-xl metal-card space-y-1.5 ${p.isPinned ? 'border-slate-500 ring-1 ring-slate-300' : ''}">
        <div class="flex items-center justify-between text-xs gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            ${p.isPinned ? `<span class="px-2 py-0.5 rounded obsidian-btn text-white font-semibold">📌 置顶公告</span>` : ''}
            <span class="px-2.5 py-0.5 rounded-full text-white font-semibold" style="background:${p.platformColor}">${p.artistName} · ${p.platformName}</span>
            <span class="text-slate-400">${timeStr}</span>
          </div>
          ${p.link && p.link !== '#' ? `<a href="${p.link}" target="_blank" rel="noopener noreferrer" class="text-slate-600 hover:text-slate-950 font-medium shrink-0">直达原帖 ↗</a>` : ''}
        </div>
        <p class="text-sm leading-relaxed text-slate-700 line-clamp-1-clean cursor-pointer" onclick="this.classList.toggle('line-clamp-1-clean')">${p.text}</p>
      </article>
    `;
  }).join('');
}
