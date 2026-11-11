// ==UserScript==
// @name         Ozon Copy Data
// @namespace    https://github.com/qFamouse/
// @version      2.0
// @description  Copies data from an Ozon product card or directly from catalog/search tiles
// @description:ru Копирование данных с карточки товара Ozon и прямо из каталога/поиска
// @author       Famouse
// @license      MIT
// @match        https://*.ozon.ru/*
// @match        https://*.ozon.by/*
// @match        https://*.ozon.kz/*
// @match        https://*.ozon.uz/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ozon.by
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/master/scripts/ozon-copy-data
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/ozon-copy-data/ozon-copy-data.user.js
// @downloadURL  https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/ozon-copy-data/ozon-copy-data.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ─── Константы ────────────────────────────────────────────────────────────

    const SEPARATOR = '\n\n' + '='.repeat(60) + '\n\n';

    const DEFAULT_SETTINGS = {
        copyTitle: true,
        copyArticle: true,
        copyBrand: true,
        copyBrandVerified: true,
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

    // поле данных -> ключ настройки
    const FIELD_TO_SETTING = {
        title: 'copyTitle', article: 'copyArticle', brand: 'copyBrand', brandVerified: 'copyBrandVerified', category: 'copyCategory',
        price: 'copyPrice', oldPrice: 'copyOldPrice', rating: 'copyRating', url: 'copyUrl',
        image: 'copyImage', description: 'copyDescription', composition: 'copyComposition',
        complectation: 'copyComplectation', usage: 'copyUsage', characteristics: 'copyCharacteristics'
    };

    const SECTION_NAMES = ['Состав', 'Комплектация', 'Способ применения'];

    // Метка проверенного бренда (ищем по тексту, в том числе в атрибутах title/aria-label)
    const BRAND_VERIFIED_RE = /бренд\s+проверен|проверенный\s+бренд/i;

    // Виджеты страницы товара, которые нам нужны (остальные не трогаем)
    const WANTED_WIDGETS = /^(webProductHeading|webPrice|webDetailSKU|webBrand|webSingleProductScore|webShortCharacteristics|webCharacteristics|webDescription|breadCrumbs)-/;

    // ─── Утилиты ──────────────────────────────────────────────────────────────

    // Ожидание «таймер ИЛИ requestAnimationFrame, что сработает раньше».
    // На странице Ozon setTimeout/setInterval могли не срабатывать (по логам: ни одного прохода после скролла),
    // а rAF работал. В фоновой вкладке rAF не идёт, там выручает setTimeout.
    const sleep = ms => new Promise(res => {
        let done = false;
        const fin = () => { if (!done) { done = true; res(); } };
        const t0 = performance.now();
        setTimeout(fin, ms);
        const tick = () => {
            if (done) return;
            if (performance.now() - t0 >= ms) fin();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });

    function tryParse(v) {
        if (v && typeof v === 'object') return v;
        if (typeof v !== 'string' || !v) return null;
        try { return JSON.parse(v); } catch { return null; }
    }

    const richText = arr => (arr || []).map(x => x.content || '').join('');

    function isProductPage() {
        return /^\/product\//.test(location.pathname);
    }

    // '/product/slug-123/?at=...' -> '/product/slug-123/'
    function productPathFromHref(href) {
        try {
            const u = new URL(href, location.origin);
            const m = u.pathname.match(/^\/product\/[^/]+/);
            return m ? m[0] + '/' : null;
        } catch { return null; }
    }

    function articleFromPath(path) {
        const m = path.match(/(\d+)\/?$/);
        return m ? m[1] : null;
    }

    // ─── Лог для диагностики ──────────────────────────────────────────────────

    const VERSION = '2.0';
    const LOG = [];
    const scrollSources = new Set();
    let debugOn = !!GM_getValue('ozon_copy_debug', false);

    function log(type, data = {}) {
        LOG.push({ t: Math.round(performance.now()), type, ...data });
        if (LOG.length > 400) LOG.shift();
        if (debugOn) console.log('[OzonCopyData]', type, data);
    }

    // ─── Настройки ────────────────────────────────────────────────────────────

    function loadSettings() {
        const saved = GM_getValue('ozon_copy_settings', null);
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
    }

    function saveSettings(s) {
        GM_setValue('ozon_copy_settings', JSON.stringify(s));
    }

    let settings = loadSettings();

    function applySettings(raw) {
        const out = {};
        for (const [field, key] of Object.entries(FIELD_TO_SETTING)) {
            if (settings[key]) out[field] = raw[field] ?? null;
        }
        return out;
    }

    // ─── Накопительный буфер ──────────────────────────────────────────────────
    // В буфер сохраняются ВСЕ данные товара (сырой объект). Выбор полей применяется только
    // при показе, копировании и скачивании, поэтому набор полей можно менять без пересборки буфера.

    const BUF_KEY = 'ozon_buffer_data';            // JSON: [{ article, data }] или [{ article, text }] (записи из старого буфера)
    const OLD_BUF_KEY = 'ozon_accumulated_buffer'; // текстовый буфер версий до 2.0

    let cacheRaw = null, cacheItems = [];

    function bufItems() {
        const raw = GM_getValue(BUF_KEY, null);
        if (raw != null) {
            if (raw !== cacheRaw) {
                let items = null;
                try { items = JSON.parse(raw); } catch {}
                cacheItems = Array.isArray(items) ? items : [];
                cacheRaw = raw;
            }
            return cacheItems;
        }
        // Миграция из текстового буфера: старые записи остаются как есть (в них только поля, выбранные тогда)
        const old = GM_getValue(OLD_BUF_KEY, '');
        const items = old
            ? old.split(SEPARATOR).map(text => ({ article: text.match(/Артикул:\s*(\d+)/)?.[1] ?? null, text }))
            : [];
        cacheRaw = JSON.stringify(items);
        cacheItems = items;
        GM_setValue(BUF_KEY, cacheRaw);
        return items;
    }

    function bufSave(items) {
        cacheRaw = JSON.stringify(items);
        cacheItems = items;
        GM_setValue(BUF_KEY, cacheRaw);
        scheduleRefresh();
    }

    // Текст записи с учётом выбранных полей
    const itemText = item => item.data ? formatData(applySettings(item.data)) : (item.text || '');

    function itemInfo(item) {
        if (item.data) return { title: item.data.title || null, price: item.data.price || null, url: item.data.url || null };
        const g = re => item.text?.match(re)?.[1]?.trim() || null;
        return { title: g(/^Название:\s*(.+)$/m), price: g(/^Цена:\s*(.+)$/m), url: g(/^URL:\s*(\S+)/m) };
    }

    // Весь буфер одним текстом (с учётом выбранных полей)
    const bufRaw = () => bufItems().map(itemText).join(SEPARATOR);
    const bufArticles = () => bufItems().map(i => i.article ?? null);
    const bufSet = () => new Set(bufArticles().filter(Boolean));
    const bufHas = article => !!article && bufSet().has(String(article));
    const bufCount = () => bufItems().length;

    function bufAdd(data) {
        const items = bufItems();
        const article = data.article ? String(data.article) : null;
        const key = d => d.url || d.title || '';
        const dup = article
            ? items.some(i => i.article === article)
            : items.some(i => i.data && key(i.data) === key(data));
        if (dup) return { dup: true };
        bufSave([...items, { article, data }]);
        return { dup: false };
    }

    function bufRemoveAt(i) {
        bufSave(bufItems().filter((_, k) => k !== i));
    }

    function bufRemoveArticle(article) {
        const i = bufArticles().indexOf(String(article));
        if (i < 0) return false;
        bufRemoveAt(i);
        return true;
    }

    function bufClear() {
        bufSave([]);
    }

    // ─── Общие парсеры ────────────────────────────────────────────────────────

    // <h3>Заголовок</h3><p>текст</p>  ->  { 'Заголовок': 'текст' }
    function h3Sections(root) {
        const map = {};
        root.querySelectorAll('h3').forEach(h => {
            if (h.nextElementSibling) map[h.textContent.trim()] = h.nextElementSibling.textContent.trim();
        });
        return map;
    }

    function flattenStrings(node, acc = []) {
        if (typeof node === 'string') acc.push(node);
        else if (Array.isArray(node)) node.forEach(n => flattenStrings(n, acc));
        else if (node && typeof node === 'object') Object.values(node).forEach(n => flattenStrings(n, acc));
        return acc;
    }

    // Рекурсивно собирает пары «название → значения» из виджетов характеристик
    function collectChars(node, out) {
        if (Array.isArray(node)) { node.forEach(n => collectChars(n, out)); return; }
        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node.values) && node.values.length &&
            node.values.every(v => v && typeof v === 'object' && 'text' in v)) {
            const key = node.name || (typeof node.title === 'string' ? node.title : richText(node.title?.textRs));
            if (key) {
                out[key.trim()] = node.values.map(v => String(v.text).trim().replace(/[,;]+$/, '')).filter(Boolean).join(', ');
                return;
            }
        }
        Object.values(node).forEach(v => collectChars(v, out));
    }

    // Состав / Комплектация / Способ применения из состояний webDescription
    function richSections(states) {
        const strs = [];
        states.forEach(s => flattenStrings(s, strs));
        const out = {};

        const html = strs.filter(s => /<h3[\s>]/i.test(s)).join('\n');
        if (html) Object.assign(out, h3Sections(new DOMParser().parseFromString(html, 'text/html')));

        // Запасной вариант: заголовок и следующий за ним длинный текст
        for (const name of SECTION_NAMES) {
            if (out[name]) continue;
            const i = strs.findIndex(s => s.trim() === name);
            if (i >= 0) {
                const next = strs.slice(i + 1).find(s => s.trim().length > 20);
                if (next) out[name] = next.trim();
            }
        }
        return out;
    }

    // ─── Извлечение из DOM (страница товара / скачанный HTML) ─────────────────

    function getJsonLd(doc) {
        try {
            for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
                const d = JSON.parse(s.textContent);
                if (d['@type'] === 'Product') return d;
            }
        } catch {}
        return null;
    }

    function extractFromDom(doc, pageUrl) {
        const data = {};
        const ld = getJsonLd(doc);

        const titleEl = doc.querySelector('h1[class*="tsHeadline"]') ||
            doc.querySelector('[data-widget="webProductHeading"] h1');
        data.title = titleEl?.textContent.trim() || ld?.name || null;

        if (ld?.sku) data.article = String(ld.sku);
        else {
            const el = Array.from(doc.querySelectorAll('button, div'))
                .find(e => e.textContent.includes('Артикул:'));
            const m = el?.textContent.match(/Артикул:\s*(\d+)/);
            data.article = m ? m[1] : null;
        }

        data.brand = ld?.brand ?? null;
        if (!data.brand) {
            const crumbs = doc.querySelectorAll('[data-widget="breadCrumbs"] ol li span');
            if (crumbs.length) data.brand = crumbs[crumbs.length - 1]?.textContent.trim() ?? null;
        }

        const crumbs = doc.querySelectorAll('[data-widget="breadCrumbs"] ol li a span');
        data.category = crumbs.length ? Array.from(crumbs).map(e => e.textContent.trim()).join(' > ') : null;

        const brandHtml = ['webBrand', 'webProductHeading']
            .map(w => doc.querySelector(`[data-widget="${w}"]`)?.outerHTML || '').join('\n');
        data.brandVerified = BRAND_VERIFIED_RE.test(brandHtml) ? true : null;

        if (ld?.offers?.price && ld?.offers?.priceCurrency) {
            data.price = `${ld.offers.price} ${ld.offers.priceCurrency}`;
        } else {
            const el = doc.querySelector('[class*="tsHeadline600Large"]') ||
                doc.querySelector('[data-widget="webPrice"] span');
            data.price = el?.textContent.trim() ?? null;
        }

        const old = doc.querySelector('[class*="pdp_bf7"]') ||
            Array.from(doc.querySelectorAll('span')).find(e => e.style.textDecoration === 'line-through');
        data.oldPrice = old?.textContent.trim() ?? null;

        const rating = ld?.aggregateRating?.ratingValue;
        const count = ld?.aggregateRating?.reviewCount;
        if (rating) {
            data.rating = count ? `${rating} (${Number(count).toLocaleString('ru-RU')} отзывов)` : String(rating);
        } else {
            data.rating = doc.querySelector('[data-widget="webSingleProductScore"] [class*="tsBodyControl"]')?.textContent.trim() ?? null;
        }

        data.url = ld?.offers?.url ?? pageUrl;
        data.image = ld?.image ?? doc.querySelector('[data-widget="webGallery"] img')?.src ?? null;

        data.description = ld?.description
            ? ld.description.replace(/\s+/g, ' ').trim()
            : (doc.querySelector('#section-description')?.textContent.replace(/\s+/g, ' ').trim() ?? null);

        const sec = h3Sections(doc);
        data.composition = sec['Состав'] ?? null;
        data.complectation = sec['Комплектация'] ?? null;
        data.usage = sec['Способ применения'] ?? null;

        const chars = {};
        const charSection = doc.querySelector('#section-characteristics, [id*="characteristics"]');
        charSection?.querySelectorAll('dl').forEach(dl => {
            const key = dl.querySelector('dt')?.textContent.trim();
            const value = dl.querySelector('dd')?.textContent.trim();
            if (key && value) chars[key] = value;
        });
        data.characteristics = Object.keys(chars).length ? chars : null;

        return data;
    }

    // ─── Извлечение через API (без открытия страницы) ─────────────────────────

    async function fetchJson(url, opts = {}) {
        const headers = { accept: 'application/json', 'x-o3-app-name': 'dweb_client' };
        if (opts.body) headers['content-type'] = 'application/json';
        const r = await fetch(url, {
            credentials: 'include',
            method: opts.method || 'GET',
            headers,
            body: opts.body
        });
        if (!r.ok) {
            const e = new Error('HTTP ' + r.status);
            e.status = r.status;
            throw e;
        }
        return r.json();
    }

    // Отложенные виджеты: stateId -> asyncData (то, что страница догружает после рендера)
    function collectAsync(node, map = {}) {
        if (Array.isArray(node)) node.forEach(n => collectAsync(n, map));
        else if (node && typeof node === 'object') {
            if (node.stateId && node.asyncData) map[node.stateId] = node.asyncData;
            Object.values(node).forEach(v => { if (v && typeof v === 'object') collectAsync(v, map); });
        }
        return map;
    }

    // Ozon отдаёт страницу товара порциями (layout_container). Описание и характеристики
    // лежат во второй порции (pdpPage2column), первая содержит заголовок, цену, артикул.
    const PAGE_CHUNKS = ['', '?layout_container=pdpPage2column&layout_page_index=2'];

    async function loadStates(path) {
        const pages = [];
        for (const suffix of PAGE_CHUNKS) {
            try {
                pages.push(await fetchJson('/api/entrypoint-api.bx/page/json/v2?url=' + encodeURIComponent(path + suffix)));
            } catch (e) {
                if (!pages.length) throw e; // первая порция обязательна, остальные — по возможности
            }
        }

        const states = {};
        for (const pg of pages) {
            const raw = pg.widgetStates || {};
            const asyncMap = collectAsync(pg.layout);

            for (const id of new Set([...Object.keys(raw), ...Object.keys(asyncMap)])) {
                if (states[id] || !WANTED_WIDGETS.test(id)) continue;
                let st = tryParse(raw[id]);
                // Состояние пустое, но есть asyncData — догружаем так же, как это делает страница
                if (!st && asyncMap[id]) {
                    try {
                        const w = await fetchJson(
                            '/api/composer-api.bx/widget/json/v2?widgetStateId=' + encodeURIComponent(id),
                            { method: 'POST', body: JSON.stringify({ asyncData: asyncMap[id] }) }
                        );
                        st = tryParse(w.widgetStates?.[id]) || w.state || w;
                    } catch {}
                }
                if (st) states[id] = st;
            }
        }
        return { page: pages[0], pages, states };
    }

    function ldFromSeo(page) {
        for (const s of page.seo?.script || []) {
            if (!/ld\+json/.test(s.type || '')) continue;
            const d = tryParse(s.innerHTML);
            const p = Array.isArray(d) ? d.find(x => x['@type'] === 'Product') : d;
            if (p && p['@type'] === 'Product') return p;
        }
        return null;
    }

    function extractFromApi(path, page, states) {
        const ld = ldFromSeo(page);
        const keys = Object.keys(states);
        const all = p => keys.filter(k => k.startsWith(p + '-')).map(k => states[k]);
        const first = p => all(p)[0] ?? null;

        const head = first('webProductHeading');
        const price = first('webPrice');
        const sku = first('webDetailSKU');
        const score = first('webSingleProductScore');
        const brandW = first('webBrand');
        const bc = first('breadCrumbs');

        const chars = {};
        [...all('webShortCharacteristics'), ...all('webCharacteristics')].forEach(s => collectChars(s, chars));

        const sec = richSections(all('webDescription'));
        const d = {};

        d.title = head?.title ?? ld?.name ?? null;
        d.article = sku?.copyText ?? ld?.sku ?? ld?.offers?.sku ?? articleFromPath(path);
        if (d.article != null) d.article = String(d.article);

        d.brand = (typeof ld?.brand === 'string' ? ld.brand : ld?.brand?.name)
            ?? (richText(brandW?.content?.title?.text) || null)
            ?? chars['Бренд'] ?? null;

        d.brandVerified = flattenStrings([...all('webBrand'), ...all('webProductHeading')])
            .some(x => BRAND_VERIFIED_RE.test(x)) ? true : null;

        const crumbList = bc?.breadcrumbs || bc?.items;
        d.category = Array.isArray(crumbList)
            ? crumbList.map(x => x.text || x.title || '').filter(Boolean).join(' > ') || null
            : null;

        d.price = price?.price
            ?? (ld?.offers?.price ? `${ld.offers.price} ${ld.offers.priceCurrency ?? ''}`.trim() : null);
        d.oldPrice = price?.showOriginalPrice ? (price.originalPrice ?? null) : null;

        const rv = ld?.aggregateRating?.ratingValue;
        const rc = ld?.aggregateRating?.reviewCount;
        if (rv) d.rating = rc ? `${rv} (${Number(rc).toLocaleString('ru-RU')} отзывов)` : String(rv);
        else d.rating = score?.text ? score.text.replace(/\s*•\s*(.+)$/, ' ($1)') : null;

        d.url = location.origin + path;
        d.image = ld?.image ?? null;
        d.description = ld?.description ? ld.description.replace(/\s+/g, ' ').trim() : null;

        d.composition = sec['Состав'] ?? null;
        d.complectation = sec['Комплектация'] ?? null;
        d.usage = sec['Способ применения'] ?? null;
        d.characteristics = Object.keys(chars).length ? chars : null;

        return d;
    }

    // ─── Очередь запросов (чтобы Ozon не принял за бота) ──────────────────────

    let queueTail = Promise.resolve();

    function enqueue(task) {
        const run = queueTail.then(task);
        queueTail = run.catch(() => {}).then(() => sleep(300 + Math.random() * 300));
        return run;
    }

    const cache = new Map(); // path -> Promise<data>

    function fill(target, extra) {
        for (const k in extra) if (target[k] == null) target[k] = extra[k];
        return target;
    }

    // live=true — текущая страница товара: данные из DOM, пробелы закрываются через API
    async function getProductData(path, live = false) {
        if (!live && cache.has(path)) return cache.get(path);

        const p = enqueue(async () => {
            let data = live ? extractFromDom(document, location.href) : {};
            let api = null;

            try {
                const { page, states } = await loadStates(path);
                api = extractFromApi(path, page, states);
            } catch (e) {
                if (!live && (e.status === 429 || e.status === 403)) throw e;
                console.warn('[OzonCopyData] API не сработал, запасной вариант:', e);
            }
            if (api) fill(data, api);

            // Запасной вариант: скачать HTML страницы и разобрать как DOM
            if (!live && !data.title) {
                const html = await (await fetch(path, { credentials: 'include' })).text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                fill(data, extractFromDom(doc, location.origin + path));
            }

            data.url = data.url ?? location.origin + path;
            data.article = data.article ?? articleFromPath(path);
            return data;
        });

        if (!live) {
            cache.set(path, p);
            p.catch(() => cache.delete(path));
        }
        return p;
    }

    // ─── Форматирование ───────────────────────────────────────────────────────

    function formatData(data) {
        const result = [];

        if (data.title)         result.push(`Название: ${data.title}`);
        if (data.article)       result.push(`Артикул: ${data.article}`);
        if (data.brand)         result.push(`Бренд: ${data.brand}`);
        if (data.brandVerified) result.push('Бренд проверен: да');
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

    const textFor = async (path, live = false) => formatData(applySettings(await getProductData(path, live)));

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

    // ═══════════════════════════════════════════════════════════════════════════
    //  UI
    // ═══════════════════════════════════════════════════════════════════════════

    // ─── Иконки и построитель DOM ─────────────────────────────────────────────

    const ICON_PATHS = {
        plus:     '<path d="M12 5v14M5 12h14"/>',
        check:    '<path d="M5 13l4 4L19 7"/>',
        copy:     '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
        info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
        close:    '<path d="M6 6l12 12M18 6L6 18"/>',
        trash:    '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
        download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
        external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
        stop:     '<rect x="6" y="6" width="12" height="12" rx="2"/>',
        list:     '<path d="M4 6h16M4 12h16M4 18h10"/>',
        spin:     '<path d="M12 3a9 9 0 1 0 9 9"/>',
        scroll:   '<path d="M12 5v14M6 13l6 6 6-6"/>'
    };

    const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

    function ic(name) {
        const t = document.createElement('template');
        t.innerHTML = icon(name);
        return t.content.firstChild;
    }

    // Мини-хелпер: h('div', { class: 'x', onClick: fn }, ...children)
    function h(tag, props = {}, ...kids) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(props || {})) {
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (v === true) el.setAttribute(k, '');
            else el.setAttribute(k, v);
        }
        kids.flat(Infinity).forEach(c => {
            if (c == null || c === false) return;
            el.append(c.nodeType ? c : document.createTextNode(String(c)));
        });
        return el;
    }

    // ─── Стили (внутри Shadow DOM — стили Ozon на них не влияют) ──────────────

    const BASE_CSS = `
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
        button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; margin: 0; }
        a { color: inherit; text-decoration: none; }
        .i { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; transform-origin: 50% 50%; }
        .spinning { animation: spin .8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
    `;

    const UI_CSS = BASE_CSS + `
        .root {
            /* Собственная светлая палитра (индиго), не зависит от темы Ozon */
            color-scheme: light;
            --bg: #fff; --fg: #1c1b29; --muted: #6b6f80; --soft: #f3f4f9;
            --accent: #5b5bd6; --accent-h: #4a4ac2;
            --accent-soft: rgba(91,91,214,.10); --accent-text: #4a4ac2;
            --ok: #12a05c; --ok-h: #0e8f52;
            --danger: #e5484d; --danger-soft: rgba(229,72,77,.10);
            --line: rgba(28,27,41,.10);
            --shadow: 0 4px 24px rgba(28,27,41,.14);
            color: var(--fg); font-size: 14px; line-height: 1.4;
        }

        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 16px;
               border-radius: 12px; font-weight: 600; font-size: 14px; background: var(--soft); color: var(--fg);
               transition: background .15s, color .15s; white-space: nowrap; }
        .btn:hover { background: var(--accent-soft); color: var(--accent-text); }
        .btn.primary { background: var(--accent); color: #fff; }
        .btn.primary:hover { background: var(--accent-h); color: #fff; }
        .btn.ok { background: var(--ok); color: #fff; }
        .btn.ok:hover { background: var(--ok-h); color: #fff; }
        .btn.danger { color: var(--danger); }
        .btn.danger:hover { background: var(--danger-soft); color: var(--danger); }
        .btn[disabled] { opacity: .45; cursor: not-allowed; pointer-events: none; }
        .btn.grow { flex: 1; }
        .btn.round { width: 40px; padding: 0; border-radius: 50%; position: relative; }
        .icon-btn { width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: var(--muted); flex: none; }
        .icon-btn:hover { background: var(--accent-soft); color: var(--accent-text); }
        .icon-btn.danger:hover { background: var(--danger-soft); color: var(--danger); }
        .count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: #fff;
                 font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
        .btn.round .count { position: absolute; top: -5px; right: -5px; border: 2px solid var(--bg); box-sizing: content-box; }

        /* Док: без рамки-контейнера, отдельные кнопки */
        .dock { position: fixed; right: 20px; bottom: 96px; z-index: 2147483000; display: none; gap: 8px; align-items: center; }
        .dock .btn { box-shadow: 0 2px 10px rgba(28,27,41,.18); }
        .dock .btn:not(.primary):not(.ok) { background: var(--bg); }
        .dock .btn:not(.primary):not(.ok):hover { background: var(--soft); color: var(--fg); }
        .dock .btn.danger:hover { color: var(--danger); }

        .drawer { position: fixed; top: 0; right: 0; height: 100vh; width: 400px; max-width: 100vw; z-index: 2147483001;
                  background: var(--bg); border-left: 1px solid var(--line); box-shadow: var(--shadow);
                  display: flex; flex-direction: column; transform: translateX(105%); transition: transform .2s ease; visibility: hidden; }
        .drawer.open { transform: none; visibility: visible; }
        .dh { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
        .dh h2 { margin: 0; font-size: 16px; font-weight: 700; flex: 1; }
        .tabs { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--line); }
        .tab { padding: 6px 12px; border-radius: 8px; color: var(--muted); font-weight: 600; }
        .tab:hover { color: var(--fg); }
        .tab.active { background: var(--accent-soft); color: var(--accent-text); }
        .body { flex: 1; overflow: auto; padding: 12px 16px; }
        .foot { padding: 12px 16px; border-top: 1px solid var(--line); display: flex; gap: 8px; }

        .item { display: flex; gap: 6px; align-items: flex-start; padding: 8px 6px 8px 12px; border-radius: 10px; background: var(--soft); margin-bottom: 8px; }
        .item .t { flex: 1; min-width: 0; cursor: pointer; padding: 2px 0; }
        .item .n { font-weight: 600; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .item.open .n { display: block; }
        .item .acts { display: flex; flex: none; }
        .m { color: var(--muted); font-size: 12px; margin-top: 2px; }
        pre { white-space: pre-wrap; word-break: break-word; font: 12.5px/1.5 ui-monospace, Menlo, Consolas, monospace;
              background: var(--bg); border: 1px solid var(--line); padding: 10px; border-radius: 8px; margin: 8px 0 2px; cursor: text; }
        .preview-text { background: var(--soft); border: 0; margin: 0; padding: 12px; }

        .card { padding: 12px; border: 1px solid var(--line); border-radius: 12px; margin-bottom: 12px; }
        .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
        .progress { height: 6px; background: var(--soft); border-radius: 3px; overflow: hidden; }
        .progress > i { display: block; height: 100%; background: var(--accent); transition: width .2s; }
        .ptitle { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
        .prices { display: flex; gap: 8px; align-items: baseline; margin-top: 6px; }
        .prices b { font-size: 18px; }
        .prices s { color: var(--muted); }
        .empty { text-align: center; color: var(--muted); padding: 48px 12px; }

        .presets { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
        .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .chip { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 10px; background: var(--soft);
                color: var(--muted); font-size: 13px; text-align: left; user-select: none; }
        .chip .i { width: 16px; height: 16px; opacity: 0; }
        .chip.on { background: var(--accent-soft); color: var(--accent-text); font-weight: 600; }
        .chip.on .i { opacity: 1; }
        .hint { color: var(--muted); font-size: 12px; margin-top: 12px; }

        .toasts { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483002;
                  display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
        .toast { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-radius: 12px; background: rgba(28,27,41,.92); color: #fff;
                 box-shadow: var(--shadow); animation: toast-in .2s ease; pointer-events: auto; font-weight: 500; }
        .toast.error { background: var(--danger); } .toast.warning { background: #e8590c; }
        .toast button { color: #fff; font-weight: 700; text-decoration: underline; }
        @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

        /* Слой с тулбарами поверх плиток каталога (вне DOM Ozon) */
        .layer { position: fixed; inset: 0; z-index: 2147482000; pointer-events: none; overflow: hidden; }
        .tb { position: absolute; left: 0; top: 0; display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px;
              background: rgba(255,255,255,.95); box-shadow: 0 1px 6px rgba(28,27,41,.28); pointer-events: auto;
              opacity: .92; transition: opacity .15s; will-change: transform; }
        .tb:hover { opacity: 1; }
        .tb button { width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #1c1b29; }
        .tb button:hover { background: rgba(91,91,214,.12); color: #4a4ac2; }
        .tb button.on { background: #12a05c; color: #fff; }
        .tb button.on:hover { background: #0e8f52; color: #fff; }
    `;

    // ─── Корневой контейнер ───────────────────────────────────────────────────

    const ui = { open: false, tab: 'buffer', preview: null, bulk: null, scan: false, expanded: new Set() };

    const layerEl = h('div', { class: 'layer' });
    const dockEl = h('div', { class: 'dock' });
    const drawerEl = h('aside', { class: 'drawer' });
    const toastsEl = h('div', { class: 'toasts' });
    let dockSig = '';

    function mountUi() {
        const host = document.createElement('div');
        host.id = 'ocd-root';
        const shadow = host.attachShadow({ mode: 'open' });
        const rootEl = h('div', { class: 'root' }, layerEl, dockEl, drawerEl, toastsEl);
        shadow.append(h('style', {}, UI_CSS), rootEl);
        document.body.appendChild(host);
    }

    // ─── Тосты ────────────────────────────────────────────────────────────────

    function toast(msg, type = 'info', opts = {}) {
        const el = h('div', { class: 'toast ' + type },
            h('span', {}, msg),
            opts.action && h('button', {
                onClick: () => { opts.action.fn(); el.remove(); }
            }, opts.action.label)
        );
        toastsEl.append(el);
        while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
        sleep(opts.ms || (opts.action ? 5000 : 2500)).then(() => el.remove());
    }

    function reportError(err) {
        console.error('[OzonCopyData]', err);
        const blocked = err && (err.status === 429 || err.status === 403);
        toast(blocked ? `Ozon ограничил запросы (HTTP ${err.status}). Подожди немного` : 'Не удалось получить данные товара',
            'error', { ms: 4000 });
    }

    // Блокирует кнопку и крутит спиннер, пока выполняется действие
    async function withBusy(btn, fn) {
        if (btn.dataset.busy) return;
        btn.dataset.busy = '1';
        const svg = btn.querySelector('svg');
        const saved = svg?.innerHTML;
        if (svg) { svg.innerHTML = ICON_PATHS.spin; svg.classList.add('spinning'); }
        try { await fn(); }
        catch (e) { reportError(e); }
        finally {
            delete btn.dataset.busy;
            if (svg && svg.isConnected) { svg.classList.remove('spinning'); svg.innerHTML = saved; }
            scheduleRefresh();
        }
    }

    // ─── Действия над товарами ────────────────────────────────────────────────

    function toggleData(data) {
        const art = data.article ? String(data.article) : null;
        if (art && bufHas(art)) {
            bufRemoveArticle(art);
            toast('Убрано из буфера', 'info', { action: { label: 'Вернуть', fn: () => bufAdd(data) } });
        } else {
            bufAdd(data);
            toast('Добавлено в буфер', 'success', { action: { label: 'Отменить', fn: () => art && bufRemoveArticle(art) } });
        }
    }

    async function toggleProduct(path, live = false) {
        toggleData(await getProductData(path, live));
    }

    async function copyProduct(path, live = false) {
        await copyToClipboard(await textFor(path, live));
        toast('Скопировано', 'success');
    }

    async function previewProduct(path, live = false) {
        const data = await getProductData(path, live);
        ui.preview = { path, data };
        openDrawer('preview');
    }

    // ─── Док (главная панель) ─────────────────────────────────────────────────

    // Ozon показывает список виртуально: плитки вне экрана выгружаются из DOM.
    // Поэтому пути товаров копим в наборе и сбрасываем его только при смене страницы/поиска.
    const seen = new Set();
    let seenKey = '';

    function seenPaths() {
        const key = location.pathname + location.search;
        if (key !== seenKey) { seenKey = key; seen.clear(); }
        return seen;
    }

    function pageTilePaths() {
        return [...seenPaths()];
    }

    function renderDock() {
        const path = isProductPage() ? productPathFromHref(location.href) : null;
        const tilePaths = path ? [] : pageTilePaths();
        const visible = !ui.open && (!!path || tilePaths.length > 0);
        dockEl.style.display = visible ? 'flex' : 'none';
        if (!visible) { dockSig = ''; return; }

        const set = bufSet();
        const count = bufCount();
        const article = path ? articleFromPath(path) : null;
        const inBuf = article ? set.has(article) : false;
        const rest = tilePaths.filter(p => !set.has(articleFromPath(p))).length;
        const sig = [path, inBuf, count, rest, ui.scan ? 's' : '', ui.bulk ? `${ui.bulk.done}/${ui.bulk.total}` : ''].join('|');
        if (sig === dockSig) return;
        dockSig = sig;

        const bufBtn = h('button', { class: 'btn round', title: `Буфер: ${count}`, onClick: () => openDrawer('buffer') },
            ic('list'), count > 0 && h('span', { class: 'count' }, String(count)));

        dockEl.replaceChildren();

        if (path) {
            const addBtn = h('button', {
                class: 'btn ' + (inBuf ? 'ok' : 'primary'),
                title: inBuf ? 'Убрать из буфера' : 'Добавить товар в буфер',
                onClick: e => withBusy(e.currentTarget, () => toggleProduct(path, true))
            }, ic(inBuf ? 'check' : 'plus'), inBuf ? 'В буфере' : 'В буфер');

            const copyBtn = h('button', {
                class: 'btn round', title: 'Копировать данные товара',
                onClick: e => withBusy(e.currentTarget, () => copyProduct(path, true))
            }, ic('copy'));

            dockEl.append(addBtn, copyBtn, bufBtn);
        } else {
            let bulkBtn;
            if (ui.bulk) {
                bulkBtn = h('button', { class: 'btn danger', title: 'Остановить', onClick: () => { bulkCancel = true; } },
                    ic('stop'), `Стоп · ${ui.bulk.done}/${ui.bulk.total}`);
            } else {
                bulkBtn = h('button', {
                    class: 'btn primary', disabled: rest === 0,
                    title: 'Загрузить данные всех товаров на странице и добавить в буфер',
                    onClick: bulkAddAll
                }, ic('plus'), rest ? `Добавить все · ${rest}` : 'Все добавлены');
            }
            const scanBtn = h('button', {
                class: 'btn round' + (ui.scan ? ' danger' : ''),
                title: ui.scan ? 'Остановить прокрутку' : 'Прокрутить страницу и собрать все товары',
                onClick: scanPage
            }, ic(ui.scan ? 'stop' : 'scroll'));

            dockEl.append(bulkBtn, scanBtn, bufBtn);
        }
    }

    // ─── Ящик (буфер / товар / поля) ──────────────────────────────────────────

    const FIELD_OPTIONS = [
        { key: 'copyTitle',           label: 'Название' },
        { key: 'copyArticle',         label: 'Артикул' },
        { key: 'copyBrand',           label: 'Бренд' },
        { key: 'copyBrandVerified',   label: 'Бренд проверен' },
        { key: 'copyCategory',        label: 'Категория' },
        { key: 'copyPrice',           label: 'Цена' },
        { key: 'copyOldPrice',        label: 'Старая цена' },
        { key: 'copyRating',          label: 'Рейтинг' },
        { key: 'copyUrl',             label: 'URL товара' },
        { key: 'copyImage',           label: 'Изображение' },
        { key: 'copyDescription',     label: 'Описание' },
        { key: 'copyComposition',     label: 'Состав' },
        { key: 'copyComplectation',   label: 'Комплектация' },
        { key: 'copyUsage',           label: 'Способ применения' },
        { key: 'copyCharacteristics', label: 'Характеристики' }
    ];

    function openDrawer(tab) {
        ui.open = true;
        if (tab) ui.tab = tab;
        renderDrawer(true);
        renderDock();
    }

    function closeDrawer() {
        ui.open = false;
        renderDrawer();
        dockSig = '';
        renderDock();
    }

    function progressCard() {
        const { done, total } = ui.bulk;
        return h('div', { class: 'card' },
            h('div', { class: 'row' },
                h('b', {}, `Загрузка товаров: ${done}/${total}`),
                h('button', { class: 'btn danger', onClick: () => { bulkCancel = true; } }, ic('stop'), 'Стоп')),
            h('div', { class: 'progress' }, h('i', { style: `width:${total ? Math.round(done / total * 100) : 0}%` })));
    }

    function bufferBody() {
        const items = bufItems();
        const wrap = h('div');
        if (ui.bulk) wrap.append(progressCard());

        if (!items.length) {
            wrap.append(h('div', { class: 'empty' }, 'Буфер пуст', h('br'),
                'Добавляй товары кнопкой «+» на карточке или плитке каталога'));
            return wrap;
        }

        items.forEach((item, i) => {
            const info = itemInfo(item);
            const art = item.article;
            const key = art || 'i' + i;
            const open = ui.expanded.has(key);
            const href = info.url || (art ? `${location.origin}/product/${art}/` : null);

            wrap.append(h('div', { class: 'item' + (open ? ' open' : '') },
                h('div', {
                        class: 't', title: open ? 'Свернуть' : 'Показать данные',
                        onClick: () => { open ? ui.expanded.delete(key) : ui.expanded.add(key); renderDrawer(); }
                    },
                    h('div', { class: 'n' }, info.title || (art ? `Артикул ${art}` : itemText(item).slice(0, 60))),
                    h('div', { class: 'm' }, [art && `№ ${art}`, info.price].filter(Boolean).join(' · ')),
                    open && h('pre', { onClick: e => e.stopPropagation() }, itemText(item))),
                h('div', { class: 'acts' },
                    href && h('a', { class: 'icon-btn', href, target: '_blank', rel: 'noopener', title: 'Открыть на Ozon' }, ic('external')),
                    h('button', {
                        class: 'icon-btn', title: 'Копировать',
                        onClick: async () => { await copyToClipboard(itemText(item)); toast('Скопировано', 'success'); }
                    }, ic('copy')),
                    h('button', { class: 'icon-btn danger', title: 'Удалить', onClick: () => bufRemoveAt(i) }, ic('trash')))));
        });
        return wrap;
    }

    function downloadBuffer() {
        const blob = new Blob([bufRaw()], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ozon-buffer-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        sleep(1000).then(() => URL.revokeObjectURL(url));
    }

    function bufferFoot() {
        const n = bufCount();
        const has = n > 0;

        const clear = h('button', { class: 'btn danger', disabled: !has, title: 'Очистить буфер' }, ic('trash'));
        let armed = false;
        clear.addEventListener('click', () => {
            if (!armed) {
                armed = true;
                clear.replaceChildren(ic('trash'), 'Точно?');
                sleep(3000).then(() => { armed = false; clear.replaceChildren(ic('trash')); });
            } else {
                bufClear();
                toast('Буфер очищен', 'info');
            }
        });

        return h('div', { class: 'foot' },
            h('button', {
                class: 'btn primary grow', disabled: !has,
                onClick: async () => { await copyToClipboard(bufRaw()); toast(`Скопировано товаров: ${n}`, 'success'); }
            }, ic('copy'), 'Копировать всё'),
            h('button', { class: 'btn', disabled: !has, title: 'Скачать .txt', onClick: downloadBuffer }, ic('download')),
            clear);
    }

    function previewBody() {
        const { path, data } = ui.preview;
        const text = formatData(applySettings(data));
        return h('div', {},
            h('div', { class: 'card' },
                h('div', { class: 'ptitle' }, data.title || path),
                h('div', { class: 'm' }, [data.article && `№ ${data.article}`, data.brand].filter(Boolean).join(' · ')),
                (data.price || data.oldPrice) && h('div', { class: 'prices' },
                    data.price && h('b', {}, data.price),
                    data.oldPrice && h('s', {}, data.oldPrice)),
                data.rating && h('div', { class: 'm' }, '★ ' + data.rating)),
            h('pre', { class: 'preview-text' }, text));
    }

    function previewFoot() {
        const { path, data } = ui.preview;
        const inBuf = bufHas(data.article);
        return h('div', { class: 'foot' },
            h('button', {
                class: 'btn grow ' + (inBuf ? 'ok' : 'primary'),
                onClick: e => withBusy(e.currentTarget, async () => toggleData(data))
            }, ic(inBuf ? 'check' : 'plus'), inBuf ? 'В буфере' : 'В буфер'),
            h('button', {
                class: 'btn grow',
                onClick: async () => { await copyToClipboard(formatData(applySettings(data))); toast('Скопировано', 'success'); }
            }, ic('copy'), 'Копировать'),
            h('a', { class: 'icon-btn', href: location.origin + path, target: '_blank', rel: 'noopener', title: 'Открыть на Ozon' }, ic('external')));
    }

    function fieldsBody() {
        const setAll = fn => {
            FIELD_OPTIONS.forEach(o => { settings[o.key] = fn(o.key); });
            saveSettings(settings);
            renderDrawer();
        };
        const MIN = ['copyTitle', 'copyArticle', 'copyPrice'];

        return h('div', {},
            h('div', { class: 'presets' },
                h('button', { class: 'btn', onClick: () => setAll(() => true) }, 'Все'),
                h('button', { class: 'btn', onClick: () => setAll(k => MIN.includes(k)) }, 'Минимум'),
                h('button', { class: 'btn', onClick: () => setAll(k => DEFAULT_SETTINGS[k]) }, 'По умолчанию')),
            h('div', { class: 'fields' }, FIELD_OPTIONS.map(o =>
                h('button', {
                    class: 'chip' + (settings[o.key] ? ' on' : ''),
                    'aria-pressed': String(!!settings[o.key]),
                    onClick: () => { settings[o.key] = !settings[o.key]; saveSettings(settings); renderDrawer(); }
                }, ic('check'), o.label))),
            h('div', { class: 'hint' }, 'В буфер сохраняются все данные товара. Выбранные поля применяются при показе, копировании и скачивании, набор можно менять в любой момент. Записи, добавленные до версии 2.0, остаются в прежнем виде.'));
    }

    function renderDrawer(resetScroll = false) {
        drawerEl.classList.toggle('open', ui.open);
        if (!ui.open) return;

        const oldBody = drawerEl.querySelector('.body');
        const top = oldBody && !resetScroll ? oldBody.scrollTop : 0;

        if (ui.tab === 'preview' && !ui.preview) ui.tab = 'buffer';

        const tabs = [['buffer', `Буфер · ${bufCount()}`]];
        if (ui.preview) tabs.push(['preview', 'Товар']);
        tabs.push(['fields', 'Поля']);

        const header = h('div', { class: 'dh' },
            h('h2', {}, 'Ozon Copy Data'),
            h('button', { class: 'icon-btn', title: 'Закрыть (Esc)', onClick: closeDrawer }, ic('close')));

        const tabsEl = h('div', { class: 'tabs' }, tabs.map(([id, label]) =>
            h('button', {
                class: 'tab' + (ui.tab === id ? ' active' : ''),
                onClick: () => { ui.tab = id; renderDrawer(true); }
            }, label)));

        const body = h('div', { class: 'body' },
            ui.tab === 'buffer' ? bufferBody() : ui.tab === 'preview' ? previewBody() : fieldsBody());

        const foot = ui.tab === 'buffer' ? bufferFoot() : ui.tab === 'preview' ? previewFoot() : null;

        drawerEl.replaceChildren(header, tabsEl, body, ...(foot ? [foot] : []));
        body.scrollTop = top;
    }

    // ─── Обновление всего UI после изменения буфера ───────────────────────────

    const tileBars = new Map(); // элемент плитки -> тулбар (живёт в нашем слое, а не в DOM Ozon)
    let refreshQueued = false;

    function syncTiles() {
        const set = bufSet();
        for (const bar of tileBars.values()) bar.refresh(set);
        renderDock();
    }

    function scheduleRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;
        requestAnimationFrame(() => {
            refreshQueued = false;
            syncTiles();
            if (ui.open) renderDrawer();
        });
    }

    // ─── Каталог: тулбары поверх плиток ───────────────────────────────────────
    // Тулбары живут в нашем слое, а не внутри плиток Ozon. Вставка своих узлов в SSR-разметку
    // ломает гидратацию Vue («Mismatching childNodes»): Ozon выбрасывает чужие узлы и перерисовывает плитку.
    // Поэтому в DOM Ozon мы ничего не пишем, а позиционируем свои кнопки по getBoundingClientRect плитки.

    function createBar(path) {
        const bar = { path, el: null, state: null, shown: false, target: null, refresh: null };
        const guard = fn => e => { e.preventDefault(); e.stopPropagation(); fn(e.currentTarget); };

        const addBtn = h('button', { title: 'Добавить в буфер', onClick: guard(b => withBusy(b, () => toggleProduct(bar.path))) }, ic('plus'));
        const copyBtn = h('button', { title: 'Копировать данные', onClick: guard(b => withBusy(b, () => copyProduct(bar.path))) }, ic('copy'));
        const infoBtn = h('button', { title: 'Показать данные', onClick: guard(b => withBusy(b, () => previewProduct(bar.path))) }, ic('info'));

        bar.refresh = set => {
            const on = set.has(articleFromPath(bar.path));
            if (on === bar.state) return;
            bar.state = on;
            addBtn.classList.toggle('on', on);
            addBtn.title = on ? 'Убрать из буфера' : 'Добавить в буфер';
            if (!addBtn.dataset.busy) addBtn.replaceChildren(ic(on ? 'check' : 'plus'));
        };

        bar.el = h('div', { class: 'tb' }, addBtn, copyBtn, infoBtn);
        bar.el.style.display = 'none';
        layerEl.append(bar.el);
        return bar;
    }

    function decorateTile(tile) {
        const a = tile.querySelector('a[href*="/product/"]');
        const path = a && productPathFromHref(a.getAttribute('href'));
        if (!path) return 'nolink';

        seenPaths().add(path);

        let bar = tileBars.get(tile);
        if (!bar) {
            bar = createBar(path);
            tileBars.set(tile, bar);
            bar.refresh(bufSet());
            return 'fresh';
        }
        // Плитка могла быть переиспользована под другой товар
        if (bar.path !== path) {
            bar.path = path;
            bar.state = null;
            bar.refresh(bufSet());
            return 'repathed';
        }
        return 'ok';
    }

    let layoutQueued = false;

    function scheduleLayout() {
        if (layoutQueued) return;
        layoutQueued = true;
        requestAnimationFrame(() => { layoutQueued = false; layoutBars(); });
    }

    function layoutBars() {
        const vw = window.innerWidth, vh = window.innerHeight;
        for (const [tile, bar] of tileBars) {
            if (!tile.isConnected) { bar.el.remove(); tileBars.delete(tile); continue; }

            if (!bar.target || !bar.target.isConnected || !tile.contains(bar.target)) {
                bar.target = tile.querySelector('img') || tile;
            }
            const r = bar.target.getBoundingClientRect();
            let show = r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;

            // Не показываем тулбар, если плитку перекрывает шапка, окно или другой слой
            if (show) {
                const x = Math.min(vw - 1, Math.max(0, r.right - 12));
                const y = Math.min(vh - 1, Math.max(0, r.bottom - 22));
                const hit = document.elementFromPoint(x, y);
                show = !!hit && tile.contains(hit);
            }

            if (show !== bar.shown) {
                bar.shown = show;
                bar.el.style.display = show ? '' : 'none';
            }
            if (show) {
                const x = Math.round(r.left + 8);
                const y = Math.round(Math.max(r.top + 4, Math.min(r.bottom - 44, vh - 44)));
                bar.el.style.transform = `translate(${x}px, ${y}px)`;
            }
        }
    }

    // ─── Каталог: добавить все ────────────────────────────────────────────────

    let bulkCancel = false;

    async function bulkAddAll() {
        if (ui.bulk) { bulkCancel = true; return; }

        const set = bufSet();
        const todo = pageTilePaths().filter(p => !set.has(articleFromPath(p)));
        if (!todo.length) { toast('Все товары на странице уже в буфере', 'info'); return; }

        ui.bulk = { done: 0, total: todo.length };
        bulkCancel = false;
        scheduleRefresh();

        let added = 0, failed = 0, blocked = false;
        for (const p of todo) {
            if (bulkCancel) break;
            try {
                const data = await getProductData(p);
                if (!bufAdd(data).dup) added++;
            } catch (err) {
                failed++;
                console.error('[OzonCopyData]', p, err);
                if (err.status === 429 || err.status === 403) { blocked = true; break; }
            }
            ui.bulk.done++;
            scheduleRefresh();
        }

        const stopped = bulkCancel;
        ui.bulk = null;
        scheduleRefresh();

        if (blocked) toast(`Ozon ограничил запросы. Добавлено: ${added}`, 'error', { ms: 5000 });
        else if (stopped) toast(`Остановлено. Добавлено: ${added}`, 'warning');
        else toast(`Добавлено: ${added}${failed ? `, ошибок: ${failed}` : ''}`, failed ? 'warning' : 'success');
    }

    // ─── Каталог: прокрутка страницы, чтобы подгрузить все плитки ─────────────

    let scanCancel = false;

    async function scanPage() {
        if (ui.scan) { scanCancel = true; return; }
        ui.scan = true;
        scanCancel = false;
        scheduleRefresh();

        const startY = window.scrollY;
        let last = pageTilePaths().length, idle = 0;

        for (let i = 0; i < 300 && !scanCancel && idle < 4; i++) {
            window.scrollBy(0, Math.round(window.innerHeight * 0.8));
            await sleep(500);
            decorateAll(); // не ждём наблюдателя: плитка может выгрузиться раньше, чем он сработает
            const n = pageTilePaths().length;
            const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
            log('scan-step', { i, n, last, idle, atBottom, y: Math.round(window.scrollY), docH: document.documentElement.scrollHeight });
            if (n === last && atBottom) idle++;
            else { idle = 0; last = n; }
        }

        window.scrollTo(0, startY);
        const stopped = scanCancel;
        ui.scan = false;
        scheduleRefresh();
        toast(`${stopped ? 'Остановлено. ' : ''}Найдено товаров: ${pageTilePaths().length}`, stopped ? 'warning' : 'success');
    }

    // ─── Диагностика ──────────────────────────────────────────────────────────

    async function debugDump() {
        const path = isProductPage()
            ? productPathFromHref(location.href)
            : [...seenPaths()][0];
        if (!path) { toast('Нет товара для диагностики', 'warning'); return; }

        try {
            const { pages, states } = await loadStates(path);
            const dump = {
                path,
                widgetStateKeys: pages.map(pg => Object.keys(pg.widgetStates || {})),
                asyncStateIds: pages.map(pg => Object.keys(collectAsync(pg.layout))),
                states: Object.fromEntries(
                    Object.entries(states).map(([k, v]) => [k, JSON.stringify(v).slice(0, 20000)])
                ),
                parsed: extractFromApi(path, pages[0], states)
            };
            await copyToClipboard(JSON.stringify(dump, null, 2));
            toast('Дамп скопирован в буфер обмена', 'success');
        } catch (err) {
            toast('Ошибка диагностики: ' + err.message, 'error');
        }
    }

    function describeEl(el) {
        return (el.tagName || '?').toLowerCase() + (el.id ? '#' + el.id : '') +
            (typeof el.className === 'string' && el.className.trim()
                ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    }

    // В дамп не должны попадать персональные токены ссылок (?at=...)
    const stripTokens = html => html.replace(/([?&])at=[^"'&\s\\]+/g, '$1at=…');

    async function debugTiles() {
        const LINK = 'a[href*="/product/"]';
        const tiles = [...document.querySelectorAll('.tile-root')];
        const first = tiles[0];

        // Какой элемент реально прокручивается (предки плитки с переполнением)
        const scrollers = [];
        for (let el = first?.parentElement; el && el !== document.documentElement; el = el.parentElement) {
            const cs = getComputedStyle(el);
            if (/(auto|scroll|hidden)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
                scrollers.push({ el: describeEl(el), overflowY: cs.overflowY, scrollTop: el.scrollTop,
                    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
            }
        }

        const noLink = tiles.find(t => !t.querySelector(LINK));
        const dump = {
            version: VERSION,
            url: location.pathname + location.search,
            page: { scrollY: Math.round(window.scrollY), innerHeight: window.innerHeight,
                docHeight: document.documentElement.scrollHeight, hidden: document.hidden },
            counts: {
                tiles: tiles.length,
                withLink: tiles.filter(t => t.querySelector(LINK)).length,
                decorated: tiles.filter(t => tileBars.has(t)).length,
                barsShown: [...tileBars.values()].filter(b => b.shown).length,
                seen: seenPaths().size,
                inBuffer: bufCount(),
                timerOk: LOG.some(x => x.type === 'timer-ok'),
                timerDead: LOG.some(x => x.type === 'timer-DEAD')
            },
            scrollSources: [...scrollSources],
            scrollers,
            tiles: tiles.slice(0, 150).map((t, i) => {
                const r = t.getBoundingClientRect();
                return {
                    i, index: t.dataset.index ?? null, path: tileBars.get(t)?.path ?? null,
                    link: !!t.querySelector(LINK), bar: tileBars.has(t), shown: !!tileBars.get(t)?.shown,
                    docTop: Math.round(r.top + window.scrollY), h: Math.round(r.height),
                    chunk: t.closest('[style*="translate"]')?.style.transform ?? null
                };
            }),
            sampleTile: first ? stripTokens(first.outerHTML).slice(0, 3500) : null,
            tileWithoutLink: noLink ? stripTokens(noLink.outerHTML).slice(0, 2500) : null,
            log: LOG.slice(-200)
        };

        await copyToClipboard(JSON.stringify(dump, null, 2));
        toast('Дамп плиток скопирован в буфер обмена', 'success');
    }

    // ─── Инициализация ────────────────────────────────────────────────────────

    let lastTally = '';
    let mutCount = 0;
    let scrollCount = 0;

    function decorateAll() {
        if (isProductPage()) return;
        const tally = { tiles: 0, ok: 0, fresh: 0, repathed: 0, nolink: 0, errors: 0 };
        document.querySelectorAll('.tile-root').forEach(t => {
            tally.tiles++;
            try {
                const st = decorateTile(t) || 'ok';
                tally[st] = (tally[st] || 0) + 1;
            } catch (e) {
                tally.errors++;
                log('tile-error', { message: String((e && e.message) || e) });
                console.warn('[OzonCopyData] плитка пропущена:', e);
            }
        });
        tally.seen = seenPaths().size;
        scheduleLayout();

        // Пишем в лог только изменения, чтобы он не забивался повторами
        const sig = JSON.stringify(tally);
        if (sig !== lastTally || tally.fresh || tally.errors) {
            log('decorate', { ...tally, muts: mutCount, scrolls: scrollCount, y: Math.round(window.scrollY) });
            lastTally = sig;
            mutCount = 0;
            scrollCount = 0;
        }
    }

    function init() {
        mountUi();
        log('init', { url: location.pathname + location.search, version: VERSION });
        decorateAll();
        renderDock();

        document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.open) closeDrawer(); });

        // Планировщик на requestAnimationFrame: по логам setTimeout/setInterval на Ozon не срабатывали,
        // а rAF работал. Троттлинг: проход не чаще раза в ~200 мс, плюс «пульс» раз в секунду как страховка.
        // Проверка таймеров: если через 1 с setTimeout сработал — пишем timer-ok, если нет (через 3 с) — timer-DEAD.
        let lastRun = 0, queued = false, timerOk = false, warned = false, hb = 0, hbLayout = 0;
        const t0 = performance.now();
        setTimeout(() => { timerOk = true; log('timer-ok'); }, 1000);

        const scheduleDecorate = () => {
            if (queued) return;
            queued = true;
            const run = () => {
                if (Date.now() - lastRun < 200) { requestAnimationFrame(run); return; }
                queued = false;
                lastRun = Date.now();
                decorateAll();
                syncTiles();
            };
            requestAnimationFrame(run);
        };

        const beat = () => {
            const now = Date.now();
            if (!document.hidden) {
                if (now - hb > 1000) { hb = now; scheduleDecorate(); }
                if (now - hbLayout > 500) { hbLayout = now; scheduleLayout(); }
            }
            if (!timerOk && !warned && performance.now() - t0 > 3000) { warned = true; log('timer-DEAD'); }
            requestAnimationFrame(beat);
        };
        requestAnimationFrame(beat);

        new MutationObserver(recs => { mutCount += recs.length; scheduleDecorate(); scheduleLayout(); }).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['href']
        });
        // Список виртуальный: плитки монтируются при скролле (в том числе внутри прокручиваемых контейнеров)
        document.addEventListener('scroll', e => {
            scrollCount++;
            const tg = e.target;
            const d = tg === document ? '#document' : describeEl(tg);
            if (!scrollSources.has(d) && scrollSources.size < 10) { scrollSources.add(d); log('scroll-source', { source: d }); }
            scheduleLayout();
            scheduleDecorate();
        }, { capture: true, passive: true });
        window.addEventListener('resize', scheduleLayout);

        // ─── Команды в меню менеджера скриптов ─────────────────────────────────────
        const productPath = () => isProductPage() ? productPathFromHref(location.href) : null;
        const needProduct = fn => async () => {
            const p = productPath();
            if (!p) { toast('Открой страницу товара', 'warning'); return; }
            try { await fn(p); } catch (e) { reportError(e); }
        };

        GM_registerMenuCommand('🗂 Открыть панель', () => openDrawer('buffer'));
        GM_registerMenuCommand('📋 Скопировать товар', needProduct(p => copyProduct(p, true)));
        GM_registerMenuCommand('➕ Добавить/убрать товар в буфере', needProduct(p => toggleProduct(p, true)));
        GM_registerMenuCommand('⬇️ Добавить все товары со страницы', bulkAddAll);
        GM_registerMenuCommand('⏬ Прокрутить страницу и собрать все товары', scanPage);
        GM_registerMenuCommand('📤 Скопировать весь буфер', async () => {
            if (bufCount()) { await copyToClipboard(bufRaw()); toast('Буфер скопирован', 'success'); }
            else toast('Буфер пуст', 'warning');
        });
        GM_registerMenuCommand('🗑️ Очистить буфер', () => {
            if (confirm('Очистить накопительный буфер?')) { bufClear(); toast('Буфер очищен', 'info'); }
        });
        GM_registerMenuCommand('🐞 Диагностика (дамп данных товара)', debugDump);
        GM_registerMenuCommand('🧩 Диагностика плиток (дамп + лог)', debugTiles);
        GM_registerMenuCommand('🔧 Логи в консоль: вкл/выкл', () => {
            debugOn = !debugOn;
            GM_setValue('ozon_copy_debug', debugOn);
            toast('Логи в консоль: ' + (debugOn ? 'включены' : 'выключены'), 'info');
        });
    }

    init();

})();