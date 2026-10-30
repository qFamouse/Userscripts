// ==UserScript==
// @name         Replit Hide Onboarding
// @namespace    https://github.com/qFamouse/
// @version      1.0
// @description  Hides the unclosable Replit onboarding modal (username, full name, phone verification) and restores scrolling and clicks on the page
// @description:ru Скрывает незакрываемое модальное окно онбординга на replit.com (имя пользователя, полное имя, подтверждение телефона) и возвращает странице прокрутку и клики
// @author       Famouse
// @license      MIT
// @match        https://replit.com/*
// @match        https://*.replit.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=replit.com
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @noframes
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/master/scripts/replit-hide-onboarding
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/replit-hide-onboarding/replit-hide-onboarding.user.js
// @downloadURL  https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/replit-hide-onboarding/replit-hide-onboarding.user.js
// ==/UserScript==

(function () {
    'use strict';

    const LOG = '[Replit Hide Onboarding]';
    const STORE_KEY = 'rhob:enabled';

    let enabled = true;
    try { enabled = localStorage.getItem(STORE_KEY) !== '0'; } catch { /* приватный режим */ }

    // ── CSS: прячет модалку мгновенно, ещё до срабатывания наблюдателя ────────
    // Шаги онбординга живут в одном dialog с aria-label="Replit onboarding"
    // и полями data-cy="onboarding-survey-*", поэтому :has() закрывает и шаг
    // с подтверждением телефона.

    const CSS = `
        [data-replit-is-modal]:has(section[role="dialog"][aria-label="Replit onboarding"]),
        [data-replit-is-modal]:has([data-cy^="onboarding-survey"]) {
            display: none !important;
        }
    `;

    function injectCss() {
        const style = document.createElement('style');
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    // ── Поиск целевой модалки ─────────────────────────────────────────────────

    // Шаг телефона может появиться в отдельном окне с другим aria-label —
    // ловим его по тексту, чтобы не трогать настройки/шаринг и прочие диалоги.
    // \w в JS не покрывает кириллицу, поэтому основы слов перечислены явно:
    // «подтверди…», «подтвержд…» (Подтвердите телефон, подтверждение телефона).
    const PHONE_TEXT_RE =
        /verify\s+(?:your\s+)?phone|phone\s+verification|(?:подтверди|подтвержд)[а-яё]*\s*телефон|номер\s+телефона/i;

    function isOnboardingModal(modal) {
        if (modal.querySelector('section[role="dialog"][aria-label="Replit onboarding"]')) return true;
        if (modal.querySelector('[data-cy^="onboarding-survey"]')) return true;
        const dialog = modal.querySelector('section[role="dialog"]');
        return !!dialog && PHONE_TEXT_RE.test(dialog.textContent || '');
    }

    // ── Разблокировка страницы ────────────────────────────────────────────────
    // Пока модалка «открыта» с точки зрения React, библиотека сама не снимет
    // ни scroll-lock на <html>, ни aria-hidden/inert с корня приложения.

    function unlockPage() {
        const html = document.documentElement;
        if (html.style.overflow === 'hidden') {
            html.style.removeProperty('overflow');       // scroll-lock
            html.style.removeProperty('padding-right');  // компенсация скроллбара
        }
        if (document.body && document.body.style.overflow === 'hidden') {
            document.body.style.removeProperty('overflow');
        }

        const app = document.getElementById('__next');
        if (app) {
            if (app.getAttribute('aria-hidden') === 'true') app.removeAttribute('aria-hidden');
            if (app.inert) app.inert = false;
        }
    }

    // ── Основной цикл ─────────────────────────────────────────────────────────

    let wasHidden = false;
    let scheduled = false;

    function enforce() {
        scheduled = false;
        if (!enabled) return;

        let suppressed = false;
        document.querySelectorAll('[data-replit-is-modal]').forEach(modal => {
            if (!isOnboardingModal(modal)) return;
            if (modal.style.display !== 'none') modal.style.setProperty('display', 'none', 'important');
            suppressed = true;
        });

        if (suppressed) {
            unlockPage();
            if (!wasHidden) {
                wasHidden = true;
                console.info(LOG, 'модалка онбординга скрыта, страница разблокирована');
            }
        } else {
            wasHidden = false;
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(enforce);
    }

    // SPA: модалка может появиться в любой момент и React может вернуть атрибуты
    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'aria-hidden', 'inert', 'data-replit-is-modal'],
    });
    setInterval(schedule, 500); // страховка от пропущенных мутаций

    if (enabled) injectCss();
    schedule();

    // ── Переключатель в меню менеджера скриптов ──────────────────────────────

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand(
            enabled
                ? 'Replit: показать онбординг (выключить скрипт)'
                : 'Replit: снова скрывать онбординг (включить скрипт)',
            () => {
                try { localStorage.setItem(STORE_KEY, enabled ? '0' : '1'); } catch { /* ignore */ }
                location.reload();
            }
        );
    }
})();