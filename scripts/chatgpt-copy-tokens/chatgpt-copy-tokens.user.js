// ==UserScript==
// @name         ChatGPT Copy Tokens
// @namespace    https://github.com/qFamouse/
// @version      1.1
// @description  Two ChatGPT-styled buttons to copy the accessToken and refreshToken (sessionToken) of the current session
// @description:ru Две аккуратные кнопки в стиле ChatGPT для копирования accessToken и refreshToken (sessionToken) текущей сессии
// @author       Famouse
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @grant        GM_setClipboard
// @run-at       document-idle
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/master/scripts/chatgpt-copy-tokens
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/chatgpt-copy-tokens/chatgpt-copy-tokens.user.js
// @downloadURL  https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/chatgpt-copy-tokens/chatgpt-copy-tokens.user.js
// ==/UserScript==

(function () {
  'use strict';

  const HOST_ID = 'tm-copy-tokens';

  // ---------- иконки (lucide) ----------
  const svg = (inner, extra = '') =>
    `<svg ${extra} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    key: svg('<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>'),
    refresh: svg('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
    spinner: svg('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>', 'class="spin"'),
  };

  // ---------- получение сессии ----------
  async function getSession() {
    const res = await fetch('/api/auth/session', {
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error('Ошибка запроса: HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.accessToken) throw new Error('Вы не авторизованы');
    return data;
  }

  // ---------- копирование ----------
  async function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  // ---------- действия ----------
  async function copyAccessToken() {
    const s = await getSession();
    await copyText(s.accessToken);
    return 'accessToken скопирован';
  }

  async function copyRefreshToken() {
    const s = await getSession();
    // В веб-версии ChatGPT отдельного refreshToken нет — его роль играет sessionToken.
    const field = s.refreshToken ? 'refreshToken'
      : s.refresh_token ? 'refresh_token'
      : s.sessionToken ? 'sessionToken'
      : null;
    if (!field) throw new Error('В сессии нет refresh/session токена');
    await copyText(s[field]);
    return field + ' скопирован';
  }

  // ---------- стили (Shadow DOM, чтобы не конфликтовать со стилями сайта) ----------
  const CSS = `
    :host {
      position: fixed;
      right: 16px;
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      z-index: 2147483647;
    }
    .wrap {
      --bg: #ffffff;
      --bg-hover: #f3f3f3;
      --bg-press: #e8e8e8;
      --border: rgba(0, 0, 0, .12);
      --text: #0d0d0d;
      --icon: #5d5d5d;
      --shadow: 0 4px 16px rgba(0, 0, 0, .10), 0 1px 3px rgba(0, 0, 0, .06);
      --ok: #10a37f;
      --err: #ef4444;
      --hint-bg: #0d0d0d;
      --hint-text: #ffffff;
      position: relative;
      display: flex;
      gap: 8px;
      font-family: inherit;
      animation: appear .25s ease-out both;
    }
    .wrap[data-theme="dark"] {
      --bg: #2f2f2f;
      --bg-hover: #3a3a3a;
      --bg-press: #444444;
      --border: rgba(255, 255, 255, .12);
      --text: #ececec;
      --icon: #b4b4b4;
      --shadow: 0 4px 18px rgba(0, 0, 0, .45), 0 1px 3px rgba(0, 0, 0, .3);
      --hint-bg: #ececec;
      --hint-text: #0d0d0d;
    }

    button {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 14px 0 12px;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      box-shadow: var(--shadow);
      transition: background-color .15s ease, border-color .15s ease,
                  color .15s ease, transform .1s ease;
    }
    button:hover { background: var(--bg-hover); }
    button:active { background: var(--bg-press); transform: scale(.97); }
    button:focus-visible { outline: 2px solid var(--ok); outline-offset: 2px; }
    button[data-busy] { cursor: default; }

    .icon { display: inline-flex; color: var(--icon); transition: color .15s ease; }
    button[data-state="ok"]    { border-color: var(--ok);  }
    button[data-state="ok"]    .icon { color: var(--ok);  }
    button[data-state="error"] { border-color: var(--err); }
    button[data-state="error"] .icon { color: var(--err); }

    .spin { animation: spin .8s linear infinite; }

    .hint {
      position: absolute;
      right: 0;
      bottom: calc(100% + 10px);
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--hint-bg);
      color: var(--hint-text);
      font-size: 13px;
      line-height: 18px;
      white-space: nowrap;
      box-shadow: var(--shadow);
      opacity: 0;
      transform: translateY(4px);
      pointer-events: none;
      transition: opacity .18s ease, transform .18s ease;
    }
    .hint[data-show] { opacity: 1; transform: none; }
    .hint[data-error] { background: var(--err); color: #fff; }

    @keyframes appear { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes spin   { to { transform: rotate(360deg); } }

    @media (max-width: 640px) {
      :host { right: 12px; bottom: calc(92px + env(safe-area-inset-bottom, 0px)); }
    }
    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
    }
  `;

  // ---------- тема ----------
  function isDark() {
    const cl = document.documentElement.classList;
    if (cl.contains('dark')) return true;
    if (cl.contains('light')) return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ---------- сборка UI ----------
  function mount() {
    if (!document.body || document.getElementById(HOST_ID)) return;

    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.dataset.theme = isDark() ? 'dark' : 'light';

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');

    let hintTimer;
    function showHint(text, isError) {
      hint.textContent = text;
      if (isError) hint.setAttribute('data-error', ''); else hint.removeAttribute('data-error');
      hint.setAttribute('data-show', '');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => hint.removeAttribute('data-show'), 2600);
    }

    function makeButton({ icon, label, title, action }) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = title;
      btn.innerHTML = '<span class="icon"></span><span class="label"></span>';
      const iconEl = btn.querySelector('.icon');
      const labelEl = btn.querySelector('.label');

      const states = {
        idle:    { icon: ICONS[icon],  label },
        loading: { icon: ICONS.spinner, label },
        ok:      { icon: ICONS.check,  label: 'Скопировано' },
        error:   { icon: ICONS.alert,  label: 'Ошибка' },
      };
      function setState(name) {
        btn.dataset.state = name;
        iconEl.innerHTML = states[name].icon;
        labelEl.textContent = states[name].label;
      }
      setState('idle');

      let resetTimer;
      btn.addEventListener('click', async () => {
        if (btn.hasAttribute('data-busy')) return;
        btn.setAttribute('data-busy', '');
        clearTimeout(resetTimer);
        setState('loading');
        let delay = 1800;
        try {
          const msg = await action();
          setState('ok');
          showHint(msg, false);
        } catch (e) {
          setState('error');
          showHint(e.message || 'Не удалось скопировать', true);
          delay = 2600;
        }
        resetTimer = setTimeout(() => {
          setState('idle');
          btn.removeAttribute('data-busy');
        }, delay);
      });
      return btn;
    }

    wrap.append(
      hint,
      makeButton({
        icon: 'key',
        label: 'accessToken',
        title: 'Скопировать accessToken',
        action: copyAccessToken,
      }),
      makeButton({
        icon: 'refresh',
        label: 'refreshToken',
        title: 'Скопировать refreshToken (в веб-версии это sessionToken)',
        action: copyRefreshToken,
      }),
    );

    root.append(style, wrap);
    document.body.appendChild(host);

    // следим за переключением светлой/тёмной темы сайта
    new MutationObserver(() => {
      wrap.dataset.theme = isDark() ? 'dark' : 'light';
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  mount();
  // ChatGPT — SPA: если DOM перерисовался и кнопки пропали, возвращаем их
  setInterval(mount, 2000);
})();
