// ================= 🔗 首页「时光提醒」人物 ⇄ 足迹页粉籍 / 应援色 双向同步 =================
// 规则：
// 1) 首页切换人物保存时：足迹页从未设置过粉籍（或原粉籍就等于旧对象）→ 静默同步；
//    若足迹页已明确设成别的粉籍 → 弹「粉籍统一提醒」。
// 2) 切到「🎫 足迹」或新增足迹时：比对两者，不一致且本会话未选「保持各自独立」→ 再次提醒。
// 3) 应援色全部复用站内 ARTIST_COLORS / getMemberHex / 粉籍主题变量，不新增配色表。

const FANDOM_CONFLICT_MUTE_KEY = 'onerland_fandom_conflict_muted_v1';
const FAN_PREF_STORAGE_KEY_FOR_SYNC = 'onerland_fan_pref_v1';

// 首页当前对象名（团粉→ONER，唯粉→成员名，双人→「A & B」，自定义→原样）
function getHomeFandomTarget() {
  const ann = (typeof getAnniversaryState === 'function' ? getAnniversaryState() : null) || AppState.anniversary || {};
  const targets = Array.isArray(ann.targets) ? ann.targets.filter(Boolean) : [];
  return targets[0] || 'ONER';
}

// 足迹页当前粉籍显示名
function getFootprintFandomLabel() {
  const pref = (typeof getFanPrefState === 'function' ? getFanPrefState() : AppState.fanPref) || {};
  const members = Array.isArray(pref.biasMembers) ? pref.biasMembers.filter(Boolean) : [];
  if (pref.biasType === 'cp') {
    const duo = members.filter(m => m !== 'ONER').slice(0, 2);
    return duo.length ? duo.join(' & ') : '岳岳 & 木子洋';
  }
  if (pref.biasType === 'solo') return members[0] || '岳岳';
  return 'ONER';
}

// 足迹页是否还是「从未设置过」的初始态
function isFootprintFandomUntouched() {
  try {
    const raw = localStorage.getItem(FAN_PREF_STORAGE_KEY_FOR_SYNC);
    if (!raw) return true;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return true;
    const members = Array.isArray(saved.biasMembers) ? saved.biasMembers.filter(Boolean) : [];
    return !members.length && !saved.biasType && !saved.autoFilterShows
      && !(Array.isArray(saved.customTags) && saved.customTags.length);
  } catch (e) {
    return true;
  }
}

// 对象名 → 站内粉籍身份 id（ONER / 岳岳 / 木子洋 / 灵超 / 双人）
function fandomIdentityIdOfTarget(target) {
  const name = String(target || '').trim();
  const options = typeof getFanIdentityOptions === 'function' ? getFanIdentityOptions() : [];
  const hit = options.find(o => o.target === name);
  return hit ? hit.id : '';
}

function fandomPrefPatchOfTarget(target) {
  const name = String(target || '').trim();
  if (!name) return null;
  const duo = name.split(/\s*&\s*/).filter(Boolean);
  if (duo.length >= 2) {
    const members = duo.filter(m => ['岳岳', '木子洋', '灵超'].includes(m)).slice(0, 2);
    if (members.length === 2) return { biasType: 'cp', biasMembers: members };
    return null;
  }
  if (name === 'ONER') return { biasType: 'group', biasMembers: ['ONER'] };
  if (['岳岳', '木子洋', '灵超'].includes(name)) return { biasType: 'solo', biasMembers: [name] };
  return null; // 自定义对象：没有对应官方应援色，保持原粉籍不动
}

// 把足迹页粉籍 + 应援色主题同步为指定对象
function applyFandomFromHomeTarget(target, opts = {}) {
  const patch = fandomPrefPatchOfTarget(target);
  if (!patch) return false;
  if (typeof saveFanPrefState !== 'function') return false;
  saveFanPrefState(patch);
  if (typeof syncGlobalFanTheme === 'function') syncGlobalFanTheme();
  if (typeof renderFootprintPage === 'function' && !opts.silentRender) renderFootprintPage();
  if (typeof renderHomeDashboard === 'function' && !opts.silentRender) renderHomeDashboard();
  return true;
}

// 把首页对象同步为足迹页粉籍
function applyHomeTargetFromFandom() {
  const label = getFootprintFandomLabel();
  const identity = fandomIdentityIdOfTarget(label);
  if (typeof saveAnniversaryState !== 'function') return false;
  saveAnniversaryState({ fanIdentity: identity || 'custom', targets: [label] });
  if (typeof renderAnniversaryCard === 'function') renderAnniversaryCard();
  if (typeof renderHomeDashboard === 'function') renderHomeDashboard();
  return true;
}

// 首页保存后调用：决定静默同步 or 弹冲突提醒
function onHomeFandomTargetChanged(prevTarget) {
  const nextTarget = getHomeFandomTarget();
  const prev = String(prevTarget || '').trim();
  if (nextTarget === prev) return;

  // 自定义对象（无官方应援色）：保持足迹页粉籍不变，也不打扰用户
  if (!fandomPrefPatchOfTarget(nextTarget)) return;

  const fandom = getFootprintFandomLabel();
  const untouched = isFootprintFandomUntouched();
  const sameAsPrev = Boolean(prev) && fandom === prev;

  if (untouched || sameAsPrev) {
    applyFandomFromHomeTarget(nextTarget, { silentRender: false });
    try { sessionStorage.removeItem(FANDOM_CONFLICT_MUTE_KEY); } catch (e) { /* ignore */ }
    return;
  }

  if (fandom === nextTarget) return;
  openFandomConflictModal();
}

function isFandomConflictMuted() {
  try { return sessionStorage.getItem(FANDOM_CONFLICT_MUTE_KEY) === '1'; } catch (e) { return false; }
}

function muteFandomConflictThisSession() {
  try { sessionStorage.setItem(FANDOM_CONFLICT_MUTE_KEY, '1'); } catch (e) { /* ignore */ }
}

// 切到足迹页 / 新增足迹时检测
function checkFandomConflict() {
  const home = getHomeFandomTarget();
  const fandom = getFootprintFandomLabel();
  if (!home || !fandom || home === fandom) return false;
  if (!fandomPrefPatchOfTarget(home)) return false; // 自定义对象不参与比对
  if (isFandomConflictMuted()) return false;
  if (document.getElementById('fandom-conflict-modal')) return false;
  openFandomConflictModal();
  return true;
}

function closeFandomConflictModal() {
  document.getElementById('fandom-conflict-modal')?.remove();
}

// ---------- 粉籍统一提醒弹窗（冷银白液态金属磨砂） ----------
function openFandomConflictModal() {
  closeFandomConflictModal();
  const home = getHomeFandomTarget();
  const fandom = getFootprintFandomLabel();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const homeAccent = (typeof getAnniversaryTargetAccent === 'function' ? getAnniversaryTargetAccent([home]) : null) || { solid: '#DD0514', bg: 'linear-gradient(135deg,#DD0514,#8D0D0E)' };
  const fandomSolid = typeof getFanThemeHexes === 'function' ? (getFanThemeHexes()[0] || '#DD0514') : '#DD0514';
  const fandomTheme = typeof getFanPrefThemeColor === 'function' ? getFanPrefThemeColor() : fandomSolid;

  const modal = document.createElement('div');
  modal.id = 'fandom-conflict-modal';
  modal.className = 'fandom-conflict-overlay';
  modal.innerHTML = `
    <div class="fandom-conflict-card" role="dialog" aria-modal="true" aria-label="粉籍统一提醒">
      <div class="fandom-conflict-head">
        <span class="fandom-conflict-title">🔗 粉籍统一提醒</span>
        <button type="button" class="fandom-conflict-close" aria-label="关闭" data-fc-close>✕</button>
      </div>
      <p class="fandom-conflict-text">检测到首页时光提醒对象（<strong style="color:${esc(homeAccent.solid || '#0f172a')}">${esc(home)}</strong>）与足迹页粉籍（<strong style="color:${esc(fandomSolid)}">${esc(fandom)}</strong>）不一致，是否立即统一？</p>
      <div class="fandom-conflict-preview">
        <span class="fandom-conflict-dot" style="background:${esc(homeAccent.bg || homeAccent.solid || '#DD0514')}"></span>
        <span>${esc(home)}</span>
        <span class="fandom-conflict-vs">⇄</span>
        <span class="fandom-conflict-dot" style="background:${esc(fandomTheme)}"></span>
        <span>${esc(fandom)}</span>
      </div>
      <div class="fandom-conflict-actions">
        <button type="button" class="fandom-conflict-btn is-primary" data-fc-action="to-home">统一为「${esc(home)}」</button>
        <button type="button" class="fandom-conflict-btn" data-fc-action="to-fandom">统一为「${esc(fandom)}」</button>
        <button type="button" class="fandom-conflict-btn is-text" data-fc-action="keep">保持各自独立</button>
      </div>
      <p class="fandom-conflict-foot">粉籍与应援色均只保存在本机浏览器，随时可在足迹页手动修改。</p>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', ev => {
    if (ev.target === modal || ev.target.closest('[data-fc-close]')) {
      closeFandomConflictModal();
      return;
    }
    const btn = ev.target.closest('[data-fc-action]');
    if (!btn) return;
    const action = btn.dataset.fcAction;
    closeFandomConflictModal();
    try { sessionStorage.removeItem(FANDOM_CONFLICT_MUTE_KEY); } catch (e) { /* ignore */ }

    if (action === 'to-home') {
      const ok = applyFandomFromHomeTarget(home);
      if (typeof renderFootprintPage === 'function') renderFootprintPage();
      showToast(ok ? `已统一为「${home}」` : '该对象暂无可对应的官方应援色，已保留原粉籍');
    } else if (action === 'to-fandom') {
      applyHomeTargetFromFandom();
      showToast(`首页时光提醒已统一为「${fandom}」`);
    } else {
      muteFandomConflictThisSession();
      showToast('已保持各自独立，本会话内不再提醒');
    }
  });
}

window.getHomeFandomTarget = getHomeFandomTarget;
window.getFootprintFandomLabel = getFootprintFandomLabel;
window.applyFandomFromHomeTarget = applyFandomFromHomeTarget;
window.applyHomeTargetFromFandom = applyHomeTargetFromFandom;
window.onHomeFandomTargetChanged = onHomeFandomTargetChanged;
window.checkFandomConflict = checkFandomConflict;
window.openFandomConflictModal = openFandomConflictModal;
window.closeFandomConflictModal = closeFandomConflictModal;
