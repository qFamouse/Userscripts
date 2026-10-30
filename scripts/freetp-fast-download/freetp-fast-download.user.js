// ==UserScript==
// @name         FreeTP Fast Download + Magnet
// @namespace    https://github.com/qFamouse/
// @version      1.0
// @description  Skips the waiting timer on freetp.org, reveals the .torrent download button instantly and adds a matching magnet button built from the torrent itself
// @description:ru Пропуск таймера на freetp.org: кнопка скачивания .torrent видна сразу, рядом — кнопка magnet в стиле сайта
// @author       Famouse
// @license      MIT
// @match        https://freetp.org/getfile-*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=freetp.org
// @grant        none
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/master/scripts/freetp-fast-download
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/freetp-fast-download/freetp-fast-download.user.js
// @downloadURL  https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/freetp-fast-download/freetp-fast-download.user.js
// ==/UserScript==

(function () {
  'use strict';

  const ACTION = '.ftp-dl-action';

  /* ── Утилиты ─────────────────────────────────────────────────────────── */

  function downloadUrl() {
    const raw = document.getElementById('dlink')?.value?.trim();
    if (raw) {
      try { return new URL(raw, location.origin).href; } catch (e) { /* ignore */ }
    }
    const id = location.pathname.match(/getfile-(\d+)/)?.[1];
    return id ? location.origin + '/index.php?do=download&id=' + id : null;
  }

  function torrentName() {
    const el = document.querySelector('.ftp-dl-title b') ||
               document.querySelector('.ftp-dl-info span');
    const text = (el?.textContent?.trim() || document.title).replace(/\.torrent$/i, '').trim();
    return text || 'download';
  }

  const downloadButton = () => document.querySelector(ACTION + ' a.dl-button') ||
                              document.querySelector('a.dl-button');

  /* ── 1. Таймер: кнопка скачивания показывается сразу ─────────────────── */

  function skipTimer() {
    const url = downloadUrl();
    const btn = downloadButton();

    if (btn) {
      if (url && btn.href !== url) btn.href = url;
      if (btn.style.display === 'none') btn.style.display = '';
    }

    // Счётчик прячем, а не удаляем: скрипт сайта продолжает работать без ошибок
    document.querySelectorAll('.dl-counter').forEach(el => {
      if (el.style.display !== 'none') el.style.display = 'none';
    });

    return btn;
  }

  /* ── 2. Кнопка magnet ────────────────────────────────────────────────── */

  const style = document.createElement('style');
  style.textContent =
    '.ftp-dl-button.dl-magnet{border-color:rgba(120,228,90,.45)!important;background:#121c16!important;color:#b7efa6!important;cursor:pointer}' +
    '.ftp-dl-button.dl-magnet:hover{background:#1d2a22!important;color:#d4ff6b!important}' +
    '.ftp-dl-button.dl-magnet.is-busy{opacity:.65;pointer-events:none}' +
    '.ftp-dl-button.dl-magnet.is-error{border-color:rgba(255,138,30,.55)!important;color:#ffd8b8!important}';
  document.head.appendChild(style);

  const setLabel = (btn, text) => {
    const el = btn.querySelector('span');
    if (el && el.textContent !== text) el.textContent = text;
  };

  // Разбор .torrent: нужны границы info-секции (для info hash), имя и трекеры
  function readBencode(bytes) {
    let pos = 0;
    const dec = new TextDecoder('utf-8');

    function readStr() {
      let len = 0;
      while (bytes[pos] !== 0x3a) { len = len * 10 + (bytes[pos] - 0x30); pos++; }
      pos++;
      const start = pos;
      pos += len;
      return dec.decode(bytes.subarray(start, pos));
    }

    function skipValue() {
      const c = bytes[pos];
      if (c === 0x64) {                    // d … e
        pos++;
        while (bytes[pos] !== 0x65) { readStr(); skipValue(); }
        pos++;
      } else if (c === 0x6c) {             // l … e
        pos++;
        while (bytes[pos] !== 0x65) skipValue();
        pos++;
      } else if (c === 0x69) {             // i … e
        pos++;
        while (bytes[pos] !== 0x65) pos++;
        pos++;
      } else {
        readStr();
      }
    }

    function readStrList() {
      const out = [];
      if (bytes[pos] !== 0x6c) { skipValue(); return out; }
      pos++;
      while (bytes[pos] !== 0x65) {
        if (bytes[pos] === 0x6c) {
          pos++;
          while (bytes[pos] !== 0x65) out.push(readStr());
          pos++;
        } else {
          out.push(readStr());
        }
      }
      pos++;
      return out;
    }

    if (bytes[0] !== 0x64) throw new Error('это не .torrent');

    const info = { start: 0, end: 0, name: '' };
    let announce = '';
    let trackers = [];

    pos = 1;
    while (pos < bytes.length && bytes[pos] !== 0x65) {
      const key = readStr();

      if (key === 'announce') {
        announce = readStr();
      } else if (key === 'announce-list') {
        trackers = readStrList();
      } else if (key === 'info') {
        info.start = pos;
        skipValue();
        info.end = pos;

        const after = pos;
        pos = info.start + 1;
        while (pos < info.end - 1 && bytes[pos] !== 0x65) {
          const k = readStr();
          if (k === 'name' || k === 'name.utf-8') info.name = readStr();
          else skipValue();
        }
        pos = after;
      } else {
        skipValue();
      }
    }

    if (!info.end) throw new Error('в файле нет info-секции');
    return { info, announce, trackers };
  }

  let cachedMagnet = null;
  let inflight = null;

  function buildMagnet() {
    if (cachedMagnet) return Promise.resolve(cachedMagnet);

    if (!inflight) {
      inflight = (async () => {
        const url = downloadUrl();
        if (!url) throw new Error('не найдена ссылка на файл');

        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const bytes = new Uint8Array(await res.arrayBuffer());
        const { info, announce, trackers } = readBencode(bytes);

        const digest = await crypto.subtle.digest('SHA-1', bytes.subarray(info.start, info.end));
        const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');

        const parts = ['xt=urn:btih:' + hash, 'dn=' + encodeURIComponent(info.name || torrentName())];
        const list = trackers.length ? trackers : (announce ? [announce] : []);
        [...new Set(list)].filter(Boolean).forEach(tr => parts.push('tr=' + encodeURIComponent(tr)));

        return 'magnet:?' + parts.join('&');
      })().then(magnet => {
        cachedMagnet = magnet;
        return magnet;
      }).finally(() => { inflight = null; });
    }

    return inflight;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  async function onMagnetClick(e) {
    e.preventDefault();
    const btn = e.currentTarget;
    if (btn.classList.contains('is-busy')) return;

    btn.classList.remove('is-error');
    btn.classList.add('is-busy');
    setLabel(btn, 'Готовим…');

    try {
      const magnet = await buildMagnet();
      await copyText(magnet);
      setLabel(btn, 'Открываю торрент-клиент…');
      location.href = magnet;
      setTimeout(() => setLabel(btn, 'Magnet'), 1500);
    } catch (err) {
      console.error('[FreeTP Fast Download]', err);
      btn.classList.add('is-error');
      setLabel(btn, 'Magnet недоступен');
    } finally {
      btn.classList.remove('is-busy');
    }
  }

  function ensureMagnetButton(action) {
    let btn = action.querySelector('.dl-magnet');
    if (btn) return btn;

    btn = document.createElement('a');
    btn.className = 'ftp-dl-button dl-magnet';
    btn.href = '#';
    btn.title = 'Добавить раздачу в торрент-клиент по magnet-ссылке';
    btn.innerHTML = '<i class="ph ph-magnet"></i><span>Magnet</span>';
    btn.addEventListener('click', onMagnetClick);
    btn.addEventListener('mouseenter', () => { buildMagnet().catch(() => {}); }, { once: true });

    const dl = action.querySelector('a.dl-button');
    if (dl) dl.insertAdjacentElement('afterend', btn);
    else action.appendChild(btn);

    return btn;
  }

  /* ── Запуск и наблюдение за перерисовками страницы ───────────────────── */

  function sync() {
    const btn = skipTimer();
    const action = document.querySelector(ACTION);
    if (action) ensureMagnetButton(action);
    return !!btn && !!action;
  }

  sync();

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'href'],
  });

  const timer = setInterval(() => { if (sync()) clearInterval(timer); }, 300);
  setTimeout(() => clearInterval(timer), 15000);
})();