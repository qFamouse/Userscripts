// ==UserScript==
// @name         Onliner Compare Extended
// @namespace    https://github.com/qFamouse/
// @version      3.0
// @description  Widens the Onliner comparison table and lets you copy it as CSV
// @description:ru Позволяет расширить таблицу сравнения Onliner и скопировать её в CSV
// @author       Famouse
// @license      MIT
// @match        https://catalog.onliner.by/compare/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=onliner.by
// @grant        GM_setValue
// @grant        GM_getValue
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/main/scripts/onliner-compare-extended
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://github.com/qFamouse/Userscripts/raw/main/scripts/onliner-compare-extended/onliner-compare-extended.user.js
// @downloadURL  https://github.com/qFamouse/Userscripts/raw/main/scripts/onliner-compare-extended/onliner-compare-extended.user.js
// ==/UserScript==
(function () {
    'use strict';

    // ─── Константы ────────────────────────────────────────────────────────────
    const MARKER         = 'ch-expand-btn';
    const SETTINGS_KEY   = 'ch_csv_settings';
    const DEFAULT_SETTINGS = {
        includeName:       true,
        includePrice:      true,
        includeSections:   true,
        onlyDiff:          false,
        separator:         ';',
        includeUrl:        true,
        includeRating:     false,
        boolFormat:        'word', // 'word' = Да/Нет, 'symbol' = ✓/✗, 'bool' = true/false
    };

    let expanded = false;
    let settingsOpen = false;

    // ─── Утилиты ──────────────────────────────────────────────────────────────
    function loadSettings() {
        try {
            const raw = GM_getValue(SETTINGS_KEY, '{}');
            return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
        } catch { return { ...DEFAULT_SETTINGS }; }
    }

    function saveSettings(s) {
        GM_setValue(SETTINGS_KEY, JSON.stringify(s));
    }

    function escapeCell(val, sep) {
        if (val == null) return '';
        const str = String(val).replace(/\u00a0/g, ' ').trim();
        if (str.includes(sep) || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    // ─── Кнопка «Убрать границы» ──────────────────────────────────────────────
    function hideClearButtons() {
        document.querySelectorAll('.product-table__clear').forEach(el => {
            if (el.textContent.trim() === 'Очистить список') {
                el.style.display = 'none';
            }
        });
    }

    function toggleBorders(btn) {
        const middle = document.querySelector('.g-middle-i');
        const table  = document.querySelector('.product-table-container');
        if (!expanded) {
            if (middle) { middle.dataset.chOld = middle.style.maxWidth || ''; middle.style.maxWidth = 'none'; }
            if (table)  { table.dataset.chOld  = table.style.maxWidth  || ''; table.style.maxWidth  = 'none'; }
            btn.textContent = 'Вернуть границы';
            btn.classList.remove('button_white');
            btn.classList.add('button_orange');
        } else {
            if (middle) middle.style.maxWidth = middle.dataset.chOld || '';
            if (table)  table.style.maxWidth  = table.dataset.chOld  || '';
            btn.textContent = 'Убрать границы';
            btn.classList.remove('button_orange');
            btn.classList.add('button_white');
        }
        expanded = !expanded;
    }

    function addTopButton() {
        if (document.querySelector('.' + MARKER)) return;
        const tabs = document.querySelector('.product-table__tabs');
        if (!tabs) return;
        const btn = document.createElement('a');
        btn.textContent = 'Убрать границы';
        btn.className = `product-table__clear button button_small button_white ${MARKER}`;
        btn.href = '#';
        btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleBorders(btn); }, true);
        tabs.appendChild(btn);
    }

    // ─── Извлечение данных из таблицы ─────────────────────────────────────────
    function extractTableData(settings) {
        const rows = [];

        // Считаем количество товаров (колонок данных)
        // Первая строка-заголовок: .product-table__row_header
        const headerRow = document.querySelector('.product-table__row_header');
        if (!headerRow) return null;

        // Ячейки с товарами — все th.product-table__cell (кроме первого с кнопками и duplicate)
        const productCells = [...headerRow.querySelectorAll('th.product-table__cell')]
            .filter(th => !th.classList.contains('product-table__cell_duplicate') &&
                          !th.classList.contains('product-table__cell_small'));

        const productCount = productCells.length;
        if (productCount === 0) return null;

        // Имена товаров
        const names = productCells.map(th => {
            const cap = th.querySelector('.product-summary__caption');
            return cap ? cap.textContent.trim() : '';
        });

        // Цены
        const prices = productCells.map(th => {
            const pr = th.querySelector('.product-summary__price_primary');
            return pr ? pr.textContent.trim().replace(/\s+/g, ' ') : '';
        });

        // Рейтинги
        const ratings = productCells.map(th => {
            const stars = th.querySelector('.rating');
            if (!stars) return '';
            const titleAttr = stars.getAttribute('title') || '';
            const ratingLink = th.querySelector('.product-summary__rating-link');
            const reviewCount = ratingLink ? ratingLink.textContent.replace(/[^\d]/g, '') : '';
            return titleAttr + (reviewCount ? ` (${reviewCount} отз.)` : '');
        });

        // URL товаров
        const urls = productCells.map(th => {
            const link = th.querySelector('.product-summary__figure');
            return link ? link.href : '';
        });

        // Заголовок (первая строка)
        const header = ['Параметр', ...names.map((n, i) => {
            let label = n || `Товар ${i + 1}`;
            return label;
        })];
        rows.push(header);

        // Строка с ценами
        if (settings.includePrice) {
            rows.push(['Цена', ...prices]);
        }

        // Строка с рейтингом
        if (settings.includeRating) {
            rows.push(['Рейтинг', ...ratings]);
        }

        // Строка с URL
        if (settings.includeUrl) {
            rows.push(['Ссылка', ...urls]);
        }

        // Параметры: проходим по группам и строкам параметров
        const groups = document.querySelectorAll('.product-table__group');
        groups.forEach(group => {
            // Заголовок секции
            const sectionTitle = group.querySelector('.product-table__title-inner-text');
            const sectionName = sectionTitle ? sectionTitle.textContent.trim() : '';

            // Строки параметров
            const paramRows = group.querySelectorAll('.product-table__row_parameter');
            if (paramRows.length === 0) return;

            if (settings.includeSections && sectionName) {
                // Вставляем строку-заголовок секции (пустые значения для товаров)
                rows.push([`=== ${sectionName} ===`, ...Array(productCount).fill('')]);
            }

            paramRows.forEach(row => {
                // Если строка скрыта через «Скрыть одинаковые параметры» — не пропускаем её
                // (экспортируем всё)

                // Лейбл параметра — первая ячейка (не duplicate, не с иконкой)
                const labelCell = row.querySelector('td.product-table__cell:not(.product-table__cell_duplicate)');
                if (!labelCell) return;
                const labelWrapper = labelCell.querySelector('.product-table__wrapper');
                const label = labelWrapper ? labelWrapper.textContent.trim() : labelCell.textContent.trim();
                if (!label) return;

                // Значения — все td.product-table__cell кроме первого (лейбл) и duplicate
                const valueCells = [...row.querySelectorAll('td.product-table__cell')]
                    .filter(td => !td.classList.contains('product-table__cell_duplicate'));

                // valueCells[0] — лейбл, остальные — значения товаров
                const values = valueCells.slice(1).map(td => {
                    const wrapper = td.querySelector('.product-table__wrapper');
                    if (!wrapper) return td.textContent.trim().replace(/\s+/g, ' ');

                    const iconTip = wrapper.querySelector('.product-icon_tip');
                    const iconX   = wrapper.querySelector('.product-icon_x');
                    const vt      = wrapper.querySelector('.value__text');

                    const fmt = settings.boolFormat || 'word';
                    const yes = fmt === 'symbol' ? '✓' : fmt === 'bool' ? 'true'  : 'Да';
                    const no  = fmt === 'symbol' ? '✗' : fmt === 'bool' ? 'false' : 'Нет';
                    if (iconX)   return no  + (vt ? ' ' + vt.textContent.trim() : '');
                    if (iconTip) return yes + (vt ? ' ' + vt.textContent.trim() : '');
                    if (vt)      return vt.textContent.trim().replace(/\u00a0/g, ' ');

                    return wrapper.textContent.trim().replace(/\s+/g, ' ');
                });

                // Дополнить до нужного количества товаров
                while (values.length < productCount) values.push('');

                // Если «только различающиеся» — пропускаем одинаковые
                if (settings.onlyDiff && values.length > 1) {
                    const unique = new Set(values.map(v => v.toLowerCase()));
                    if (unique.size === 1) return;
                }

                rows.push([label, ...values.slice(0, productCount)]);
            });
        });

        return rows;
    }

    // ─── Генерация CSV ────────────────────────────────────────────────────────
    function generateCSV(rows, sep) {
        return rows.map(row => row.map(cell => escapeCell(cell, sep)).join(sep)).join('\r\n');
    }

    // ─── Копирование в буфер ─────────────────────────────────────────────────
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return Promise.resolve();
    }

    // ─── Toast-уведомление ───────────────────────────────────────────────────
    function showToast(msg, isError) {
        const existing = document.querySelector('.ch-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'ch-toast';
        toast.textContent = msg;
        toast.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 24px;
            z-index: 99999;
            background: ${isError ? '#e53935' : '#43a047'};
            color: #fff;
            padding: 10px 18px;
            border-radius: 6px;
            font-size: 13px;
            font-family: "Open Sans", Arial, sans-serif;
            box-shadow: 0 4px 16px rgba(0,0,0,.25);
            pointer-events: none;
            opacity: 0;
            transition: opacity .2s ease;
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; });
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 250);
        }, 2400);
    }

    // ─── Панель настроек ──────────────────────────────────────────────────────
    function buildSettingsPanel(settings, onClose) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99998;
            background: rgba(0,0,0,.35);
            display: flex; align-items: flex-end; justify-content: flex-end;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background: #fff;
            border-radius: 12px 12px 0 0;
            box-shadow: 0 -4px 32px rgba(0,0,0,.18);
            padding: 24px 28px 28px;
            min-width: 320px;
            max-width: 380px;
            margin-right: 16px;
            font-family: "Open Sans", Arial, sans-serif;
            font-size: 14px;
            color: #1a1a1a;
        `;

        // Заголовок
        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;';
        const title = document.createElement('span');
        title.textContent = '⚙ Настройки экспорта CSV';
        title.style.cssText = 'font-weight:600; font-size:15px;';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none; border: none; cursor: pointer;
            font-size: 18px; color: #888; padding: 0 4px;
            line-height: 1;
        `;
        closeBtn.onclick = () => { overlay.remove(); settingsOpen = false; onClose(settings); };
        titleRow.append(title, closeBtn);
        panel.appendChild(titleRow);

        // Переключатели
        const toggles = [
            { key: 'includeName',     label: 'Название товара',            tip: 'Первая строка с именами' },
            { key: 'includePrice',    label: 'Цена',                       tip: 'Строка с ценами из заголовка' },
            { key: 'includeUrl',      label: 'Ссылка на товар',            tip: 'URL страницы товара' },
            { key: 'includeRating',   label: 'Рейтинг и отзывы',          tip: 'Оценка и количество отзывов' },
            { key: 'includeSections', label: 'Заголовки секций',           tip: 'Например «Общая информация»' },
            { key: 'onlyDiff',        label: 'Только различающиеся',       tip: 'Пропустить одинаковые параметры' },
        ];

        toggles.forEach(({ key, label, tip }) => {
            const row = document.createElement('label');
            row.style.cssText = `
                display: flex; align-items: center; justify-content: space-between;
                padding: 8px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer;
            `;

            const left = document.createElement('div');
            const lbl = document.createElement('div');
            lbl.textContent = label;
            lbl.style.cssText = 'font-weight:500;';
            const desc = document.createElement('div');
            desc.textContent = tip;
            desc.style.cssText = 'font-size:11px; color:#888; margin-top:1px;';
            left.append(lbl, desc);

            // Toggle switch
            const switchWrap = document.createElement('div');
            switchWrap.style.cssText = 'position:relative; flex-shrink:0; margin-left:12px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!settings[key];
            cb.style.cssText = 'position:absolute; opacity:0; width:0; height:0;';
            cb.onchange = () => { settings[key] = cb.checked; saveSettings(settings); };

            const track = document.createElement('div');
            track.style.cssText = `
                width: 40px; height: 22px; border-radius: 11px;
                background: ${cb.checked ? '#ff6520' : '#ccc'};
                transition: background .2s;
                position: relative; cursor: pointer;
            `;
            const knob = document.createElement('div');
            knob.style.cssText = `
                position: absolute; top: 3px;
                left: ${cb.checked ? '21px' : '3px'};
                width: 16px; height: 16px;
                border-radius: 50%; background: #fff;
                box-shadow: 0 1px 3px rgba(0,0,0,.3);
                transition: left .2s;
            `;
            track.appendChild(knob);
            cb.onchange = () => {
                settings[key] = cb.checked;
                track.style.background = cb.checked ? '#ff6520' : '#ccc';
                knob.style.left = cb.checked ? '21px' : '3px';
                saveSettings(settings);
            };
            switchWrap.append(cb, track);
            row.append(left, switchWrap);
            panel.appendChild(row);
        });

        // Разделитель
        const sepRow = document.createElement('div');
        sepRow.style.cssText = 'margin-top:14px;';
        const sepLabel = document.createElement('div');
        sepLabel.textContent = 'Разделитель';
        sepLabel.style.cssText = 'font-weight:500; margin-bottom:8px;';
        const sepGroup = document.createElement('div');
        sepGroup.style.cssText = 'display:flex; gap:8px;';

        [
            { val: ';',  display: 'Точка с запятой  ;' },
            { val: ',',  display: 'Запятая  ,' },
            { val: '\t', display: 'Tab  ⇥' },
        ].forEach(({ val, display }) => {
            const btn = document.createElement('button');
            btn.textContent = display;
            const isActive = settings.separator === val;
            btn.style.cssText = `
                padding: 5px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;
                border: 2px solid ${isActive ? '#ff6520' : '#ddd'};
                background: ${isActive ? '#fff4ef' : '#fafafa'};
                color: ${isActive ? '#ff6520' : '#555'};
                font-family: inherit; transition: all .15s;
            `;
            btn.onclick = () => {
                settings.separator = val;
                saveSettings(settings);
                // Обновить стили всех кнопок
                sepGroup.querySelectorAll('button').forEach(b => {
                    const active = b === btn;
                    b.style.borderColor = active ? '#ff6520' : '#ddd';
                    b.style.background  = active ? '#fff4ef' : '#fafafa';
                    b.style.color       = active ? '#ff6520' : '#555';
                });
            };
            sepGroup.appendChild(btn);
        });

        sepRow.append(sepLabel, sepGroup);
        panel.appendChild(sepRow);

        // Формат булевых значений
        const boolRow = document.createElement("div");
        boolRow.style.cssText = "margin-top:14px;";
        const boolLabel = document.createElement("div");
        boolLabel.textContent = "Формат галочек (есть/нет)";
        boolLabel.style.cssText = "font-weight:500; margin-bottom:8px;";
        const boolGroup = document.createElement("div");
        boolGroup.style.cssText = "display:flex; gap:8px;";

        [
            { val: "word",   display: "Да / Нет" },
            { val: "symbol", display: "✓ / ✗" },
            { val: "bool",   display: "true / false" },
        ].forEach(({ val, display }) => {
            const btn = document.createElement("button");
            btn.textContent = display;
            const isActive = (settings.boolFormat || "word") === val;
            btn.style.cssText = `padding: 5px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; border: 2px solid ${isActive ? "#ff6520" : "#ddd"}; background: ${isActive ? "#fff4ef" : "#fafafa"}; color: ${isActive ? "#ff6520" : "#555"}; font-family: inherit; transition: all .15s;`;
            btn.onclick = () => {
                settings.boolFormat = val;
                saveSettings(settings);
                boolGroup.querySelectorAll("button").forEach(b => {
                    const active = b === btn;
                    b.style.borderColor = active ? "#ff6520" : "#ddd";
                    b.style.background  = active ? "#fff4ef" : "#fafafa";
                    b.style.color       = active ? "#ff6520" : "#555";
                });
            };
            boolGroup.appendChild(btn);
        });

        boolRow.append(boolLabel, boolGroup);
        panel.appendChild(boolRow);

        overlay.appendChild(panel);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) { overlay.remove(); settingsOpen = false; onClose(settings); }
        });

        return overlay;
    }

    // ─── FAB-кнопка (правый нижний угол) ─────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('ch-fab-style')) return;
        const style = document.createElement('style');
        style.id = 'ch-fab-style';
        style.textContent = `
            .ch-fab-wrap {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 8px;
            }
            .ch-fab-main {
                display: flex;
                align-items: center;
                gap: 0;
                border-radius: 28px;
                box-shadow: 0 4px 18px rgba(0,0,0,.22);
                overflow: hidden;
                font-family: "Open Sans", Arial, sans-serif;
            }
            .ch-fab-copy {
                background: #ff6520;
                color: #fff;
                border: none;
                padding: 12px 20px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: background .15s, transform .1s;
                white-space: nowrap;
                line-height: 1;
                display: flex;
                align-items: center;
                gap: 7px;
            }
            .ch-fab-copy:hover { background: #e55a1a; }
            .ch-fab-copy:active { transform: scale(.97); }
            .ch-fab-copy svg {
                width: 15px; height: 15px;
                fill: none; stroke: #fff;
                stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
                flex-shrink: 0;
            }
            .ch-fab-settings {
                background: #ff6520;
                color: #fff;
                border: none;
                border-left: 1px solid rgba(255,255,255,.25);
                padding: 12px 14px;
                cursor: pointer;
                transition: background .15s;
                line-height: 1;
                display: flex;
                align-items: center;
            }
            .ch-fab-settings:hover { background: #e55a1a; }
            .ch-fab-settings svg {
                width: 15px; height: 15px;
                fill: none; stroke: #fff;
                stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
            }
        `;
        document.head.appendChild(style);
    }

    function addFAB() {
        if (document.querySelector('.ch-fab-wrap')) return;

        injectStyles();
        let settings = loadSettings();

        const wrap = document.createElement('div');
        wrap.className = 'ch-fab-wrap';

        const main = document.createElement('div');
        main.className = 'ch-fab-main';

        // Кнопка копирования
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ch-fab-copy';
        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Копировать CSV
        `;
        copyBtn.title = 'Скопировать таблицу сравнения в буфер обмена (CSV)';
        copyBtn.onclick = () => {
            settings = loadSettings();
            const data = extractTableData(settings);
            if (!data || data.length < 2) {
                showToast('Не удалось прочитать таблицу сравнения', true);
                return;
            }
            const csv = generateCSV(data, settings.separator);
            copyToClipboard(csv).then(() => {
                const products = data[0].length - 1;
                const params   = data.length - 1;
                showToast(`✓ Скопировано: ${products} товара, ${params} строк`, false);
                // Анимация кнопки
                copyBtn.innerHTML = `
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    Скопировано!
                `;
                copyBtn.style.background = '#43a047';
                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Копировать CSV
                    `;
                    copyBtn.style.background = '';
                }, 2000);
            }).catch(() => {
                showToast('Ошибка: не удалось скопировать', true);
            });
        };

        // Кнопка настроек (шестерёнка)
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'ch-fab-settings';
        settingsBtn.title = 'Настройки экспорта';
        settingsBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
        `;
        settingsBtn.onclick = () => {
            if (settingsOpen) return;
            settingsOpen = true;
            settings = loadSettings();
            const panel = buildSettingsPanel(settings, (updated) => {
                settings = updated;
            });
            document.body.appendChild(panel);
        };

        main.append(copyBtn, settingsBtn);
        wrap.appendChild(main);
        document.body.appendChild(wrap);
    }

    // ─── Инициализация ────────────────────────────────────────────────────────
    function init() {
        hideClearButtons();
        addTopButton();
        addFAB();
    }

    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        init();
        if (document.querySelector('.' + MARKER) || attempts >= 50) {
            clearInterval(interval);
        }
    }, 200);

    const observer = new MutationObserver(() => {
        hideClearButtons();
        if (!document.querySelector('.' + MARKER)) addTopButton();
        if (!document.querySelector('.ch-fab-wrap'))  addFAB();
    });
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();