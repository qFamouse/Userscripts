// ==UserScript==
// @name           Yandex Ad Blocker
// @namespace      https://github.com/qFamouse/
// @version        1.1.0
// @description    Hides ads and promo results in Yandex search, the "Some sites are unavailable" modal and the "Install Yandex Browser" banners
// @description:ru Скрывает рекламу и промо-результаты в поиске Яндекса, окно «Часть сайтов недоступна» и баннеры «Установите Яндекс Браузер»
// @author         Famouse
// @license        MIT
// @match          https://ya.ru/*
// @match          https://*.ya.ru/*
// @match          https://yandex.by/*
// @match          https://*.yandex.by/*
// @match          https://yandex.ru/*
// @match          https://*.yandex.ru/*
// @match          https://yandex.com/*
// @match          https://*.yandex.com/*
// @match          https://yandex.kz/*
// @match          https://*.yandex.kz/*
// @icon           https://www.google.com/s2/favicons?sz=64&domain=ya.ru
// @grant          none
// @run-at         document-start
// @homepageURL    https://github.com/qFamouse/Userscripts/tree/master/scripts/yandex-ad-blocker
// @supportURL     https://github.com/qFamouse/Userscripts/issues
// @updateURL      https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/yandex-ad-blocker/yandex-ad-blocker.user.js
// @downloadURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/yandex-ad-blocker/yandex-ad-blocker.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Подписи рекламных меток (классы у Яндекса хешированные и меняются,
  // поэтому опираемся на видимый текст метки, а не на имена классов).
  const AD_LABEL_RE = /^(реклама(?![а-яё])|промо$|ad$|advertisement$|jarnama$|reklama$)/i;
  const HIDDEN_ATTR = 'data-ad-hidden';

  // Верхнеуровневый элемент результата, в котором лежит метка.
  function resultContainer(label) {
    let li = label.closest('li');
    if (li) {
      // Поднимаемся до самого внешнего <li> (внутри галерей бывают вложенные <li>).
      for (let p = li.parentElement && li.parentElement.closest('li'); p; p = li.parentElement && li.parentElement.closest('li')) {
        li = p;
      }
      return li;
    }
    // Медийный баннер (колонка справа) лежит не в <li>, а в блоке .Root.
    let box = label.closest('.Root');
    if (!box) return null;
    // Заодно прячем обёртки, в которых больше ничего нет, чтобы не оставалась пустая рамка.
    for (let i = 0; i < 3; i++) {
      const parent = box.parentElement;
      if (!parent || parent.childElementCount !== 1 || parent === document.body || parent.matches('main, .content')) break;
      box = parent;
    }
    return box;
  }

  function scan(root) {
    const labels = (root || document).querySelectorAll('span, div');
    for (const el of labels) {
      if (el.childElementCount !== 0) continue;                 // только листовые узлы
      const text = el.textContent.trim().toLowerCase();
      if (text.length > 40 || !AD_LABEL_RE.test(text)) continue;
      const box = resultContainer(el);
      if (box && !box.hasAttribute(HIDDEN_ATTR)) {
        box.setAttribute(HIDDEN_ATTR, '1');
        box.style.setProperty('display', 'none', 'important');
      }
    }
  }

  // Прямые рекламные блоки по понятным (нехешированным) классам — на всякий случай.
  const style = document.createElement('style');
  style.textContent = `
    .AdvGallery, .AdvGalleryItem, .AdvListItem { display: none !important; }
    /* Окно «Часть сайтов недоступна — скачайте Яндекс Браузер» */
    .DistributionSplashScreenModal,
    .Modal:has(.DistributionSplashScreenModalContent) { display: none !important; }
    /* Баннер «Установите Яндекс Браузер» (главная и выдача) */
    .Distribution, .DistributionLinkBro { display: none !important; }
    body.body_scroll_lock { overflow: auto !important; padding-right: 0 !important; }
  `;
  document.documentElement.appendChild(style);

  // Запасной вариант без :has — по тексту окна; заодно снимаем блокировку прокрутки.
  function killDistributionModal() {
    for (const t of document.querySelectorAll('.DistributionTitle')) {
      const modal = t.closest('.Modal') || t.closest('.DistributionSplashScreenModal');
      if (modal) modal.style.setProperty('display', 'none', 'important');
    }
    if (document.body) {
      document.body.classList.remove('body_scroll_lock');
      document.body.style.removeProperty('overflow');
    }
  }

  function run() { scan(); killDistributionModal(); }

  // Выдача подгружается динамически — следим за изменениями (с дебаунсом).
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', run);
  run();
})();
