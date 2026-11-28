/* ===== 新手引导：首次欢迎弹窗 + 场景化微提示条 ===== */
(function () {
  'use strict';

  const WELCOME_KEY = 'onerland_welcomed_v1';
  const TIP_PREFIX = 'onerland_tip_seen_';

  const FEATURE_TIPS = {
    ticket_stats: {
      title: '抢票座位对照表',
      text: '💡 怎么用：默认按付款秒数从快到慢排序，帮你对照手速与开票区域；同设备限填 1 条，填错可随时修改或撤回。'
    },
    buddy_match: {
      title: '找搭子',
      text: '💡 怎么用：支持筛选「同行 / 拼房 / 互换物料」，你的微信号默认加密隐藏，只有双方互相点击同意后才会解锁。'
    },
    footprints_tab: {
      title: '足迹页',
      text: '💡 怎么用：在档案页点亮「+ 足迹」后，这里会自动点亮对应的中国省份地图，还能关联同场搭子一键生成纪念日。'
    },
    ticket_generator: {
      title: '纪念票根生成器',
      text: '💡 怎么用：下拉选择演出场次可自动带入日期与场馆，支持导出高清票根图片，或同步写入首页纪念日倒计时。'
    },
    security_check: {
      title: '安检体验',
      text: '💡 怎么用：免票根即可参与安检严格度与长焦/翻包投票（再次点击可取消），下方私人笔记仅存在本机不上传。'
    }
  };

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function tipSeen(featureKey) {
    return lsGet(TIP_PREFIX + featureKey) === '1';
  }

  // 通用微提示条 HTML（未读时返回内容，已读返回空）
  function renderFeatureOnboardingTip(featureKey, title, stepsText, force) {
    const conf = FEATURE_TIPS[featureKey] || { title: title || '', text: stepsText || '' };
    if (!force && tipSeen(featureKey)) return '';
    return `
      <div class="onb-tip" data-onb-tip="${featureKey}" role="note">
        <span class="onb-tip-badge">🆕 新手提示</span>
        <span class="onb-tip-text">${conf.text}</span>
        <button type="button" class="onb-tip-close" onclick="dismissFeatureTip('${featureKey}', event)">我知道了 ×</button>
      </div>`;
  }

  function dismissFeatureTip(featureKey, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    lsSet(TIP_PREFIX + featureKey, '1');
    document.querySelectorAll(`[data-onb-tip="${featureKey}"]`).forEach(el => el.remove());
  }

  function showFeatureTip(featureKey, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    mountFeatureTip(featureKey, null, true);
  }

  // 把提示条挂到某个面板顶部（同一面板只挂一次）
  function mountFeatureTip(featureKey, host, force) {
    if (!FEATURE_TIPS[featureKey]) return;
    const container = host || document.querySelector(`[data-onb-host="${featureKey}"]`);
    if (!container) return;
    container.classList.add('onb-host');
    container.dataset.onbHost = featureKey;

    if (!container.querySelector('.onb-help-dot')) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'onb-help-dot';
      dot.title = `再看一次「${FEATURE_TIPS[featureKey].title}」用法`;
      dot.setAttribute('aria-label', `查看${FEATURE_TIPS[featureKey].title}用法`);
      dot.textContent = '?';
      dot.addEventListener('click', ev => {
        ev.stopPropagation();
        const tip = container.querySelector(`[data-onb-tip="${featureKey}"]`);
        if (tip) { tip.remove(); return; }
        const wrap = document.createElement('div');
        wrap.innerHTML = renderFeatureOnboardingTip(featureKey, '', '', true);
        const node = wrap.firstElementChild;
        if (node) container.insertBefore(node, container.firstChild);
      });
      container.insertBefore(dot, container.firstChild);
    }

    if (!force && tipSeen(featureKey)) return;
    if (container.querySelector(`[data-onb-tip="${featureKey}"]`)) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = renderFeatureOnboardingTip(featureKey, '', '', false);
    const node = wrap.firstElementChild;
    if (node) container.insertBefore(node, container.firstChild.nextSibling);
  }

  // ===== 首次进站欢迎弹窗 =====
  function buildWelcomeModal() {
    if (document.getElementById('onb-welcome-modal')) return document.getElementById('onb-welcome-modal');
    const modal = document.createElement('div');
    modal.id = 'onb-welcome-modal';
    modal.className = 'onb-welcome-overlay hidden';
    modal.innerHTML = `
      <div class="onb-welcome-card" role="dialog" aria-modal="true" aria-label="欢迎来到 ONERLAND">
        <div class="onb-welcome-head">
          <div>
            <div class="onb-welcome-title">👋 欢迎来到 ONERLAND · 30秒玩法速览</div>
            <div class="onb-welcome-sub">非盈利追星档案站 · 所有数据只存在你自己的浏览器里</div>
          </div>
          <button type="button" class="onb-welcome-x" onclick="closeWelcomeModal()" aria-label="关闭">✕</button>
        </div>
        <div class="onb-steps">
          <div class="onb-step">
            <span class="onb-step-no">1</span>
            <div>
              <div class="onb-step-title">设主推 · 联动应援色</div>
              <div class="onb-step-desc">顶部点昵称 / 对象切换主推，全站应援色与足迹属性一起联动。</div>
            </div>
          </div>
          <div class="onb-step">
            <span class="onb-step-no">2</span>
            <div>
              <div class="onb-step-title">记计划 / 足迹 · 点亮中国地图</div>
              <div class="onb-step-desc">在档案页点「🎫 计划前往」和「+ 足迹」，足迹页会自动点亮去过的省份。</div>
            </div>
          </div>
          <div class="onb-step">
            <span class="onb-step-no">3</span>
            <div>
              <div class="onb-step-title">领票根 / 抢票对照 / 找搭子</div>
              <div class="onb-step-desc">生成专属纪念票根、对照抢票手速与座位，还能和同场粉丝互换联系方式。</div>
            </div>
          </div>
        </div>
        <div class="onb-welcome-actions">
          <button type="button" class="onb-btn-primary" onclick="finishWelcomeModal()">✨ 开始探索</button>
          <button type="button" class="onb-btn-ghost" onclick="openGuideFromWelcome()">📖 查看完整分类指南</button>
        </div>
        <div class="onb-welcome-foot">随时可点顶部「❓ 指南」再看一次</div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal) finishWelcomeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) finishWelcomeModal();
    });
    return modal;
  }

  function openWelcomeModal() {
    const modal = buildWelcomeModal();
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }

  function finishWelcomeModal() {
    lsSet(WELCOME_KEY, '1');
    const modal = document.getElementById('onb-welcome-modal');
    if (modal) {
      modal.classList.remove('is-open');
      setTimeout(() => modal.classList.add('hidden'), 180);
    }
  }

  function openGuideFromWelcome() {
    finishWelcomeModal();
    if (typeof openFeedbackModal === 'function') openFeedbackModal();
  }

  function splashDone() {
    const splash = document.getElementById('app-splash-screen');
    if (!splash) return true;
    if (splash.classList.contains('hidden')) return true;
    const style = window.getComputedStyle(splash);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return true;
    return false;
  }

  function scheduleWelcome() {
    if (lsGet(WELCOME_KEY) === '1') return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (splashDone()) {
        clearInterval(timer);
        setTimeout(() => {
          if (lsGet(WELCOME_KEY) === '1') return;
          openWelcomeModal();
        }, 300);
      } else if (tries > 40) {
        clearInterval(timer);
        setTimeout(() => { if (lsGet(WELCOME_KEY) !== '1') openWelcomeModal(); }, 300);
      }
    }, 100);
  }

  window.renderFeatureOnboardingTip = renderFeatureOnboardingTip;
  window.mountFeatureTip = mountFeatureTip;
  window.dismissFeatureTip = dismissFeatureTip;
  window.showFeatureTip = showFeatureTip;
  window.openWelcomeModal = openWelcomeModal;
  window.finishWelcomeModal = finishWelcomeModal;
  window.closeWelcomeModal = finishWelcomeModal;
  window.openGuideFromWelcome = openGuideFromWelcome;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleWelcome);
  } else {
    scheduleWelcome();
  }
})();
