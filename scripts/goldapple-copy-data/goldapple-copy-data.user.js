// ==UserScript==
// @name           GoldApple Copy Data
// @namespace      https://github.com/qFamouse/
// @version        1.0
// @description    Copies data from a Gold Apple product card, with an accumulating buffer
// @description:ru Копирование данных с карточки товара Gold Apple с накопительным буфером
// @author         Famouse
// @license        MIT
// @match          https://goldapple.by/*
// @match          https://www.goldapple.by/*
// @match          https://goldapple.ru/*
// @match          https://www.goldapple.ru/*
// @icon           https://www.google.com/s2/favicons?sz=64&domain=goldapple.by
// @grant          GM_setValue
// @grant          GM_getValue
// @grant          GM_registerMenuCommand
// @homepageURL    https://github.com/qFamouse/Userscripts/tree/master/scripts/goldapple-copy-data
// @supportURL     https://github.com/qFamouse/Userscripts/issues
// @updateURL      https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/goldapple-copy-data/goldapple-copy-data.user.js
// @downloadURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/goldapple-copy-data/goldapple-copy-data.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─── Константы ────────────────────────────────────────────────────────────

    const SEPARATOR = '\n\n' + '='.repeat(60) + '\n\n';

    const DEFAULT_SETTINGS = {
        copyTitle: true,
        copyArticle: true,
        copyBrand: true,
        copyCategory: true,
        copyPrice: true,
        copyCardPrice: true,
        copyRating: true,
        copyUrl: false,
        copyImage: false,
        copyDescription: true,
        copyUsage: true,
        copyComposition: true,
        copyAdditionalInfo: true,
    };

    // ─── Стили (один раз) ─────────────────────────────────────────────────────

    const globalStyle = document.createElement('style');
    globalStyle.textContent = `
        @keyframes gcd-slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to   { transform: translateX(0);     opacity: 1; }
        }
    `;
    document.head.appendChild(globalStyle);

    // ─── Настройки ────────────────────────────────────────────────────────────

    function loadSettings() {
        const saved = GM_getValue('ga_copy_settings', null);
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
    }

    function saveSettings(s) {
        GM_setValue('ga_copy_settings', JSON.stringify(s));
    }

    let settings = loadSettings();

    // ─── Накопительный буфер ──────────────────────────────────────────────────

    function getAccumulatedData() { return GM_getValue('ga_accumulated_buffer', ''); }

    function getAccumulatedCount() {
        const data = getAccumulatedData();
        if (!data) return 0;
        return (data.match(new RegExp('={60}', 'g')) || []).length + 1;
    }

    function addToAccumulatedData(newData) {
        const current = getAccumulatedData();
        if (current) {
            const newArtMatch = newData.match(/Артикул:\s*(\d+)/);
            if (newArtMatch) {
                if (new RegExp(`Артикул:\\s*${newArtMatch[1]}\\b`).test(current)) {
                    return { isDuplicate: true, data: current };
                }
            } else {
                const entries = current.split(SEPARATOR);
                if (entries.some(e => e.trim() === newData.trim())) {
                    return { isDuplicate: true, data: current };
                }
            }
        }
        const updated = current ? current + SEPARATOR + newData : newData;
        GM_setValue('ga_accumulated_buffer', updated);
        return { isDuplicate: false, data: updated };
    }

    function clearAccumulatedData() { GM_setValue('ga_accumulated_buffer', ''); }

    function removeFromAccumulatedData(index) {
        const entries = getAccumulatedData().split(SEPARATOR);
        entries.splice(index, 1);
        GM_setValue('ga_accumulated_buffer', entries.join(SEPARATOR));
    }

    function getAccumulatedEntries() {
        const data = getAccumulatedData();
        return data ? data.split(SEPARATOR) : [];
    }

    // ─── Вспомогательные функции ──────────────────────────────────────────────

    /** querySelector по частичному имени CSS-модульного класса */
    function qc(root, classSubstr) {
        return root.querySelector(`[class*="${classSubstr}"]`);
    }

    function qca(root, classSubstr) {
        return Array.from(root.querySelectorAll(`[class*="${classSubstr}"]`));
    }

    /** Возвращает содержимое вкладки по её порядковому номеру (0-based) */
    function getTabContent(index) {
        const tabs = qca(document, 'tabbed-sections__content');
        return tabs[index] || null;
    }

    /** Чистый текст ноды */
    function cleanText(el) {
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    }

    // ─── Извлечение данных ────────────────────────────────────────────────────

    function extractData() {
        const data = {};

        // Бренд и название
        const h1 = document.querySelector('h1');
        if (h1) {
            const brandEl = qc(h1, 'pdp-title__brand');
            const nameEl  = qc(h1, 'pdp-title__name');
            const brand   = brandEl?.textContent.trim() ?? null;
            const name    = nameEl?.textContent.trim()  ?? null;

            if (settings.copyBrand)  data.brand = brand;
            if (settings.copyTitle)  data.title = [brand, name].filter(Boolean).join(' ') || null;
        }

        // Артикул
        if (settings.copyArticle) {
            const subTitles = qca(document, 'pdp-tabs-content__sub-title');
            for (const el of subTitles) {
                const m = el.textContent.match(/артикул:\s*(\d+)/i);
                if (m) { data.article = m[1]; break; }
            }
        }

        // Категория (хлебные крошки)
        if (settings.copyCategory) {
            const crumbLinks = document.querySelectorAll('[class*="breadcrumbs__list"] a');
            if (crumbLinks.length) {
                data.category = Array.from(crumbLinks)
                    .map(a => a.textContent.trim())
                    .filter(Boolean)
                    .join(' > ');
            }
        }

        // Текущая цена
        if (settings.copyPrice) {
            // Строка с классом *row_actual* содержит актуальную цену
            const actualRow = qc(document, 'pdp-price-row__row_actual');
            if (actualRow) {
                // Берём только первый элемент ga-price (число + валюта), без подписей
                const priceVal = qc(actualRow, 'pdp-price-row__value') || qc(actualRow, 'ga-price_');
                data.price = priceVal ? priceVal.textContent.trim() : cleanText(actualRow);
            }
        }

        // Цена по карте
        if (settings.copyCardPrice) {
            const bestRow = qc(document, 'pdp-price-row__row_best');
            if (bestRow) {
                const priceVal = qc(bestRow, 'pdp-price-row__value') || qc(bestRow, 'ga-price_');
                const label    = qc(bestRow, 'pdp-price-row__label');
                const priceStr = priceVal ? priceVal.textContent.trim() : null;
                const labelStr = label ? label.textContent.trim() : null;
                if (priceStr) {
                    data.cardPrice = labelStr ? `${priceStr} (${labelStr})` : priceStr;
                }
            }
        }

        // Рейтинг и отзывы
        if (settings.copyRating) {
            // Числовой рейтинг — ищем элемент с numeral внутри блока with_rating
            const ratingBlock = qc(document, 'review-score-point_with_rating');
            const ratingNum   = ratingBlock ? qc(ratingBlock, 'score-point__numeral') : null;
            const countEl     = qc(document, 'review-rating-score__count');
            const num   = ratingNum?.textContent.trim() ?? null;
            const count = countEl?.textContent.trim()   ?? null;
            if (num || count) {
                data.rating = [num, count].filter(Boolean).join(' · ');
            }
        }

        // URL
        if (settings.copyUrl) data.url = window.location.href;

        // Изображение
        if (settings.copyImage) {
            const galleryImg = document.querySelector('[class*="gallery"] img');
            data.image = galleryImg?.src ?? null;
        }

        // Контент вкладок — порядок: [0] Описание, [1] Применение, [2] Состав, [3] Бренд, [4] Доп. информация
        const tabContents = qca(document, 'tabbed-sections__content');

        // Описание (вкладка 0)
        if (settings.copyDescription && tabContents[0]) {
            // В вкладке 0 есть заголовок+артикул наверху, берём только <p> теги
            const paragraphs = tabContents[0].querySelectorAll('p');
            if (paragraphs.length) {
                data.description = Array.from(paragraphs)
                    .map(p => p.innerText.trim())
                    .filter(Boolean)
                    .join('\n');
            } else {
                // Fallback: весь текст вкладки минус первые строки с заголовком
                const rawText = cleanText(tabContents[0]) ?? '';
                // Пробуем убрать «БРЕНД Название\nартикул: XXXXX\n» в начале
                data.description = rawText.replace(/^.+?артикул:\s*\d+\s*/i, '').trim() || null;
            }
        }

        // Применение (вкладка 1)
        if (settings.copyUsage && tabContents[1]) {
            data.usage = cleanText(tabContents[1]);
        }

        // Состав (вкладка 2)
        if (settings.copyComposition && tabContents[2]) {
            data.composition = cleanText(tabContents[2]);
        }

        // Дополнительная информация (вкладка 4)
        if (settings.copyAdditionalInfo && tabContents[4]) {
            data.additionalInfo = cleanText(tabContents[4]);
        }

        return data;
    }

    // ─── Форматирование ───────────────────────────────────────────────────────

    function formatData(data) {
        const result = [];
        if (data.title)          result.push(`Название: ${data.title}`);
        if (data.article)        result.push(`Артикул: ${data.article}`);
        if (data.brand)          result.push(`Бренд: ${data.brand}`);
        if (data.category)       result.push(`Категория: ${data.category}`);
        if (data.price)          result.push(`Цена: ${data.price}`);
        if (data.cardPrice)      result.push(`Цена по карте: ${data.cardPrice}`);
        if (data.rating)         result.push(`Рейтинг: ${data.rating}`);
        if (data.url)            result.push(`URL: ${data.url}`);
        if (data.image)          result.push(`Изображение: ${data.image}`);
        if (data.description)    result.push(`\nОписание:\n${data.description}`);
        if (data.usage)          result.push(`\nПрименение:\n${data.usage}`);
        if (data.composition)    result.push(`\nСостав:\n${data.composition}`);
        if (data.additionalInfo) result.push(`\nДополнительная информация:\n${data.additionalInfo}`);
        return result.join('\n');
    }

    // ─── Буфер обмена ─────────────────────────────────────────────────────────

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
    }

    // ─── Уведомления ──────────────────────────────────────────────────────────

    const NOTIFICATION_COLORS = {
        success: '#4CAF50',
        warning: '#FF9800',
        error: '#F44336',
        info: '#2196F3',
    };

    function showNotification(message, type = 'success') {
        const el = document.createElement('div');
        el.textContent = message;
        el.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: ${NOTIFICATION_COLORS[type]}; color: white;
            padding: 16px 24px; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10002; font-size: 14px; font-weight: 500;
            animation: gcd-slideIn 0.3s ease;
        `;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.transition = 'all 0.3s ease';
            el.style.transform = 'translateX(400px)';
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }

    // ─── Вспомогательные функции UI ───────────────────────────────────────────

    function makeButton(label, cssExtra) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 12px 16px; color: white; border: none;
            border-radius: 8px; font-size: 14px; font-weight: 500;
            transition: background 0.2s; cursor: pointer;
            ${cssExtra}
        `;
        return btn;
    }

    function setHover(btn, normalBg, hoverBg) {
        btn.addEventListener('mouseenter', () => { btn.style.background = hoverBg; });
        btn.addEventListener('mouseleave', () => { btn.style.background = normalBg; });
    }

    // ─── Панель настроек ──────────────────────────────────────────────────────

    function createSettingsPanel() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 10001;
            display: flex; align-items: center; justify-content: center;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background: white; border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            width: 420px; max-width: 95vw; max-height: 85vh;
            display: flex; flex-direction: column; overflow: hidden;
        `;

        // Заголовок + вкладки
        const header = document.createElement('div');
        header.style.cssText = 'padding: 20px 24px 0; border-bottom: 1px solid #e0e0e0; flex-shrink: 0;';

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'GoldApple Copy Data';
        titleEl.style.cssText = 'margin: 0 0 16px 0; color: #1a1a1a; font-size: 18px; font-weight: 600;';
        header.appendChild(titleEl);

        const tabs = document.createElement('div');
        tabs.style.cssText = 'display: flex;';

        function makeTab(label) {
            const t = document.createElement('button');
            t.textContent = label;
            t.style.cssText = `
                padding: 8px 18px; border: none; background: none; cursor: pointer;
                font-size: 14px; font-weight: 500; color: #888;
                border-bottom: 2px solid transparent; margin-bottom: -1px;
                transition: color 0.15s;
            `;
            return t;
        }

        const tabSettings = makeTab('Поля');
        const tabBuffer   = makeTab('Буфер');
        tabs.append(tabSettings, tabBuffer);
        header.appendChild(tabs);
        panel.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding: 20px 24px; overflow-y: auto; flex: 1;';
        panel.appendChild(body);

        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 24px 20px; border-top: 1px solid #e0e0e0;
            flex-shrink: 0; display: flex; gap: 8px; flex-direction: column;
        `;
        panel.appendChild(footer);

        // Вкладка «Поля»
        const fieldOptions = [
            { key: 'copyTitle',          label: 'Название' },
            { key: 'copyArticle',        label: 'Артикул' },
            { key: 'copyBrand',          label: 'Бренд' },
            { key: 'copyCategory',       label: 'Категория' },
            { key: 'copyPrice',          label: 'Цена' },
            { key: 'copyCardPrice',      label: 'Цена по карте' },
            { key: 'copyRating',         label: 'Рейтинг и отзывы' },
            { key: 'copyUrl',            label: 'URL товара' },
            { key: 'copyImage',          label: 'Ссылка на изображение' },
            { key: 'copyDescription',    label: 'Описание' },
            { key: 'copyUsage',          label: 'Применение' },
            { key: 'copyComposition',    label: 'Состав' },
            { key: 'copyAdditionalInfo', label: 'Дополнительная информация' },
        ];

        const settingsPane = document.createElement('div');
        fieldOptions.forEach(opt => {
            const label = document.createElement('label');
            label.style.cssText = `
                display: flex; align-items: center;
                margin-bottom: 12px; cursor: pointer; user-select: none;
            `;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = settings[opt.key];
            checkbox.style.cssText = 'margin-right: 10px; width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;';
            checkbox.addEventListener('change', () => {
                settings[opt.key] = checkbox.checked;
                saveSettings(settings);
            });
            const span = document.createElement('span');
            span.textContent = opt.label;
            span.style.cssText = 'color: #333; font-size: 14px;';
            label.append(checkbox, span);
            settingsPane.appendChild(label);
        });

        // Вкладка «Буфер»
        const bufferPane = document.createElement('div');

        function getEntryLabel(entry) {
            const titleMatch   = entry.match(/Название:\s*(.+)/);
            const articleMatch = entry.match(/Артикул:\s*(\d+)/);
            const title   = titleMatch   ? titleMatch[1].trim()   : null;
            const article = articleMatch ? articleMatch[1].trim() : null;
            if (title && article) return `${title} (${article})`;
            if (title)   return title;
            if (article) return `Артикул: ${article}`;
            return entry.slice(0, 60).trim();
        }

        function renderBufferList() {
            bufferPane.innerHTML = '';
            const entries = getAccumulatedEntries();

            if (!entries.length) {
                const empty = document.createElement('div');
                empty.textContent = 'Буфер пуст';
                empty.style.cssText = 'color: #999; font-size: 14px; text-align: center; padding: 24px 0;';
                bufferPane.appendChild(empty);
                return;
            }

            const countEl = document.createElement('div');
            countEl.textContent = `Товаров: ${entries.length}`;
            countEl.style.cssText = 'color: #888; font-size: 13px; margin-bottom: 12px;';
            bufferPane.appendChild(countEl);

            entries.forEach((entry, idx) => {
                const row = document.createElement('div');
                row.style.cssText = `
                    display: flex; align-items: flex-start; gap: 10px;
                    padding: 10px 12px; border-radius: 8px; background: #f8f8f8; margin-bottom: 8px;
                `;
                const nameEl = document.createElement('div');
                nameEl.textContent = getEntryLabel(entry);
                nameEl.style.cssText = 'flex: 1; font-size: 13px; color: #222; line-height: 1.4; word-break: break-word;';

                const delBtn = document.createElement('button');
                delBtn.title = 'Удалить';
                delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>`;
                delBtn.style.cssText = `
                    flex-shrink: 0; padding: 4px; border: none; background: none;
                    color: #bbb; cursor: pointer; border-radius: 4px;
                    display: flex; align-items: center; transition: color 0.15s, background 0.15s;
                `;
                delBtn.addEventListener('mouseenter', () => { delBtn.style.color = '#e53935'; delBtn.style.background = '#fce8e8'; });
                delBtn.addEventListener('mouseleave', () => { delBtn.style.color = '#bbb'; delBtn.style.background = 'none'; });
                delBtn.addEventListener('click', () => {
                    removeFromAccumulatedData(idx);
                    updateCounter();
                    renderBufferList();
                    updateFooterButtons();
                });
                row.append(nameEl, delBtn);
                bufferPane.appendChild(row);
            });
        }

        // Футер-кнопки
        const copyBufferBtn = makeButton('Скопировать буфер', '');
        setHover(copyBufferBtn, '#333', '#111');
        copyBufferBtn.addEventListener('click', async () => {
            const data = getAccumulatedData();
            if (data) {
                await copyToClipboard(data);
                showNotification('Буфер скопирован в clipboard', 'success');
            }
        });

        const clearBtn = makeButton('Очистить буфер', '');
        setHover(clearBtn, '#FF5722', '#E64A19');
        clearBtn.addEventListener('click', () => {
            if (confirm('Очистить накопительный буфер?')) {
                clearAccumulatedData();
                updateCounter();
                renderBufferList();
                updateFooterButtons();
                showNotification('Буфер очищен', 'info');
            }
        });

        const closeBtn = makeButton('Закрыть', 'background: #f5f5f5; color: #333;');
        closeBtn.style.color = '#333';
        setHover(closeBtn, '#f5f5f5', '#e0e0e0');
        closeBtn.addEventListener('click', () => overlay.remove());

        footer.append(copyBufferBtn, clearBtn, closeBtn);

        function updateFooterButtons() {
            const hasData = getAccumulatedData().length > 0;
            copyBufferBtn.disabled = !hasData;
            copyBufferBtn.style.background = hasData ? '#333' : '#ccc';
            copyBufferBtn.style.cursor = hasData ? 'pointer' : 'not-allowed';
            clearBtn.disabled = !hasData;
            clearBtn.style.background = hasData ? '#FF5722' : '#ccc';
            clearBtn.style.cursor = hasData ? 'pointer' : 'not-allowed';
        }

        function activateTab(tab, pane, showFooterBtns) {
            [tabSettings, tabBuffer].forEach(t => {
                t.style.color = '#888';
                t.style.borderBottomColor = 'transparent';
            });
            tab.style.color = '#333';
            tab.style.borderBottomColor = '#333';
            body.innerHTML = '';
            body.appendChild(pane);
            copyBufferBtn.style.display = showFooterBtns ? '' : 'none';
            clearBtn.style.display      = showFooterBtns ? '' : 'none';
        }

        tabSettings.addEventListener('click', () => activateTab(tabSettings, settingsPane, false));
        tabBuffer.addEventListener('click',   () => {
            activateTab(tabBuffer, bufferPane, true);
            renderBufferList();
            updateFooterButtons();
        });

        activateTab(tabSettings, settingsPane, false);

        overlay.appendChild(panel);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        const onKey = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
    }

    // ─── Счётчик ──────────────────────────────────────────────────────────────

    const counterBadge = document.createElement('div');
    counterBadge.style.cssText = `
        position: absolute; top: -6px; right: -6px;
        background: #FF5722; color: white; border-radius: 50%;
        min-width: 20px; height: 20px; font-size: 11px; font-weight: bold;
        display: none; align-items: center; justify-content: center;
        border: 2px solid white; padding: 0 4px;
    `;

    function updateCounter() {
        const count = getAccumulatedData().length > 0 ? getAccumulatedCount() : 0;
        counterBadge.textContent = count;
        counterBadge.style.display = count > 0 ? 'flex' : 'none';
    }

    // ─── Кнопки ───────────────────────────────────────────────────────────────

    // Кнопка — скопировать
    const copyButton = document.createElement('button');
    copyButton.innerHTML = '📋';
    copyButton.title = 'Копировать данные товара';
    copyButton.style.cssText = `
        position: fixed; bottom: 80px; right: 20px; z-index: 10000;
        background: #333; color: white; border: none;
        padding: 12px; border-radius: 50%; font-size: 20px; cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25); transition: all 0.2s;
        width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
    `;
    copyButton.addEventListener('mouseenter', () => copyButton.style.transform = 'scale(1.1)');
    copyButton.addEventListener('mouseleave', () => copyButton.style.transform = 'scale(1)');
    copyButton.addEventListener('click', async () => {
        try {
            const text = formatData(extractData());
            await copyToClipboard(text);
            copyButton.innerHTML = '✅';
            copyButton.style.background = '#28a745';
            setTimeout(() => { copyButton.innerHTML = '📋'; copyButton.style.background = '#333'; }, 1500);
        } catch (err) {
            copyButton.innerHTML = '❌';
            copyButton.style.background = '#dc3545';
            setTimeout(() => { copyButton.innerHTML = '📋'; copyButton.style.background = '#333'; }, 1500);
            console.error('[GoldAppleCopyData] Ошибка:', err);
        }
    });

    // Кнопка — добавить в буфер
    const accumulateButton = document.createElement('button');
    accumulateButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M19 11H13V5C13 4.45 12.55 4 12 4C11.45 4 11 4.45 11 5V11H5C4.45 11 4 11.45 4 12C4 12.55 4.45 13 5 13H11V19C11 19.55 11.45 20 12 20C12.55 20 13 19.55 13 19V13H19C19.55 13 20 12.55 20 12C20 11.45 19.55 11 19 11Z" fill="white"/>
        </svg>
    `;
    accumulateButton.title = 'Добавить товар в буфер';
    accumulateButton.style.cssText = `
        position: fixed; bottom: 140px; right: 20px; z-index: 10000;
        background: #333; color: white; border: none;
        padding: 12px; border-radius: 50%; cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25); transition: all 0.2s;
        width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
    `;
    accumulateButton.addEventListener('mouseenter', () => {
        accumulateButton.style.transform = 'scale(1.1)';
        accumulateButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.35)';
    });
    accumulateButton.addEventListener('mouseleave', () => {
        accumulateButton.style.transform = 'scale(1)';
        accumulateButton.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
    });
    accumulateButton.addEventListener('click', () => {
        try {
            const text   = formatData(extractData());
            const result = addToAccumulatedData(text);
            if (result.isDuplicate) {
                showNotification('Этот товар уже в буфере', 'warning');
            } else {
                updateCounter();
                showNotification('Товар добавлен в буфер', 'success');
                accumulateButton.style.background = '#28a745';
                setTimeout(() => { accumulateButton.style.background = '#333'; }, 300);
            }
        } catch (err) {
            showNotification('Ошибка при добавлении', 'error');
            console.error('[GoldAppleCopyData] Ошибка:', err);
        }
    });
    accumulateButton.appendChild(counterBadge);

    // Кнопка — настройки
    const settingsButton = document.createElement('button');
    settingsButton.innerHTML = '⚙️';
    settingsButton.title = 'Настройки копирования';
    settingsButton.style.cssText = `
        position: fixed; bottom: 200px; right: 20px; z-index: 10000;
        background: #6c757d; color: white; border: none;
        padding: 10px; border-radius: 50%; font-size: 18px; cursor: pointer;
        box-shadow: 0 2px 8px rgba(108,117,125,0.3); transition: all 0.2s;
        width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
    `;
    settingsButton.addEventListener('mouseenter', () => {
        settingsButton.style.transform = 'scale(1.1)';
        settingsButton.style.background = '#5a6268';
    });
    settingsButton.addEventListener('mouseleave', () => {
        settingsButton.style.transform = 'scale(1)';
        settingsButton.style.background = '#6c757d';
    });
    settingsButton.addEventListener('click', createSettingsPanel);

    document.body.append(copyButton, accumulateButton, settingsButton);
    updateCounter();

    // ─── Команды в меню Tampermonkey ──────────────────────────────────────────

    GM_registerMenuCommand('📋 Скопировать товар', async () => {
        try {
            await copyToClipboard(formatData(extractData()));
            showNotification('Данные скопированы', 'success');
        } catch { showNotification('Ошибка копирования', 'error'); }
    });

    GM_registerMenuCommand('➕ Добавить в буфер', () => {
        try {
            const result = addToAccumulatedData(formatData(extractData()));
            updateCounter();
            showNotification(result.isDuplicate ? 'Уже в буфере' : 'Добавлено в буфер',
                             result.isDuplicate ? 'warning' : 'success');
        } catch { showNotification('Ошибка', 'error'); }
    });

    GM_registerMenuCommand('📤 Скопировать весь буфер', async () => {
        const data = getAccumulatedData();
        if (data) {
            await copyToClipboard(data);
            showNotification('Буфер скопирован', 'success');
        } else {
            showNotification('Буфер пуст', 'warning');
        }
    });

    GM_registerMenuCommand('🗑️ Очистить буфер', () => {
        if (confirm('Очистить накопительный буфер?')) {
            clearAccumulatedData();
            updateCounter();
            showNotification('Буфер очищен', 'info');
        }
    });

})();
