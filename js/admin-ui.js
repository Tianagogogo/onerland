async function submitAdminQuickPost() {
  if (!AppState.isAdmin) return;
  const type = document.getElementById('adm-type').value;
  const artist = document.getElementById('adm-artist').value;
  const titleOrPlat = document.getElementById('adm-title').value.trim();
  const dateOrTime = document.getElementById('adm-date').value.trim();
  const venueOrBody = document.getElementById('adm-body').value.trim();
  const posterUrl = document.getElementById('adm-poster').value.trim();
  const url = document.getElementById('adm-url').value.trim();
  const isPinned = document.getElementById('adm-pin').checked;

  if (!titleOrPlat) return alert('请填写标题或平台名称！');

  try {
    if (type === 'feed') {
      const content = `${isPinned ? '[PIN] ' : ''}${venueOrBody || titleOrPlat}`;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feeds`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify({ artist, platform: titleOrPlat, content, url })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadAllFeeds();
    } else if (type === 'ticket') {
      const showDate = dateOrTime || new Date().toISOString().slice(0, 10);
      const payload = {
        title: `${artist}|${titleOrPlat}|${venueOrBody || '场馆待补充'}|${showDate}|`,
        ticket_time: `${showDate}T19:30`,
        platform: `META:${JSON.stringify({ rounds: [], posterUrl, theme: extractSeriesPrefix(titleOrPlat) })}`,
        url
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/tickets`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTourData();
    } else {
      const showDate = dateOrTime || new Date().toISOString().slice(0, 10);
      const payload = {
        title: `ARCHIVE|${artist}|${titleOrPlat}|${showDate}`,
        ticket_time: `${showDate}T19:30`,
        platform: `ARCHIVE:${JSON.stringify({ subType: 'tour', venue: venueOrBody || '演出现场', posterUrl, theme: extractSeriesPrefix(titleOrPlat) })}`,
        url
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/tickets`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTourData();
    }

    document.getElementById('adm-title').value = '';
    document.getElementById('adm-body').value = '';
    alert('已发布并同步至云端！');
    renderAdminTodoQueue();
  } catch (e) {
    alert(`发布失败：${e.message}`);
  }
}

// 极简管理端：已有记录快捷管理与待审占位队列（阶段 1 接入 OTP 后直接对接待审表）
function renderAdminTodoQueue() {
  const box = document.getElementById('admin-todo-queue');
  if (!box) return;
  const recentItems = [
    ...AppState.cloudTickets.map(t => ({ table: 'tickets', id: t.cloudId, tag: '近期演出', title: `${t.artist} · ${t.city} (${t.show_date})` })),
    ...AppState.cloudArchives.slice(0, 5).map(a => ({ table: 'tickets', id: a.cloudId, tag: '往日档案', title: `${a.artist} · ${a.title} (${a.showDate})` }))
  ];

  box.innerHTML = recentItems.length ? recentItems.map(item => `
    <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
      <div class="truncate">
        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium mr-1.5">${item.tag}</span>
        <span class="text-slate-800">${item.title}</span>
      </div>
      <button type="button" onclick="adminDeleteItem('${item.table}', ${item.id})" class="px-2.5 py-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium shrink-0">删除</button>
    </div>
  `).join('') : `<div class="text-xs text-slate-400 py-3">当前待办队列已清空</div>`;
}

async function adminDeleteItem(table, id) {
  if (!confirm('确认删除该条记录？')) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
  await loadTourData();
  renderAdminTodoQueue();
}
