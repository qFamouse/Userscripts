// ==UserScript==
// @name         Onliner + Shop.by Prices
// @namespace    https://github.com/qFamouse/
// @version      1.2
// @description  Automatically shows shop.by prices in onliner.by product cards, with caching
// @description:ru Автоматически показывает цены с shop.by в карточках товаров onliner.by с кешированием
// @author       Famouse
// @license      MIT
// @match        https://catalog.onliner.by/*
// @match        https://www.onliner.by/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=onliner.by
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      shop.by
// @homepageURL  https://github.com/qFamouse/Userscripts/tree/master/scripts/onliner-shopby-prices
// @supportURL   https://github.com/qFamouse/Userscripts/issues
// @updateURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/onliner-shopby-prices/onliner-shopby-prices.user.js
// @downloadURL  https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/onliner-shopby-prices/onliner-shopby-prices.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Shop.by] Скрипт запущен');

    // Настройки кеширования
    const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 часов в миллисекундах
    const CACHE_KEY_PREFIX = 'shopby_cache_';

    // Функции работы с кешем
    function getCacheKey(productName) {
        // Используем Base64 для создания уникального ключа
        return CACHE_KEY_PREFIX + btoa(encodeURIComponent(productName)).replace(/[^a-zA-Z0-9]/g, '_');
    }

    function getCachedData(productName) {
        try {
            const cacheKey = getCacheKey(productName);
            const cached = GM_getValue(cacheKey, null);

            if (!cached) return null;

            const data = JSON.parse(cached);
            const now = Date.now();

            // Проверяем, не истек ли срок действия кеша
            if (now - data.timestamp > CACHE_DURATION) {
                GM_setValue(cacheKey, null); // Очищаем устаревший кеш
                console.log('[Shop.by] Кеш устарел для:', productName);
                return null;
            }

            console.log('[Shop.by] Данные взяты из кеша:', productName);
            return data.shopData;
        } catch (e) {
            console.error('[Shop.by] Ошибка чтения кеша:', e);
            return null;
        }
    }

    function setCachedData(productName, shopData) {
        try {
            const cacheKey = getCacheKey(productName);
            const cacheEntry = {
                timestamp: Date.now(),
                shopData: shopData
            };
            GM_setValue(cacheKey, JSON.stringify(cacheEntry));
            console.log('[Shop.by] Данные сохранены в кеш:', productName);
        } catch (e) {
            console.error('[Shop.by] Ошибка записи в кеш:', e);
        }
    }

    function clearOldCache() {
        // Очистка старого кеша при запуске (опционально)
        try {
            const allKeys = GM_getValue('cache_keys', '').split(',').filter(k => k);
            const now = Date.now();

            allKeys.forEach(key => {
                if (key.startsWith(CACHE_KEY_PREFIX)) {
                    const cached = GM_getValue(key, null);
                    if (cached) {
                        const data = JSON.parse(cached);
                        if (now - data.timestamp > CACHE_DURATION) {
                            GM_setValue(key, null);
                        }
                    }
                }
            });
        } catch (e) {
            console.error('[Shop.by] Ошибка очистки кеша:', e);
        }
    }

    function searchOnShopBy(productName) {
        const encodedName = encodeURIComponent(productName);
        const url = `https://shop.by/find/?findtext=${encodedName}&sort=price--number`;

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                headers: {
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "accept-language": "ru,en;q=0.9",
                    "referer": "https://shop.by/",
                    "user-agent": navigator.userAgent
                },
                anonymous: false,
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(response.responseText, 'text/html');

                            // Проверяем наличие результатов
                            const noResults = doc.querySelector('.PageFind__Noresults');
                            if (noResults) {
                                resolve(null);
                                return;
                            }

                            const modelList = doc.querySelector('.ModelList');
                            if (!modelList) {
                                resolve(null);
                                return;
                            }

                            // Ищем первую карточку (модель или товар магазина)
                            const modelCard = modelList.querySelector('.ModelList__ModelBlockItem');
                            const shopCard = modelList.querySelector('.ShopItemList__BlockItem');

                            const firstCard = modelCard || shopCard;
                            if (!firstCard) {
                                resolve(null);
                                return;
                            }

                            let price, shopCount;
                            const productUrl = url;

                            if (modelCard) {
                                // Карточка модели товара
                                const priceEl = modelCard.querySelector('.PriceBlock__PriceValue');
                                const countEl = modelCard.querySelector('.ModelList__CountShopsLink');

                                price = priceEl ? priceEl.textContent.replace(/\s+/g, ' ').trim() : null;

                                if (countEl) {
                                    shopCount = countEl.textContent.trim();
                                } else {
                                    // Подсчитываем количество карточек на странице
                                    const itemsOnPage = modelList.querySelectorAll('.ModelList__ModelBlockItem, .ShopItemList__BlockItem').length;

                                    // Проверяем наличие пагинации
                                    const pagination = doc.querySelector('.Paging__InnerPages');
                                    if (pagination) {
                                        const pageLinks = pagination.querySelectorAll('.Paging__PageLink:not(.Paging__DisabledFirstPage):not(.Paging__PageActive):not(.Paging__LastPage)');
                                        const totalPages = pageLinks.length + 1; // +1 за текущую страницу
                                        const estimatedTotal = itemsOnPage * totalPages;
                                        shopCount = `~${estimatedTotal} предложений`;
                                    } else {
                                        shopCount = `${itemsOnPage} ${itemsOnPage === 1 ? 'предложение' : itemsOnPage < 5 ? 'предложения' : 'предложений'}`;
                                    }
                                }
                            } else {
                                // Карточка товара от магазина
                                const priceEl = shopCard.querySelector('.PriceBlock__PriceFirst');

                                price = priceEl ? priceEl.textContent.replace(/\s+/g, ' ').trim() : null;

                                // Для товаров магазинов считаем все карточки
                                const totalItems = modelList.querySelectorAll('.ShopItemList__BlockItem').length;

                                const pagination = doc.querySelector('.Paging__InnerPages');
                                if (pagination) {
                                    const pageLinks = pagination.querySelectorAll('.Paging__PageLink:not(.Paging__DisabledFirstPage):not(.Paging__PageActive):not(.Paging__LastPage)');
                                    const totalPages = pageLinks.length + 1;
                                    const estimatedTotal = totalItems * totalPages;
                                    shopCount = `~${estimatedTotal} предложений`;
                                } else {
                                    shopCount = `${totalItems} ${totalItems === 1 ? 'предложение' : totalItems < 5 ? 'предложения' : 'предложений'}`;
                                }
                            }

                            if (price) {
                                resolve({
                                    price: price,
                                    url: productUrl,
                                    shopCount: shopCount || ''
                                });
                            } else {
                                resolve(null);
                            }

                        } catch (e) {
                            console.error('[Shop.by] Ошибка парсинга:', e);
                            reject(e);
                        }
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: reject
            });
        });
    }

    async function getShopByData(productName) {
        // Проверяем кеш
        const cached = getCachedData(productName);
        if (cached) {
            return cached;
        }

        // Если в кеше нет, делаем запрос
        console.log('[Shop.by] Запрос к API для:', productName);
        const shopData = await searchOnShopBy(productName);

        // Сохраняем результат в кеш (даже если null)
        setCachedData(productName, shopData);

        return shopData;
    }

    function extractProductName(container) {
        // Блок #1: catalog-form__offers-part_data
        let nameEl = container.querySelector('.catalog-form__offers-part_data .catalog-form__link');
        if (nameEl) {
            return nameEl.textContent.trim();
        }

        // Блок #2-3: product-summary__caption
        nameEl = container.querySelector('.product-summary__caption');
        if (nameEl) {
            return nameEl.textContent.trim();
        }

        // Блок #4: catalog-masthead__title
        nameEl = container.querySelector('.catalog-masthead__title');
        if (nameEl) {
            return nameEl.textContent.trim();
        }

        return null;
    }

    function addShopByPrice(container, shopData) {
        if (container.querySelector('.shopby-price-badge')) {
            return;
        }

        let insertTarget = null;

        // Блок #1: После цены в catalog-form__link
        const priceLink = container.querySelector('.catalog-form__offers-part_control .catalog-form__link');
        if (priceLink) {
            insertTarget = priceLink.parentElement;
        }

        // Блок #2-3: После product-summary__price
        if (!insertTarget) {
            insertTarget = container.querySelector('.product-summary__price');
        }

        // Блок #4: После первой цены product-aside__description
        if (!insertTarget) {
            const priceElements = document.querySelectorAll('.product-aside__description');
            for (let el of priceElements) {
                if (el.textContent.includes('р.') && el.textContent.trim().match(/^\d+[,\s\d]*р\./)) {
                    insertTarget = el;
                    break;
                }
            }
        }

        if (!insertTarget) {
            console.warn('[Shop.by] Не найдено место для вставки');
            return;
        }

        const badge = document.createElement('div');
        badge.className = 'shopby-price-badge';
        badge.style.cssText = `
            display: block;
            margin: 8px 0;
            padding: 8px 12px;
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            border-radius: 6px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        `;

        badge.innerHTML = `
            <a href="${shopData.url}" target="_blank" style="color: white; text-decoration: none; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600;">
                <span style="font-size: 16px;">🛒</span>
                <div>
                    <div>Shop.by: ${shopData.price}</div>
                    ${shopData.shopCount ? `<div style="font-size: 11px; opacity: 0.85; margin-top: 2px;">${shopData.shopCount}</div>` : ''}
                </div>
            </a>
        `;

        insertTarget.insertAdjacentElement('afterend', badge);
        console.log('[Shop.by] Цена добавлена:', shopData.price);
    }

    async function processCard(card) {
        if (card.dataset.shopbyProcessed === 'true') return;
        card.dataset.shopbyProcessed = 'true';

        const productName = extractProductName(card);
        if (!productName) {
            console.warn('[Shop.by] Не удалось извлечь название');
            return;
        }

        console.log('[Shop.by] Обработка:', productName);

        try {
            const shopData = await getShopByData(productName);
            if (shopData) {
                addShopByPrice(card, shopData);
            } else {
                console.log('[Shop.by] Товар не найден на shop.by');
            }
        } catch (error) {
            console.error('[Shop.by] Ошибка:', error);
        }
    }

    function findCards() {
        return [
            ...document.querySelectorAll('.catalog-form__offers-unit'),  // Блок #1
            ...document.querySelectorAll('.product-summary'),             // Блок #2-3
            ...document.querySelectorAll('.catalog-masthead')             // Блок #4
        ];
    }

    async function processAllCards() {
        const cards = findCards();
        console.log(`[Shop.by] Найдено карточек: ${cards.length}`);

        for (const card of cards) {
            await processCard(card);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    const observer = new MutationObserver(() => {
        processAllCards();
    });

    function init() {
        console.log('[Shop.by] Инициализация');
        clearOldCache(); // Очищаем старый кеш при запуске
        processAllCards();

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 2000); // Задержка для загрузки динамического контента
    }
})();