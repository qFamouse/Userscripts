// ==UserScript==
// @name         Tabletka Price Filter
// @namespace    https://github.com/qFamouse/
// @version      1.0
// @description  Price filter for tabletka.by: from/to fields and a button to fill in the minimum price
// @description:ru Фильтр по цене на tabletka.by — поля «от/до» и кнопка минимальной цены
// @author       Famouse
// @license      MIT
// @match        https://tabletka.by/result/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tabletka.by
// @grant        none
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/main/scripts/tabletka-price-filter
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://github.com/qFamouse/Userscripts/raw/main/scripts/tabletka-price-filter/tabletka-price-filter.user.js
// @downloadURL  https://github.com/qFamouse/Userscripts/raw/main/scripts/tabletka-price-filter/tabletka-price-filter.user.js
// ==/UserScript==

(function () {
  'use strict';

  function init() {
    if (document.getElementById('__cpf')) return true;

    const priceTitle = [...document.querySelectorAll('.select-check-title')]
      .find(el => el.textContent.trim() === 'Диапазон цен');
    if (!priceTitle) return false;

    const ul = priceTitle.closest('.page-nav-item').querySelector('ul.result-check');
    if (!ul) return false;

    // ── helpers ────────────────────────────────────────────────────────────
    function getRowPrice(row) {
      const el = row.querySelector('.price-value');
      if (!el) return null;
      const v = parseFloat(el.textContent.replace(/[^\d.,]/g, '').replace(',', '.'));
      return isNaN(v) ? null : v;
    }

    function calcMin() {
      let min = Infinity;
      document.querySelectorAll('tr.tr-border').forEach(row => {
        const v = getRowPrice(row);
        if (v !== null && v < min) min = v;
      });
      return isFinite(min) ? min : null;
    }

    function applyToMap(testFn) {
      const om = window.myObjectManager;
      if (!om || typeof om.setFilter !== 'function') return false;
      om.setFilter(obj => {
        const p = parseFloat(String(obj.price ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
        return isNaN(p) || testFn(p);
      });
      return true;
    }

    function getGroupFilter() {
      const checked = [...ul.querySelectorAll('.select-check-real:checked')];
      if (!checked.length)
        return 'properties.group == 1 || properties.group == 2 || properties.group == 3';
      return checked.map(el => `properties.group == ${el.getAttribute('group')}`).join(' || ');
    }

    // ── UI ─────────────────────────────────────────────────────────────────
    const li = document.createElement('li');
    li.id = '__cpf';
    li.className = 'select-check-item';
    li.style.cssText = 'padding-top:6px;border-top:1px solid #eaeaea;margin-top:4px;';
    li.innerHTML = `
      <label style="display:flex;align-items:center;gap:5px;cursor:default;">
        <span class="select-check-text" style="display:flex;align-items:center;gap:4px;flex:1;min-width:0;flex-wrap:wrap;">
          <input id="__cpf-from" type="number" placeholder="от" step="0.01" min="0"
            style="width:58px;padding:3px 5px;border:1px solid #ccc;border-radius:3px;
                   font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;
                   transition:border-color .15s;" />
          <span style="color:#aaa;">–</span>
          <input id="__cpf-to" type="number" placeholder="до" step="0.01" min="0"
            style="width:58px;padding:3px 5px;border:1px solid #ccc;border-radius:3px;
                   font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;
                   transition:border-color .15s;" />
          <span style="color:#555;white-space:nowrap;">р.</span>
          <button id="__cpf-minbtn"
            style="padding:2px 6px;background:none;border:1px solid #ccc;border-radius:3px;
                   font-size:11px;color:#888;cursor:pointer;font-family:inherit;
                   white-space:nowrap;transition:border-color .15s,color .15s;"
            title="Подставить минимальную цену">мин</button>
        </span>
      </label>
      <div id="__cpf-info" style="font-size:11px;color:#888;margin-top:3px;min-height:14px;"></div>
    `;
    ul.appendChild(li);

    const inpFrom = document.getElementById('__cpf-from');
    const inpTo   = document.getElementById('__cpf-to');
    const info    = document.getElementById('__cpf-info');
    const btnMin  = document.getElementById('__cpf-minbtn');

    [inpFrom, inpTo].forEach(inp => {
      inp.addEventListener('focus', () => inp.style.borderColor = '#4caf50');
      inp.addEventListener('blur',  () => inp.style.borderColor = inp.value ? '#4caf50' : '#ccc');
    });
    li.addEventListener('click', e => e.stopPropagation());

    btnMin.addEventListener('mouseover', () => { btnMin.style.borderColor = '#4caf50'; btnMin.style.color = '#4caf50'; });
    btnMin.addEventListener('mouseout',  () => { btnMin.style.borderColor = '#ccc';    btnMin.style.color = '#888'; });

    // ── apply / reset ──────────────────────────────────────────────────────
    function applyRange() {
      const from = parseFloat(inpFrom.value);
      const to   = parseFloat(inpTo.value);
      const hasFrom = !isNaN(from), hasTo = !isNaN(to);

      if (!hasFrom && !hasTo) { resetAll(); return; }

      let shown = 0, hidden = 0;
      document.querySelectorAll('tr.tr-border').forEach(row => {
        const p = getRowPrice(row);
        if (p === null) return;
        const ok = (!hasFrom || p >= from) && (!hasTo || p <= to);
        row.style.display = ok ? '' : 'none';
        ok ? shown++ : hidden++;
      });

      applyToMap(p => (!hasFrom || p >= from) && (!hasTo || p <= to));
      info.textContent = `${shown} аптек · карта ✓`;
      info.style.color = '#4caf50';
    }

    function resetAll() {
      inpFrom.value = '';
      inpTo.value = '';
      [inpFrom, inpTo].forEach(inp => inp.style.borderColor = '#ccc');
      document.querySelectorAll('tr.tr-border').forEach(r => r.style.display = '');
      const om = window.myObjectManager;
      if (om && typeof om.setFilter === 'function') om.setFilter(getGroupFilter());
      info.textContent = '';
    }

    btnMin.addEventListener('click', () => {
      const min = calcMin();
      if (min === null) { info.textContent = 'Таблица не загружена'; return; }
      inpTo.value = min.toFixed(2);
      inpTo.style.borderColor = '#4caf50';
      applyRange();
    });

    let timer;
    [inpFrom, inpTo].forEach(inp => {
      inp.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(applyRange, 350);
      });
      inp.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter')  { clearTimeout(timer); applyRange(); }
        if (e.key === 'Escape') resetAll();
      });
    });

    return true;
  }

  // Ждём загрузки страницы — таблица и фильтры появляются асинхронно
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (init() || attempts >= 50) clearInterval(interval);
  }, 200);

  // Восстанавливаем после динамической перезагрузки таблицы
  const observer = new MutationObserver(() => {
    if (!document.getElementById('__cpf')) init();
  });
  const waitBody = setInterval(() => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      clearInterval(waitBody);
    }
  }, 100);
})();