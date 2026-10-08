// ==UserScript==
// @name           Steam Workshop Copy ID
// @namespace      https://github.com/qFamouse/
// @version        2.1
// @description    Copy Steam Workshop item IDs: one-click chip on every card, multi-select with a floating panel (kept between pages), custom separator, collections support (copy IDs of all mods inside a collection)
// @description:ru Копирование ID предметов Мастерской Steam: чип на каждой карточке, множественный выбор с плавающей панелью (сохраняется между страницами), выбор разделителя, поддержка коллекций (ID всех модов внутри коллекции)
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
    const COLLECTIONS_KEY = 'swci:collections'; // кэш: id коллекции -> { t, ids }
    const COLLECTIONS_TTL = 6 * 60 * 60 * 1000;  // 6 часов
    const COLLECTIONS_MAX = 80;                  // сколько коллекций держим в кэше
    const FETCH_CONCURRENCY = 3;
    const ID_RE = /[?&]id=(\d+)/;

    const FORMATS = {
        lines: { label: 'Строки',  sep: '\n' },
        comma: { label: 'Запятая', sep: ', ' },
        space: { label: 'Пробел',  sep: ' ' },
    };

    const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 3.5v-.3A1.2 1.2 0 0 0 9.3 2H3.7A1.2 1.2 0 0 0 2.5 3.2v5.6A1.2 1.2 0 0 0 3.7 10h.3"/></svg>';
    const ICON_CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 8.6l3.1 3.1 6.5-7"/></svg>';
    const ICON_LIST = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 4h7.5M6 8h7.5M6 12h7.5M2.5 4h.01M2.5 8h.01M2.5 12h.01"/></svg>';

    // ─── Состояние (хранится в localStorage, синхронизируется между вкладками) ─
    // В выборе лежат токены: "123" — обычный предмет, "c123" — коллекция.
    // Коллекция разворачивается в ID её модов только при копировании/подсчёте,
    // поэтому пересечения между коллекциями дедуплицируются автоматически.

    function loadSelection() {
        try {
            const arr = JSON.parse(localStorage.getItem(STORE_KEY));
            return Array.isArray(arr) ? arr.filter(x => /^c?\d+$/.test(x)) : [];
        } catch { return []; }
    }

    function loadFormat() {
        try {
            const f = localStorage.getItem(FORMAT_KEY);
            return FORMATS[f] ? f : 'lines';
        } catch { return 'lines'; }
    }

    function loadCollectionsCache() {
        try {
            const raw = JSON.parse(localStorage.getItem(COLLECTIONS_KEY)) || {};
            const now = Date.now();
            const fresh = {};
            for (const [id, v] of Object.entries(raw)) {
                if (/^\d+$/.test(id) && v && Array.isArray(v.ids) && now - v.t < COLLECTIONS_TTL) fresh[id] = v;
            }
            return fresh;
        } catch { return {}; }
    }

    let selected = new Set(loadSelection());
    let format = loadFormat();
    let lastIndex = -1; // для выбора диапазона по Shift
    let colCache = loadCollectionsCache();
    const inflight = new Map(); // id коллекции -> Promise
    const failed = new Set();   // коллекции, которые не удалось загрузить

    function persist() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify([...selected]));
            localStorage.setItem(FORMAT_KEY, format);
        } catch { /* хранилище недоступно — работаем без сохранения */ }
    }

    function persistCollections() {
        try {
            const entries = Object.entries(colCache).sort((a, b) => b[1].t - a[1].t).slice(0, COLLECTIONS_MAX);
            colCache = Object.fromEntries(entries);
            localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(colCache));
        } catch { /* не критично — кэш останется в памяти */ }
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

        .swci-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 2px; }

        .swci-id, .swci-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 0 10px; border: 0; border-radius: 2px; cursor: pointer;
            font: 12px "Motiva Sans", Arial, Helvetica, sans-serif;
            font-variant-numeric: tabular-nums; white-space: nowrap;
            color: #67c1f5; background: rgba(103,193,245,.18);
            transition: color .15s, background .15s;
        }
        .swci-id { margin: 0; line-height: 22px; }
        .swci-btn { line-height: 28px; }
        .swci-id svg { width: 11px; height: 11px; opacity: .85; }
        .swci-id:hover:not([data-flash]), .swci-btn:hover:not(:disabled):not([data-flash]) {
            color: #fff; background: linear-gradient(to right, #47bfff 5%, #1a44c2 60%);
        }
        .swci-btn:disabled { opacity: .4; cursor: default; }
        .swci-id[data-flash="done"], .swci-btn[data-flash="done"] { color: #fff; background: #5ba32b; }
        .swci-id[data-flash="fail"], .swci-btn[data-flash="fail"] { color: #fff; background: #c33c3c; }
        .swci-id[data-flash="busy"], .swci-btn[data-flash="busy"] { color: #fff; background: rgba(103,193,245,.35); cursor: progress; }

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
        .swci-extra { margin-left: 4px; font-size: 12px; color: #8ba4b6; }
        .swci-extra.swci-warn { color: #e0884f; }
        .swci-div { width: 1px; align-self: stretch; background: rgba(255,255,255,.1); }
        .swci-ctx { display: flex; align-items: center; gap: 8px; }
        .swci-ctx .swci-id { line-height: 28px; }

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

    // Раздел «Коллекции» в браузере Мастерской: карточки — это коллекции, а не моды
    const onCollectionsList = () =>
        !onDetailsPage() && new URLSearchParams(location.search).get('section') === 'collections';

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

    // ms = 0 — состояние «busy» без таймера, снимается следующим flash()
    function flash(btn, text, kind, ms = 1500) {
        const el = btn.querySelector('.swci-label');
        clearTimeout(btn._swciTimer);
        btn.dataset.flash = kind;
        el.textContent = text;
        if (ms > 0) {
            btn._swciTimer = setTimeout(() => {
                delete btn.dataset.flash;
                render();
            }, ms);
        }
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

    // ─── Коллекции ────────────────────────────────────────────────────────────

    // Моды внутри коллекции: на странице коллекции каждый — блок .collectionItem
    // с id="sharedfile_<ID>" (запасной вариант — первая ссылка на предмет внутри)
    function parseCollectionItems(root) {
        const ids = [];
        root.querySelectorAll('.collectionItem').forEach(el => {
            const id = el.id?.match(/^sharedfile_(\d+)$/)?.[1]
                ?? idOf(el.querySelector('a[href*="filedetails/?id="]')?.getAttribute('href') ?? '');
            if (id) ids.push(id);
        });
        return [...new Set(ids)];
    }

    async function fetchCollectionMods(id) {
        const res = await fetch(`/sharedfiles/filedetails/?id=${id}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const ids = parseCollectionItems(doc);
        if (!ids.length) throw new Error('в коллекции не найдено ни одного предмета');
        return ids;
    }

    function getCollectionMods(id) {
        if (colCache[id]) return Promise.resolve(colCache[id].ids);
        if (!inflight.has(id)) {
            inflight.set(id, fetchCollectionMods(id)
                .then(ids => {
                    colCache[id] = { t: Date.now(), ids };
                    failed.delete(id);
                    persistCollections();
                    return ids;
                })
                .catch(err => {
                    failed.add(id);
                    console.error('[SteamWorkshopCopyId] коллекция', id, err);
                    throw err;
                })
                .finally(() => {
                    inflight.delete(id);
                    render();
                }));
        }
        return inflight.get(id);
    }

    // Загружает коллекции с ограничением параллелизма, возвращает число ошибок
    async function resolveCollections(ids) {
        const queue = [...ids];
        let errors = 0;
        const worker = async () => {
            while (queue.length) {
                try { await getCollectionMods(queue.shift()); } catch { errors++; }
            }
        };
        await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, worker));
        return errors;
    }

    const collectionIdsInSelection = () =>
        [...selected].filter(t => t[0] === 'c').map(t => t.slice(1));

    // Фоново подгружаем выбранные коллекции, чтобы счётчик показывал реальное число модов
    function prefetchCollections() {
        const todo = collectionIdsInSelection().filter(id => !colCache[id] && !failed.has(id) && !inflight.has(id));
        if (todo.length) resolveCollections(todo);
    }

    // Выбор -> плоский список ID модов (порядок сохраняется, дубли убираются)
    function expandSelection() {
        const ids = new Set();
        let collections = 0, pending = 0, errors = 0;
        for (const token of selected) {
            if (token[0] !== 'c') { ids.add(token); continue; }
            collections++;
            const id = token.slice(1);
            if (colCache[id]) colCache[id].ids.forEach(m => ids.add(m));
            else if (failed.has(id)) errors++;
            else pending++;
        }
        return { ids: [...ids], collections, pending, errors };
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

    const tokenOf = card => (card.dataset.swciKind === 'collection' ? 'c' : '') + card.dataset.swciId;

    function createCheck() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swci-check';
        btn.setAttribute('role', 'checkbox');
        btn.innerHTML = ICON_CHECK;
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            onCheckClick(btn.closest('.swci-card'), e.shiftKey);
        });
        return btn;
    }

    function createChips() {
        const wrap = document.createElement('div');
        wrap.className = 'swci-chips';

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'swci-id swci-copy-id';
        chip.innerHTML = ICON_COPY + '<span class="swci-label"></span>';
        chip.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            copyWithFlash(chip, chip.dataset.id, 'Скопировано');
        });
        wrap.append(chip);
        return wrap;
    }

    function createModsChip() {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'swci-id swci-mods';
        chip.title = 'Скопировать ID всех модов этой коллекции';
        chip.innerHTML = ICON_LIST + '<span class="swci-label">Моды</span>';
        chip.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            copyCollectionMods(chip, chip.dataset.id);
        });
        return chip;
    }

    async function copyCollectionMods(btn, id) {
        if (btn.dataset.flash === 'busy') return;
        flash(btn, 'Загрузка…', 'busy', 0);
        try {
            const ids = await getCollectionMods(id);
            await copyToClipboard(ids.join(FORMATS[format].sep));
            flash(btn, `Скопировано: ${ids.length}`, 'done');
        } catch (err) {
            flash(btn, 'Ошибка', 'fail');
            console.error('[SteamWorkshopCopyId]', err);
        }
    }

    // Чипы карточки зависят от её типа: у коллекции дополнительно есть кнопка «Моды»
    function syncChips(chips, kind, id) {
        const idChip = chips.querySelector('.swci-copy-id');
        idChip.dataset.id = id;
        idChip.title = kind === 'collection' ? 'Скопировать ID коллекции' : 'Скопировать ID предмета';

        let mods = chips.querySelector('.swci-mods');
        if (kind === 'collection') {
            if (!mods) chips.append(mods = createModsChip());
            mods.dataset.id = id;
        } else {
            mods?.remove();
        }
    }

    function prepareCard(card, id, kind) {
        card.classList.add('swci-card');
        card.dataset.swciId = id; // React может переиспользовать узел для другого предмета
        card.dataset.swciKind = kind;

        let check = card.querySelector(':scope > .swci-check');
        if (!check) card.append(check = createCheck());
        check.title = kind === 'collection'
            ? 'Выбрать коллекцию — в список попадут все её моды (Shift — диапазон)'
            : 'Выбрать (Shift — выбрать диапазон)';
        check.setAttribute('aria-label', kind === 'collection' ? 'Выбрать коллекцию' : 'Выбрать предмет');
        return check;
    }

    function inject() {
        if (onDetailsPage()) return injectCollectionPage();

        const kind = onCollectionsList() ? 'collection' : 'mod';

        document.querySelectorAll('a[href*="/sharedfiles/filedetails/?id="]').forEach(thumb => {
            if (!thumb.querySelector('img')) return; // карточку находим по ссылке-картинке
            const id = idOf(thumb.href);
            const card = id && findCard(thumb, id);
            if (!card) return; // например, баннер без превью

            prepareCard(card, id, kind);

            let chips = card.querySelector('.swci-chips');
            if (!chips) {
                chips = createChips();
                const titleBlock = titleLinkOf(card, id)?.parentElement;
                const anchor = titleBlock?.nextElementSibling || titleBlock; // под строкой автора
                if (anchor) anchor.after(chips);
                else card.append(chips);
            }
            syncChips(chips, kind, id);
        });
    }

    // Страница коллекции (старая вёрстка): моды лежат в блоках .collectionItem
    function injectCollectionPage() {
        document.querySelectorAll('.collectionItem').forEach(card => {
            const id = card.id?.match(/^sharedfile_(\d+)$/)?.[1]
                ?? idOf(card.querySelector('a[href*="filedetails/?id="]')?.getAttribute('href') ?? '');
            if (!id) return;

            prepareCard(card, id, 'mod');

            let chips = card.querySelector('.swci-chips');
            if (!chips) {
                chips = createChips();
                (card.querySelector('.collectionItemDetails') ?? card).append(chips);
            }
            syncChips(chips, 'mod', id);
        });
    }

    // ─── Выбор ────────────────────────────────────────────────────────────────

    const allCards = () => [...document.querySelectorAll('.swci-card')];

    function setSelected(token, on) {
        if (on) selected.add(token); else selected.delete(token);
    }

    function onCheckClick(card, shift) {
        const cards = allCards();
        const index = cards.indexOf(card);
        const on = !selected.has(tokenOf(card));

        if (shift && lastIndex >= 0 && lastIndex < cards.length) {
            const [from, to] = index < lastIndex ? [index, lastIndex] : [lastIndex, index];
            for (let i = from; i <= to; i++) setSelected(tokenOf(cards[i]), on);
        } else {
            setSelected(tokenOf(card), on);
        }
        lastIndex = index;
        commit();
    }

    function commit() {
        persist();
        prefetchCollections();
        render();
    }

    async function copySelection(btn) {
        if (btn.dataset.flash === 'busy') return;

        const missing = collectionIdsInSelection().filter(id => !colCache[id]);
        let loadErrors = 0;
        if (missing.length) {
            flash(btn, `Загрузка коллекций: ${missing.length}…`, 'busy', 0);
            loadErrors = await resolveCollections(missing);
        }

        const { ids } = expandSelection();
        if (!ids.length) {
            flash(btn, 'Ошибка', 'fail');
            return;
        }
        try {
            await copyToClipboard(ids.join(FORMATS[format].sep));
            flash(btn, loadErrors ? `Скопировано: ${ids.length}, ошибок: ${loadErrors}` : `Скопировано: ${ids.length}`,
                loadErrors ? 'fail' : 'done');
        } catch (err) {
            flash(btn, 'Ошибка', 'fail');
            console.error('[SteamWorkshopCopyId]', err);
        }
    }

    // ─── Панель ───────────────────────────────────────────────────────────────

    const panel = document.createElement('div');
    panel.className = 'swci-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Копирование ID мастерской');
    panel.innerHTML = `
        <div class="swci-ctx" data-ref="ctx" hidden>
            <button type="button" class="swci-id" data-act="copy-this">${ICON_COPY}<span class="swci-label"></span></button>
            <button type="button" class="swci-btn" data-act="toggle-this"><span class="swci-label"></span></button>
            <button type="button" class="swci-btn" data-act="copy-mods" title="Скопировать ID всех модов коллекции"><span class="swci-label"></span></button>
        </div>
        <div class="swci-div" data-ref="ctx-div" hidden></div>
        <div class="swci-count">Выбрано: <b data-ref="count">0</b><span class="swci-extra" data-ref="extra" hidden></span></div>
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
                copySelection(btn);
                break;
            case 'clear':
                selected.clear();
                lastIndex = -1;
                commit();
                break;
            case 'page': {
                const tokens = allCards().map(tokenOf);
                const everySelected = tokens.every(t => selected.has(t));
                tokens.forEach(t => setSelected(t, !everySelected));
                commit();
                break;
            }
            case 'copy-this':
                copyWithFlash(btn, currentItemId(), 'Скопировано');
                break;
            case 'copy-mods': {
                const ids = allCards().map(c => c.dataset.swciId);
                copyWithFlash(btn, ids.join(FORMATS[format].sep), `Скопировано: ${ids.length}`);
                break;
            }
            case 'toggle-this': {
                const id = currentItemId();
                setSelected(id, !selected.has(id));
                commit();
                break;
            }
        }
    });

    function render() {
        document.body.classList.toggle('swci-has-selection', selected.size > 0);

        const cards = allCards();
        cards.forEach(card => {
            const id = card.dataset.swciId;
            const on = selected.has(tokenOf(card));
            card.classList.toggle('swci-selected', on);

            const check = card.querySelector(':scope > .swci-check');
            if (check) {
                check.classList.toggle('swci-on', on);
                check.setAttribute('aria-checked', String(on));
            }
            const chip = card.querySelector('.swci-copy-id');
            if (chip) setLabel(chip, 'ID ' + id);

            const mods = card.querySelector('.swci-mods');
            if (mods) setLabel(mods, colCache[id] ? `Моды (${colCache[id].ids.length})` : 'Моды');
        });

        // Контекст страницы предмета / коллекции
        const current = currentItemId();
        const inCollection = !!current && cards.length > 0;
        ref('ctx').hidden = !current;
        ref('ctx-div').hidden = !current;
        if (current) {
            const copyThis = act('copy-this');
            copyThis.title = inCollection ? 'Скопировать ID коллекции' : 'Скопировать ID этого предмета';
            setLabel(copyThis, (inCollection ? 'Коллекция ' : 'ID ') + current);

            const toggle = act('toggle-this');
            toggle.hidden = inCollection;
            if (!inCollection) setLabel(toggle, selected.has(current) ? 'Убрать из списка' : 'В список');

            const mods = act('copy-mods');
            mods.hidden = !inCollection;
            if (inCollection) setLabel(mods, `Моды коллекции (${cards.length})`);
        }

        // Счётчик: уникальные моды + сводка по выбранным коллекциям
        const { ids, collections, pending, errors } = expandSelection();
        ref('count').textContent = ids.length;
        const extra = ref('extra');
        extra.hidden = collections === 0;
        if (collections) {
            const parts = [`коллекций: ${collections}`];
            if (pending) parts.push('загрузка…');
            if (errors) parts.push(`ошибок: ${errors}`);
            const text = `(${parts.join(', ')})`;
            if (extra.textContent !== text) extra.textContent = text;
            extra.classList.toggle('swci-warn', errors > 0);
        }

        const pageBtn = act('page');
        const everySelected = cards.length > 0 && cards.every(c => selected.has(tokenOf(c)));
        pageBtn.hidden = !!current && !inCollection;
        pageBtn.disabled = cards.length === 0;
        setLabel(pageBtn, everySelected ? 'Снять со страницы' : 'Все на странице');

        act('clear').disabled = selected.size === 0;

        const copyBtn = act('copy');
        copyBtn.disabled = selected.size === 0;
        setLabel(copyBtn, ids.length ? `Копировать ID (${ids.length})` : 'Копировать ID');

        panel.querySelectorAll('[data-fmt]').forEach(b =>
            b.classList.toggle('swci-active', b.dataset.fmt === format));
    }

    // ─── Динамическая подгрузка карточек ──────────────────────────────────────

    let scheduled = false;
    new MutationObserver(mutations => {
        // Собственные изменения (подписи кнопок, вставка контролов) игнорируем
        const external = mutations.some(m => {
            const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
            return !el?.closest('.swci-panel, .swci-chips, .swci-id, .swci-check');
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
        prefetchCollections();
        render();
    });

    document.body.appendChild(panel);
    inject();
    prefetchCollections();
    render();
})();
