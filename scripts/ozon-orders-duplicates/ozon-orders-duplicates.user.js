// ==UserScript==
// @name           Ozon Orders Duplicates
// @namespace      https://github.com/qFamouse/
// @version        3.1.0
// @description    Orders page: merges identical products, compares prices, shows the current price, suggests what to refuse and what to reorder, links open in new tabs (middle click works too)
// @description:ru Страница «Заказы»: объединяет одинаковые товары, сравнивает цены, показывает текущую цену, подсказывает от чего отказаться и что перезаказать, ссылки открываются в новых вкладках (в том числе средней кнопкой мыши)
// @author         Famouse
// @license        MIT
// @match          https://ozon.by/*
// @match          https://www.ozon.by/*
// @match          https://ozon.ru/*
// @match          https://www.ozon.ru/*
// @icon           https://www.google.com/s2/favicons?sz=64&domain=ozon.ru
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @run-at         document-idle
// @homepageURL    https://github.com/qFamouse/Userscripts/tree/master/scripts/ozon-orders-duplicates
// @supportURL     https://github.com/qFamouse/Userscripts/issues
// @updateURL      https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/ozon-orders-duplicates/ozon-orders-duplicates.user.js
// @downloadURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/ozon-orders-duplicates/ozon-orders-duplicates.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- настройки ---------- */
  const CFG = {
    loadDetails: true,            // читать страницы заказов: названия, SKU, точный номер заказа для спорных случаев
    currentPrices: true,          // узнавать текущую цену товара на сайте
    priceTtlMs: 60 * 60 * 1000,   // как долго хранить текущую цену в кэше
    minDiff: 0.05,                // разница в цене меньше этого (в валюте) не считается: 29,95 и 29,96 — одно и то же
    useCardPrice: false,          // true — сравнивать с ценой по Ozon Карте, если она есть
    requestDelayMs: 300,          // пауза между запросами к Ozon
    debug: false,
  };
  const log = (...a) => CFG.debug && console.log('[ozx]', ...a);

  const store = {
    get(k, d) { try { const v = GM_getValue(k, null); return v == null ? d : (JSON.parse(v) ?? d); } catch { return d; } },
    set(k, v) { try { GM_setValue(k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- утилиты ---------- */
  const norm = (t) => (t || '').replace(/[\u00a0\u202f]/g, ' ');
  const clean = (t) => norm(t).replace(/\s+/g, ' ').replace(/\s*>\s*$/, '').trim();
  const CUR = '(BYN|Br|руб\\.?|р\\.|₽|₸|KZT|RUB)';
  const PRICE_STRICT = new RegExp('^\\s*(\\d[\\d ]*(?:[.,]\\d{1,2})?)\\s*' + CUR + '\\s*$', 'i');
  const PRICE_LOOSE = new RegExp('(\\d[\\d ]*(?:[.,]\\d{1,2})?)\\s*' + CUR, 'i');
  const toPrice = (m) => (m ? { value: parseFloat(m[1].replace(/\s/g, '').replace(',', '.')), cur: m[2] } : null);
  const parsePrice = (txt) => toPrice(PRICE_STRICT.exec(norm(txt)));       // точное совпадение (для DOM)
  const findPrice = (txt) => toPrice(PRICE_LOOSE.exec(norm(txt)));         // цена внутри строки (для JSON)
  const fmt = (n) => n.toFixed(2).replace('.', ',');
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) ? b : c; };
  const IMG_RE = /\/(\d{6,})\.(?:webp|jpe?g|png)/;
  const imgIdFromUrl = (u) => { const m = IMG_RE.exec(u || ''); return m ? m[1] : null; };
  const imgId = (img) => imgIdFromUrl((img.getAttribute('srcset') || '') + ' ' + (img.getAttribute('src') || ''));
  const onOrderList = () => /\/my\/orderlist/.test(location.pathname);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const h = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  function* walk(o) { if (o && typeof o === 'object') { yield o; for (const k in o) yield* walk(o[k]); } }
  const jparse = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
  const b64json = (s) => {
    try { s = decodeURIComponent(s); } catch {}
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))));
  };
  const orderNoFromLink = (l) => { const m = /orderNumber=([\w-]+)/.exec(l || ''); return m ? m[1] : null; };
  const skuFromHref = (hr) => { const m = /-(\d{5,})\/?(?:\?|#|$)/.exec(hr || ''); return m ? m[1] : null; };

  /* ---------- состояние страницы Ozon (data-state / composer-api) ---------- */
  // Ozon кладёт данные каждого виджета в JSON: на странице (div#state-… [data-state]) и в composer-api.
  async function fetchJson(path) {
    const r = await fetch('/api/composer-api.bx/page/json/v2?url=' + encodeURIComponent(path), { credentials: 'include' });
    if (!r.ok) throw new Error('composer ' + r.status);
    return r.json();
  }
  async function fetchHtml(path) {
    const r = await fetch(path, { credentials: 'include', headers: { Accept: 'text/html' } });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.text();
  }
  function statesFromComposer(json) {
    const ws = json && json.widgetStates;
    if (!ws) return [];
    return Object.keys(ws).map((k) => ({ key: k, data: jparse(ws[k]) })).filter((s) => s.data);
  }
  function statesFromDoc(doc) {
    return [...doc.querySelectorAll('[id^="state-"][data-state]')]
      .map((n) => ({ key: n.id.slice(6), data: jparse(n.getAttribute('data-state')) })).filter((s) => s.data);
  }
  async function loadStates(path) {
    try { const st = statesFromComposer(await fetchJson(path)); if (st.length) return st; } catch (e) { log('composer', path, e.message); }
    return statesFromDoc(new DOMParser().parseFromString(await fetchHtml(path), 'text/html'));
  }

  /* --- список заказов: какие номера заказов лежат в каждой карточке --- */
  function parseListStates(states) {
    const cards = [];
    states.forEach((s) => {
      if (!s.data || !Array.isArray(s.data.ordersV2)) return;
      s.data.ordersV2.forEach((c) => {
        const prods = (c.rightBlock && c.rightBlock.products && c.rightBlock.products.products) || [];
        const ids = prods.map((p) => imgIdFromUrl(p.image && p.image.productMedia && p.image.productMedia.image && p.image.productMedia.image.url));
        const act = (c.common && c.common.action) || {};
        let orders = [];
        try {
          if (/orderNumber=/.test(act.link || '')) {
            orders = [{ no: orderNoFromLink(act.link), ids }];                        // карточка = один заказ
          } else if (act.params && act.params.data) {
            const d = b64json(act.params.data);                                       // карточка с несколькими заказами
            orders = (d.orders || []).map((o) => ({ no: o.order_number, ids: (o.product_images || []).map((pi) => imgIdFromUrl(pi.link)) }));
          }
          if (!orders.length && act.link) {                                           // запасной вариант: номера отправлений
            const q = new URL(act.link, location.origin).searchParams.get('data');
            const d = b64json(q);
            const nos = [...new Set((d.postings || []).map((p) => p.replace(/-\d+$/, '')))];
            orders = nos.map((no) => ({ no, ids: null }));
          }
        } catch (e) { log('list state', e.message); }
        cards.push({ ids, orders });
      });
    });
    return cards;
  }
  const domStateCache = new Map();
  function listCardsFromDom() {
    const out = [];
    document.querySelectorAll('[id^="state-orderList"][data-state]').forEach((n) => {
      const raw = n.getAttribute('data-state');
      let c = domStateCache.get(n.id);
      if (!c || c.raw !== raw) { c = { raw, cards: parseListStates([{ key: n.id, data: jparse(raw) }]) }; domStateCache.set(n.id, c); }
      out.push(...c.cards);
    });
    return out;
  }
  let apiList = { url: '', cards: [] };
  const apiTried = new Set();

  /* --- страница заказа: товары с названием, SKU, ссылкой и ценой --- */
  function extractOrderItems(states) {
    let src = states.filter((s) => /^shipmentWidget/i.test(s.key));
    if (!src.length) src = states;
    const out = [];
    src.forEach((s) => {
      for (const n of walk(s.data)) {
        const title = n.title && n.title.name && n.title.name.text;
        const arr = n.price && n.price.price;
        if (!title || !Array.isArray(arr)) continue;
        const pe = arr.find((x) => x && x.textStyle === 'PRICE') || arr[0];
        const price = pe && findPrice(pe.text);
        const media = (n.pictureV2 && n.pictureV2.productMedia && n.pictureV2.productMedia.image && n.pictureV2.productMedia.image.url)
          || (n.picture && n.picture.image && n.picture.image.image);
        const img = imgIdFromUrl(media);
        const act = n.title.common && n.title.common.action;
        const link = act && act.link ? act.link.split('?')[0] : null;
        const sku = (act && act.id && /^\d{5,}$/.test(String(act.id)) ? String(act.id) : skuFromHref(link));
        if (img && price) out.push({ img, price: price.value, cur: price.cur, sku, title: clean(title), link });
      }
    });
    return out;
  }

  /* --- страница товара: текущая цена --- */
  function extractWebPrice(states, doc) {
    const st = states.find((s) => /^webPrice/i.test(s.key));
    if (st) {
      const d = st.data;
      if (d.isAvailable === false) return { avail: false };
      const order = CFG.useCardPrice ? [d.cardPrice, d.price] : [d.price, d.cardPrice];
      for (const f of order) { const p = f && findPrice(typeof f === 'string' ? f : JSON.stringify(f)); if (p) return { value: p.value, cur: p.cur, avail: true }; }
    }
    const w = doc && doc.querySelector('[data-widget="webPrice"]');           // запасной вариант — разметка
    const sp = w && [...w.querySelectorAll('span')].find((x) => !x.children.length && parsePrice(x.textContent));
    const p = sp && parsePrice(sp.textContent);
    return p ? { value: p.value, cur: p.cur, avail: true } : null;
  }

  /* ---------- разбор страницы «Заказы» ---------- */
  const HDR_RE = /^(Можно забирать|Доставим|Доставка|Отмен|Возврат|В пути|Доставлен|Ожида|Передаётся)/i;
  const headerSpan = (e) => [...e.querySelectorAll('span')].find((sp) => !sp.children.length && HDR_RE.test(norm(sp.textContent).trim()));
  const findPriceIn = (e) => {
    for (const sp of e.querySelectorAll('span')) { if (sp.children.length) continue; const p = parsePrice(sp.textContent); if (p) return p; }
    return null;
  };
  const bigImg = (img) => { const m = (img.getAttribute('srcset') || '').match(/https?:\/\/\S+/); return m ? m[0] : img.currentSrc || img.src; };

  function scan() {
    const roots = [...document.querySelectorAll('[data-widget="orderList"]')];
    const items = [];
    roots.forEach((root) => {
      [...root.querySelectorAll('img')].filter(imgId).forEach((img) => {
        let node = img.parentElement;
        while (node && node !== root && !findPriceIn(node)) node = node.parentElement;
        if (!node || node === root) return;
        while (node.parentElement && node.parentElement !== root) {
          const p = node.parentElement;
          if ([...p.querySelectorAll('img')].filter(imgId).length > 1 || headerSpan(p)) break;
          node = p;
        }
        const price = findPriceIn(node);
        // карточка отправления = прямой потомок корня виджета
        let card = node;
        while (card.parentElement && card.parentElement !== root) card = card.parentElement;
        if (!headerSpan(card)) { card = node; while (card && card !== root && !headerSpan(card)) card = card.parentElement; if (!card || card === root) card = null; }
        const hs = card && headerSpan(card);
        const orderStatus = hs ? clean(hs.textContent) : '';
        const nos = card ? [...new Set([...card.querySelectorAll('a[href*="orderNumber="]')].map((a) => orderNoFromLink(a.href)).filter(Boolean))] : [];
        const small = node.querySelector('[class*="tsCompact400Small"]');
        const itemStatus = small ? clean(small.textContent) : '';
        const all = orderStatus + ' ' + itemStatus;
        const cancelled = /отмен|возврат/i.test(all);
        const ready = !cancelled && (/можно забирать/i.test(orderStatus) || /хранится/i.test(itemStatus));
        items.push({
          el: node, cardEl: card, id: imgId(img), imgUrl: bigImg(img), price, orderStatus, itemStatus,
          directNo: nos.length === 1 ? nos[0] : null, orderNo: null, orderCands: [], ambiguous: false,
          kind: cancelled ? 'cancelled' : ready ? 'ready' : 'transit',
        });
      });
    });
    return items.filter((it, i, a) => a.findIndex((x) => x.el === it.el) === i);
  }

  /* ---------- привязка товара к конкретному заказу ---------- */
  const orderCache = store.get('ozx3_orders', {});   // orderNo -> [{img,price,sku,title,link}]
  const priceCache = store.get('ozx3_prices', {});   // sku -> {value,cur,avail,t}
  const saveAll = () => { store.set('ozx3_orders', orderCache); store.set('ozx3_prices', priceCache); };
  const triedOrders = new Set();

  function assignOrders(items, cards) {
    items.forEach((it) => { it.orderNo = it.directNo; it.orderCands = it.directNo ? [it.directNo] : []; it.ambiguous = false; });
    const queue = new Map();
    cards.forEach((c) => { const k = c.ids.join(','); if (!queue.has(k)) queue.set(k, []); queue.get(k).push(c); });
    const byCard = new Map();
    items.forEach((it) => { if (!it.cardEl) return; if (!byCard.has(it.cardEl)) byCard.set(it.cardEl, []); byCard.get(it.cardEl).push(it); });

    byCard.forEach((its) => {
      const sc = (queue.get(its.map((i) => i.id).join(',')) || []).shift();
      if (!sc || !sc.orders.length) return;
      if (sc.orders.length === 1) { its.forEach((it) => { it.orderNo = sc.orders[0].no; it.orderCands = [sc.orders[0].no]; }); return; }

      // в карточке несколько заказов: сопоставляем по картинке, а при совпадениях — по цене из страницы заказа
      const pool = sc.orders.map((o) => ({ no: o.no, ids: o.ids ? o.ids.slice() : null, det: orderCache[o.no] ? orderCache[o.no].slice() : null }));
      const cands = (it) => {
        const base = pool.filter((o) => !o.ids || o.ids.includes(it.id));
        const pr = it.price ? it.price.value : null;
        const exact = base.filter((o) => o.det && pr != null && o.det.some((d) => d.img === it.id && Math.abs(d.price - pr) < 0.005));
        if (exact.length) return exact;
        const unknown = base.filter((o) => !o.det);
        return unknown.length ? unknown : base;
      };
      const take = (it, o) => {
        it.orderNo = o.no;
        if (o.ids) { const i = o.ids.indexOf(it.id); if (i >= 0) o.ids.splice(i, 1); }
        if (o.det && it.price) { const i = o.det.findIndex((d) => d.img === it.id && Math.abs(d.price - it.price.value) < 0.005); if (i >= 0) o.det.splice(i, 1); }
      };
      let left = its.slice(), progress = true;
      while (left.length && progress) {
        progress = false;
        for (const it of left.slice()) {
          const c = cands(it);
          it.orderCands = c.map((x) => x.no);
          if (c.length === 1) { take(it, c[0]); left.splice(left.indexOf(it), 1); progress = true; }
        }
      }
      // что осталось, различить пока нечем (цены совпадают или страница заказа ещё не загружена)
      const sets = left.map((it) => cands(it).map((x) => x.no));
      left.forEach((it, i) => { it.orderCands = sets[i]; it.ambiguous = new Set(sets[i]).size > 1; });
      left.forEach((it) => { const c = cands(it); if (c.length) take(it, c[0]); });
    });
  }

  // SKU, название и ссылка берутся со страницы заказа: по картинке + цене, а если цена не совпала — по картинке
  function attachMeta(it) {
    it.sku = null; it.meta = null;
    const det = it.orderNo ? orderCache[it.orderNo] : null;
    if (det) {
      const same = det.filter((d) => d.img === it.id);
      let d = it.price && same.find((x) => Math.abs(x.price - it.price.value) < 0.005);
      if (!d && same.length && same.every((x) => x.sku === same[0].sku)) d = same[0];
      if (d) { it.sku = d.sku || null; it.meta = d; }
    }
    it.pending = !det && !!it.orderNo && CFG.loadDetails && !triedOrders.has(it.orderNo);   // данные заказа ещё не получены
  }

  /* ---------- фоновая подгрузка: данные заказов и текущие цены ---------- */
  const failSku = new Map();
  let running = false, statusText = '';
  const setStatus = (t) => { statusText = t; const n = document.getElementById('ozx-status'); if (n) n.textContent = t; };
  const priceFresh = (sku) => { const c = priceCache[sku]; return c && Date.now() - c.t < CFG.priceTtlMs; };

  async function fetchCurrentPrice(sku) {
    if (priceFresh(sku)) return priceCache[sku];
    if (failSku.get(sku) > Date.now()) return null;
    let res = null;
    try { res = extractWebPrice(statesFromComposer(await fetchJson('/product/' + sku + '/')), null); } catch (e) { log('price json', sku, e.message); }
    if (!res) {
      try {
        const doc = new DOMParser().parseFromString(await fetchHtml('/product/' + sku + '/'), 'text/html');
        res = extractWebPrice(statesFromDoc(doc), doc);
      } catch (e) { log('price html', sku, e.message); }
    }
    if (res) { priceCache[sku] = { ...res, t: Date.now() }; saveAll(); return priceCache[sku]; }
    failSku.set(sku, Date.now() + 10 * 60 * 1000);
    return null;
  }

  async function enrich(items) {
    if (running || (!CFG.loadDetails && !CFG.currentPrices)) return;
    running = true;
    let changed = false;
    try {
      // 1) страницы заказов: названия, SKU и точное соответствие «товар → заказ»
      if (CFG.loadDetails) {
        const need = [];
        const push = (no) => { if (no && !orderCache[no] && !triedOrders.has(no) && !need.includes(no)) need.push(no); };
        items.forEach((it) => { push(it.orderNo); if (it.ambiguous) it.orderCands.forEach(push); });
        for (let i = 0; i < need.length; i++) {
          const no = need[i];
          triedOrders.add(no);
          setStatus(`Загружаю заказы ${i + 1}/${need.length}…`);
          try {
            const list = extractOrderItems(await loadStates('/my/orderdetails/?orderNumber=' + encodeURIComponent(no)));
            if (list.length) {
              orderCache[no] = list;
              saveAll(); changed = true;
            }
          } catch (e) { log('order', no, e.message); }
          await sleep(CFG.requestDelayMs);
        }
      }
      // 2) текущие цены
      if (CFG.currentPrices) {
        const skus = [...new Set(items.map((it) => it.sku).filter(Boolean))].filter((s) => !priceFresh(s));
        for (let i = 0; i < skus.length; i++) {
          setStatus(`Загружаю цены ${i + 1}/${skus.length}…`);
          if (await fetchCurrentPrice(skus[i])) changed = true;
          await sleep(CFG.requestDelayMs);
        }
      }
    } finally { running = false; setStatus(''); }
    if (changed) { lastSig = ''; render(); }
  }

  /* ---------- анализ групп ---------- */
  const currentOf = (sku) => (sku && priceCache[sku]) || null;
  const productUrl = (g) => (g.meta && g.meta.link) || (g.sku ? `/product/${g.sku}/` : null);

  // один товар = один SKU (у вариантов — размер, цвет, комплект — фото часто общее, цена разная)
  function groupItems(items) {
    const map = new Map();
    items.forEach((it) => {
      if (it.kind === 'cancelled') return;
      const key = it.sku ? 'sku:' + it.sku : 'img:' + it.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    return [...map.entries()].map(([key, arr]) => {
      arr.sort((a, b) => (a.price ? a.price.value : 1e9) - (b.price ? b.price.value : 1e9));
      const withMeta = arr.find((x) => x.meta);
      return { key, id: arr[0].id, sku: arr[0].sku, meta: withMeta ? withMeta.meta : null, arr, pending: arr.some((x) => x.pending) };
    });
  }

  // что делать с каждой позицией и с товаром целиком
  function analyze(g) {
    const eps = CFG.minDiff;
    const arr = g.arr, dup = arr.length > 1;
    const priced = arr.filter((x) => x.price);
    const min = priced.length ? priced[0].price.value : null;
    const now = currentOf(g.sku);
    const nowOk = now && now.avail !== false && now.value != null ? now : null;
    g.min = min; g.now = now; g.dup = dup;
    g.gain = nowOk && min != null ? min - nowOk.value : 0;
    g.reorder = g.gain >= eps;                 // на сайте сейчас дешевле, чем самая выгодная из ваших покупок
    g.refuseN = 0; g.refuseSum = 0;
    arr.forEach((it) => { it.act = null; it.diff = 0; });
    if (g.pending) { g.reorder = false; return; }      // пока не знаем SKU — советов не даём
    const anyPricier = priced.some((x) => x.price.value - min >= eps);
    arr.forEach((it) => {
      if (!it.price || min == null) return;
      const d = it.price.value - min;
      it.diff = d;
      if (dup && d >= eps) {                   // есть такой же товар дешевле
        it.act = it.kind === 'ready' ? 'refuse' : 'pricier';
        if (it.act === 'refuse') { g.refuseN++; g.refuseSum += d; }
      } else if (g.reorder) it.act = 'reorder';
      else if (dup) it.act = anyPricier ? 'keep' : 'same';
    });
  }

  /* ---------- стили ---------- */
  const css = `
  .ozx-orig-hidden{display:none !important}
  #ozx-view{font:14px/1.4 system-ui,sans-serif;color:#1a1a1a;margin:8px 0}
  #ozx-bar{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:12px 16px;border-radius:16px;background:#fff;margin-bottom:10px}
  #ozx-bar .seg{display:inline-flex;flex-wrap:wrap;background:#eef0f3;border-radius:10px;padding:2px}
  #ozx-bar button{border:0;border-radius:8px;padding:6px 12px;font:600 13px system-ui,sans-serif;cursor:pointer;background:transparent;color:#1a1a1a}
  #ozx-bar button.on{background:#1a1a1a;color:#fff}
  #ozx-bar button.hot{color:#005bff}
  #ozx-bar button.hot.on{color:#fff}
  #ozx-bar .sum{color:#444;flex:1 1 280px}
  #ozx-bar .ozx-status{color:#777;font-size:12px}
  #ozx-bar button.ozx-refresh{background:#eef0f3;padding:6px 10px}
  .ozx-card{display:flex;gap:14px;background:#fff;border-radius:16px;padding:12px 14px;margin-bottom:8px}
  .ozx-pic{flex:0 0 72px;height:96px;background:#f4f5f7;border-radius:10px;overflow:hidden;cursor:pointer}
  a.ozx-pic{display:block}
  .ozx-pic img{width:100%;height:100%;object-fit:contain}
  .ozx-main{flex:1;min-width:0}
  .ozx-title{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px}
  .ozx-title a,.ozx-title span.t{font:600 15px/1.3 system-ui;color:#1a1a1a;text-decoration:none}
  .ozx-title a:hover{text-decoration:underline}
  .ozx-chip{font:600 12px system-ui;color:#555;background:#eef0f3;border-radius:6px;padding:1px 7px;white-space:nowrap}
  .ozx-chip.now{background:#fff;border:1px solid #d5d9df;color:#1a1a1a}
  .ozx-chip.reorder{background:#e8f0ff;color:#005bff}
  table.ozx-t{border-collapse:collapse;width:100%}
  .ozx-t td{padding:5px 8px 5px 6px;border-top:1px solid #eef0f3;vertical-align:baseline;font-size:13px}
  .ozx-t td.pr{font-weight:700;font-size:15px;white-space:nowrap;width:1%}
  .ozx-t td.pr small{font:500 12px system-ui;color:#777;margin-left:4px}
  .ozx-t td.st{color:#555}
  .ozx-t td.go{text-align:right;white-space:nowrap;width:1%}
  .ozx-t tr.refuse td{background:#fdeceb}
  .ozx-t tr.reorder td{background:#f1f6ff}
  .ozx-pill{display:inline-block;font-weight:700;border-radius:6px;padding:2px 8px;white-space:nowrap}
  .ozx-pill.refuse{background:#d92d20;color:#fff}
  .ozx-pill.reorder{background:#005bff;color:#fff}
  .ozx-pill.keep{background:#e3f6e8;color:#157a31}
  .ozx-ready{display:inline-block;background:#e3f6e8;color:#157a31;font-weight:700;border-radius:6px;padding:1px 8px}
  .ozx-dim{color:#777}
  .ozx-open{border:1px solid #d5d9df !important;background:#fff !important;border-radius:8px !important;padding:3px 9px !important;font:600 12px system-ui !important;color:#005bff !important;cursor:pointer}
  .ozx-open:hover{background:#f4f7ff !important}
  .ozx-open.fuzzy{border-style:dashed !important}
  a.ozx-open{display:inline-block;text-decoration:none !important}
  .ozx-sub{font:600 12px system-ui;color:#777;margin:8px 6px 4px}
  .ozx-sep{font:600 13px system-ui;color:#777;margin:14px 4px 6px;text-transform:uppercase;letter-spacing:.04em}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- отрисовка ---------- */
  let mode = store.get('mode3', 'orig');         // orig (как на Ozon) | grouped (по товарам)
  let filter = store.get('filter3', 'all');      // all | dups | single | refuse | reorder
  let observer, lastSig = '', view;

  function openOrder(it) {
    if (it.orderNo) { window.open(orderHref(it), '_blank'); return; }
    (it.el.querySelector('a') || it.el).click();       // нет номера — как кликнуть по оригинальной карточке Ozon
  }
  const orderHref = (it) => (it.orderNo ? `/my/orderdetails/?orderNumber=${encodeURIComponent(it.orderNo)}` : null);

  // настоящая ссылка: работает средний клик, Ctrl/Cmd+клик, контекстное меню
  function link(cls, href, html) {
    const a = h('a', cls, html);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    a.addEventListener('click', (e) => e.stopPropagation());   // чтобы делегированные обработчики Ozon не перехватили клик
    a.addEventListener('auxclick', (e) => e.stopPropagation());
    return a;
  }

  function actCell(it, g) {
    const d = fmt(it.diff);
    switch (it.act) {
      case 'refuse': return `<span class="ozx-pill refuse">отказаться</span> <span class="ozx-dim">дороже на ${d}</span>`;
      case 'keep': return '<span class="ozx-pill keep">оставить</span>';
      case 'pricier': return `<span class="ozx-dim">дороже на ${d} · отказаться при выдаче</span>`;
      case 'reorder': return `<span class="ozx-pill reorder">перезаказать</span> <span class="ozx-dim">${it.kind === 'ready' ? 'затем отказаться от этого' : 'старый — отказаться при выдаче'}</span>`;
      case 'same': return '<span class="ozx-dim">цена та же</span>';
      default: return '';
    }
  }

  function cardFor(g) {
    const { arr } = g;
    const now = g.now;
    const card = h('div', 'ozx-card');

    const pu = productUrl(g);
    const picHref = pu || orderHref(arr[0]);
    const pic = picHref ? link('ozx-pic', picHref) : h('div', 'ozx-pic');
    pic.appendChild(Object.assign(document.createElement('img'), { src: arr[0].imgUrl, loading: 'lazy' }));
    pic.title = pu ? 'Открыть товар в новой вкладке' : 'Ссылка на товар пока не найдена — откроется заказ';
    if (!picHref) pic.onclick = () => openOrder(arr[0]);
    card.appendChild(pic);

    const main = h('div', 'ozx-main');
    const title = h('div', 'ozx-title');
    const name = (g.meta && g.meta.title) || 'Товар';
    if (pu) title.appendChild(link('', pu, esc(name)));
    else title.appendChild(h('span', 't', esc(name)));
    if (g.pending) title.appendChild(h('span', 'ozx-dim', 'уточняю данные заказа…'));
    if (g.dup) title.appendChild(h('span', 'ozx-chip', `заказано ${arr.length} ${plural(arr.length, 'раз', 'раза', 'раз')}`));
    if (now && now.avail === false) title.appendChild(h('span', 'ozx-chip', 'нет в наличии'));
    else if (now) {
      title.appendChild(h('span', 'ozx-chip now', `сейчас ${fmt(now.value)} ${esc(now.cur)}`));
      if (g.reorder) title.appendChild(h('span', 'ozx-chip reorder', `дешевле на ${fmt(g.gain)} — стоит перезаказать`));
      else if (g.min != null) {
        const diff = now.value - g.min;
        if (Math.abs(diff) < CFG.minDiff) title.appendChild(h('span', 'ozx-dim', 'цена не изменилась'));
        else if (diff > 0) title.appendChild(h('span', 'ozx-dim', `сейчас дороже на ${fmt(diff)}`));
      }
    }
    main.appendChild(title);

    const t = h('table', 'ozx-t');
    arr.forEach((it) => {
      const tr = h('tr', it.act === 'refuse' ? 'refuse' : it.act === 'reorder' ? 'reorder' : '');
      tr.appendChild(h('td', 'pr', it.price ? fmt(it.price.value) + (it.diff >= CFG.minDiff ? `<small>+${fmt(it.diff)}</small>` : '') : '—'));
      tr.appendChild(h('td', 'st', it.kind === 'ready'
        ? `<span class="ozx-ready">Можно забирать</span>${it.itemStatus ? ' · ' + esc(it.itemStatus) : ''}`
        : esc(['В пути', it.orderStatus, it.itemStatus].filter((x, i, a) => x && a.indexOf(x) === i).join(' · '))));
      tr.appendChild(h('td', '', actCell(it, g)));

      const go = h('td', 'go');
      const href = orderHref(it);
      const cls = 'ozx-open' + (it.ambiguous ? ' fuzzy' : '');
      let btn;
      if (href) btn = link(cls, href, 'заказ ↗');
      else { btn = h('button', cls, 'заказ ↗'); btn.onclick = () => openOrder(it); }   // номер не определён — запасной вариант
      btn.title = it.orderNo
        ? 'Открыть заказ ' + it.orderNo + (it.ambiguous ? ' (возможно, это один из: ' + it.orderCands.join(', ') + ')' : '')
        : 'Номер заказа не определён — откроется карточка Ozon';
      go.appendChild(btn);
      tr.appendChild(go);
      t.appendChild(tr);
    });
    main.appendChild(t);
    card.appendChild(main);
    return card;
  }

  function getListCards() {
    const dom = listCardsFromDom();
    if (dom.length) return dom;
    const url = location.pathname + location.search;
    if (apiList.url === url) return apiList.cards;
    if (!apiTried.has(url)) {                          // состояния нет в DOM (SPA-переход) — берём из composer-api
      apiTried.add(url);
      loadStates(url).then((st) => { apiList = { url, cards: parseListStates(st) }; lastSig = ''; render(); }).catch((e) => log('list api', e.message));
    }
    return [];
  }

  function render() {
    if (!onOrderList()) { document.getElementById('ozx-view')?.remove(); document.querySelectorAll('.ozx-orig-hidden').forEach((n) => n.classList.remove('ozx-orig-hidden')); return; }
    const roots = [...document.querySelectorAll('[data-widget="orderList"]')];
    if (!roots.length) return;
    const items = scan();
    assignOrders(items, getListCards());
    items.forEach(attachMeta);
    const active = items.filter((i) => i.kind !== 'cancelled');
    const sig = mode + filter + JSON.stringify(items.map((i) => [i.id, i.price && i.price.value, i.kind, i.itemStatus, i.orderStatus, i.orderNo, i.ambiguous, i.sku, i.pending, i.meta && i.meta.title, currentOf(i.sku)]));
    if (observer) observer.disconnect();
    try {
      roots.forEach((r) => r.classList.toggle('ozx-orig-hidden', mode === 'grouped'));
      if (!view || !view.isConnected) { view = document.getElementById('ozx-view') || h('div'); view.id = 'ozx-view'; }
      if (view.parentElement !== roots[0].parentElement || view.nextSibling !== roots[0]) roots[0].parentElement.insertBefore(view, roots[0]);
      if (sig !== lastSig || !view.firstChild) {
        lastSig = sig;
        const groups = groupItems(items);
        groups.forEach(analyze);
        const dups = groups.filter((g) => g.dup);
        const singles = groups.filter((g) => !g.dup);
        const toRefuse = groups.filter((g) => g.refuseN > 0).sort((a, b) => b.refuseSum - a.refuseSum);
        const toReorder = groups.filter((g) => g.reorder).sort((a, b) => b.gain - a.gain);
        const refuseN = toRefuse.reduce((s, g) => s + g.refuseN, 0);
        const refuseSum = toRefuse.reduce((s, g) => s + g.refuseSum, 0);
        const gainSum = toReorder.reduce((s, g) => s + g.gain, 0);
        const cur = ((active.find((i) => i.price) || {}).price || {}).cur || '';

        view.innerHTML = '';
        const bar = h('div'); bar.id = 'ozx-bar';
        const seg = (opts, curv, onpick) => {
          const s = h('span', 'seg');
          opts.forEach(([v, t, hot]) => { const b = h('button', (curv === v ? 'on ' : '') + (hot ? 'hot' : ''), t); b.onclick = () => onpick(v); s.appendChild(b); });
          return s;
        };
        bar.appendChild(seg([['orig', 'Как на Ozon'], ['grouped', 'По товарам']], mode, (v) => { mode = v; store.set('mode3', v); lastSig = ''; render(); }));
        bar.appendChild(seg([
          ['all', `Все (${groups.length})`], ['dups', `Повторные (${dups.length})`],
          ['refuse', `Отказаться (${toRefuse.length})`, true], ['reorder', `Перезаказать (${toReorder.length})`, true],
          ['single', `Один раз (${singles.length})`],
        ], mode === 'grouped' ? filter : '', (v) => { filter = v; mode = 'grouped'; store.set('filter3', v); store.set('mode3', mode); lastSig = ''; render(); }));
        const parts = [];
        if (refuseN) parts.push(`отказаться: <b>${refuseN}</b> ${plural(refuseN, 'заказ', 'заказа', 'заказов')}, экономия <b>${fmt(refuseSum)} ${esc(cur)}</b>`);
        if (toReorder.length) parts.push(`перезаказать: <b>${toReorder.length}</b> ${plural(toReorder.length, 'товар', 'товара', 'товаров')}, выгода <b>${fmt(gainSum)} ${esc(cur)}</b>`);
        bar.appendChild(h('span', 'sum', parts.length ? parts.join(' · ') : 'Выгодных действий пока нет'));
        bar.appendChild(h('span', 'ozx-status', esc(statusText))).id = 'ozx-status';
        const rf = h('button', 'ozx-refresh', '↻ цены');
        rf.title = 'Заново узнать текущие цены';
        rf.onclick = () => { Object.keys(priceCache).forEach((k) => { priceCache[k].t = 0; }); failSku.clear(); lastSig = ''; render(); };
        bar.appendChild(rf);
        view.appendChild(bar);

        if (mode === 'grouped') {
          const section = (label, list) => { if (!list.length) return; view.appendChild(h('div', 'ozx-sep', `${label} · ${list.length}`)); list.forEach((g) => view.appendChild(cardFor(g))); };
          const byAct = (a, b) => (b.refuseSum - a.refuseSum) || (b.gain - a.gain);
          const dupsSorted = dups.slice().sort((a, b) => byAct(a, b) || b.arr.length - a.arr.length);
          const singlesSorted = singles.slice().sort(byAct);
          if (filter === 'refuse') section('Отказаться при получении', toRefuse);
          else if (filter === 'reorder') section('Стоит перезаказать', toReorder);
          else {
            if (filter !== 'single') section('Повторные заказы', dupsSorted);
            if (filter !== 'dups') section('Заказаны один раз', singlesSorted);
          }
          if (!groups.length) view.appendChild(h('div', 'ozx-sep', 'Товары не найдены — подождите загрузки страницы'));
          else if (filter === 'refuse' && !toRefuse.length) view.appendChild(h('div', 'ozx-sep', 'Отказываться пока не от чего'));
          else if (filter === 'reorder' && !toReorder.length) view.appendChild(h('div', 'ozx-sep', 'Перезаказывать пока нечего' + (Object.keys(priceCache).length ? '' : ' — текущие цены ещё не загружены')));
        }
        enrich(active);
      }
    } finally {
      observe();
    }
  }

  /* ---------- наблюдатель за DOM (Ozon — SPA, список подгружается) ---------- */
  let timer;
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 400); }
  function observe() {
    if (!observer) {
      observer = new MutationObserver((muts) => {
        if (muts.every((m) => m.target.closest && m.target.closest('#ozx-view'))) return;
        schedule();
      });
    }
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Сбросить кэш (названия, заказы, цены)', () => {
      [orderCache, priceCache].forEach((c) => Object.keys(c).forEach((k) => delete c[k]));
      saveAll(); triedOrders.clear(); failSku.clear(); lastSig = ''; render();
    });
    GM_registerMenuCommand('Отладка в консоль', () => {
      console.log('[ozx]', { orderCache, priceCache, items: scan().map((i) => ({ id: i.id, price: i.price, kind: i.kind, status: i.orderStatus + ' / ' + i.itemStatus })) });
    });
  }

  observe();
  schedule();
})();
