// ==UserScript==
// @name         Wildberries Copy Data
// @namespace    https://github.com/qFamouse/
// @version      1.0
// @description  Copies data from a Wildberries product card or directly from catalog/search tiles
// @description:ru Копирование данных с карточки товара Wildberries и прямо из каталога/поиска
// @author       Famouse
// @license      MIT
// @match        https://*.wildberries.by/*
// @match        https://*.wildberries.ru/*
// @match        https://*.wildberries.kz/*
// @match        https://*.wildberries.kg/*
// @match        https://*.wildberries.am/*
// @match        https://*.wildberries.uz/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wildberries.by
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      wbbasket.ru
// @connect      *.wbbasket.ru
// @connect      wbcontent.net
// @connect      *.wbcontent.net
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/master/scripts/wildberries-copy-data
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/wildberries-copy-data/wildberries-copy-data.user.js
// @downloadURL  https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/wildberries-copy-data/wildberries-copy-data.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ─── Константы ────────────────────────────────────────────────────────────

    const VERSION = '1.0';
    const SEPARATOR = '\n\n' + '='.repeat(60) + '\n\n';

    const DEFAULT_SETTINGS = {
        copyTitle: true,
        copyArticle: true,
        copyBrand: true,
        copyOriginal: true,
        copySeller: true,
        copyCategory: true,
        copyPrice: true,
        copyOldPrice: true,
        copyRating: true,
        copyUrl: false,
        copyImage: false,
        copyDescription: true,
        copyComposition: true,
        copyComplectation: true,
        copyCharacteristics: true
    };

    // поле данных -> ключ настройки
    const FIELD_TO_SETTING = {
        title: 'copyTitle', article: 'copyArticle', brand: 'copyBrand', original: 'copyOriginal', seller: 'copySeller',
        category: 'copyCategory', price: 'copyPrice', oldPrice: 'copyOldPrice', rating: 'copyRating', url: 'copyUrl',
        image: 'copyImage', description: 'copyDescription', composition: 'copyComposition',
        complectation: 'copyComplectation', characteristics: 'copyCharacteristics'
    };

    const TLD = location.hostname.split('.').pop();
    const CURR_BY_TLD = { by: 'byn', ru: 'rub', kz: 'kzt', kg: 'kgs', am: 'amd', uz: 'uzs' };

    // ─── Утилиты ──────────────────────────────────────────────────────────────

    // «таймер ИЛИ requestAnimationFrame, что сработает раньше» (на маркетплейсах таймеры бывают придушены)
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

    const txt = el => el ? (el.textContent.replace(/\s+/g, ' ').trim() || null) : null;

    function flattenStrings(node, acc = []) {
        if (typeof node === 'string') acc.push(node);
        else if (Array.isArray(node)) node.forEach(n => flattenStrings(n, acc));
        else if (node && typeof node === 'object') Object.values(node).forEach(n => flattenStrings(n, acc));
        return acc;
    }

    const isProductPage = () => /^\/catalog\/\d+\/detail\.aspx/.test(location.pathname);

    // '/catalog/123/detail.aspx?targetUrl=MI' -> '123'
    function nmFromHref(href) {
        try {
            const m = new URL(href, location.origin).pathname.match(/^\/catalog\/(\d+)\/detail\.aspx/);
            return m ? m[1] : null;
        } catch { return null; }
    }

    const currentNm = () => isProductPage() ? nmFromHref(location.href) : null;
    const productUrl = nm => `${location.origin}/catalog/${nm}/detail.aspx`;

    // ─── Лог для диагностики ──────────────────────────────────────────────────

    const LOG = [];
    const scrollSources = new Set();
    let debugOn = !!GM_getValue('wb_copy_debug', false);

    function log(type, data = {}) {
        LOG.push({ t: Math.round(performance.now()), type, ...data });
        if (LOG.length > 400) LOG.shift();
        if (debugOn) console.log('[WBCopyData]', type, data);
    }

    // ─── Настройки ────────────────────────────────────────────────────────────

    function loadSettings() {
        const saved = tryParse(GM_getValue('wb_copy_settings', null));
        return { ...DEFAULT_SETTINGS, ...(saved || {}) };
    }

    function saveSettings(s) {
        GM_setValue('wb_copy_settings', JSON.stringify(s));
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
    // В буфер сохраняются ВСЕ данные товара. Выбор полей применяется только при показе,
    // копировании и скачивании, поэтому набор полей можно менять без пересборки буфера.

    const BUF_KEY = 'wb_buffer_data'; // JSON: [{ article, data }]

    let cacheRaw = null, cacheItems = [];

    function bufItems() {
        const raw = GM_getValue(BUF_KEY, null);
        if (raw !== cacheRaw) {
            const items = tryParse(raw);
            cacheItems = Array.isArray(items) ? items : [];
            cacheRaw = raw;
        }
        return cacheItems;
    }

    function bufSave(items) {
        cacheRaw = JSON.stringify(items);
        cacheItems = items;
        GM_setValue(BUF_KEY, cacheRaw);
        scheduleRefresh();
    }

    const itemText = item => formatData(applySettings(item.data || {}));
    const itemInfo = item => ({ title: item.data?.title || null, price: item.data?.price || null, url: item.data?.url || null });

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

    // ═══════════════════════════════════════════════════════════════════════════
    //  Источники данных
    // ═══════════════════════════════════════════════════════════════════════════

    // ─── 1. Параметры API (dest, spp и т.п. подсматриваем у запросов самого сайта) ───

    const learned = {};
    const LEARN_KEYS = ['appType', 'curr', 'dest', 'spp', 'hide_vflags', 'hide_dflags', 'hide_dtype', 'mtype', 'lang', 'locale', 'ab_testing'];

    function learnParams(name) {
        if (!/\/__internal\/(u-card\/cards|u-search|u-recom|meta)\//.test(name)) return;
        try {
            const u = new URL(name);
            for (const k of LEARN_KEYS) if (u.searchParams.has(k)) learned[k] = u.searchParams.get(k);
        } catch {}
    }

    try {
        performance.getEntriesByType('resource').forEach(e => learnParams(e.name));
        new PerformanceObserver(list => list.getEntries().forEach(e => learnParams(e.name)))
            .observe({ type: 'resource', buffered: true });
    } catch {}

    function apiParams() {
        return { appType: '1', curr: CURR_BY_TLD[TLD] || 'rub', lang: 'ru', locale: TLD, ...learned };
    }

    // ─── 2. Цена/бренд/продавец/рейтинг: /__internal/u-card/cards/v4/detail ───

    async function fetchJson(url, opts = {}) {
        const r = await fetch(url, {
            credentials: 'include',
            method: opts.method || 'GET',
            headers: { accept: 'application/json' },
            body: opts.body
        });
        if (!r.ok) {
            const e = new Error('HTTP ' + r.status);
            e.status = r.status;
            throw e;
        }
        return r.json();
    }

    const detailCache = new Map(); // nm -> product | null

    // Пачками по 20 артикулов через ';' — как делает сам сайт
    async function loadDetails(ids) {
        const need = ids.filter(id => !detailCache.has(id));
        for (let i = 0; i < need.length; i += 20) {
            const chunk = need.slice(i, i + 20);
            const q = new URLSearchParams({ ...apiParams(), nm: chunk.join(';') });
            const j = await fetchJson('/__internal/u-card/cards/v4/detail?' + q);
            for (const p of j.products || []) detailCache.set(String(p.id), p);
            chunk.forEach(id => { if (!detailCache.has(id)) detailCache.set(id, null); });
        }
    }

    // Цены в API — в сотых долях валюты (2636 -> 26,36)
    function formatMoney(v) {
        const cur = (apiParams().curr || '').toUpperCase();
        return `${(v / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`.trim();
    }

    function extractFromDetail(p) {
        const d = {};
        d.title = p.name || null;
        d.brand = p.brand || null;
        d.seller = p.supplier || null;

        const sizes = (p.sizes || []).filter(s => s.price && s.price.product > 0);
        const inStock = sizes.filter(s => (s.stocks || []).length);
        const pool = inStock.length ? inStock : sizes;
        if (pool.length) {
            const product = Math.min(...pool.map(s => s.price.product));
            const basic = Math.min(...pool.map(s => s.price.basic));
            d.price = formatMoney(product);
            d.oldPrice = basic > product ? formatMoney(basic) : null;
        }

        if (p.reviewRating && p.feedbacks) d.rating = `${p.reviewRating} (оценок: ${p.feedbacks})`;
        return d;
    }

    async function loadCategory(p) {
        const q = new URLSearchParams({ subject: p.subjectId, kind: p.kindId, brand: p.brandId, lang: 'ru', locale: TLD });
        const j = await fetchJson('/__internal/site-path/for-product?' + q);
        const names = (j.sitePath || []).map(x => x.name).filter(Boolean);
        return names.length ? names.join(' > ') : null;
    }

    // ─── 3. Описание и характеристики: card.json на CDN (basket-NN.wbbasket.ru) ───
    // Номер корзины зависит от vol артикула и меняется со временем, поэтому берём его у картинок
    // на странице (там он прописан), а если не нашли — подбираем перебором.

    const basketByVol = new Map(); // vol -> 'basket-45.wbbasket.ru'
    let basketDomain = 'wbbasket.ru';

    function learnBasket(src) {
        const m = src && src.match(/^https?:\/\/(basket-\d+)\.([a-z0-9.-]+)\/vol(\d+)\//i);
        if (!m) return;
        basketByVol.set(Number(m[3]), `${m[1]}.${m[2]}`);
        basketDomain = m[2];
    }

    function gmGet(url) {
        return new Promise(resolve => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET', url, timeout: 15000,
                    onload: r => resolve(r.status >= 200 && r.status < 300 ? r.responseText : null),
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            } else {
                fetch(url).then(r => r.ok ? r.text() : null).then(resolve, () => resolve(null));
            }
        });
    }

    const pad2 = n => String(n).padStart(2, '0');

    async function findCard(nm) {
        const n = Number(nm), vol = Math.floor(n / 1e5), part = Math.floor(n / 1e3);

        const tryHost = async host => {
            const base = `https://${host}/vol${vol}/part${part}/${nm}`;
            const text = await gmGet(base + '/info/ru/card.json');
            const json = text && tryParse(text);
            if (json && typeof json === 'object') { basketByVol.set(vol, host); return { json, base }; }
            return null;
        };

        const bnum = h => Number(h.match(/basket-(\d+)/)[1]);
        const mk = k => `basket-${pad2(k)}.${basketDomain}`;
        const order = [];
        const exact = basketByVol.get(vol);

        if (exact) {
            const k = bnum(exact);
            order.push(exact, mk(k - 1), mk(k + 1));
        } else {
            // корзины растут вместе с vol: начинаем с соседей по известным парам
            const near = [...basketByVol].sort((a, b) => Math.abs(a[0] - vol) - Math.abs(b[0] - vol)).slice(0, 2);
            for (const [, host] of near) {
                const k = bnum(host);
                [k, k + 1, k - 1, k + 2].forEach(x => x > 0 && order.push(mk(x)));
            }
            for (let k = 1; k <= 99; k++) order.push(mk(k));
        }

        const uniq = [...new Set(order.filter(h => bnum(h) >= 1))];
        for (let i = 0; i < uniq.length; i += 6) {
            const hits = await Promise.all(uniq.slice(i, i + 6).map(tryHost));
            const hit = hits.find(Boolean);
            if (hit) return hit;
        }
        return null;
    }

    const cardCache = new Map(); // nm -> Promise<{ json, base } | null>

    function loadCard(nm) {
        if (!cardCache.has(nm)) {
            cardCache.set(nm, findCard(nm).then(r => { if (!r) cardCache.delete(nm); return r; }));
        }
        return cardCache.get(nm);
    }

    function cleanText(s) {
        return String(s).replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }

    function extractFromCard(cj, base) {
        const d = {};
        d.title = cj.imt_name || null;
        d.brand = cj.selling?.brand_name || null;
        d.category = [cj.subj_root_name, cj.subj_name].filter(Boolean).join(' > ') || null;
        d.description = cj.description ? cleanText(cj.description) : null;

        const chars = {};
        const add = (k, v) => {
            if (!k) return;
            const val = Array.isArray(v) ? v.join(', ') : String(v ?? '').trim();
            const key = String(k).trim();
            if (val && !(key in chars)) chars[key] = val;
        };
        (cj.grouped_options || []).forEach(g => (g.options || []).forEach(o => add(o.name, o.value)));
        (cj.options || []).forEach(o => add(o.name, o.value));

        const comp = cj.compositions ? flattenStrings(cj.compositions).join(', ') : null;
        d.composition = comp || chars['Состав'] || null;
        d.complectation = cj.contents ? cleanText(cj.contents) : (chars['Комплектация'] || null);
        // чтобы не дублировать в списке характеристик
        if (d.composition && chars['Состав'] === d.composition) delete chars['Состав'];
        if (d.complectation && chars['Комплектация'] === d.complectation) delete chars['Комплектация'];

        d.characteristics = Object.keys(chars).length ? chars : null;
        d.image = base ? `${base}/images/big/1.webp` : null;
        return d;
    }

    // ─── 4. DOM: страница товара и плитки каталога ────────────────────────────

    const bigImage = src => src ? src.replace(/\/images\/c\d+x\d+\//, '/images/big/').replace(/\?.*$/, '') : null;

    function domArticle(doc) {
        for (const tr of doc.querySelectorAll('[class*="options--"] table tr')) {
            if (txt(tr.querySelector('th')) === 'Артикул') {
                const m = (txt(tr.querySelector('td')) || '').match(/\d+/);
                if (m) return m[0];
            }
        }
        return null;
    }

    function extractFromDom(doc, nm) {
        const d = {};
        const aside = doc.querySelector('[class*="productPageAside--"]') || doc;

        d.title = txt(doc.querySelector('[class*="productTitle--"]'));
        d.brand = txt(doc.querySelector('[class*="productHeaderBrandText--"]'));
        d.original = doc.querySelector('[class*="originalMark--"]') ? true : null;
        d.seller = txt(aside.querySelector('[class*="supplierNameText--"]'));
        d.price = txt(aside.querySelector('[class*="priceBlockFinalPrice--"]'));
        d.oldPrice = txt(aside.querySelector('[class*="priceBlockOldPrice--"]'));

        const rt = txt(doc.querySelector('[class*="reviewRating--"]'));
        const m = rt && rt.match(/^([\d.,]+)\s*·\s*(.+)$/);
        d.rating = m ? `${m[1]} (${m[2]})` : (rt && /\d/.test(rt) ? rt : null);

        const crumbs = [...doc.querySelectorAll('[class*="breadcrumbsList--"] li')]
            .filter(li => !li.querySelector('a[href*="/brands/"]'))
            .map(li => txt(li.querySelector('[itemprop="name"]')))
            .filter(n => n && n !== 'Главная');
        d.category = crumbs.length ? crumbs.join(' > ') : null;

        // Короткая таблица характеристик (полная — в card.json)
        const chars = {};
        doc.querySelectorAll('[class*="options--"] table tr').forEach(tr => {
            const k = txt(tr.querySelector('th')), v = txt(tr.querySelector('td'));
            if (k && v && k !== 'Артикул') chars[k] = v;
        });
        d.characteristics = Object.keys(chars).length ? chars : null;

        const img = doc.querySelector('[class*="miniatureSlide--"] img[data-src-pb]');
        d.image = bigImage(img?.getAttribute('data-src-pb'));
        d.url = productUrl(nm);
        d.article = nm;
        return d;
    }

    const tileInfo = new Map(); // nm -> { title, brand, price, oldPrice, rating, image }

    function extractTile(tile) {
        const d = {};
        d.title = txt(tile.querySelector('[class*="productName--"]'));
        d.brand = txt(tile.querySelector('[class*="brand--"]'));
        d.price = txt(tile.querySelector('ins'));
        d.oldPrice = txt(tile.querySelector('del'));

        const r = txt(tile.querySelector('[class*="ratingCount--"]'));
        const c = txt(tile.querySelector('[class*="count--"]'));
        d.rating = r ? (c ? `${r} (${c.replace(/^·\s*/, '')})` : r) : null;

        const src = tile.querySelector('img[data-src-pb]')?.getAttribute('data-src-pb');
        learnBasket(src);
        d.image = bigImage(src);
        return d;
    }

    // ─── Очередь запросов ─────────────────────────────────────────────────────

    let queueTail = Promise.resolve();

    function enqueue(task) {
        const run = queueTail.then(task);
        queueTail = run.catch(() => {}).then(() => sleep(300 + Math.random() * 300));
        return run;
    }

    const cache = new Map(); // nm -> Promise<data>

    function fill(target, extra) {
        for (const k in extra) if (target[k] == null) target[k] = extra[k];
        return target;
    }

    // live=true — текущая страница товара: данные из DOM, пробелы закрываются через API
    async function getProductData(nm, live = false) {
        if (!live && cache.has(nm)) return cache.get(nm);

        const p = enqueue(async () => {
            let dom = {};
            if (live) {
                const a = domArticle(document);
                if (a === nm) dom = extractFromDom(document, nm); // DOM мог ещё не обновиться после перехода
            }
            const tile = live ? {} : (tileInfo.get(nm) || {});

            let det = null, card = null, cardBase = null;
            try {
                await loadDetails([nm]);
                det = detailCache.get(nm) || null;
            } catch (e) {
                if (!live && (e.status === 429 || e.status === 403)) throw e;
                console.warn('[WBCopyData] detail API не сработал:', e);
            }
            try {
                const r = await loadCard(nm);
                if (r) { card = extractFromCard(r.json, r.base); cardBase = r.base; }
            } catch (e) {
                console.warn('[WBCopyData] card.json не получен:', e);
            }

            const fromDet = det ? extractFromDetail(det) : {};
            const fromCard = card || {};

            // Видимые пользователю значения (DOM / плитка) главнее API
            const data = live ? { ...dom } : { ...tile };
            if (!live) data.title = fromCard.title ?? fromDet.title ?? tile.title ?? null;
            fill(data, fromDet);
            fill(data, fromCard);

            if (!data.category && det) {
                try { data.category = await loadCategory(det); } catch {}
            }
            if (!data.title) throw new Error('Нет данных о товаре ' + nm);

            data.url = data.url ?? productUrl(nm);
            data.article = data.article ?? nm;
            if (!data.image && cardBase) data.image = `${cardBase}/images/big/1.webp`;
            return data;
        });

        if (!live) {
            cache.set(nm, p);
            p.catch(() => cache.delete(nm));
        }
        return p;
    }

    // ─── Форматирование ───────────────────────────────────────────────────────

    function formatData(data) {
        const result = [];

        if (data.title)         result.push(`Название: ${data.title}`);
        if (data.article)       result.push(`Артикул: ${data.article}`);
        if (data.brand)         result.push(`Бренд: ${data.brand}`);
        if (data.original)      result.push('Оригинал: да');
        if (data.seller)        result.push(`Продавец: ${data.seller}`);
        if (data.category)      result.push(`Категория: ${data.category}`);
        if (data.price)         result.push(`Цена: ${data.price}`);
        if (data.oldPrice)      result.push(`Старая цена: ${data.oldPrice}`);
        if (data.rating)        result.push(`Рейтинг: ${data.rating}`);
        if (data.url)           result.push(`URL: ${data.url}`);
        if (data.image)         result.push(`Изображение: ${data.image}`);
        if (data.description)   result.push(`\nОписание:\n${data.description}`);
        if (data.composition)   result.push(`\nСостав:\n${data.composition}`);
        if (data.complectation) result.push(`\nКомплектация:\n${data.complectation}`);

        if (data.characteristics) {
            result.push('\nХарактеристики:');
            for (const [key, value] of Object.entries(data.characteristics)) {
                result.push(`  ${key}: ${value}`);
            }
        }

        return result.join('\n');
    }

    const textFor = async (nm, live = false) => formatData(applySettings(await getProductData(nm, live)));

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

    // ─── Стили (внутри Shadow DOM — стили сайта на них не влияют) ─────────────

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
            /* Собственная светлая палитра (фиолетовая), не зависит от темы сайта */
            color-scheme: light;
            --bg: #fff; --fg: #1c1b29; --muted: #6b6f80; --soft: #f4f3f9;
            --accent: #8a3ffc; --accent-h: #7527e6;
            --accent-soft: rgba(138,63,252,.10); --accent-text: #7527e6;
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

        /* Слой с тулбарами поверх плиток каталога (вне DOM сайта) */
        .layer { position: fixed; inset: 0; z-index: 2147482000; pointer-events: none; overflow: hidden; }
        /* Тулбар не ловит мышь (pointer-events: none): плитка под ним остаётся «под курсором»,
           поэтому WB не прячет «Быстрый просмотр». Наведение и клики обрабатываем сами (см. initToolbarPointer). */
        .tb { position: absolute; left: 0; top: 0; display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px;
              background: rgba(255,255,255,.96); box-shadow: 0 1px 6px rgba(28,27,41,.28); pointer-events: none;
              transition: margin-top .12s ease; will-change: transform;
              margin-top: calc(var(--lift, 0px) * -1); }
        .tb button { width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #1c1b29; }
        .tb button.hv { background: rgba(138,63,252,.12); color: #7527e6; }
        .tb button.on { background: #12a05c; color: #fff; }
        .tb button.on.hv { background: #0e8f52; color: #fff; }
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
        host.id = 'wbcd-root';
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
        console.error('[WBCopyData]', err);
        const blocked = err && (err.status === 429 || err.status === 403);
        toast(blocked ? `Wildberries ограничил запросы (HTTP ${err.status}). Подожди немного` : 'Не удалось получить данные товара',
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

    async function toggleProduct(nm, live = false) {
        toggleData(await getProductData(nm, live));
    }

    async function copyProduct(nm, live = false) {
        await copyToClipboard(await textFor(nm, live));
        toast('Скопировано', 'success');
    }

    async function previewProduct(nm, live = false) {
        const data = await getProductData(nm, live);
        ui.preview = { nm, data };
        openDrawer('preview');
    }

    // ─── Док (главная панель) ─────────────────────────────────────────────────

    // Список плиток может подгружаться порциями и выгружаться из DOM,
    // поэтому артикулы копим в наборе и сбрасываем его только при смене страницы/поиска.
    const seen = new Set();
    let seenKey = '';

    function seenIds() {
        const key = location.pathname + location.search;
        if (key !== seenKey) { seenKey = key; seen.clear(); }
        return seen;
    }

    const pageTileIds = () => [...seenIds()];

    function renderDock() {
        const nm = currentNm();
        const tileIds = nm ? [] : pageTileIds();
        const visible = !ui.open && (!!nm || tileIds.length > 0);
        dockEl.style.display = visible ? 'flex' : 'none';
        if (!visible) { dockSig = ''; return; }

        const set = bufSet();
        const count = bufCount();
        const inBuf = nm ? set.has(nm) : false;
        const rest = tileIds.filter(id => !set.has(id)).length;
        const sig = [nm, inBuf, count, rest, ui.scan ? 's' : '', ui.bulk ? `${ui.bulk.done}/${ui.bulk.total}` : ''].join('|');
        if (sig === dockSig) return;
        dockSig = sig;

        const bufBtn = h('button', { class: 'btn round', title: `Буфер: ${count}`, onClick: () => openDrawer('buffer') },
            ic('list'), count > 0 && h('span', { class: 'count' }, String(count)));

        dockEl.replaceChildren();

        if (nm) {
            const addBtn = h('button', {
                class: 'btn ' + (inBuf ? 'ok' : 'primary'),
                title: inBuf ? 'Убрать из буфера' : 'Добавить товар в буфер',
                onClick: e => withBusy(e.currentTarget, () => toggleProduct(nm, true))
            }, ic(inBuf ? 'check' : 'plus'), inBuf ? 'В буфере' : 'В буфер');

            const copyBtn = h('button', {
                class: 'btn round', title: 'Копировать данные товара',
                onClick: e => withBusy(e.currentTarget, () => copyProduct(nm, true))
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
        { key: 'copyOriginal',        label: 'Метка «Оригинал»' },
        { key: 'copySeller',          label: 'Продавец' },
        { key: 'copyCategory',        label: 'Категория' },
        { key: 'copyPrice',           label: 'Цена' },
        { key: 'copyOldPrice',        label: 'Старая цена' },
        { key: 'copyRating',          label: 'Рейтинг' },
        { key: 'copyUrl',             label: 'URL товара' },
        { key: 'copyImage',           label: 'Изображение' },
        { key: 'copyDescription',     label: 'Описание' },
        { key: 'copyComposition',     label: 'Состав' },
        { key: 'copyComplectation',   label: 'Комплектация' },
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
            const href = info.url || (art ? productUrl(art) : null);

            wrap.append(h('div', { class: 'item' + (open ? ' open' : '') },
                h('div', {
                        class: 't', title: open ? 'Свернуть' : 'Показать данные',
                        onClick: () => { open ? ui.expanded.delete(key) : ui.expanded.add(key); renderDrawer(); }
                    },
                    h('div', { class: 'n' }, info.title || (art ? `Артикул ${art}` : itemText(item).slice(0, 60))),
                    h('div', { class: 'm' }, [art && `№ ${art}`, info.price].filter(Boolean).join(' · ')),
                    open && h('pre', { onClick: e => e.stopPropagation() }, itemText(item))),
                h('div', { class: 'acts' },
                    href && h('a', { class: 'icon-btn', href, target: '_blank', rel: 'noopener', title: 'Открыть на Wildberries' }, ic('external')),
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
        a.download = `wb-buffer-${new Date().toISOString().slice(0, 10)}.txt`;
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
        const { nm, data } = ui.preview;
        const text = formatData(applySettings(data));
        return h('div', {},
            h('div', { class: 'card' },
                h('div', { class: 'ptitle' }, data.title || nm),
                h('div', { class: 'm' }, [data.article && `№ ${data.article}`, data.brand].filter(Boolean).join(' · ')),
                (data.price || data.oldPrice) && h('div', { class: 'prices' },
                    data.price && h('b', {}, data.price),
                    data.oldPrice && h('s', {}, data.oldPrice)),
                data.rating && h('div', { class: 'm' }, '★ ' + data.rating)),
            h('pre', { class: 'preview-text' }, text));
    }

    function previewFoot() {
        const { nm, data } = ui.preview;
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
            h('a', { class: 'icon-btn', href: productUrl(nm), target: '_blank', rel: 'noopener', title: 'Открыть на Wildberries' }, ic('external')));
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
            h('div', { class: 'hint' }, 'В буфер сохраняются все данные товара. Выбранные поля применяются при показе, копировании и скачивании, набор можно менять в любой момент.'));
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
            h('h2', {}, 'Wildberries Copy Data'),
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

    const tileBars = new Map(); // элемент плитки -> тулбар (живёт в нашем слое, а не в DOM сайта)
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
    // Свои узлы в разметку сайта (React) не вставляем: гидратация/перерисовка их выбросит.
    // Кнопки живут в нашем слое и позиционируются по getBoundingClientRect плитки.

    function createBar(nm) {
        const bar = { nm, el: null, tile: null, state: null, shown: false, target: null, refresh: null };
        const guard = fn => e => { e.preventDefault(); e.stopPropagation(); fn(e.currentTarget); };

        const addBtn = h('button', { title: 'Добавить в буфер', onClick: guard(b => withBusy(b, () => toggleProduct(bar.nm))) }, ic('plus'));
        const copyBtn = h('button', { title: 'Копировать данные', onClick: guard(b => withBusy(b, () => copyProduct(bar.nm))) }, ic('copy'));
        const infoBtn = h('button', { title: 'Показать данные', onClick: guard(b => withBusy(b, () => previewProduct(bar.nm))) }, ic('info'));

        bar.refresh = set => {
            const on = set.has(bar.nm);
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

    const TILE_SEL = 'article.product-card';
    const BAR_H = 36; // высота тулбара: 30 + padding 3*2

    function decorateTile(tile) {
        const nm = tile.dataset.nmId || nmFromHref(tile.querySelector('a[href*="/catalog/"]')?.getAttribute('href'));
        if (!nm) return 'nolink';

        seenIds().add(nm);
        const info = tileInfo.get(nm);
        if (!info || !info.price) tileInfo.set(nm, extractTile(tile));

        let bar = tileBars.get(tile);
        if (!bar) {
            bar = createBar(nm);
            bar.tile = tile;
            tileBars.set(tile, bar);
            bar.refresh(bufSet());
            return 'fresh';
        }
        if (bar.nm !== nm) { // плитка могла быть переиспользована под другой товар
            bar.nm = nm;
            bar.state = null;
            bar.refresh(bufSet());
            return 'repathed';
        }
        return 'ok';
    }

    // Наведение и клики по кнопкам тулбара: сам тулбар мышь не ловит, поэтому ищем кнопку под курсором по координатам
    function barButtonAt(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        for (const bar of tileBars.values()) {
            if (!bar.shown || !bar.tile || !bar.tile.contains(el)) continue; // над тулбаром не должно быть чужих слоёв
            for (const b of bar.el.children) {
                const r = b.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return b;
            }
        }
        return null;
    }

    function initToolbarPointer() {
        let hov = null, queued = false, last = null, synthetic = false;

        document.addEventListener('mousemove', e => {
            last = e;
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                const b = last ? barButtonAt(last.clientX, last.clientY) : null;
                if (b === hov) return;
                hov?.classList.remove('hv');
                b?.classList.add('hv');
                hov = b;
            });
        }, { capture: true, passive: true });

        // Перехватываем клик раньше сайта: иначе он откроет карточку товара
        window.addEventListener('click', e => {
            if (synthetic) return;
            const b = barButtonAt(e.clientX, e.clientY);
            if (!b) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            synthetic = true;
            try { b.click(); } finally { synthetic = false; }
        }, true);
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
                const baseY = Math.max(r.top + 4, Math.min(r.bottom - 44, vh - 44));

                // При наведении WB показывает внизу плитки «Быстрый просмотр» — поднимаемся над ним.
                // Тулбар мышь не ловит, так что наведение на него = наведение на плитку, и кнопка не пропадает.
                let lift = 0;
                if (tile.matches(':hover')) {
                    const fv = tile.querySelector('[class*="fastView--"]');
                    const fr = fv && fv.getBoundingClientRect();
                    if (fr && fr.height > 0) lift = Math.max(0, Math.round(baseY - (fr.top - BAR_H - 6)));
                }
                bar.el.style.transform = `translate(${x}px, ${Math.round(baseY)}px)`;
                bar.el.style.setProperty('--lift', lift + 'px');
            }
        }
    }

    // ─── Каталог: добавить все ────────────────────────────────────────────────

    let bulkCancel = false;

    async function bulkAddAll() {
        if (ui.bulk) { bulkCancel = true; return; }

        const set = bufSet();
        const todo = pageTileIds().filter(id => !set.has(id));
        if (!todo.length) { toast('Все товары на странице уже в буфере', 'info'); return; }

        ui.bulk = { done: 0, total: todo.length };
        bulkCancel = false;
        scheduleRefresh();

        // Цены/бренды/продавцов тянем пачками по 20 — это один запрос на 20 товаров
        try { await loadDetails(todo); } catch (e) { console.warn('[WBCopyData] предзагрузка detail не удалась:', e); }

        let added = 0, failed = 0, blocked = false;
        for (const id of todo) {
            if (bulkCancel) break;
            try {
                const data = await getProductData(id);
                if (!bufAdd(data).dup) added++;
            } catch (err) {
                failed++;
                console.error('[WBCopyData]', id, err);
                if (err.status === 429 || err.status === 403) { blocked = true; break; }
            }
            ui.bulk.done++;
            scheduleRefresh();
        }

        const stopped = bulkCancel;
        ui.bulk = null;
        scheduleRefresh();

        if (blocked) toast(`Wildberries ограничил запросы. Добавлено: ${added}`, 'error', { ms: 5000 });
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
        let last = pageTileIds().length, idle = 0;

        for (let i = 0; i < 300 && !scanCancel && idle < 4; i++) {
            window.scrollBy(0, Math.round(window.innerHeight * 0.8));
            await sleep(500);
            decorateAll();
            const n = pageTileIds().length;
            const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
            log('scan-step', { i, n, last, idle, atBottom, y: Math.round(window.scrollY), docH: document.documentElement.scrollHeight });
            if (n === last && atBottom) idle++;
            else { idle = 0; last = n; }
        }

        window.scrollTo(0, startY);
        const stopped = scanCancel;
        ui.scan = false;
        scheduleRefresh();
        toast(`${stopped ? 'Остановлено. ' : ''}Найдено товаров: ${pageTileIds().length}`, stopped ? 'warning' : 'success');
    }

    // ─── Диагностика ──────────────────────────────────────────────────────────

    async function debugDump() {
        const nm = currentNm() || pageTileIds()[0];
        if (!nm) { toast('Нет товара для диагностики', 'warning'); return; }

        const dump = { version: VERSION, nm, host: location.hostname, params: apiParams(), learnedParams: { ...learned } };
        try {
            await loadDetails([nm]);
            dump.detailRaw = detailCache.get(nm) ?? null;
            dump.detailParsed = dump.detailRaw ? extractFromDetail(dump.detailRaw) : null;
        } catch (e) { dump.detailError = String(e.message || e); }

        try {
            const r = await loadCard(nm);
            dump.cardBase = r?.base ?? null;
            dump.cardRaw = r ? JSON.stringify(r.json).slice(0, 20000) : null;
            dump.cardParsed = r ? extractFromCard(r.json, r.base) : null;
        } catch (e) { dump.cardError = String(e.message || e); }

        dump.basketsLearned = [...basketByVol].slice(0, 40);
        dump.dom = isProductPage() ? { article: domArticle(document), parsed: extractFromDom(document, nm) } : null;
        dump.tile = tileInfo.get(nm) ?? null;
        try { dump.final = await getProductData(nm, isProductPage()); } catch (e) { dump.finalError = String(e.message || e); }

        await copyToClipboard(JSON.stringify(dump, null, 2));
        toast('Дамп скопирован в буфер обмена', 'success');
    }

    function describeEl(el) {
        return (el.tagName || '?').toLowerCase() + (el.id ? '#' + el.id : '') +
            (typeof el.className === 'string' && el.className.trim()
                ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    }

    async function debugTiles() {
        const tiles = [...document.querySelectorAll(TILE_SEL)];
        const first = tiles[0];
        const dump = {
            version: VERSION,
            url: location.pathname + location.search,
            page: { scrollY: Math.round(window.scrollY), innerHeight: window.innerHeight,
                docHeight: document.documentElement.scrollHeight, hidden: document.hidden },
            counts: {
                tiles: tiles.length,
                withId: tiles.filter(t => t.dataset.nmId || t.querySelector('a[href*="/catalog/"]')).length,
                decorated: tiles.filter(t => tileBars.has(t)).length,
                barsShown: [...tileBars.values()].filter(b => b.shown).length,
                seen: seenIds().size,
                inBuffer: bufCount()
            },
            scrollSources: [...scrollSources],
            sampleTileInfo: first ? tileInfo.get(first.dataset.nmId) ?? null : null,
            sampleTile: first ? first.outerHTML.slice(0, 3500) : null,
            log: LOG.slice(-200)
        };
        await copyToClipboard(JSON.stringify(dump, null, 2));
        toast('Дамп плиток скопирован в буфер обмена', 'success');
    }

    // ─── Инициализация ────────────────────────────────────────────────────────

    let lastTally = '';
    let mutCount = 0;
    let scrollCount = 0;
    let lastLearn = 0;

    function learnBasketsFromDom() {
        if (Date.now() - lastLearn < 1000) return;
        lastLearn = Date.now();
        document.querySelectorAll('img[data-src-pb]').forEach(img => learnBasket(img.getAttribute('data-src-pb')));
    }

    function decorateAll() {
        learnBasketsFromDom();
        const tally = { tiles: 0, ok: 0, fresh: 0, repathed: 0, nolink: 0, errors: 0 };
        document.querySelectorAll(TILE_SEL).forEach(t => {
            tally.tiles++;
            try {
                const st = decorateTile(t) || 'ok';
                tally[st] = (tally[st] || 0) + 1;
            } catch (e) {
                tally.errors++;
                log('tile-error', { message: String((e && e.message) || e) });
                console.warn('[WBCopyData] плитка пропущена:', e);
            }
        });
        tally.seen = seenIds().size;
        scheduleLayout();

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

        initToolbarPointer();
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.open) closeDrawer(); });

        // Планировщик на requestAnimationFrame (устойчивее к придушенным таймерам):
        // проход не чаще раза в ~200 мс, плюс «пульс» раз в секунду как страховка.
        // Пульс же отслеживает SPA-переходы между страницами.
        let lastRun = 0, queued = false, hb = 0, hbLayout = 0;

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
            requestAnimationFrame(beat);
        };
        requestAnimationFrame(beat);

        new MutationObserver(recs => { mutCount += recs.length; scheduleDecorate(); scheduleLayout(); }).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['href']
        });
        document.addEventListener('scroll', e => {
            scrollCount++;
            const tg = e.target;
            const d = tg === document ? '#document' : describeEl(tg);
            if (!scrollSources.has(d) && scrollSources.size < 10) { scrollSources.add(d); log('scroll-source', { source: d }); }
            scheduleLayout();
            scheduleDecorate();
        }, { capture: true, passive: true });
        window.addEventListener('resize', scheduleLayout);
        document.addEventListener('mouseover', scheduleLayout, { passive: true });
        document.addEventListener('mouseout', scheduleLayout, { passive: true });

        // ─── Команды в меню Tampermonkey ─────────────────────────────────────
        const needProduct = fn => async () => {
            const nm = currentNm();
            if (!nm) { toast('Открой страницу товара', 'warning'); return; }
            try { await fn(nm); } catch (e) { reportError(e); }
        };

        GM_registerMenuCommand('🗂 Открыть панель', () => openDrawer('buffer'));
        GM_registerMenuCommand('📋 Скопировать товар', needProduct(nm => copyProduct(nm, true)));
        GM_registerMenuCommand('➕ Добавить/убрать товар в буфере', needProduct(nm => toggleProduct(nm, true)));
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
            GM_setValue('wb_copy_debug', debugOn);
            toast('Логи в консоль: ' + (debugOn ? 'включены' : 'выключены'), 'info');
        });
    }

    init();

})();