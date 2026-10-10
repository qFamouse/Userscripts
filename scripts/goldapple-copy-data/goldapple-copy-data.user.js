// ==UserScript==
// @name           GoldApple Copy Data
// @namespace      https://github.com/qFamouse/
// @version        1.1
// @description    Copies data from a Gold Apple product card, with an accumulating buffer and a "+" button right on catalog cards
// @description:ru Копирование данных с карточки товара Gold Apple с накопительным буфером и кнопкой «+» прямо на карточках каталога
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
// @noframes
// @homepageURL    https://github.com/qFamouse/Userscripts/tree/master/scripts/goldapple-copy-data
// @supportURL     https://github.com/qFamouse/Userscripts/issues
// @updateURL      https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/goldapple-copy-data/goldapple-copy-data.user.js
// @downloadURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/goldapple-copy-data/goldapple-copy-data.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─── Константы ────────────────────────────────────────────────────────────

    const SEPARATOR = '\n\n' + '='.repeat(60) + '\n\n';

    /** Маркер записи, собранной только из карточки каталога (без описания/состава) */
    const PARTIAL_MARK = '⚠ Неполные данные: добавлено из карточки каталога';

    /** Сколько ждать загрузки страницы товара в фоне, мс */
    const PRODUCT_LOAD_TIMEOUT = 30000;

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

    // Карточка каталога: <article class="_ga-product-card-vertical_…">.
    // Второй вариант — на случай, если корень не <article>; дочерние элементы
    // (…vertical__xxx) исключаются.
    const CARD_SELECTOR = [
        'article[class*="product-card-vertical"]',
        'div[class*="product-card-vertical_"]:not([class*="product-card-vertical__"])',
    ].join(', ');

    // ─── Стили (один раз) ─────────────────────────────────────────────────────

    const globalStyle = document.createElement('style');
    globalStyle.textContent = `
        @keyframes gcd-slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes gcd-spin { to { transform: rotate(360deg); } }

        #gcd-toasts {
            position: fixed; top: 20px; right: 20px; z-index: 10002;
            display: flex; flex-direction: column; gap: 8px;
            pointer-events: none;
        }

        /* Кнопка «+» на карточке каталога */
        .gcd-card-btn {
            position: absolute; left: 8px; bottom: 8px; z-index: 5;
            width: 32px; height: 32px; padding: 0; margin: 0;
            display: flex; align-items: center; justify-content: center;
            border: none; border-radius: 50%; cursor: pointer;
            background: #333; color: #fff;
            box-shadow: 0 1px 6px rgba(0,0,0,0.3);
            pointer-events: auto;
            transition: transform 0.15s, background 0.2s;
        }
        .gcd-card-btn:hover { transform: scale(1.12); }
        .gcd-card-btn svg { width: 18px; height: 18px; display: block; }
        .gcd-card-btn[data-state="loading"] { background: #888; cursor: progress; }
        .gcd-card-btn[data-state="loading"] svg { animation: gcd-spin 0.8s linear infinite; }
        .gcd-card-btn[data-state="done"]    { background: #28a745; }
        .gcd-card-btn[data-state="partial"] { background: #FF9800; }
        /* Уже в буфере: при наведении галочка превращается в крестик — клик убирает из буфера */
        .gcd-card-btn .gcd-x { display: none; }
        .gcd-card-btn[data-state="done"]:hover,
        .gcd-card-btn[data-state="partial"]:hover { background: #e53935; }
        .gcd-card-btn[data-state="done"]:hover .gcd-check,
        .gcd-card-btn[data-state="partial"]:hover .gcd-check { display: none; }
        .gcd-card-btn[data-state="done"]:hover .gcd-x,
        .gcd-card-btn[data-state="partial"]:hover .gcd-x { display: block; }
    `;
    document.head.appendChild(globalStyle);

    // ─── Настройки ────────────────────────────────────────────────────────────

    function loadSettings() {
        try {
            const saved = GM_getValue('ga_copy_settings', null);
            return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
        } catch {
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings(s) {
        GM_setValue('ga_copy_settings', JSON.stringify(s));
    }

    let settings = loadSettings();

    // ─── Накопительный буфер ──────────────────────────────────────────────────

    function getAccumulatedData() { return GM_getValue('ga_accumulated_buffer', ''); }

    function getAccumulatedEntries() {
        const data = getAccumulatedData();
        return data ? data.split(SEPARATOR) : [];
    }

    function saveEntries(entries) {
        GM_setValue('ga_accumulated_buffer', entries.join(SEPARATOR));
    }

    function getAccumulatedCount() { return getAccumulatedEntries().length; }

    /** Артикул записи — строка «Артикул: N» (с начала строки, чтобы не цеплять текст описаний) */
    function entryArticle(entry) {
        const m = entry.match(/^Артикул:\s*(\d+)/m);
        return m ? m[1] : null;
    }

    function isPartialEntry(entry) { return entry.includes(PARTIAL_MARK); }

    function getBufferArticles() {
        return new Set(getAccumulatedEntries().map(entryArticle).filter(Boolean));
    }

    /**
     * @returns {{status: 'added'|'duplicate'|'replaced'|'empty'}}
     * Если в буфере уже есть неполная запись (из карточки), а пришла полная — заменяем её.
     */
    function addToAccumulatedData(newData, article) {
        if (!newData || !newData.trim()) return { status: 'empty' };

        const entries = getAccumulatedEntries();
        const idx = entries.findIndex(e =>
            article && entryArticle(e)
                ? entryArticle(e) === String(article)
                : e.trim() === newData.trim()
        );

        if (idx !== -1) {
            if (isPartialEntry(entries[idx]) && !isPartialEntry(newData)) {
                entries[idx] = newData;
                saveEntries(entries);
                return { status: 'replaced' };
            }
            return { status: 'duplicate' };
        }

        entries.push(newData);
        saveEntries(entries);
        return { status: 'added' };
    }

    function clearAccumulatedData() { GM_setValue('ga_accumulated_buffer', ''); }

    function removeFromAccumulatedData(index) {
        const entries = getAccumulatedEntries();
        entries.splice(index, 1);
        saveEntries(entries);
    }

    function removeFromBufferByArticle(article) {
        saveEntries(getAccumulatedEntries().filter(e => entryArticle(e) !== String(article)));
    }

    // ─── Вспомогательные функции ──────────────────────────────────────────────

    /** querySelector по частичному имени CSS-модульного класса */
    function qc(root, classSubstr) {
        return root.querySelector(`[class*="${classSubstr}"]`);
    }

    function qca(root, classSubstr) {
        return Array.from(root.querySelectorAll(`[class*="${classSubstr}"]`));
    }

    /** Чистый текст ноды */
    function cleanText(el) {
        return el ? (el.innerText ?? el.textContent).replace(/\s+/g, ' ').trim() : null;
    }

    /** Артикул из URL вида /19000295772-velvet-cover */
    function articleFromUrl(url) {
        const m = String(url || '').match(/\/(\d{6,})-/);
        return m ? m[1] : null;
    }

    /** Ссылку на товар приводим к текущему origin (нужно для same-origin iframe) */
    function toSameOriginUrl(href) {
        const u = new URL(href, location.href);
        return location.origin + u.pathname + u.search;
    }

    /** Мы на странице конкретного товара? */
    function isProductPage(doc = document) {
        return !!doc.querySelector('h1 [class*="pdp-title__name"]');
    }

    // ─── Извлечение данных со страницы товара ─────────────────────────────────

    /**
     * Вкладки товара: { 'описание': el, 'применение': el, … }.
     * Названия берём из атрибута text="…" внутри контента вкладки,
     * а если его нет — из кнопок навигации (по порядку).
     */
    function getTabs(doc) {
        const contents = qca(doc, 'tabbed-sections__content');
        const navNames = Array.from(doc.querySelectorAll('.ga-tabs-tab__text'))
            .map(el => el.textContent.trim().toLowerCase());
        // Порядок на сайте: Описание, Применение, Состав, Бренд, Дополнительная информация
        const defaultOrder = ['описание', 'применение', 'состав', 'бренд', 'дополнительная информация'];

        const tabs = {};
        contents.forEach((el, i) => {
            const own = el.querySelector('[text]')?.getAttribute('text');
            const name = (own || navNames[i] || defaultOrder[i] || '').trim().toLowerCase();
            if (name && !tabs[name]) tabs[name] = el;
        });
        return tabs;
    }

    function extractData(doc = document, pageUrl = location.href) {
        const fields = {};
        let article = null;
        let title = null;

        // Бренд и название
        const h1 = doc.querySelector('h1');
        if (h1) {
            const brandEl = qc(h1, 'pdp-title__brand');
            const nameEl  = qc(h1, 'pdp-title__name');
            const brand   = brandEl?.textContent.trim() ?? null;
            const name    = nameEl?.textContent.trim()  ?? null;

            title = [brand, name].filter(Boolean).join(' ') || null;
            if (settings.copyBrand) fields.brand = brand;
            if (settings.copyTitle) fields.title = title;
        }

        // Артикул (всегда определяем — нужен для проверки дублей и валидации)
        for (const el of qca(doc, 'pdp-tabs-content__sub-title')) {
            const m = el.textContent.match(/артикул:\s*(\d+)/i);
            if (m) { article = m[1]; break; }
        }
        if (!article) article = articleFromUrl(pageUrl);
        if (settings.copyArticle && article) fields.article = article;

        // Категория (хлебные крошки)
        if (settings.copyCategory) {
            const crumbLinks = doc.querySelectorAll('[class*="breadcrumbs__list"] a');
            if (crumbLinks.length) {
                fields.category = Array.from(crumbLinks)
                    .map(a => a.textContent.trim())
                    .filter(Boolean)
                    .join(' > ');
            }
        }

        // Текущая цена
        if (settings.copyPrice) {
            const actualRow = qc(doc, 'pdp-price-row__row_actual');
            if (actualRow) {
                const priceVal = qc(actualRow, 'pdp-price-row__value') || qc(actualRow, 'ga-price_');
                fields.price = priceVal ? priceVal.textContent.trim() : cleanText(actualRow);
            }
        }

        // Цена по карте
        if (settings.copyCardPrice) {
            const bestRow = qc(doc, 'pdp-price-row__row_best');
            if (bestRow) {
                const priceVal = qc(bestRow, 'pdp-price-row__value') || qc(bestRow, 'ga-price_');
                const label    = qc(bestRow, 'pdp-price-row__label');
                const priceStr = priceVal ? priceVal.textContent.trim() : null;
                const labelStr = label ? label.textContent.trim() : null;
                if (priceStr) {
                    fields.cardPrice = labelStr ? `${priceStr} (${labelStr})` : priceStr;
                }
            }
        }

        // Рейтинг и отзывы
        if (settings.copyRating) {
            const ratingBlock = qc(doc, 'review-score-point_with_rating');
            const ratingNum   = ratingBlock ? qc(ratingBlock, 'score-point__numeral') : null;
            const countEl     = qc(doc, 'review-rating-score__count');
            const num   = ratingNum?.textContent.trim() ?? null;
            const count = countEl?.textContent.trim()   ?? null;
            if (num || count) {
                fields.rating = [num, count].filter(Boolean).join(' · ');
            }
        }

        // URL
        if (settings.copyUrl) fields.url = pageUrl;

        // Изображение
        if (settings.copyImage) {
            const galleryImg = doc.querySelector('[class*="gallery"] img');
            fields.image = galleryImg?.src ?? null;
        }

        // Вкладки
        const tabs = getTabs(doc);

        // Описание
        const descTab = tabs['описание'];
        if (settings.copyDescription && descTab) {
            // В начале вкладки есть заголовок+артикул, берём только <p>
            const paragraphs = descTab.querySelectorAll('p');
            if (paragraphs.length) {
                fields.description = Array.from(paragraphs)
                    .map(p => (p.innerText ?? p.textContent).trim())
                    .filter(Boolean)
                    .join('\n');
            } else {
                const rawText = cleanText(descTab) ?? '';
                fields.description = rawText.replace(/^.+?артикул:\s*\d+\s*/i, '').trim() || null;
            }
        }

        if (settings.copyUsage && tabs['применение'])  fields.usage = cleanText(tabs['применение']);
        if (settings.copyComposition && tabs['состав']) fields.composition = cleanText(tabs['состав']);
        if (settings.copyAdditionalInfo && tabs['дополнительная информация']) {
            fields.additionalInfo = cleanText(tabs['дополнительная информация']);
        }

        return { fields, article, title };
    }

    // ─── Извлечение данных из карточки каталога ───────────────────────────────

    function extractCardInfo(card) {
        const link = card.querySelector('a[href]');
        const href = link?.getAttribute('href');
        const article =
            card.querySelector('meta[itemprop="sku"]')?.getAttribute('content') ||
            card.querySelector('[data-scroll-id]')?.getAttribute('data-scroll-id') ||
            articleFromUrl(href);
        if (!href || !article) return null;

        const brand = qc(card, 'product-card-name__brand')?.textContent.trim() || null;
        const name  = qc(card, 'product-card-name__name')?.textContent.trim() || null;
        const type  = qc(card, 'product-card-vertical__type')?.textContent.trim() || null;

        const actual = qc(card, 'price-row__item-actual');
        const price  = actual ? cleanText(qc(actual, 'ga-price_') || actual) : null;

        return {
            article: String(article),
            url: toSameOriginUrl(href),
            brand,
            name,
            type,
            price,
            title: [brand, name].filter(Boolean).join(' ') || null,
        };
    }

    /** Запасной вариант: запись только с тем, что видно на карточке */
    function formatCardInfo(info) {
        const fields = {};
        if (settings.copyTitle && info.title)     fields.title = info.title;
        if (settings.copyArticle)                 fields.article = info.article;
        if (settings.copyBrand && info.brand)     fields.brand = info.brand;
        if (settings.copyPrice && info.price)     fields.price = info.price;
        if (settings.copyUrl)                     fields.url = info.url;
        return formatData(fields) + '\n\n' + PARTIAL_MARK;
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

    let toastHost = null;

    function showNotification(message, type = 'success') {
        if (!toastHost || !toastHost.isConnected) {
            toastHost = document.createElement('div');
            toastHost.id = 'gcd-toasts';
            document.body.appendChild(toastHost);
        }
        const el = document.createElement('div');
        el.textContent = message;
        el.style.cssText = `
            background: ${NOTIFICATION_COLORS[type]}; color: white;
            padding: 14px 22px; border-radius: 8px; max-width: 360px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px; font-weight: 500; line-height: 1.35;
            animation: gcd-slideIn 0.3s ease;
        `;
        toastHost.appendChild(el);
        setTimeout(() => {
            el.style.transition = 'all 0.3s ease';
            el.style.transform = 'translateX(400px)';
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }

    // ─── Загрузка страницы товара в фоне ──────────────────────────────────────
    //
    // Сайт рендерится на клиенте (в HTML-ответе пустая оболочка), поэтому fetch()
    // данных не даст. Открываем товар в скрытом same-origin iframe, ждём, пока
    // отрисуется страница, и читаем DOM теми же функциями, что и на странице товара.

    function loadProductInIframe(url) {
        return new Promise((resolve, reject) => {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.setAttribute('aria-hidden', 'true');
            iframe.tabIndex = -1;
            // Не display:none — иначе у страницы не будет раскладки, а часть контента ленивая
            iframe.style.cssText = `
                position: fixed; left: -10000px; top: 0;
                width: 1280px; height: 1000px; border: 0;
                opacity: 0; pointer-events: none;
            `;

            let finished = false;
            const finish = (err, result) => {
                if (finished) return;
                finished = true;
                clearInterval(timer);
                clearTimeout(timeout);
                if (err) { iframe.remove(); reject(err); }
                else resolve({ ...result, dispose: () => iframe.remove() });
            };

            const isReady = doc =>
                isProductPage(doc) &&
                qca(doc, 'tabbed-sections__content').length > 0 &&
                qca(doc, 'pdp-tabs-content__sub-title').length > 0;

            let readySince = 0;
            const timer = setInterval(() => {
                try {
                    const doc = iframe.contentDocument;
                    if (!doc || !doc.body) return;
                    if (isReady(doc)) {
                        // небольшая «выдержка», чтобы дорисовались цены/рейтинг
                        if (!readySince) readySince = Date.now();
                        if (Date.now() - readySince > 600) finish(null, { doc });
                    } else {
                        readySince = 0;
                    }
                } catch (e) {
                    finish(e);
                }
            }, 250);
            const timeout = setTimeout(() => finish(new Error('timeout')), PRODUCT_LOAD_TIMEOUT);

            document.body.appendChild(iframe);
        });
    }

    /** Один товар за раз — чтобы не поднимать десяток копий SPA одновременно */
    let loadQueue = Promise.resolve();
    function enqueue(task) {
        const run = loadQueue.then(task);
        loadQueue = run.catch(() => {});
        return run;
    }

    /** @returns {Promise<{text: string, partial: boolean}>} */
    function collectProductText(info) {
        return enqueue(async () => {
            try {
                const { doc, dispose } = await loadProductInIframe(info.url);
                try {
                    const product = extractData(doc, info.url);
                    if (!product.article) product.article = info.article;
                    const text = formatData(product.fields);
                    if (!text.trim()) throw new Error('empty');
                    return { text, partial: false };
                } finally {
                    dispose();
                }
            } catch (err) {
                console.warn('[GoldAppleCopyData] Не удалось загрузить страницу товара, беру данные карточки:', err);
                return { text: formatCardInfo(info), partial: true };
            }
        });
    }

    // ─── Кнопка «+» на карточках каталога ─────────────────────────────────────

    const PLUS_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    const CHECK_SVG = `<svg class="gcd-check" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const X_SVG = `<svg class="gcd-x" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    const SPIN_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

    const pendingArticles = new Set();

    function setCardBtnState(btn, state) {
        btn.dataset.state = state;
        btn.innerHTML = state === 'loading' ? SPIN_SVG : (state === 'idle' ? PLUS_SVG : CHECK_SVG + X_SVG);
        btn.title = {
            idle: 'Добавить товар в буфер (GoldApple Copy Data)',
            loading: 'Загружаю данные товара…',
            done: 'Товар в буфере. Нажмите, чтобы убрать',
            partial: 'В буфере только данные карточки (без описания и состава). Нажмите, чтобы убрать, затем добавьте снова',
        }[state];
    }

    async function onCardBtnClick(btn) {
        const article = btn.dataset.article;
        if (pendingArticles.has(article)) return;

        const card = btn.closest(CARD_SELECTOR);
        const info = card ? extractCardInfo(card) : null;
        if (!info) { showNotification('Не удалось прочитать карточку', 'error'); return; }

        // Товар уже в буфере — повторный клик убирает его оттуда
        if (getBufferArticles().has(info.article)) {
            removeFromBufferByArticle(info.article);
            updateCounter(); // перерисует состояние кнопок
            showNotification(`Убрано из буфера: ${info.title || info.article}`, 'info');
            return;
        }

        pendingArticles.add(article);
        setCardBtnState(btn, 'loading');
        try {
            const { text, partial } = await collectProductText(info);
            // Дедуп по артикулу из самой записи (он взят со страницы товара), а не только из карточки
            const result = addToAccumulatedData(text, entryArticle(text) || info.article);
            const label = info.title || info.article;

            if (result.status === 'duplicate') {
                showNotification('Этот товар уже в буфере', 'warning');
            } else if (partial) {
                showNotification(`Добавлено частично (только данные карточки): ${label}`, 'warning');
            } else if (result.status === 'replaced') {
                showNotification(`Дополнено полными данными: ${label}`, 'success');
            } else {
                showNotification(`Добавлено в буфер: ${label}`, 'success');
            }
        } catch (err) {
            console.error('[GoldAppleCopyData] Ошибка:', err);
            showNotification('Ошибка при добавлении', 'error');
        } finally {
            pendingArticles.delete(article);
            updateCounter(); // заодно перерисует состояния кнопок
        }
    }

    function injectCardButtons() {
        document.querySelectorAll(CARD_SELECTOR).forEach(card => {
            if (card.querySelector('.gcd-card-btn')) return;

            const info = extractCardInfo(card);
            if (!info) return; // карточка ещё не дорисована

            // Кладём в тот же оверлей, где лежат «избранное» и «в корзину»
            const actions = qc(card, 'product-card-vertical__actions');
            const host = (actions && qc(actions, 'product-card-vertical__ratio')) || actions || card;
            if (host === card && getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gcd-card-btn';
            btn.dataset.article = info.article;
            setCardBtnState(btn, 'idle');

            const stop = e => { e.preventDefault(); e.stopPropagation(); };
            btn.addEventListener('click', e => { stop(e); onCardBtnClick(btn); }, true);
            // чтобы клик не уходил в ссылку/роутер карточки
            ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']
                .forEach(t => btn.addEventListener(t, e => e.stopPropagation()));

            host.appendChild(btn);
        });
        refreshCardStates();
    }

    /** Подсветка кнопок на карточках, которые уже в буфере */
    function refreshCardStates() {
        const entries = getAccumulatedEntries();
        const full = new Set();
        const partial = new Set();
        entries.forEach(e => {
            const a = entryArticle(e);
            if (a) (isPartialEntry(e) ? partial : full).add(a);
        });

        document.querySelectorAll('.gcd-card-btn').forEach(btn => {
            const a = btn.dataset.article;
            if (pendingArticles.has(a)) return;
            const state = full.has(a) ? 'done' : partial.has(a) ? 'partial' : 'idle';
            if (btn.dataset.state !== state) setCardBtnState(btn, state);
        });
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

        const closePanel = () => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        };
        const onKey = e => { if (e.key === 'Escape') closePanel(); };

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
            const titleMatch = entry.match(/^Название:\s*(.+)/m);
            const title   = titleMatch ? titleMatch[1].trim() : null;
            const article = entryArticle(entry);
            const warn    = isPartialEntry(entry) ? '⚠ ' : '';
            if (title && article) return `${warn}${title} (${article})`;
            if (title)   return warn + title;
            if (article) return `${warn}Артикул: ${article}`;
            return warn + entry.slice(0, 60).trim();
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
                if (isPartialEntry(entry)) nameEl.title = 'Только данные карточки каталога (без описания и состава)';

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
        closeBtn.addEventListener('click', closePanel);

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
        overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
    }

    // ─── Счётчик ──────────────────────────────────────────────────────────────

    const badges = [];

    function makeBadge() {
        const badge = document.createElement('div');
        badge.style.cssText = `
            position: absolute; top: -6px; right: -6px;
            background: #FF5722; color: white; border-radius: 50%;
            min-width: 20px; height: 20px; font-size: 11px; font-weight: bold;
            display: none; align-items: center; justify-content: center;
            border: 2px solid white; padding: 0 4px; box-sizing: border-box;
            pointer-events: none;
        `;
        badges.push(badge);
        return badge;
    }

    function updateCounter() {
        const count = getAccumulatedCount();
        badges.forEach(b => {
            b.textContent = count;
            b.style.display = count > 0 ? 'flex' : 'none';
        });
        refreshCardStates();
    }

    // ─── Текущий товар (страница товара) ──────────────────────────────────────

    /** @returns {{text: string, article: string|null}|null} — null, если копировать нечего */
    function getCurrentProduct() {
        if (!isProductPage()) {
            showNotification('Откройте страницу товара — на списке копировать нечего', 'warning');
            return null;
        }
        const product = extractData();
        if (!product.article && !product.title) {
            showNotification('Не удалось прочитать данные товара — дождитесь загрузки страницы', 'error');
            return null;
        }
        const text = formatData(product.fields);
        if (!text.trim()) {
            showNotification('Все поля отключены в настройках', 'warning');
            return null;
        }
        return { text, article: product.article };
    }

    function addCurrentProductToBuffer() {
        const product = getCurrentProduct();
        if (!product) return null;
        const result = addToAccumulatedData(product.text, product.article);
        updateCounter();
        return result;
    }

    // ─── Плавающие кнопки ─────────────────────────────────────────────────────

    // Кнопка — скопировать
    const copyButton = document.createElement('button');
    copyButton.innerHTML = '📋';
    copyButton.title = 'Копировать данные товара';
    copyButton.style.cssText = `
        position: fixed; bottom: 80px; right: 20px; z-index: 10000;
        background: #333; color: white; border: none;
        padding: 12px; border-radius: 50%; font-size: 20px; cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25); transition: all 0.2s;
        width: 48px; height: 48px; display: none; align-items: center; justify-content: center;
    `;
    copyButton.addEventListener('mouseenter', () => copyButton.style.transform = 'scale(1.1)');
    copyButton.addEventListener('mouseleave', () => copyButton.style.transform = 'scale(1)');
    copyButton.addEventListener('click', async () => {
        const product = getCurrentProduct();
        if (!product) return;
        try {
            await copyToClipboard(product.text);
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
        width: 48px; height: 48px; display: none; align-items: center; justify-content: center;
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
            const result = addCurrentProductToBuffer();
            if (!result) return;
            if (result.status === 'duplicate') {
                showNotification('Этот товар уже в буфере', 'warning');
            } else {
                showNotification(result.status === 'replaced' ? 'Данные товара дополнены' : 'Товар добавлен в буфер', 'success');
                accumulateButton.style.background = '#28a745';
                setTimeout(() => { accumulateButton.style.background = '#333'; }, 300);
            }
        } catch (err) {
            showNotification('Ошибка при добавлении', 'error');
            console.error('[GoldAppleCopyData] Ошибка:', err);
        }
    });
    accumulateButton.appendChild(makeBadge());

    // Кнопка — настройки / буфер (доступна на любой странице)
    const settingsButton = document.createElement('button');
    settingsButton.innerHTML = '⚙️';
    settingsButton.title = 'Настройки копирования и буфер';
    settingsButton.style.cssText = `
        position: fixed; bottom: 80px; right: 20px; z-index: 10000;
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
    settingsButton.appendChild(makeBadge());

    document.body.append(copyButton, accumulateButton, settingsButton);

    /**
     * 📋 и ➕ имеют смысл только на странице товара. На списках они раньше
     * сохраняли в буфер мусор — теперь скрыты (там работают «+» на карточках).
     * Сайт — SPA, поэтому состояние пересчитываем при изменениях DOM.
     */
    let lastMode = null;
    function syncPageMode() {
        const onProduct = isProductPage();
        if (onProduct === lastMode) return;
        lastMode = onProduct;
        copyButton.style.display       = onProduct ? 'flex' : 'none';
        accumulateButton.style.display = onProduct ? 'flex' : 'none';
        settingsButton.style.bottom    = onProduct ? '200px' : '80px';
    }

    let syncTimer = null;
    function scheduleSync() {
        if (syncTimer) return;
        syncTimer = setTimeout(() => {
            syncTimer = null;
            syncPageMode();
            injectCardButtons();
        }, 250);
    }

    new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true });
    // страховка на случай навигации без заметных мутаций
    setInterval(scheduleSync, 1500);

    syncPageMode();
    injectCardButtons();
    updateCounter();

    // ─── Команды в меню Tampermonkey ──────────────────────────────────────────

    GM_registerMenuCommand('📋 Скопировать товар', async () => {
        const product = getCurrentProduct();
        if (!product) return;
        try {
            await copyToClipboard(product.text);
            showNotification('Данные скопированы', 'success');
        } catch { showNotification('Ошибка копирования', 'error'); }
    });

    GM_registerMenuCommand('➕ Добавить в буфер', () => {
        try {
            const result = addCurrentProductToBuffer();
            if (!result) return;
            showNotification(result.status === 'duplicate' ? 'Уже в буфере' : 'Добавлено в буфер',
                             result.status === 'duplicate' ? 'warning' : 'success');
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
