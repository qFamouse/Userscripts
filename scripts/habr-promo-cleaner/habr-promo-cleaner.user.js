// ==UserScript==
// @name           Habr Promo Cleaner
// @namespace      https://github.com/qFamouse/
// @version        1.0
// @description    Hides ads and cross-promo blocks on Habr Promo and turns the 'Show promo code' button green
// @description:ru Скрывает рекламу и кросс-промо блоки на Habr Промокоды и красит кнопку «Показать промокод» в зелёный
// @author         Famouse
// @license        MIT
// @match          https://promo.habr.com/*
// @icon           https://www.google.com/s2/favicons?sz=64&domain=habr.com
// @grant          none
// @run-at         document-idle
// @homepageURL    https://github.com/qFamouse/Userscripts/tree/master/scripts/habr-promo-cleaner
// @supportURL     https://github.com/qFamouse/Userscripts/issues
// @updateURL      https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/habr-promo-cleaner/habr-promo-cleaner.user.js
// @downloadURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/habr-promo-cleaner/habr-promo-cleaner.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ---------- 1. CSS: сразу прячем рекламу и готовим стиль для зелёной кнопки ----------
    const style = document.createElement('style');
    style.textContent = `
        /* Зелёная кнопка -> применяется только к элементам с классом .green-coupon-btn,
           который навешивается через JS исключительно на кнопки с текстом "Показать промокод" */
        a.green-coupon-btn {
            background-color: #2ecc71 !important;
            border-color: #27ae60 !important;
            color: #fff !important;
        }
        a.green-coupon-btn:hover {
            background-color: #27ae60 !important;
        }

        /* Рекламные и кросс-промо блоки (чужие офферы среди промокодов) */
        .banner-container,          /* верхний рекламный баннер */
        .coupons-a-block,           /* рекламный слайдер с пометкой "Реклама" */
        .coupon.cross-top,          /* кросс-промокоды других магазинов вперемешку со "своими" */
        .advertising-note__wrapper  /* пометка "Реклама" на баннерах */
        {
            display: none !important;
        }
    `;
    document.documentElement.appendChild(style);

    // ---------- 2. JS: подчищаем DOM (на случай динамической подгрузки) ----------
    const AD_SELECTORS = [
        '.banner-container',
        '.coupons-a-block',
        '.coupon.cross-top',
        '.advertising-note__wrapper'
    ];

    function removeAds(root) {
        AD_SELECTORS.forEach(function (sel) {
            root.querySelectorAll(sel).forEach(function (el) {
                el.remove();
            });
        });
    }

    // Красим зелёным ТОЛЬКО кнопки с текстом "Показать промокод"
    // (у "Открыть предложение" тот же класс .coupon-btn, поэтому фильтруем по тексту)
    function paintShowCodeButtons(root) {
        root.querySelectorAll('a.coupon-btn').forEach(function (btn) {
            const text = btn.textContent.trim();
            if (text === 'Показать промокод') {
                btn.classList.add('green-coupon-btn');
            } else {
                btn.classList.remove('green-coupon-btn');
            }
        });
    }

    function refresh(root) {
        removeAds(root);
        paintShowCodeButtons(root);
    }

    refresh(document);

    // ---------- 3. Следим за подгрузкой новых промокодов (пагинация/AJAX) ----------
    const observer = new MutationObserver(function () {
        refresh(document);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
