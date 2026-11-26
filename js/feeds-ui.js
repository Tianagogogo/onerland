function syncArtistDropdownUI() {
  const artistOptions = [{ id: 'ALL', name: '全部艺人', badgeStyle: COLOR_METAL_DEFAULT }, ...artistsConfig.map(a => ({
    id: a.artistId,
    name: a.artistName,
    badgeStyle: a.badgeStyle || a.accounts[0]?.color || COLOR_METAL_DEFAULT
  }))];
  const currentObj = artistOptions.find(a => a.id === activeArtistId) || artistOptions[0];
  document.getElementById('current-artist-label').textContent = currentObj.name;
  document.getElementById('artist-menu-btn').style.background = currentObj.badgeStyle;

  document.getElementById('artist-dropdown-menu').innerHTML = artistOptions.map(t => {
    const isActive = activeArtistId === t.id;
    return `<button type="button" onclick="selectArtist('${t.id}')" class="w-full px-3.5 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-100 transition ${isActive ? 'font-bold text-slate-900 bg-slate-100/70' : 'text-slate-700'}"><span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${t.badgeStyle}"></span><span>${t.name}</span></span>${isActive ? '<span>✓</span>' : ''}</button>`;
  }).join('');
}

function renderFeedsSectionOnly() {
  const artistOptions = [{ id: 'ALL', name: '全部艺人', badgeStyle: COLOR_METAL_DEFAULT }, ...artistsConfig.map(a => ({
    id: a.artistId,
    name: a.artistName,
    badgeStyle: a.badgeStyle || a.accounts[0]?.color || COLOR_METAL_DEFAULT
  }))];

  const feedArtistPills = document.getElementById('feed-artist-pills');
  if (feedArtistPills) {
    feedArtistPills.innerHTML = artistOptions.map(t => {
      const isActive = activeArtistId === t.id;
      return `<button type="button" onclick="selectArtist('${t.id}')" style="${isActive ? `background:${t.badgeStyle}` : ''}" class="px-3 py-1 rounded-full text-xs font-medium transition border ${isActive ? 'text-white border-transparent shadow-2xs' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}">${t.name}</button>`;
    }).join('');
  }

  const artistPosts = activeArtistId === 'ALL' ? allPosts : allPosts.filter(p => p.artistId === activeArtistId);
  const spotlightEl = document.getElementById('latest-spotlight');
  if (artistPosts.length > 0) {
    const top = artistPosts[0];
    spotlightEl.classList.remove('hidden');
    document.getElementById('spotlight-artist').textContent = top.artistName;
    document.getElementById('spotlight-platform').textContent = top.platformName;
    document.getElementById('spotlight-time').textContent = formatTimeAgo(top.timestamp);
    document.getElementById('spotlight-text').textContent = top.text;
    document.getElementById('spotlight-link').href = top.link;
  } else {
    spotlightEl.classList.add('hidden');
  }

  const platformMap = new Map();
  artistPosts.forEach(p => {
    const label = p.platformName;
    if (!platformMap.has(label)) platformMap.set(label, { label, count: 0 });
    platformMap.get(label).count++;
  });

  const platformTabs = [{ id: 'ALL', label: `全部平台 (${artistPosts.length})` }, ...[...platformMap.values()].map(item => ({ id: item.label, label: `${item.label} (${item.count})` }))];
  document.getElementById('platform-tabs').innerHTML = platformTabs.map(t => {
    const isActive = activeAccountId === t.id;
    return `<button type="button" onclick="selectAccount('${t.id}')" class="px-3 py-1 rounded-full text-xs font-medium transition border ${isActive ? 'obsidian-btn text-white border-transparent' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}">${t.label}</button>`;
  }).join('');

  renderTimeline();
}

function clearDate() {
  document.getElementById('date-start-filter').value = '';
  document.getElementById('date-end-filter').value = '';
  renderTimeline();
}

function renderTimeline() {
  const startDateVal = document.getElementById('date-start-filter').value;
  const endDateVal = document.getElementById('date-end-filter').value;
  const kw = document.getElementById('keyword-filter').value.trim().toLowerCase();
  const startTs = startDateVal ? new Date(`${startDateVal}T00:00:00`).getTime() : null;
  const endTs = endDateVal ? new Date(`${endDateVal}T23:59:59`).getTime() : null;

  const filtered = allPosts.filter(p => {
    if (activeArtistId !== 'ALL' && p.artistId !== activeArtistId) return false;
    if (activeAccountId !== 'ALL' && p.platformName !== activeAccountId) return false;
    if (startTs && p.timestamp < startTs) return false;
    if (endTs && p.timestamp > endTs) return false;
    if (kw && !p.text.toLowerCase().includes(kw)) return false;
    return true;
  });

  const listEl = document.getElementById('timeline-list');
  if (!filtered.length) {
    listEl.innerHTML = `<div class="text-center py-10 text-sm text-slate-400">暂无符合筛选条件的动态记录</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const dateStr = new Date(p.timestamp).toLocaleString('zh-CN', { hour12: false });
    return `<article class="p-3.5 sm:p-4 rounded-xl metal-card space-y-2"><div class="flex items-center justify-between text-xs gap-2"><div class="flex items-center gap-2 flex-wrap"><span class="px-2.5 py-0.5 rounded-full text-white font-semibold shadow-2xs" style="background:${p.platformColor}">${p.artistName} · ${p.platformName}</span><span class="text-slate-400">${formatTimeAgo(p.timestamp)} · ${dateStr}</span></div><div class="flex items-center gap-2.5 shrink-0">${p.link && p.link !== '#' ? `<a href="${p.link}" target="_blank" class="text-slate-500 hover:text-slate-900">原帖 ↗</a>` : ''}${(isAdmin && p.cloudId) ? `<button type="button" onclick="deleteCloudRecord('feeds', ${p.cloudId})" class="text-rose-600 hover:underline">删除</button>` : ''}</div></div><p class="text-sm leading-relaxed text-slate-700 line-clamp-1-clean cursor-pointer" title="点击展开/收起全文" onclick="this.classList.toggle('line-clamp-1-clean')">${p.text}</p></article>`;
  }).join('');
}

function formatTimeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 0) return '即将发布';
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  return Math.floor(diff / 86400) + ' 天前';
}

function openManageModal() {
  renderManageList();
  document.getElementById('manage-modal').classList.remove('hidden');
}

function closeManageModal() {
  document.getElementById('manage-modal').classList.add('hidden');
}

function renderManageList() {
  const box = document.getElementById('manage-artist-list');
  if (!artistsConfig.length) {
    box.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">暂无艺人，请在上方添加</p>`;
    return;
  }
  box.innerHTML = artistsConfig.map((artist, aIdx) => `<div class="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2"><div class="flex items-center justify-between"><div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full border border-white" style="background:${artist.badgeStyle || artist.accounts[0]?.color || '#334155'}"></span><span class="font-bold text-sm text-slate-800">${artist.artistName}</span></div><button onclick="removeArtist(${aIdx})" class="text-xs text-rose-600 hover:underline">删除整组</button></div><div class="space-y-1.5">${artist.accounts.map((acc, accIdx) => `<div class="flex items-center justify-between text-xs bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"><div class="flex items-center gap-2 truncate pr-2"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${acc.color}"></span><span class="font-medium shrink-0 text-slate-700">${acc.name}</span><span class="text-slate-400 truncate">${acc.url}</span></div><button onclick="removeAccount(${aIdx}, ${accIdx})" class="text-slate-400 hover:text-rose-600 shrink-0">移除</button></div>`).join('')}</div></div>`).join('');
}

function addArtistAccount() {
  const artistName = document.getElementById('input-artist-name').value.trim();
  const platformName = document.getElementById('input-platform-name').value.trim();
  const rssUrl = document.getElementById('input-rss-url').value.trim();
  const color = document.getElementById('input-color').value;
  if (!artistName || !platformName || !rssUrl) return alert('请完整填写艺人名称、账号标签和 RSS 链接！');

  const existingArtist = artistsConfig.find(a => a.artistName === artistName);
  const newAcc = { id: 'acc_' + Date.now(), name: platformName, color: existingArtist?.badgeStyle || color, url: rssUrl };
  if (existingArtist) existingArtist.accounts.push(newAcc);
  else artistsConfig.push({ artistId: 'artist_' + Date.now(), artistName, badgeStyle: color, accounts: [newAcc] });

  saveArtistsConfig();
  document.getElementById('input-platform-name').value = '';
  document.getElementById('input-rss-url').value = '';
  renderManageList();
  loadAllFeeds(true);
}

function removeAccount(artistIdx, accIdx) {
  artistsConfig[artistIdx].accounts.splice(accIdx, 1);
  if (!artistsConfig[artistIdx].accounts.length) artistsConfig.splice(artistIdx, 1);
  saveArtistsConfig();
  activeArtistId = 'ALL'; activeAccountId = 'ALL';
  renderManageList();
  loadAllFeeds(true);
}

function removeArtist(artistIdx) {
  artistsConfig.splice(artistIdx, 1);
  saveArtistsConfig();
  activeArtistId = 'ALL'; activeAccountId = 'ALL';
  renderManageList();
  loadAllFeeds(true);
}

function resetToDefaultArtists() {
  if (!confirm('确定清空自定义配置并恢复默认艺人列表吗？')) return;
  localStorage.removeItem(STORAGE_ARTISTS_KEY);
  artistsConfig = loadArtistsConfig();
  activeArtistId = 'ALL'; activeAccountId = 'ALL';
  renderManageList();
  loadAllFeeds(true);
}
