// ==UserScript==
// @name           Maktun Export
// @namespace      https://github.com/qFamouse/
// @version        2.0.0
// @description    Exports a Maktun coin collection to .xlsx with your own photos: button and progress panel built into the site design, column filters enabled in the table
// @description:ru Экспорт коллекции Maktun в .xlsx вместе с вашими фото: кнопка и панель прогресса встроены в дизайн сайта, в таблице включены фильтры по колонкам
// @author         Famouse
// @license        MIT
// @match          https://web.maktun.com/*
// @icon           https://www.google.com/s2/favicons?sz=64&domain=maktun.com
// @grant          GM_xmlhttpRequest
// @connect        *
// @require        https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js
// @run-at         document-start
// @homepageURL    https://github.com/qFamouse/Userscripts/tree/master/scripts/maktun-export
// @supportURL     https://github.com/qFamouse/Userscripts/issues
// @updateURL      https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/maktun-export/maktun-export.user.js
// @downloadURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/maktun-export/maktun-export.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '__maktun_export';

  const CFG = {
    DETAIL_CONCURRENCY: 4, // параллельных запросов get_cointype_info
    IMAGE_CONCURRENCY: 6, // параллельных загрузок фото
    IMG_MAX_SIDE: 400, // фото уменьшается до этого размера по длинной стороне (px)
    ROW_HEIGHT_PT: 92, // высота строки в Excel (pt)
    CELL_W: 132, // максимальные размеры фото в ячейке (px)
    CELL_H: 112,
  };

  // ───────────────────────── 1. Перехват запросов самого сайта ─────────────────────────
  // Выполняется в контексте страницы. Забирает заголовок Authorization (если он есть) и
  // тело запроса get_coins_info_by_flag — оттуда берутся flag_id, coin_token, limit_count и т.д.
  function pageHook() {
    const TAG = '__maktun_export';
    const post = (type, data) => window.postMessage({ [TAG]: true, type, data }, '*');

    const normHeaders = (h) => {
      const out = {};
      if (!h) return out;
      try {
        if (typeof Headers !== 'undefined' && h instanceof Headers) h.forEach((v, k) => (out[k.toLowerCase()] = v));
        else if (Array.isArray(h)) h.forEach(([k, v]) => (out[String(k).toLowerCase()] = v));
        else Object.keys(h).forEach((k) => (out[k.toLowerCase()] = h[k]));
      } catch (e) {}
      return out;
    };

    const seen = (url, method, headers, body) => {
      try {
        const u = new URL(url, location.href);
        if (!u.pathname.startsWith('/api/')) return;
        const h = normHeaders(headers);
        const keep = {};
        ['authorization', 'x-csrftoken'].forEach((k) => {
          if (h[k]) keep[k] = h[k];
        });
        post('api', { origin: u.origin, headers: keep });
        if (u.pathname.indexOf('get_coins_info_by_flag') !== -1 && typeof body === 'string') {
          post('tpl', { body: JSON.parse(body) });
        }
      } catch (e) {}
    };

    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input, init) {
        try {
          const isReq = typeof Request !== 'undefined' && input instanceof Request;
          const url = isReq ? input.url : String(input);
          const method = (init && init.method) || (isReq && input.method) || 'GET';
          const headers = (init && init.headers) || (isReq && input.headers);
          seen(url, method, headers, init && init.body);
        } catch (e) {}
        return origFetch.apply(this, arguments);
      };
    }

    const XO = XMLHttpRequest.prototype.open;
    const XS = XMLHttpRequest.prototype.send;
    const XH = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (m, u) {
      this.__mk = { m, u, h: {} };
      return XO.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      if (this.__mk) this.__mk.h[k] = v;
      return XH.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (b) {
      if (this.__mk) seen(this.__mk.u, this.__mk.m, this.__mk.h, b);
      return XS.apply(this, arguments);
    };
  }

  const hook = document.createElement('script');
  hook.textContent = '(' + pageHook.toString() + ')();';
  (document.head || document.documentElement).appendChild(hook);
  hook.remove();

  // ───────────────────────── 2. Состояние ─────────────────────────
  const S = {
    tpl: null,
    auth: {},
    origin: location.origin,
    running: false,
    cancel: false,
    wantExport: false, // нажали «Экспорт» до того, как скрипт получил параметры запроса
    raw: null,
  };

  // Что показывает панель: idle | hint | run | done | cancel | error
  const V = { phase: 'idle', title: '', detail: '', pct: 0 };

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || !d[TAG]) return;
    if (d.type === 'api' && d.data.origin === location.origin) {
      Object.assign(S.auth, d.data.headers);
    } else if (d.type === 'tpl') {
      S.tpl = d.data.body;
      if (S.wantExport && !S.running) runExport();
    }
  });

  // ───────────────────────── 3. Утилиты ─────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function pool(items, limit, worker) {
    let i = 0;
    const run = async () => {
      while (i < items.length && !S.cancel) {
        const idx = i++;
        await worker(items[idx], idx);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  }

  async function api(path, body, method = 'POST') {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(S.origin + path, {
          method,
          credentials: 'include',
          headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, S.auth),
          body: method === 'GET' ? undefined : JSON.stringify(body),
        });
        if (res.status === 401 || res.status === 403) {
          throw Object.assign(new Error('Нет авторизации (HTTP ' + res.status + ')'), { fatal: true });
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (j.success !== undefined && j.success !== 1) throw new Error('success=' + j.success);
        return j;
      } catch (e) {
        if (e.fatal || attempt >= 3) throw e;
        await sleep(600 * attempt);
      }
    }
  }

  const gmGet = (url) =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout: 45000,
        onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.response) : reject(new Error('HTTP ' + r.status))),
        onerror: () => reject(new Error('network')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });

  const resolveUrl = (uri) => new URL(uri, S.origin + '/').href;

  async function toThumb(buf) {
    const bmp = await createImageBitmap(new Blob([buf]));
    const k = Math.min(1, CFG.IMG_MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return { dataUrl: cv.toDataURL('image/jpeg', 0.88), w, h };
  }

  const txt = (v) => {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.map(txt).filter((x) => x !== '').join(', ');
    if (typeof v === 'object') return v.title || v.name || JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'да' : 'нет';
    return v;
  };
  const num = (v) => {
    if (v === null || v === undefined || v === '') return '';
    const s = String(v).trim();
    return /^-?\d+([.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : v;
  };

  // ───────────────────────── 4. Колонки Excel ─────────────────────────
  const COLS = [
    { id: 'n', h: '№', w: 5 },
    { id: 's1', h: 'Аверс (моё фото)', w: 20, photo: true },
    { id: 's2', h: 'Реверс (моё фото)', w: 20, photo: true },
    { id: 'e1', h: 'Доп. фото 1', w: 20, photo: true },
    { id: 'e2', h: 'Доп. фото 2', w: 20, photo: true },
    { id: 'e3', h: 'Доп. фото 3', w: 20, photo: true },
    { id: 'title', h: 'Название', w: 38 },
    { id: 'country', h: 'Страна', w: 16 },
    { id: 'km', h: 'KM Code', w: 12 },
    { id: 'y1', h: 'Год начала выпуска', w: 10 },
    { id: 'y2', h: 'Год конца выпуска', w: 10 },
    { id: 'nominal', h: 'Номинал', w: 10 },
    { id: 'currency', h: 'Валюта', w: 18 },
    { id: 'series', h: 'Серия', w: 30 },
    { id: 'distribution', h: 'Распространение', w: 18 },
    { id: 'mint', h: 'Монетный двор', w: 28 },
    { id: 'composition', h: 'Материал', w: 16 },
    { id: 'compositionDetails', h: 'Описание состава', w: 20 },
    { id: 'edge', h: 'Гурт', w: 14 },
    { id: 'orientation', h: 'Отношение аверс/реверс', w: 22 },
    { id: 'shape', h: 'Форма', w: 12 },
    { id: 'rim', h: 'Описание канта/буртика', w: 24 },
    { id: 'weight', h: 'Вес (каталог)', w: 10 },
    { id: 'diameter', h: 'Диаметр (каталог)', w: 10 },
    { id: 'thickness', h: 'Толщина', w: 10 },
    { id: 'mintage', h: 'Тираж', w: 14 },
    { id: 'themes', h: 'Темы', w: 26 },
    { id: 'myYear', h: 'Мой: год', w: 8 },
    { id: 'myMint', h: 'Мой: монетный двор', w: 18 },
    { id: 'myQuality', h: 'Мой: качество', w: 12 },
    { id: 'myValuta', h: 'Мой: валюта', w: 12 },
    { id: 'myWeight', h: 'Мой: вес', w: 9 },
    { id: 'myDiameter', h: 'Мой: диаметр', w: 9 },
    { id: 'amount', h: 'Количество', w: 10 },
    { id: 'price', h: 'Цена', w: 10 },
    { id: 'avgPrice', h: 'Средняя цена', w: 10 },
    { id: 'collections', h: 'Мои коллекции', w: 20 },
    { id: 'created', h: 'Добавлено', w: 16 },
    { id: 'replica', h: 'Копия', w: 8 },
    { id: 'myComment', h: 'Мой комментарий', w: 28 },
    { id: 'typeComment', h: 'Комментарий к типу', w: 28 },
    { id: 'flag', h: 'Список', w: 14 },
    { id: 'typeId', h: 'ID типа', w: 10 },
    { id: 'coinId', h: 'ID монеты', w: 11 },
    { id: 'kind', h: 'Запись', w: 14 },
    { id: 'description', h: 'Описание', w: 60 },
  ];

  // ───────────────────────── 5. Сборка строк ─────────────────────────
  function makeRows(ct, info, kind, flagId) {
    const i = info || {};
    const typeFields = info
      ? {
          title: i.combined_title || i.title || ct.combined_title || '',
          country: txt(i.country),
          km: i.km_code || '',
          y1: num(i.start_year),
          y2: num(i.end_year),
          nominal: num(i.nominal),
          currency: txt(i.currency),
          series: i.series || txt(i.nseries),
          distribution: i.distribution || '',
          mint: i.mint || '',
          composition: i.composition || '',
          compositionDetails: i.composition_details || '',
          edge: i.edge || '',
          orientation: i.orientation || '',
          shape: i.shape || '',
          rim: i.rim || '',
          weight: num(i.weight),
          diameter: num(i.diameter),
          thickness: num(i.thickness),
          mintage: num(i.mintage),
          themes: txt(i.themes) || i.theme || '',
          typeComment: txt(i.comment),
          description: i.translated_description || i.description || '',
        }
      : {
          // нет деталей (нераспознанная монета или ошибка запроса) — берём что есть из списка
          title: kind === 'Не распознана' ? `Не распознана (id ${ct.id})` : ct.combined_title || ct.title || '',
          country: txt(ct.country),
          km: ct.km_code || '',
          y1: num(ct.start_year),
          y2: num(ct.end_year),
          nominal: num(ct.nominal),
          currency: txt(ct.currency),
          weight: num(ct.weight),
          diameter: num(ct.diameter),
          typeComment: txt(ct.comment),
        };

    const flags = (i.flags && i.flags.length ? i.flags : ct.flags) || [];
    const owned = [];
    for (const f of flags) {
      if (flagId !== null && flagId !== undefined && f.flag_id !== flagId) continue;
      for (const c of f.coins || []) owned.push({ c, flag: f.title });
    }

    const base = Object.assign({ typeId: ct.id, kind, avgPrice: num(ct.average_price) }, typeFields);
    if (!owned.length) return [base];

    return owned.map(({ c, flag }) =>
      Object.assign({}, base, {
        s1: c.side1_uri,
        s2: c.side2_uri,
        e1: c.ext1_uri,
        e2: c.ext2_uri,
        e3: c.ext3_uri,
        myYear: num(c.year),
        myMint: c.mint || '',
        myQuality: txt(c.quality),
        myValuta: c.valuta || '',
        myWeight: num(c.weight),
        myDiameter: num(c.diameter),
        amount: c.amount,
        price: num(c.price),
        collections: txt(c.collections),
        created: txt(c.created),
        replica: txt(c.replica),
        myComment: txt(c.comment),
        flag,
        coinId: c.coin_id,
        overLimit: c.over_limit,
      })
    );
  }

  // ───────────────────────── 6. Экспорт ─────────────────────────
  // Доли общего прогресса по этапам
  const STAGES = { list: [0, 0.05], details: [0.05, 0.4], photos: [0.4, 0.9], excel: [0.9, 1] };

  function progress(stage, done, total, title, detail) {
    const [a, b] = STAGES[stage];
    const f = Number.isFinite(total) && total > 0 ? Math.min(1, done / total) : 0;
    setView({ phase: 'run', title, detail: detail || '', pct: a + (b - a) * f });
  }

  const cancelled = () => setView({ phase: 'cancel', title: 'Экспорт отменён', detail: '', pct: 0 });

  async function runExport() {
    if (S.running) return;
    if (!S.tpl) {
      // Параметры запроса ещё не перехвачены — ждём, пока сайт сам отправит запрос списка
      S.wantExport = true;
      setView({
        phase: 'hint',
        title: 'Нужно один раз обновить список',
        detail:
          'Нажмите на любой номер страницы в пагинации ниже — сайт отправит запрос, скрипт запомнит параметры, и экспорт начнётся сам.',
        pct: 0,
      });
      return;
    }
    S.wantExport = false;
    S.running = true;
    S.cancel = false;
    setView({ phase: 'run', title: 'Читаю список коллекции…', detail: '', pct: 0 });

    try {
      const tpl = S.tpl;
      const flagId = tpl.flag_id === undefined ? null : tpl.flag_id;
      const limit = Number(tpl.limit_count) || 30;

      // 6.1 список типов, лежащих в коллекции
      const types = new Map();
      const unrec = new Map();
      let total = Infinity;
      for (let start = 0; start < total && !S.cancel; start += limit) {
        const r = await api('/api/flags/get_coins_info_by_flag/', Object.assign({}, tpl, { limit_start: start, limit_count: limit }));
        if (typeof r.total === 'number') total = r.total;
        let added = 0;
        for (const ct of r.cointypes || []) {
          if (!types.has(ct.id)) {
            types.set(ct.id, ct);
            added++;
          }
        }
        for (const u of r.unrecognizedes || []) if (!unrec.has(u.id)) unrec.set(u.id, u);
        progress('list', types.size, total, 'Читаю список коллекции…', `${types.size} из ${Number.isFinite(total) ? total : '?'}`);
        if (!added) break;
      }
      if (S.cancel) return cancelled();

      // 6.2 подробности каждого типа
      const list = [...types.values()];
      const infos = new Map();
      let done = 0;
      let detailErrors = 0;
      await pool(list, CFG.DETAIL_CONCURRENCY, async (ct) => {
        try {
          const r = await api('/api/catalog/get_cointype_info/', {
            subject_id: ct.subject_id !== undefined ? ct.subject_id : tpl.subject_id,
            cointype_id: ct.id,
          });
          infos.set(ct.id, r.info);
        } catch (e) {
          if (e.fatal) throw e;
          detailErrors++;
        }
        done++;
        progress('details', done, list.length, 'Загружаю описания монет…', `${done} из ${list.length}` + (detailErrors ? ` · ошибок: ${detailErrors}` : ''));
      });
      if (S.cancel) return cancelled();

      // 6.3 строки
      const rows = [];
      for (const ct of list) rows.push(...makeRows(ct, infos.get(ct.id), 'Каталог', flagId));
      for (const u of unrec.values()) rows.push(...makeRows(u, null, 'Не распознана', flagId));
      // нераспознанные без монет в нужном списке не нужны
      const finalRows = rows.filter((r) => r.kind === 'Каталог' || r.coinId !== undefined);

      S.raw = { tpl, types: list, infos: Object.fromEntries(infos), unrecognized: [...unrec.values()] };

      // 6.4 фото
      const urls = new Set();
      for (const r of finalRows) for (const k of ['s1', 's2', 'e1', 'e2', 'e3']) if (r[k]) urls.add(r[k]);
      const urlList = [...urls];
      const thumbs = new Map();
      let imgDone = 0;
      let imgErrors = 0;
      progress('photos', 0, urlList.length, 'Скачиваю фото…', `0 из ${urlList.length}`);
      await pool(urlList, CFG.IMAGE_CONCURRENCY, async (u) => {
        try {
          thumbs.set(u, await toThumb(await gmGet(resolveUrl(u))));
        } catch (e) {
          imgErrors++;
          console.warn('[Maktun export] фото не загружено:', u, e);
        }
        imgDone++;
        progress('photos', imgDone, urlList.length, 'Скачиваю фото…', `${imgDone} из ${urlList.length}` + (imgErrors ? ` · не загрузилось: ${imgErrors}` : ''));
      });
      if (S.cancel) return cancelled();

      // 6.5 Excel
      progress('excel', 0, 1, 'Собираю таблицу Excel…', `${finalRows.length} строк`);
      await sleep(30);
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Коллекция', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = COLS.map((c) => ({ header: c.h, key: c.id, width: c.w }));

      const head = ws.getRow(1);
      head.font = { bold: true };
      head.alignment = { vertical: 'middle', wrapText: true };
      head.height = 32;
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF4' } };

      // Размеры ячейки в пикселях — чтобы привязать фото к ячейке «двумя углами».
      // Так при фильтрации строка скрывается вместе со своими фото (с oneCell они бы остались на экране).
      const EMU = 9525;
      const colPx = (w) => Math.round(w * 7 + 5);
      const rowPx = (CFG.ROW_HEIGHT_PT * 96) / 72;

      const imgIds = new Map();
      finalRows.forEach((r, idx) => {
        r.n = idx + 1;
        const row = ws.addRow(r);
        row.height = CFG.ROW_HEIGHT_PT;
        row.alignment = { vertical: 'middle', wrapText: true };
        COLS.forEach((c, ci) => {
          if (!c.photo) return;
          const t = r[c.id] && thumbs.get(r[c.id]);
          row.getCell(ci + 1).value = null;
          if (!t) return;
          if (!imgIds.has(r[c.id])) imgIds.set(r[c.id], wb.addImage({ base64: t.dataUrl, extension: 'jpeg' }));
          const k = Math.min(CFG.CELL_W / t.w, CFG.CELL_H / t.h);
          const w = Math.round(t.w * k);
          const h = Math.round(t.h * k);
          const padX = Math.max(0, (colPx(c.w) - w) / 2);
          const padY = Math.max(0, (rowPx - h) / 2);
          const rw = row.number - 1;
          ws.addImage(imgIds.get(r[c.id]), {
            tl: { nativeCol: ci, nativeColOff: Math.round(padX * EMU), nativeRow: rw, nativeRowOff: Math.round(padY * EMU) },
            br: { nativeCol: ci, nativeColOff: Math.round((padX + w) * EMU), nativeRow: rw, nativeRowOff: Math.round((padY + h) * EMU) },
            editAs: 'twoCell',
          });
        });
      });

      // Фильтры по всем колонкам: диапазон от заголовка до последней строки данных
      ws.autoFilter = { from: { row: 1, col: 1 }, to: { row: Math.max(1, ws.rowCount), col: COLS.length } };

      const buf = await wb.xlsx.writeBuffer();
      const stamp = new Date().toISOString().slice(0, 10);
      download(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `maktun-collection-${stamp}.xlsx`
      );

      const hidden = finalRows.filter((r) => r.overLimit).length;
      setView({
        phase: 'done',
        title: 'Готово — файл сохранён',
        detail:
          `${finalRows.length} строк · фото ${thumbs.size} из ${urlList.length}` +
          (imgErrors ? ` · не загрузилось фото: ${imgErrors}` : '') +
          (detailErrors ? ` · без описания: ${detailErrors} типов` : '') +
          (hidden ? ` · over_limit: ${hidden}` : ''),
        pct: 1,
      });
    } catch (e) {
      console.error('[Maktun export]', e);
      setView({
        phase: 'error',
        title: 'Не удалось выполнить экспорт',
        detail: e.message + (e.fatal ? '. Обновите страницу, нажмите на номер страницы и повторите.' : ''),
        pct: 0,
      });
    } finally {
      S.running = false;
      render();
    }
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 10000);
  }

  // ───────────────────────── 7. UI в стиле сайта ─────────────────────────
  // Палитра и размеры взяты из стилей самого сайта: фон #0F0F0F, карточки #1A1A1A с рамкой #333,
  // акцент #FFCC00, шрифт Roboto, скругление 4px/8px, кнопки с жёлтой обводкой, которые на hover заливаются.
  const CSS = `
    .mkx-btn {
      font-family: "Roboto", sans-serif;
      display: inline-flex; align-items: center; gap: 8px;
      height: 40px; padding: 0 16px; margin: 0 3rem 0 1rem;
      background: transparent; border: 1px solid #FFCC00; border-radius: 4px;
      color: #FFCC00; font-weight: 500; font-size: 16px; line-height: 20px;
      cursor: pointer; outline: none; white-space: nowrap; flex-shrink: 0;
      transition: background-color .5s, color .5s;
    }
    .mkx-btn svg { width: 20px; height: 20px; fill: currentColor; flex-shrink: 0; }
    .mkx-btn:hover:not(:disabled), .mkx-btn:focus-visible { background: #FFCC00; color: #000; }
    .mkx-btn:disabled { opacity: .5; cursor: default; }

    .mkx-panel {
      font-family: "Roboto", sans-serif; box-sizing: border-box;
      margin: 0 3rem 1.5rem 3rem; padding: 1rem 1.25rem;
      background: #1A1A1A; border: 1px solid #333; border-radius: 8px;
      color: #fff; user-select: text; -webkit-user-select: text;
    }
    .mkx-panel[hidden] { display: none; }
    .mkx-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .mkx-title { font-weight: 500; font-size: 18px; line-height: 22px; }
    .mkx-pct { color: #999; font-size: 16px; line-height: 22px; font-feature-settings: "pnum" on, "lnum" on; }
    .mkx-bar { height: 6px; margin: .9rem 0 .7rem; background: #333; border-radius: 3px; overflow: hidden; }
    .mkx-bar i { display: block; width: 0; height: 100%; background: #FFCC00; border-radius: 3px; transition: width .25s; }
    .mkx-detail { color: #999; font-size: 14px; line-height: 20px; word-break: break-word; }
    .mkx-detail:empty { display: none; }
    .mkx-head + .mkx-detail { margin-top: .5rem; }
    .mkx-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: .9rem; }
    .mkx-actions:empty, .mkx-panel[data-phase="hint"] .mkx-bar, .mkx-panel[data-phase="done"] .mkx-bar,
    .mkx-panel[data-phase="error"] .mkx-bar, .mkx-panel[data-phase="cancel"] .mkx-bar { display: none; }
    .mkx-sec {
      font-family: "Roboto", sans-serif; height: 32px; padding: 0 14px;
      background: transparent; border: 1px solid #666; border-radius: 4px;
      color: #fff; font-weight: 500; font-size: 14px; cursor: pointer; outline: none;
      transition: border-color .3s, color .3s;
    }
    .mkx-sec:hover, .mkx-sec:focus-visible { border-color: #FFCC00; color: #FFCC00; }
    .mkx-panel[data-phase="error"] { border-color: rgb(215, 65, 65); }
    .mkx-panel[data-phase="error"] .mkx-title { color: rgb(215, 65, 65); }
    .mkx-panel[data-phase="done"] .mkx-title { color: #FFCC00; }
    @media screen and (max-width: 850px) {
      .mkx-btn { margin-right: 1rem; padding: 0 12px; }
      .mkx-panel { margin: 0 1rem 1rem 1rem; }
    }
  `;

  const SVG_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"></path></svg>';

  const el = {};
  let styleMounted = false;

  function mk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildUI() {
    // Кнопка в шапке страницы (справа от заголовка списка)
    el.btn = mk('button', 'mkx-btn');
    el.btn.type = 'button';
    el.btn.innerHTML = SVG_DOWNLOAD;
    el.btnLabel = mk('span', '', 'Экспорт в Excel');
    el.btn.appendChild(el.btnLabel);
    el.btn.addEventListener('click', runExport);

    // Панель статуса под заголовком
    el.panel = mk('div', 'mkx-panel');
    el.panel.hidden = true;
    el.panel.addEventListener('selectstart', (e) => e.stopPropagation()); // на body у сайта запрещено выделение текста
    const head = mk('div', 'mkx-head');
    el.title = mk('div', 'mkx-title');
    el.pct = mk('div', 'mkx-pct');
    head.append(el.title, el.pct);
    const bar = mk('div', 'mkx-bar');
    el.fill = document.createElement('i');
    bar.appendChild(el.fill);
    el.detail = mk('div', 'mkx-detail');
    el.actions = mk('div', 'mkx-actions');

    el.bCancel = mk('button', 'mkx-sec', 'Отменить');
    el.bCancel.type = 'button';
    el.bCancel.addEventListener('click', () => {
      S.cancel = true;
      el.bCancel.disabled = true;
      el.title.textContent = 'Останавливаю…';
    });
    el.bJson = mk('button', 'mkx-sec', 'Скачать JSON');
    el.bJson.type = 'button';
    el.bJson.addEventListener('click', () => {
      if (S.raw) download(new Blob([JSON.stringify(S.raw, null, 1)], { type: 'application/json' }), 'maktun-raw.json');
    });
    el.bClose = mk('button', 'mkx-sec', 'Закрыть');
    el.bClose.type = 'button';
    el.bClose.addEventListener('click', () => {
      S.wantExport = false;
      setView({ phase: 'idle' });
    });

    el.panel.append(head, bar, el.detail, el.actions);
  }

  function setView(patch) {
    Object.assign(V, patch);
    render();
  }

  function render() {
    if (!el.panel) return;
    const p = V.phase;
    el.panel.dataset.phase = p;
    el.panel.hidden = p === 'idle';
    el.title.textContent = V.title || '';
    el.detail.textContent = V.detail || '';
    el.pct.textContent = p === 'run' ? Math.round((V.pct || 0) * 100) + '%' : '';
    el.fill.style.width = Math.round((p === 'run' ? V.pct : 0) * 100) + '%';

    el.btn.disabled = S.running;
    el.btnLabel.textContent = S.running ? 'Идёт экспорт…' : 'Экспорт в Excel';

    // набор кнопок под статусом зависит от фазы
    const acts = [];
    if (p === 'run') {
      el.bCancel.disabled = S.cancel;
      acts.push(el.bCancel);
    } else if (p !== 'idle') {
      if (p === 'done' && S.raw) acts.push(el.bJson);
      acts.push(el.bClose);
    }
    el.actions.replaceChildren(...acts);
  }

  // Сайт — SPA на React: заголовок страницы пересоздаётся при навигации, поэтому следим за DOM
  // и при необходимости заново вешаем кнопку и панель.
  function ensureUI() {
    const title = document.querySelector('.notes-page-content__title');
    if (!title || !document.head) return;
    if (!styleMounted) {
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      styleMounted = true;
    }
    if (el.btn.parentElement !== title) title.appendChild(el.btn);
    const content = title.parentElement;
    const anchor = content.querySelector(':scope > .coin-token-toggle') || title;
    if (el.panel.parentElement !== content || el.panel.previousElementSibling !== anchor) anchor.after(el.panel);
  }

  buildUI();
  render();

  let timer = 0;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      ensureUI();
    }, 60);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
