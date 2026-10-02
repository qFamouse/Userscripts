// ==UserScript==
// @name         NNM-Club Magnet Column
// @namespace    https://github.com/qFamouse/
// @version      1.1
// @description  Adds a magnet link column on NNM-Club: next to DL on the tracker, next to Topic on the top releases page
// @description:ru Добавляет колонку с magnet-ссылкой на NNM-Club: рядом с DL на трекере и рядом с «Тема» на странице популярного
// @author       Famouse
// @license      MIT
// @match        https://nnmclub.to/forum/tracker.php*
// @match        https://nnmclub.to/forum/medal.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nnmclub.to
// @grant        none
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/master/scripts/nnmclub-magnet-column
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/nnmclub-magnet-column/nnmclub-magnet-column.user.js
// @downloadURL  https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/nnmclub-magnet-column/nnmclub-magnet-column.user.js
// ==/UserScript==

(function () {
    'use strict';

    const HOVER_DELAY = 250; // мс до предзагрузки magnet при наведении
    const cache = new Map(); // topicUrl -> Promise<string>

    // ── magnet ───────────────────────────────────────────────────────────────
    function findMagnet(root) {
        const a = root.querySelector('.btTbl a[href^="magnet:"]') || root.querySelector('a[href^="magnet:"]');
        return a ? a.getAttribute('href') : null;
    }

    // В списке трекера magnet нет — берём со страницы раздачи (viewtopic.php?t=...)
    function fetchMagnet(topicUrl) {
        if (!cache.has(topicUrl)) {
            const p = fetch(topicUrl, { credentials: 'include' })
                .then(r => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.text();
                })
                .then(html => {
                    const magnet = findMagnet(new DOMParser().parseFromString(html, 'text/html'));
                    if (!magnet) throw new Error('magnet не найден на странице раздачи');
                    return magnet;
                });
            p.catch(() => cache.delete(topicUrl));
            cache.set(topicUrl, p);
        }
        return cache.get(topicUrl);
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    const TITLE = 'Magnet-ссылка (Shift+клик — копировать)';

    function setLabel(a, text, ms) {
        a.querySelector('b').textContent = text;
        if (ms) setTimeout(() => setLabel(a, 'MG'), ms);
    }

    function createCell(row, refCell) {
        const td = document.createElement('td');
        td.className = refCell.className; // row1/row2 на medal.php
        td.align = 'center';
        td.noWrap = true;

        // 1) magnet прямо в строке, если вдруг есть
        const inRow = findMagnet(row);

        // 2) иначе — со страницы раздачи
        const topic = row.querySelector('a.topictitle') || row.querySelector('a[href*="viewtopic.php?t="]');
        const topicUrl = topic ? topic.href : null;
        if (!inRow && !topicUrl) return td;

        const a = document.createElement('a');
        a.className = 'genmed';
        a.rel = 'nofollow';
        a.title = TITLE;
        a.href = inRow || topicUrl;
        a.innerHTML = '[ <b>MG</b> ]';
        td.appendChild(a);

        const getMagnet = () => (inRow ? Promise.resolve(inRow) : fetchMagnet(topicUrl));

        // Предзагрузка при наведении — чтобы клик был мгновенным, а «копировать адрес ссылки» работал
        let timer;
        a.addEventListener('mouseenter', () => {
            timer = setTimeout(() => getMagnet().then(m => { a.href = m; }).catch(() => {}), HOVER_DELAY);
        });
        a.addEventListener('mouseleave', () => clearTimeout(timer));

        a.addEventListener('click', async e => {
            e.preventDefault();
            setLabel(a, '…');
            try {
                const magnet = await getMagnet();
                a.href = magnet;
                if (e.shiftKey) {
                    await navigator.clipboard.writeText(magnet);
                    setLabel(a, '✓', 1500);
                } else {
                    setLabel(a, 'MG');
                    location.href = magnet;
                }
            } catch (err) {
                console.error('[NNM Magnet]', err);
                a.title = 'Ошибка: ' + err.message;
                setLabel(a, '!', 3000);
            }
        });

        return td;
    }

    // Колонка, после которой вставляем MG: DL (трекер) или «Тема» (medal.php, где DL нет)
    const ANCHORS = [['DL'], ['Тема', 'Topic']];

    function processTable(table) {
        const rows = [...table.rows];
        const headRow = rows.find(r => r.querySelector('th'));
        if (!headRow || table.dataset.magnetColumn) return;

        const headCells = [...headRow.cells];
        let anchorIdx = -1;
        for (const names of ANCHORS) {
            anchorIdx = headCells.findIndex(th => names.includes(th.textContent.trim()) || names.includes(th.title));
            if (anchorIdx >= 0) break;
        }
        if (anchorIdx < 0) return;

        const dataRows = rows.filter(r => r !== headRow && !r.querySelector('th') && r.cells.length === headCells.length);
        if (!dataRows.length) return;
        table.dataset.magnetColumn = '1';

        const refTh = headCells[anchorIdx];
        const th = document.createElement('th');
        th.className = refTh.className;
        th.align = 'center';
        th.noWrap = true;
        th.title = 'Magnet-ссылка';
        th.textContent = ' MG ';
        if (/sorter/.test(th.className)) th.className = '{sorter: false}'; // tablesorter на трекере
        refTh.after(th);

        dataRows.forEach(row => {
            const ref = row.cells[anchorIdx];
            ref.after(createCell(row, ref));
        });
    }

    function init() {
        document.querySelectorAll('table.forumline').forEach(processTable);
    }

    init();
})();