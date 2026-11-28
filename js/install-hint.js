/* 📲 添加到手机桌面：仅在手机浏览器（非全屏 App 模式）显示一条可关闭的轻量提示 */
(function () {
  'use strict';
  const DISMISS_KEY = 'onerland_install_hint_dismissed_v1';

  function isMobileBrowser() {
    const ua = navigator.userAgent || '';
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MiuiBrowser|MicroMessenger/i.test(ua);
    const narrow = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    return mobileUa && narrow;
  }

  function isStandalone() {
    try {
      if (window.navigator.standalone) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    } catch (e) {}
    return false;
  }

  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function build() {
    if (dismissed() || !isMobileBrowser() || isStandalone()) return;
    const footer = document.querySelector('footer');
    if (!footer || document.getElementById('install-hint-bar')) return;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const tip = isIOS
      ? '点击 Safari 底部「分享」→「添加到主屏幕」'
      : '浏览器菜单「⋮」→「添加到主屏幕」';
    const bar = document.createElement('div');
    bar.id = 'install-hint-bar';
    bar.className = 'install-hint-bar';
    bar.innerHTML = `
      <span class="install-hint-icon">📲</span>
      <span class="install-hint-text">把 ONERLAND 加到手机桌面，秒变独立 App · <span class="install-hint-steps">${tip}</span></span>
      <button type="button" class="install-hint-close" aria-label="不再提示">×</button>`;
    footer.parentNode.insertBefore(bar, footer);
    bar.querySelector('.install-hint-close').addEventListener('click', event => {
      event.stopPropagation();
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
      bar.remove();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else setTimeout(build, 0);
})();
