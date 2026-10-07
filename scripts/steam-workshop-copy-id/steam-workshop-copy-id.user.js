// ==UserScript==
// @name           Steam Workshop Copy ID
// @namespace      https://github.com/qFamouse/
// @version        2.0
// @description    Copy Steam Workshop item IDs: one-click chip on every card, multi-select with a floating panel (kept between pages), custom separator
// @description:ru Копирование ID предметов Мастерской Steam: чип на каждой карточке, множественный выбор с плавающей панелью (сохраняется между страницами), выбор разделителя
// @author         Famouse
// @license        MIT
// @match          https://steamcommunity.com/app/*/workshop/*
// @match          https://steamcommunity.com/workshop/browse/*
// @match          https://steamcommunity.com/sharedfiles/filedetails/*
// @icon           https://www.google.com/s2/favicons?sz=64&domain=steamcommunity.com
// @grant          none
// @homepageURL    https://github.com/qFamouse/Userscripts/tree/master/scripts/steam-workshop-copy-id
// @supportURL     https://github.com/qFamouse/Userscripts/issues
// @updateURL      https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/steam-workshop-copy-id/steam-workshop-copy-id.user.js
// @downloadURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/steam-workshop-copy-id/steam-workshop-copy-id.user.js
// ==/UserScript==

(function () {
    'use strict';

    const STORE_KEY = 'swci:selection';
    const FORMAT_KEY = 'swci:format';
    const ID_RE = /[?&]id=(\d+)/;

    const FORMATS = {
        lines: { label: 'Строки',  sep: '\n' },
        comma: { label: 'Запятая', sep: ', ' },
        space: { label: 'Пробел',  sep: ' ' },
    };

    const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 3.5v-.3A1.2 1.2 0 0 0 9.3 2H3.7A1.2 1.2 0 0 0 2.5 3.2v5.6A1.2 1.2 0 0 0 3.7 10h.3"/></svg>';
    const ICON_CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 8.6l3.1 3.1 6.5-7"/></svg>';

    // ─── Состояние (хранится в localStorage, синхронизируется между вкладками) ─

    function loadSelection() {
        try {
            const arr = JSON.parse(localStorage.getItem(STORE_KEY));
            return Array.isArray(arr) ? arr.filter(x => /^\d+$/.test(x)) : [];
        } catch { return []; }
    }

    function loadFormat() {
        try {
            const f = localStorage.getItem(FORMAT_KEY);
            return FORMATS[f] ? f : 'lines';
        } catch { return 'lines'; }
    }

    let selected = new Set(loadSelection());
    let format = loadFormat();
    let lastIndex = -1; // для выбора диапазона по Shift

    function persist() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify([...selected]));
            localStorage.setItem(FORMAT_KEY, format);
        } catch { /* хранилище недоступно — работаем без сохранения */ }
    }

    // ─── Стили ────────────────────────────────────────────────────────────────
    // Классы карточек в новом интерфейсе Steam хешированные и меняются между
    // билдами, поэтому карточка определяется по структуре: ближайший предок,
    // в котором есть и ссылка-картинка, и ссылка-заголовок на один и тот же ID.

    const style = document.createElement('style');
    style.textContent = `
        .swci-card { position: relative; }
        .swci-card.swci-selected { outline: 2px solid #67c1f5; outline-offset: -2px; }

        .swci-check {
            position: absolute; top: 8px; left: 8px; z-index: 5;
            display: flex; align-items: center; justify-content: center;
            width: 24px; height: 24px; padding: 0;
            border: 1px solid rgba(255,255,255,.45); border-radius: 4px;
            background: rgba(23,26,33,.72); color: transparent; cursor: pointer;
            opacity: 0; user-select: none;
            transition: opacity .12s, background .12s, border-color .12s;
        }
        .swci-check svg { width: 14px; height: 14px; }
        body.swci-has-selection .swci-check { opacity: .75; }
        .swci-card:hover .swci-check, body .swci-check.swci-on, .swci-check:focus-visible { opacity: 1; }
        .swci-check:hover { border-color: #67c1f5; }
        .swci-check.swci-on {
            color: #fff; border-color: #67c1f5;
            background: linear-gradient(to right, #47bfff 5%, #1a44c2 60%);
        }

        .swci-id, .swci-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 0 10px; border: 0; border-radius: 2px; cursor: pointer;
            font: 12px "Motiva Sans", Arial, Helvetica, sans-serif;
            font-variant-numeric: tabular-nums; white-space: nowrap;
            color: #67c1f5; background: rgba(103,193,245,.18);
            transition: color .15s, background .15s;
        }
        .swci-id { margin: 6px 0 2px; line-height: 22px; }
        .swci-btn { line-height: 28px; }
        .swci-id svg { width: 11px; height: 11px; opacity: .85; }
        .swci-id:hover:not([data-flash]), .swci-btn:hover:not(:disabled):not([data-flash]) {
            color: #fff; background: linear-gradient(to right, #47bfff 5%, #1a44c2 60%);
        }
        .swci-btn:disabled { opacity: .4; cursor: default; }
        .swci-id[data-flash="done"], .swci-btn[data-flash="done"] { color: #fff; background: #5ba32b; }
        .swci-id[data-flash="fail"], .swci-btn[data-flash="fail"] { color: #fff; background: #c33c3c; }

        .swci-panel {
            position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
            z-index: 2147483000; box-sizing: border-box; max-width: calc(100vw - 24px);
            display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px;
            padding: 8px 10px; border: 1px solid rgba(103,193,245,.28); border-radius: 6px;
            background: rgba(23,26,33,.96); backdrop-filter: blur(6px);
            box-shadow: 0 6px 24px rgba(0,0,0,.55);
            color: #c6d4df; font: 13px "Motiva Sans", Arial, Helvetica, sans-serif;
        }
        .swci-panel [hidden] { display: none !important; }
        .swci-count { min-width: 84px; padding: 0 4px; white-space: nowrap; }
        .swci-count b { color: #67c1f5; font-size: 15px; }
        .swci-div { width: 1px; align-self: stretch; background: rgba(255,255,255,.1); }
        .swci-ctx { display: flex; align-items: center; gap: 8px; }
        .swci-ctx .swci-id { margin: 0; line-height: 28px; }

        .swci-seg { display: inline-flex; overflow: hidden; border-radius: 2px; background: rgba(103,193,245,.12); }
        .swci-seg button {
            padding: 0 10px; border: 0; line-height: 28px; cursor: pointer;
            font: 12px "Motiva Sans", Arial, Helvetica, sans-serif;
            color: #8ba4b6; background: transparent; transition: color .15s, background .15s;
        }
        .swci-seg button:hover { color: #fff; }
        .swci-seg button.swci-active { color: #fff; background: rgba(103,193,245,.35); }

        .swci-primary { color: #fff; background: linear-gradient(to right, #47bfff 5%, #1a44c2 60%); }
        .swci-primary:hover:not(:disabled):not([data-flash]) { filter: brightness(1.15); }
    `;
    document.head.appendChild(style);

    // ─── Утилиты ──────────────────────────────────────────────────────────────

    const idOf = href => href.match(ID_RE)?.[1] ?? null;

    const onDetailsPage = () => location.pathname.includes('/sharedfiles/filedetails');
    const currentItemId = () => (onDetailsPage() ? idOf(location.search) : null);

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            if (!ok) throw new Error('copy failed');
        }
    }

    // Текст меняем только если он реально отличается — иначе MutationObserver зациклится
    function setLabel(btn, text) {
        if (btn.dataset.flash) return;
        const el = btn.querySelector('.swci-label');
        if (el && el.textContent !== text) el.textContent = text;
    }

    function flash(btn, text, kind) {
        const el = btn.querySelector('.swci-label');
        clearTimeout(btn._swciTimer);
        btn.dataset.flash = kind;
        el.textContent = text;
        btn._swciTimer = setTimeout(() => {
            delete btn.dataset.flash;
            render();
        }, 1500);
    }

    async function copyWithFlash(btn, text, okText) {
        try {
            await copyToClipboard(text);
            flash(btn, okText, 'done');
        } catch (err) {
            flash(btn, 'Ошибка', 'fail');
            console.error('[SteamWorkshopCopyId]', err);
        }
    }

    // ─── Карточки ─────────────────────────────────────────────────────────────

    const titleLinkOf = (el, id) =>
        [...el.querySelectorAll('a[href*="filedetails/?id="]')]
            .find(a => !a.querySelector('img') && idOf(a.href) === id) ?? null;

    function findCard(thumb, id) {
        let el = thumb.parentElement;
        for (let depth = 0; el && el !== document.body && depth < 6; depth++, el = el.parentElement) {
            if (titleLinkOf(el, id)) return el;
        }
        return null;
    }

    function createCheck() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swci-check';
        btn.setAttribute('role', 'checkbox');
        btn.setAttribute('aria-label', 'Выбрать предмет');
        btn.title = 'Выбрать (Shift — выбрать диапазон)';
        btn.innerHTML = ICON_CHECK;
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            onCheckClick(btn.closest('.swci-card'), e.shiftKey);
        });
        return btn;
    }

    function createChip() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swci-id';
        btn.title = 'Скопировать ID предмета';
        btn.innerHTML = ICON_COPY + '<span class="swci-label"></span>';
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            copyWithFlash(btn, btn.dataset.id, 'Скопировано');
        });
        return btn;
    }

    function inject() {
        if (onDetailsPage()) return;

        document.querySelectorAll('a[href*="/sharedfiles/filedetails/?id="]').forEach(thumb => {
            if (!thumb.querySelector('img')) return; // карточку находим по ссылке-картинке
            const id = idOf(thumb.href);
            const card = id && findCard(thumb, id);
            if (!card) return; // например, баннер без превью

            card.classList.add('swci-card');
            card.dataset.swciId = id; // React может переиспользовать узел для другого предмета

            if (!card.querySelector(':scope > .swci-check')) card.append(createCheck());

            let chip = card.querySelector('.swci-id');
            if (!chip) {
                chip = createChip();
                const titleBlock = titleLinkOf(card, id)?.parentElement;
                const anchor = titleBlock?.nextElementSibling || titleBlock; // под строкой автора
                if (anchor) anchor.after(chip);
                else card.append(chip);
            }
            chip.dataset.id = id;
        });
    }

    // ─── Выбор ────────────────────────────────────────────────────────────────

    const allCards = () => [...document.querySelectorAll('.swci-card')];

    function setSelected(id, on) {
        if (on) selected.add(id); else selected.delete(id);
    }

    function onCheckClick(card, shift) {
        const cards = allCards();
        const index = cards.indexOf(card);
        const on = !selected.has(card.dataset.swciId);

        if (shift && lastIndex >= 0 && lastIndex < cards.length) {
            const [from, to] = index < lastIndex ? [index, lastIndex] : [lastIndex, index];
            for (let i = from; i <= to; i++) setSelected(cards[i].dataset.swciId, on);
        } else {
            setSelected(card.dataset.swciId, on);
        }
        lastIndex = index;
        commit();
    }

    function commit() {
        persist();
        render();
    }

    // ─── Панель ───────────────────────────────────────────────────────────────

    const panel = document.createElement('div');
    panel.className = 'swci-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Копирование ID мастерской');
    panel.innerHTML = `
        <div class="swci-ctx" data-ref="ctx" hidden>
            <button type="button" class="swci-id" data-act="copy-this" title="Скопировать ID этого предмета">${ICON_COPY}<span class="swci-label"></span></button>
            <button type="button" class="swci-btn" data-act="toggle-this"><span class="swci-label"></span></button>
        </div>
        <div class="swci-div" data-ref="ctx-div" hidden></div>
        <div class="swci-count">Выбрано: <b data-ref="count">0</b></div>
        <button type="button" class="swci-btn" data-act="page"><span class="swci-label"></span></button>
        <button type="button" class="swci-btn" data-act="clear"><span class="swci-label">Сбросить</span></button>
        <div class="swci-div"></div>
        <div class="swci-seg" role="group" aria-label="Разделитель">
            ${Object.entries(FORMATS).map(([key, f]) => `<button type="button" data-fmt="${key}">${f.label}</button>`).join('')}
        </div>
        <button type="button" class="swci-btn swci-primary" data-act="copy"><span class="swci-label"></span></button>
    `;

    const ref = name => panel.querySelector(`[data-ref="${name}"]`);
    const act = name => panel.querySelector(`[data-act="${name}"]`);

    panel.addEventListener('click', e => {
        const fmtBtn = e.target.closest('[data-fmt]');
        if (fmtBtn) {
            format = fmtBtn.dataset.fmt;
            commit();
            return;
        }

        const btn = e.target.closest('[data-act]');
        if (!btn || btn.disabled) return;

        switch (btn.dataset.act) {
            case 'copy':
                copyWithFlash(btn, [...selected].join(FORMATS[format].sep), `Скопировано: ${selected.size}`);
                break;
            case 'clear':
                selected.clear();
                lastIndex = -1;
                commit();
                break;
            case 'page': {
                const ids = allCards().map(c => c.dataset.swciId);
                const everySelected = ids.every(id => selected.has(id));
                ids.forEach(id => setSelected(id, !everySelected));
                commit();
                break;
            }
            case 'copy-this':
                copyWithFlash(btn, currentItemId(), 'Скопировано');
                break;
            case 'toggle-this': {
                const id = currentItemId();
                setSelected(id, !selected.has(id));
                commit();
                break;
            }
        }
    });

    function render() {
        const n = selected.size;
        document.body.classList.toggle('swci-has-selection', n > 0);

        const cards = allCards();
        cards.forEach(card => {
            const id = card.dataset.swciId;
            const on = selected.has(id);
            card.classList.toggle('swci-selected', on);

            const check = card.querySelector(':scope > .swci-check');
            if (check) {
                check.classList.toggle('swci-on', on);
                check.setAttribute('aria-checked', String(on));
            }
            const chip = card.querySelector('.swci-id');
            if (chip) setLabel(chip, 'ID ' + id);
        });

        // Контекст страницы предмета: ID текущего мода и кнопка «в список»
        const current = currentItemId();
        ref('ctx').hidden = !current;
        ref('ctx-div').hidden = !current;
        if (current) {
            setLabel(act('copy-this'), 'ID ' + current);
            setLabel(act('toggle-this'), selected.has(current) ? 'Убрать из списка' : 'В список');
        }

        ref('count').textContent = n;

        const pageBtn = act('page');
        const everySelected = cards.length > 0 && cards.every(c => selected.has(c.dataset.swciId));
        pageBtn.hidden = !!current;
        pageBtn.disabled = cards.length === 0;
        setLabel(pageBtn, everySelected ? 'Снять со страницы' : 'Все на странице');

        act('clear').disabled = n === 0;

        const copyBtn = act('copy');
        copyBtn.disabled = n === 0;
        setLabel(copyBtn, n ? `Копировать ID (${n})` : 'Копировать ID');

        panel.querySelectorAll('[data-fmt]').forEach(b =>
            b.classList.toggle('swci-active', b.dataset.fmt === format));
    }

    // ─── Динамическая подгрузка карточек ──────────────────────────────────────

    let scheduled = false;
    new MutationObserver(mutations => {
        // Собственные изменения (подписи кнопок, вставка контролов) игнорируем
        const external = mutations.some(m => {
            const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
            return !el?.closest('.swci-panel, .swci-id, .swci-check');
        });
        if (!external || scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; inject(); render(); });
    }).observe(document.body, { childList: true, subtree: true });

    // Выбор в соседней вкладке
    window.addEventListener('storage', e => {
        if (e.key !== STORE_KEY && e.key !== FORMAT_KEY) return;
        selected = new Set(loadSelection());
        format = loadFormat();
        render();
    });

    document.body.appendChild(panel);
    inject();
    render();
})();
