// ==UserScript==
// @name         Ozon Copy Data
// @namespace    https://github.com/qFamouse/
// @version      1.5
// @description  Copies data from an Ozon product card
// @description:ru Копирование данных с карточки товара Ozon
// @author       Famouse
// @license      MIT
// @match        https://ozon.ru/product/*
// @match        https://www.ozon.ru/product/*
// @match        https://ozon.by/product/*
// @match        https://www.ozon.by/product/*
// @match        https://ozon.kz/product/*
// @match        https://www.ozon.kz/product/*
// @match        https://ozon.uz/product/*
// @match        https://www.ozon.uz/product/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ozon.by
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/main/scripts/ozon-copy-data
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://github.com/qFamouse/Userscripts/raw/main/scripts/ozon-copy-data/ozon-copy-data.user.js
// @downloadURL  https://github.com/qFamouse/Userscripts/raw/main/scripts/ozon-copy-data/ozon-copy-data.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ─── Константы ────────────────────────────────────────────────────────────

    const SEPARATOR = '\n\n' + '='.repeat(60) + '\n\n';

    const DEFAULT_SETTINGS = {
        copyTitle: true,
        copyArticle: true,
        copyBrand: true,
        copyCategory: true,
        copyPrice: true,
        copyOldPrice: true,
        copyRating: true,
        copyUrl: false,
        copyImage: false,
        copyDescription: true,
        copyComposition: true,
        copyComplectation: true,
        copyUsage: true,
        copyCharacteristics: true
    };

    // ─── Инициализация стилей (один раз) ──────────────────────────────────────

    const globalStyle = document.createElement('style');
    globalStyle.textContent = `
        @keyframes ocd-slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to   { transform: translateX(0);     opacity: 1; }
        }
    `;
    document.head.appendChild(globalStyle);

    // ─── Настройки ────────────────────────────────────────────────────────────

    function loadSettings() {
        const saved = GM_getValue('ozon_copy_settings', null);
        // Мёрджим с дефолтами — новые ключи не потеряются при обновлении скрипта
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
    }

    function saveSettings(settings) {
        GM_setValue('ozon_copy_settings', JSON.stringify(settings));
    }

    let settings = loadSettings();

    // ─── Накопительный буфер ──────────────────────────────────────────────────

    function getAccumulatedData() {
        return GM_getValue('ozon_accumulated_buffer', '');
    }

    function getAccumulatedCount() {
        const data = getAccumulatedData();
        if (!data) return 0;
        // Считаем по разделителям, а не по "Название:" — не зависит от настроек
        return (data.match(new RegExp('={60}', 'g')) || []).length + 1;
    }

    function addToAccumulatedData(newData) {
        const current = getAccumulatedData();

        if (current) {
            const newArticleMatch = newData.match(/Артикул:\s*(\d+)/);
            if (newArticleMatch) {
                const articleRegex = new RegExp(`Артикул:\\s*${newArticleMatch[1]}\\b`);
                if (articleRegex.test(current)) {
                    return { isDuplicate: true, data: current };
                }
            } else {
                const entries = current.split(SEPARATOR);
                if (entries.some(entry => entry.trim() === newData.trim())) {
                    return { isDuplicate: true, data: current };
                }
            }
        }

        const updated = current ? current + SEPARATOR + newData : newData;
        GM_setValue('ozon_accumulated_buffer', updated);
        return { isDuplicate: false, data: updated };
    }

    function clearAccumulatedData() {
        GM_setValue('ozon_accumulated_buffer', '');
    }

    function removeFromAccumulatedData(index) {
        const entries = getAccumulatedData().split(SEPARATOR);
        entries.splice(index, 1);
        GM_setValue('ozon_accumulated_buffer', entries.join(SEPARATOR));
    }

    function getAccumulatedEntries() {
        const data = getAccumulatedData();
        if (!data) return [];
        return data.split(SEPARATOR);
    }

    // ─── Парсинг JSON-LD ──────────────────────────────────────────────────────

    function getJsonLd() {
        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const s of scripts) {
                const d = JSON.parse(s.textContent);
                if (d['@type'] === 'Product') return d;
            }
        } catch {}
        return null;
    }

    // ─── Извлечение данных ────────────────────────────────────────────────────

    function extractData() {
        const data = {};
        const ld = getJsonLd(); // надёжный структурированный источник

        // Название
        if (settings.copyTitle) {
            const el = document.querySelector('h1[class*="tsHeadline"]') ||
                       document.querySelector('[data-widget="webProductHeading"] h1');
            data.title = el?.textContent.trim() ?? ld?.name ?? null;
        }

        // Артикул (SKU)
        if (settings.copyArticle) {
            if (ld?.sku) {
                data.article = ld.sku;
            } else {
                const el = Array.from(document.querySelectorAll('button, div'))
                    .find(el => el.textContent.includes('Артикул:'));
                const match = el?.textContent.match(/Артикул:\s*(\d+)/);
                data.article = match ? match[1] : null;
            }
        }

        // Бренд
        if (settings.copyBrand) {
            data.brand = ld?.brand ?? null;
            if (!data.brand) {
                // Последний элемент breadcrumb — это обычно бренд на Ozon
                const crumbs = document.querySelectorAll('[data-widget="breadCrumbs"] ol li span');
                if (crumbs.length > 0) data.brand = crumbs[crumbs.length - 1]?.textContent.trim() ?? null;
            }
        }

        // Категория (хлебные крошки без бренда)
        if (settings.copyCategory) {
            const crumbs = document.querySelectorAll('[data-widget="breadCrumbs"] ol li a span');
            if (crumbs.length > 0) {
                data.category = Array.from(crumbs).map(el => el.textContent.trim()).join(' > ');
            } else {
                data.category = null;
            }
        }

        // Текущая цена
        if (settings.copyPrice) {
            if (ld?.offers?.price && ld?.offers?.priceCurrency) {
                data.price = `${ld.offers.price} ${ld.offers.priceCurrency}`;
            } else {
                const el = document.querySelector('[class*="tsHeadline600Large"]') ||
                           document.querySelector('[data-widget="webPrice"] span');
                data.price = el?.textContent.trim() ?? null;
            }
        }

        // Старая цена
        if (settings.copyOldPrice) {
            const el = document.querySelector('[class*="pdp_bf7"]') ||
                       Array.from(document.querySelectorAll('span'))
                           .find(el => el.style.textDecoration === 'line-through');
            data.oldPrice = el?.textContent.trim() ?? null;
        }

        // Рейтинг и отзывы
        if (settings.copyRating) {
            const rating = ld?.aggregateRating?.ratingValue;
            const count  = ld?.aggregateRating?.reviewCount;
            if (rating) {
                data.rating = count ? `${rating} (${Number(count).toLocaleString('ru-RU')} отзывов)` : String(rating);
            } else {
                // Fallback по DOM
                const ratingEl = document.querySelector('[data-widget="webSingleProductScore"] [class*="tsBodyControl"]');
                data.rating = ratingEl?.textContent.trim() ?? null;
            }
        }

        // URL страницы
        if (settings.copyUrl) {
            data.url = ld?.offers?.url ?? window.location.href;
        }

        // Изображение (первое / главное)
        if (settings.copyImage) {
            data.image = ld?.image ?? null;
            if (!data.image) {
                const img = document.querySelector('[data-widget="webGallery"] img');
                data.image = img?.src ?? null;
            }
        }

        // Описание
        if (settings.copyDescription) {
            if (ld?.description) {
                data.description = ld.description.replace(/\s+/g, ' ').trim();
            } else {
                const el = document.querySelector('#section-description');
                data.description = el?.textContent.replace(/\s+/g, ' ').trim() ?? null;
            }
        }

        // Один проход по h3 для Состав / Комплектация / Способ применения
        if (settings.copyComposition || settings.copyComplectation || settings.copyUsage) {
            const h3Map = {};
            document.querySelectorAll('h3').forEach(h => {
                h3Map[h.textContent.trim()] = h.nextElementSibling;
            });
            if (settings.copyComposition) {
                data.composition = h3Map['Состав']?.textContent.trim() ?? null;
            }
            if (settings.copyComplectation) {
                data.complectation = h3Map['Комплектация']?.textContent.trim() ?? null;
            }
            if (settings.copyUsage) {
                data.usage = h3Map['Способ применения']?.textContent.trim() ?? null;
            }
        }

        // Характеристики
        if (settings.copyCharacteristics) {
            const chars = {};
            const charSection = document.querySelector('#section-characteristics, [id*="characteristics"]');
            if (charSection) {
                charSection.querySelectorAll('dl').forEach(dl => {
                    const key = dl.querySelector('dt')?.textContent.trim();
                    const value = dl.querySelector('dd')?.textContent.trim();
                    if (key && value) chars[key] = value;
                });
            }
            data.characteristics = Object.keys(chars).length > 0 ? chars : null;
        }

        return data;
    }

    // ─── Форматирование ───────────────────────────────────────────────────────

    function formatData(data) {
        const result = [];

        if (data.title)         result.push(`Название: ${data.title}`);
        if (data.article)       result.push(`Артикул: ${data.article}`);
        if (data.brand)         result.push(`Бренд: ${data.brand}`);
        if (data.category)      result.push(`Категория: ${data.category}`);
        if (data.price)         result.push(`Цена: ${data.price}`);
        if (data.oldPrice)      result.push(`Старая цена: ${data.oldPrice}`);
        if (data.rating)        result.push(`Рейтинг: ${data.rating}`);
        if (data.url)           result.push(`URL: ${data.url}`);
        if (data.image)         result.push(`Изображение: ${data.image}`);
        if (data.description)   result.push(`\nОписание:\n${data.description}`);
        if (data.composition)   result.push(`\nСостав:\n${data.composition}`);
        if (data.complectation) result.push(`\nКомплектация:\n${data.complectation}`);
        if (data.usage)         result.push(`\nСпособ применения:\n${data.usage}`);

        if (data.characteristics) {
            result.push('\nХарактеристики:');
            for (const [key, value] of Object.entries(data.characteristics)) {
                result.push(`  ${key}: ${value}`);
            }
        }

        return result.join('\n');
    }

    // ─── Буфер обмена ─────────────────────────────────────────────────────────

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Fallback для браузеров без clipboard API
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
    }

    // ─── Уведомления ─────────────────────────────────────────────────────────

    const NOTIFICATION_COLORS = {
        success: '#4CAF50',
        warning: '#FF9800',
        error:   '#F44336',
        info:    '#2196F3'
    };

    function showNotification(message, type = 'success') {
        const el = document.createElement('div');
        el.textContent = message;
        el.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${NOTIFICATION_COLORS[type]};
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10002;
            font-size: 14px;
            font-weight: 500;
            animation: ocd-slideIn 0.3s ease;
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
            padding: 12px 16px;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
            ${cssExtra}
        `;
        return btn;
    }

    function setHover(btn, normalBg, hoverBg) {
        btn.addEventListener('mouseenter', () => { btn.style.background = hoverBg; });
        btn.addEventListener('mouseleave', () => { btn.style.background = normalBg; });
    }

    // ─── Панель настроек ──────────────────────────────────────────────────────

    function closeOverlay(overlay) {
        overlay.remove();
    }

    function createSettingsPanel() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10001;
            display: flex; align-items: center; justify-content: center;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            width: 420px;
            max-width: 95vw;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // ── Заголовок + вкладки ──────────────────────────────────────────────

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 20px 24px 0;
            border-bottom: 1px solid #e0e0e0;
            flex-shrink: 0;
        `;

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Ozon Copy Data';
        titleEl.style.cssText = 'margin: 0 0 16px 0; color: #1a1a1a; font-size: 18px; font-weight: 600;';
        header.appendChild(titleEl);

        const tabs = document.createElement('div');
        tabs.style.cssText = 'display: flex; gap: 0;';

        function makeTab(label) {
            const tab = document.createElement('button');
            tab.textContent = label;
            tab.style.cssText = `
                padding: 8px 18px; border: none; background: none; cursor: pointer;
                font-size: 14px; font-weight: 500; color: #888;
                border-bottom: 2px solid transparent; margin-bottom: -1px;
                transition: color 0.15s;
            `;
            return tab;
        }

        const tabSettings = makeTab('Поля');
        const tabBuffer   = makeTab('Буфер');
        tabs.append(tabSettings, tabBuffer);
        header.appendChild(tabs);
        panel.appendChild(header);

        // ── Тело панели (скроллируемое) ───────────────────────────────────────

        const body = document.createElement('div');
        body.style.cssText = 'padding: 20px 24px; overflow-y: auto; flex: 1;';
        panel.appendChild(body);

        // ── Футер ─────────────────────────────────────────────────────────────

        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 24px 20px;
            border-top: 1px solid #e0e0e0;
            flex-shrink: 0;
            display: flex; gap: 8px; flex-direction: column;
        `;
        panel.appendChild(footer);

        // ── Вкладка «Поля» ────────────────────────────────────────────────────

        const fieldOptions = [
            { key: 'copyTitle',           label: 'Название' },
            { key: 'copyArticle',         label: 'Артикул' },
            { key: 'copyBrand',           label: 'Бренд' },
            { key: 'copyCategory',        label: 'Категория' },
            { key: 'copyPrice',           label: 'Цена' },
            { key: 'copyOldPrice',        label: 'Старая цена' },
            { key: 'copyRating',          label: 'Рейтинг и отзывы' },
            { key: 'copyUrl',             label: 'URL товара' },
            { key: 'copyImage',           label: 'Ссылка на изображение' },
            { key: 'copyDescription',     label: 'Описание' },
            { key: 'copyComposition',     label: 'Состав' },
            { key: 'copyComplectation',   label: 'Комплектация' },
            { key: 'copyUsage',           label: 'Способ применения' },
            { key: 'copyCharacteristics', label: 'Характеристики' }
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
            const labelText = document.createElement('span');
            labelText.textContent = opt.label;
            labelText.style.cssText = 'color: #333; font-size: 14px;';
            label.append(checkbox, labelText);
            settingsPane.appendChild(label);
        });

        // ── Вкладка «Буфер» ───────────────────────────────────────────────────

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

            if (entries.length === 0) {
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
                    padding: 10px 12px; border-radius: 8px; background: #f8f8f8;
                    margin-bottom: 8px;
                `;

                const nameEl = document.createElement('div');
                nameEl.textContent = getEntryLabel(entry);
                nameEl.style.cssText = `
                    flex: 1; font-size: 13px; color: #222; line-height: 1.4;
                    word-break: break-word;
                `;

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

        // ── Футер-кнопки ─────────────────────────────────────────────────────

        const copyBufferBtn = makeButton('Скопировать буфер', 'cursor: pointer;');
        setHover(copyBufferBtn, '#005bff', '#0047cc');
        copyBufferBtn.addEventListener('click', async () => {
            const accumulated = getAccumulatedData();
            if (accumulated) {
                await copyToClipboard(accumulated);
                showNotification('Буфер скопирован в clipboard', 'success');
            }
        });

        const clearBtn = makeButton('Очистить буфер', 'cursor: pointer;');
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

        const closeBtn = makeButton('Закрыть', 'background: #f5f5f5; color: #333; margin-top: 0;');
        closeBtn.style.color = '#333';
        setHover(closeBtn, '#f5f5f5', '#e0e0e0');
        closeBtn.addEventListener('click', () => closeOverlay(overlay));

        footer.append(copyBufferBtn, clearBtn, closeBtn);

        function updateFooterButtons() {
            const hasData = getAccumulatedData().length > 0;
            copyBufferBtn.disabled = !hasData;
            copyBufferBtn.style.background = hasData ? '#005bff' : '#ccc';
            copyBufferBtn.style.cursor = hasData ? 'pointer' : 'not-allowed';
            clearBtn.disabled = !hasData;
            clearBtn.style.background = hasData ? '#FF5722' : '#ccc';
            clearBtn.style.cursor = hasData ? 'pointer' : 'not-allowed';
        }

        // ── Переключение вкладок ─────────────────────────────────────────────

        function activateTab(tab, pane, showFooterBtns) {
            [tabSettings, tabBuffer].forEach(t => {
                t.style.color = '#888';
                t.style.borderBottomColor = 'transparent';
            });
            tab.style.color = '#005bff';
            tab.style.borderBottomColor = '#005bff';

            body.innerHTML = '';
            body.appendChild(pane);

            // Кнопки буфера показываем только на вкладке «Буфер»
            copyBufferBtn.style.display = showFooterBtns ? '' : 'none';
            clearBtn.style.display      = showFooterBtns ? '' : 'none';
        }

        tabSettings.addEventListener('click', () => activateTab(tabSettings, settingsPane, false));
        tabBuffer.addEventListener('click',   () => {
            activateTab(tabBuffer, bufferPane, true);
            renderBufferList();
            updateFooterButtons();
        });

        // Открываем сразу «Поля»
        activateTab(tabSettings, settingsPane, false);

        // ── Закрытие ─────────────────────────────────────────────────────────

        overlay.appendChild(panel);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(overlay); });
        const onKeyDown = e => {
            if (e.key === 'Escape') { closeOverlay(overlay); document.removeEventListener('keydown', onKeyDown); }
        };
        document.addEventListener('keydown', onKeyDown);
        document.body.appendChild(overlay);
    }

    // ─── UI: Счётчик ──────────────────────────────────────────────────────────

    const counterBadge = document.createElement('div');
    counterBadge.style.cssText = `
        position: absolute; top: -6px; right: -6px;
        background: #FF5722; color: white; border-radius: 50%;
        min-width: 20px; height: 20px; font-size: 11px; font-weight: bold;
        display: none; align-items: center; justify-content: center;
        border: 2px solid white; padding: 0 4px;
    `;

    function updateCounter() {
        const hasData = getAccumulatedData().length > 0;
        const count = hasData ? getAccumulatedCount() : 0;
        counterBadge.textContent = count;
        counterBadge.style.display = count > 0 ? 'flex' : 'none';
    }

    // ─── UI: Кнопки ───────────────────────────────────────────────────────────

    // Кнопка — скопировать товар
    const copyButton = document.createElement('button');
    copyButton.innerHTML = '📋';
    copyButton.title = 'Копировать данные товара';
    copyButton.style.cssText = `
        position: fixed; bottom: 80px; right: 20px; z-index: 10000;
        background: #005bff; color: white; border: none;
        padding: 12px; border-radius: 50%; font-size: 20px; cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,91,255,0.3); transition: all 0.2s;
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
            setTimeout(() => { copyButton.innerHTML = '📋'; copyButton.style.background = '#005bff'; }, 1500);
        } catch (err) {
            copyButton.innerHTML = '❌';
            copyButton.style.background = '#dc3545';
            setTimeout(() => { copyButton.innerHTML = '📋'; copyButton.style.background = '#005bff'; }, 1500);
            console.error('[OzonCopyData] Ошибка копирования:', err);
        }
    });

    // Кнопка — добавить в буфер
    const accumulateButton = document.createElement('button');
    accumulateButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 11H13V5C13 4.45 12.55 4 12 4C11.45 4 11 4.45 11 5V11H5C4.45 11 4 11.45 4 12C4 12.55 4.45 13 5 13H11V19C11 19.55 11.45 20 12 20C12.55 20 13 19.55 13 19V13H19C19.55 13 20 12.55 20 12C20 11.45 19.55 11 19 11Z" fill="white"/>
        </svg>
    `;
    accumulateButton.title = 'Добавить товар в буфер';
    accumulateButton.style.cssText = `
        position: fixed; bottom: 140px; right: 20px; z-index: 10000;
        background: #005bff; color: white; border: none;
        padding: 12px; border-radius: 50%; cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,91,255,0.3); transition: all 0.2s;
        width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
    `;
    accumulateButton.addEventListener('mouseenter', () => {
        accumulateButton.style.transform = 'scale(1.1)';
        accumulateButton.style.boxShadow = '0 4px 15px rgba(0,91,255,0.4)';
    });
    accumulateButton.addEventListener('mouseleave', () => {
        accumulateButton.style.transform = 'scale(1)';
        accumulateButton.style.boxShadow = '0 2px 10px rgba(0,91,255,0.3)';
    });
    accumulateButton.addEventListener('click', () => {
        try {
            const text = formatData(extractData());
            const result = addToAccumulatedData(text);
            if (result.isDuplicate) {
                showNotification('Этот товар уже в буфере', 'warning');
            } else {
                updateCounter();
                showNotification('Товар добавлен в буфер', 'success');
                accumulateButton.style.background = '#28a745';
                setTimeout(() => { accumulateButton.style.background = '#005bff'; }, 300);
            }
        } catch (err) {
            showNotification('Ошибка при добавлении', 'error');
            console.error('[OzonCopyData] Ошибка:', err);
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
            const text = formatData(extractData());
            await copyToClipboard(text);
            showNotification('Данные скопированы', 'success');
        } catch (err) {
            showNotification('Ошибка копирования', 'error');
        }
    });

    GM_registerMenuCommand('➕ Добавить в буфер', () => {
        try {
            const text = formatData(extractData());
            const result = addToAccumulatedData(text);
            updateCounter();
            showNotification(result.isDuplicate ? 'Уже в буфере' : 'Добавлено в буфер',
                             result.isDuplicate ? 'warning' : 'success');
        } catch (err) {
            showNotification('Ошибка', 'error');
        }
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