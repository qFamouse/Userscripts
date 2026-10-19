// ==UserScript==
// @name           Steam Workshop Multilang Editor
// @namespace      https://github.com/qFamouse/
// @version        1.15.0
// @description    In-page editor for a Steam Workshop item's title and description in all languages at once: sections, bulk editing of numbers, versions, links, names and flags across languages, diff, batch saving, save history
// @description:ru Встроенный редактор названия и описания мода в Мастерской Steam сразу для всех языков: секции, быстрая правка чисел, версий, ссылок, названий и флагов во всех языках, diff, пакетное сохранение, история сохранений
// @author         Famouse
// @license        MIT
// @match          https://steamcommunity.com/sharedfiles/itemedittext/*
// @icon           https://www.google.com/s2/favicons?sz=64&domain=steamcommunity.com
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_addStyle
// @run-at         document-idle
// @homepageURL    https://github.com/qFamouse/Userscripts/tree/master/scripts/steam-workshop-multilang-editor
// @supportURL     https://github.com/qFamouse/Userscripts/issues
// @updateURL      https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/steam-workshop-multilang-editor/steam-workshop-multilang-editor.user.js
// @downloadURL    https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/steam-workshop-multilang-editor/steam-workshop-multilang-editor.user.js
// ==/UserScript==

(function () {
'use strict';
if (window.__ptxLoaded) return;
window.__ptxLoaded = true;

// <core>
/* ───────────── Локализация интерфейса ───────────── */
// Язык интерфейса скрипта = язык Steam: g_strLanguage страницы → cookie Steam_Language → язык браузера → английский.
// Чего нет в словаре языка, берётся из английского.
const I18N = {
  en: {
    'lint.emptyTitle': 'Empty title — Steam won’t save it',
    'lint.titleLong': 'Title is longer than {max} characters ({n})',
    'lint.descLong': 'Description is longer than {max} characters ({n})',
    'lint.placeholders': 'Unexpanded placeholders left: {list}',
    'lint.unbalanced': 'Unbalanced tag [{tag}]: {o} opening, {c} closing',
    'lint.sameAsEn': 'Description is identical to English — not translated?',
    'lint.missSecs': 'Sections from English are missing: {list}',
    'lint.extraSecs': 'Extra sections (not in English): {list}',
    'lint.missUrls': 'Links from English are missing: {list}',
    'lint.extraUrls': 'Links not present in English: {list}',
    'lint.nums': 'Numbers differ from English (missing: {miss}; extra: {extra})',
    'err.noForm': 'No edit form on the page (session expired?)',
    'err.otherLang': 'Steam returned a different language ({id})',
    'err.load': 'Failed to load',
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.retry': 'Retry',
    'common.loading': 'Loading…',
    'common.changes': 'Changes',
    'common.title': 'Title',
    'common.desc': 'Description',
    'common.section': 'Section',
    'save.btn': 'Save…',
    'save.btnN': 'Save ({n})…',
    'side.noTr': 'no translation',
    'side.willCreate': 'A new translation will be created',
    'side.changed': 'Modified',
    'side.errors': 'Errors',
    'side.warnings': 'Warnings',
    'side.error': 'Error: {err}',
    'side.newTr': 'new translation — will be created',
    'side.updated': 'updated {when}',
    'side.never': 'never updated',
    'side.onlyDirty': 'modified only',
    'side.hideEmpty': 'hide untranslated',
    'side.filter': 'Filter languages',
    'tab.edit': 'Single language',
    'tab.grid': 'Section in all languages',
    'hist.btn': '↶ History',
    'hist.btnN': '↶ History ({n})',
    'hist.btnTip': 'Previous texts remembered before saving to Steam',
    'main.noLangs': 'Couldn’t find the language list on the page.',
    'ed.loadFailed': 'Failed to load: {err}',
    'ed.srcAria': 'Original (English)',
    'ed.srcLabel': 'Original (English), read-only',
    'ed.descLabel': 'Description — {name}',
    'ed.prevLabel': 'Preview (approximate)',
    'ed.diffLabel': 'Changes: before − / after +',
    'ed.noTrHead': 'There is no translation for this language. ',
    'ed.noTrText': 'Steam shows the English text; nothing is stored on the server for this language. ',
    'ed.willCreate': 'The translation will be created on save.',
    'ed.createTr': 'Create translation from English',
    'ed.takeEn': 'Copy title and text from English',
    'ed.takeEnConfirm': 'Replace this language’s title and description with the English ones?',
    'ed.revert': 'Discard edits',
    'ed.show': 'Show:',
    'ed.tgSrc': 'Original',
    'ed.tgPrev': 'Preview',
    'ed.diffTip': 'Highlight edits against the text in Steam, like git diff',
    'ed.sync': '⇅ Linked scroll',
    'ed.syncTip': 'Scroll the original, description and preview together; the position is kept when switching languages',
    'ed.lintOk': 'No issues',
    'grid.none': 'No sections found. A section is a block starting with [h2].',
    'grid.note': 'Edits go into each language’s description and wait to be saved.',
    'grid.noTr': 'No translation — this language is left untouched.',
    'grid.cellAria': '{name}: section {key}',
    'grid.noSec': 'This language has no such section.',
    'grid.addFromEn': 'Add from English',
    'load.progress': 'Loading languages: {done}/{total}…',
    'load.withErr': 'Loaded, errors: {n}',
    'load.all': 'All languages loaded ({n})',
    'load.noTr': ' · untranslated: {n}',
    'quick.title': '⚡ Shared data',
    'quick.collapse': 'Collapse',
    'quick.expand': 'Expand',
    'quick.badNum': 'Not a number. Write 100000 or 100,000 (exactly 3 digits after a separator).',
    'quick.badDec': 'Expected a value like 42.16 or 42.16.1',
    'quick.loading': 'Loading languages…',
    'quick.noSecs': 'No [h2] sections found.',
    'quick.apply': 'Apply to all',
    'quick.newLink': 'new link',
    'quick.keep': 'keep',
    'quick.replaceAria': 'Replace {what}',
    'quick.seenIn': 'Found in languages: {n}',
    'quick.intro': 'The section exists in {n} of {total} languages. Enter a new value — empty fields are left unchanged.',
    'quick.nums': 'Numbers, versions, dates',
    'quick.links': 'Links',
    'quick.names': 'Names',
    'quick.flagsAll': 'Flags: the whole list will be replaced',
    'quick.flagsHint': 'Flags: click to change the list',
    'quick.flagsReset': 'Reset flags',
    'quick.custom': 'Custom text (in this section, as is)',
    'quick.find': 'find',
    'quick.replaceWith': 'replace with',
    'quick.morePair': '+ another pair',
    'quick.done': 'Section {key}: languages changed — {n}{miss}. Review and save.',
    'quick.doneMiss': ', section missing in {n}',
    'diff.none': 'No changes',
    'diff.gap': '… {n} unchanged lines',
    'save.dlgTitle': 'Save to Steam',
    'save.newMark': 'new translation',
    'save.go': 'Save selected',
    'save.sumLangs': 'Languages changed: {n} · ',
    'save.lines': ' lines',
    'save.sumTitles': ' · titles: {n}',
    'save.sumNew': ' · new translations: {n}',
    'save.expandAll': 'Expand all',
    'save.collapseAll': 'Collapse all',
    'save.verify': 'After saving, re-download the language and verify the text',
    'save.dry': 'Dry run — send nothing to Steam',
    'save.histNote': 'Previous texts of the saved languages are remembered — you can restore them via “History”.',
    'save.sending': 'sending…',
    'save.dryRes': 'dry run: would send {n} chars',
    'save.justNow': 'just now',
    'save.sent': 'sent',
    'save.verified': 'saved, verified ✓',
    'save.mismatch': 'sent, but Steam returned different text — see the language’s “Changes”',
    'save.err': 'error: {err}',
    'save.done': 'Done: {ok} succeeded{bad}',
    'save.doneBad': ', problems: {n}',
    'hist.applied': '{label}: languages filled in — {n}. Review and save.',
    'hist.waitLoad': 'Wait for the languages to finish loading first',
    'hist.title': 'Save history',
    'hist.intro': 'Before each save to Steam, the previous texts of the saved languages are remembered here. “Restore” puts them into the editor — they reach Steam only after “Save”. In “Changes”, “+” is what will appear after restoring, “−” is what will disappear.',
    'hist.empty': 'No entries yet — the first one appears on the next save.',
    'hist.langs': ' · languages: {n}',
    'hist.diffTip': 'How this entry differs from the current text: {name}',
    'hist.restore': 'Restore: {name}',
    'hist.restoreAll': 'Restore all',
    'hist.restoreAllConfirm': 'Put the texts of all languages from this entry into the editor? Current edits of those languages will be replaced.',
    'hist.entry': 'Entry from {date}',
    'bar.rootAria': 'Title and description editor for all languages',
    'bar.native': '⇄ Original Steam form',
    'bar.nativeTip': 'Steam’s native form (the editor’s edits stay in memory)',
    'bar.reload': 'Reload',
    'bar.reloadConfirm': 'Unsaved edits will be lost. Continue?',
    'bar.toItem': '← Back to item',
    'native.note': 'The original Steam form is open. Unsaved editor edits are kept in memory.',
    'native.back': '← Back to the all-languages editor',
  },
  ru: {
    'lint.emptyTitle': 'Пустое название — Steam не даст сохранить',
    'lint.titleLong': 'Название длиннее {max} символов ({n})',
    'lint.descLong': 'Описание длиннее {max} символов ({n})',
    'lint.placeholders': 'Остались неразвёрнутые плейсхолдеры: {list}',
    'lint.unbalanced': 'Не сбалансирован тег [{tag}]: открывающих {o}, закрывающих {c}',
    'lint.sameAsEn': 'Описание совпадает с английским — не переведено?',
    'lint.missSecs': 'Нет секций как в английском: {list}',
    'lint.extraSecs': 'Лишние секции (нет в английском): {list}',
    'lint.missUrls': 'Нет ссылок из английского: {list}',
    'lint.extraUrls': 'Ссылки, которых нет в английском: {list}',
    'lint.nums': 'Числа расходятся с английским (нет: {miss}; лишние: {extra})',
    'err.noForm': 'На странице нет формы (сессия истекла?)',
    'err.otherLang': 'Steam вернул другой язык ({id})',
    'err.load': 'Не удалось загрузить',
    'common.close': 'Закрыть',
    'common.cancel': 'Отмена',
    'common.retry': 'Повторить',
    'common.loading': 'Загрузка…',
    'common.changes': 'Изменения',
    'common.title': 'Название',
    'common.desc': 'Описание',
    'common.section': 'Секция',
    'save.btn': 'Сохранить…',
    'save.btnN': 'Сохранить ({n})…',
    'side.noTr': 'нет перевода',
    'side.willCreate': 'Будет создан новый перевод',
    'side.changed': 'Изменено',
    'side.errors': 'Ошибки',
    'side.warnings': 'Предупреждения',
    'side.error': 'Ошибка: {err}',
    'side.newTr': 'новый перевод — будет создан',
    'side.updated': 'обновлено {when}',
    'side.never': 'не обновлялось',
    'side.onlyDirty': 'только изменённые',
    'side.hideEmpty': 'скрыть без перевода',
    'side.filter': 'Фильтр языков',
    'tab.edit': 'Один язык',
    'tab.grid': 'Секция во всех языках',
    'hist.btn': '↶ История',
    'hist.btnN': '↶ История ({n})',
    'hist.btnTip': 'Прежние тексты, запомненные перед сохранением в Steam',
    'main.noLangs': 'Не нашёл список языков на странице.',
    'ed.loadFailed': 'Не удалось загрузить: {err}',
    'ed.srcAria': 'Оригинал (английский)',
    'ed.srcLabel': 'Оригинал (английский), только чтение',
    'ed.descLabel': 'Описание — {name}',
    'ed.prevLabel': 'Предпросмотр (приблизительный)',
    'ed.diffLabel': 'Изменения: было − / стало +',
    'ed.noTrHead': 'Перевода на этот язык нет. ',
    'ed.noTrText': 'Steam показывает английский текст, на сервере для языка ничего не хранится. ',
    'ed.willCreate': 'При сохранении перевод будет создан.',
    'ed.createTr': 'Создать перевод из английского',
    'ed.takeEn': 'Взять название и текст из английского',
    'ed.takeEnConfirm': 'Заменить название и описание этого языка английскими?',
    'ed.revert': 'Отменить правки',
    'ed.show': 'Показать:',
    'ed.tgSrc': 'Оригинал',
    'ed.tgPrev': 'Предпросмотр',
    'ed.diffTip': 'Подсветка правок относительно текста в Steam, как в git diff',
    'ed.sync': '⇅ Общий скролл',
    'ed.syncTip': 'Синхронная прокрутка оригинала, описания и предпросмотра; позиция сохраняется при смене языка',
    'ed.lintOk': 'Замечаний нет',
    'grid.none': 'Секций не найдено. Секция — это блок, начинающийся с [h2].',
    'grid.note': 'Правки попадают в описание каждого языка и ждут сохранения.',
    'grid.noTr': 'Перевода нет — язык не затрагивается.',
    'grid.cellAria': '{name}: секция {key}',
    'grid.noSec': 'В этом языке секции нет.',
    'grid.addFromEn': 'Добавить из английского',
    'load.progress': 'Догрузка языков: {done}/{total}…',
    'load.withErr': 'Загружено, ошибок: {n}',
    'load.all': 'Все языки загружены ({n})',
    'load.noTr': ' · без перевода: {n}',
    'quick.title': '⚡ Общие данные',
    'quick.collapse': 'Свернуть',
    'quick.expand': 'Развернуть',
    'quick.badNum': 'Не число. Пишите 100000 или 100,000 (после разделителя ровно 3 цифры).',
    'quick.badDec': 'Нужно значение вида 42.16 или 42.16.1',
    'quick.loading': 'Загрузка языков…',
    'quick.noSecs': 'Секций [h2] не найдено.',
    'quick.apply': 'Применить ко всем',
    'quick.newLink': 'новая ссылка',
    'quick.keep': 'не менять',
    'quick.replaceAria': 'Заменить {what}',
    'quick.seenIn': 'Встречается в языков: {n}',
    'quick.intro': 'Секция есть в {n} из {total} языков. Впишите новое значение — пустое поле не меняется.',
    'quick.nums': 'Числа, версии, даты',
    'quick.links': 'Ссылки',
    'quick.names': 'Названия',
    'quick.flagsAll': 'Флаги: будет заменён весь список',
    'quick.flagsHint': 'Флаги: нажмите, чтобы изменить список',
    'quick.flagsReset': 'Сбросить флаги',
    'quick.custom': 'Свой текст (в этой секции, как есть)',
    'quick.find': 'найти',
    'quick.replaceWith': 'заменить на',
    'quick.morePair': '+ ещё пара',
    'quick.done': 'Секция {key}: изменено языков — {n}{miss}. Проверьте и сохраните.',
    'quick.doneMiss': ', секции нет в {n}',
    'diff.none': 'Изменений нет',
    'diff.gap': '… {n} строк без изменений',
    'save.dlgTitle': 'Сохранение в Steam',
    'save.newMark': 'новый перевод',
    'save.go': 'Сохранить выбранные',
    'save.sumLangs': 'Изменено языков: {n} · ',
    'save.lines': ' строк',
    'save.sumTitles': ' · названий: {n}',
    'save.sumNew': ' · новых переводов: {n}',
    'save.expandAll': 'Развернуть все',
    'save.collapseAll': 'Свернуть все',
    'save.verify': 'После сохранения скачать язык заново и сверить текст',
    'save.dry': 'Пробный прогон — ничего не отправлять в Steam',
    'save.histNote': 'Прежние тексты сохраняемых языков запоминаются — их можно вернуть через «История».',
    'save.sending': 'отправка…',
    'save.dryRes': 'пробный прогон: ушло бы {n} симв.',
    'save.justNow': 'только что',
    'save.sent': 'отправлено',
    'save.verified': 'сохранено, сверено ✓',
    'save.mismatch': 'отправлено, но Steam вернул другой текст — см. «Изменения» языка',
    'save.err': 'ошибка: {err}',
    'save.done': 'Готово: {ok} успешно{bad}',
    'save.doneBad': ', проблем: {n}',
    'hist.applied': '{label}: подставлено языков — {n}. Проверьте и сохраните.',
    'hist.waitLoad': 'Сначала дождитесь загрузки языков',
    'hist.title': 'История сохранений',
    'hist.intro': 'Перед каждым сохранением в Steam здесь запоминаются прежние тексты сохраняемых языков. «Вернуть» подставляет их в редактор — в Steam они уйдут только после «Сохранить». В «Изменениях» «+» — то, что появится после возврата, «−» — то, что исчезнет.',
    'hist.empty': 'Записей пока нет — первая появится при следующем сохранении.',
    'hist.langs': ' · языков: {n}',
    'hist.diffTip': 'Чем запись отличается от текущего текста: {name}',
    'hist.restore': 'Вернуть: {name}',
    'hist.restoreAll': 'Вернуть всё',
    'hist.restoreAllConfirm': 'Подставить в редактор тексты всех языков из этой записи? Текущие правки этих языков будут заменены.',
    'hist.entry': 'Запись от {date}',
    'bar.rootAria': 'Редактор названия и описания на всех языках',
    'bar.native': '⇄ Исходная форма Steam',
    'bar.nativeTip': 'Родная форма Steam (правки редактора остаются в памяти)',
    'bar.reload': 'Обновить',
    'bar.reloadConfirm': 'Несохранённые правки будут потеряны. Продолжить?',
    'bar.toItem': '← К предмету',
    'native.note': 'Открыта исходная форма Steam. Несохранённые правки редактора остались в памяти.',
    'native.back': '← Вернуться к редактору всех языков',
  },
  uk: {
    'lint.emptyTitle': 'Порожня назва — Steam не дасть зберегти',
    'lint.titleLong': 'Назва довша за {max} символів ({n})',
    'lint.descLong': 'Опис довший за {max} символів ({n})',
    'lint.placeholders': 'Залишилися нерозгорнуті плейсхолдери: {list}',
    'lint.unbalanced': 'Незбалансований тег [{tag}]: відкривних {o}, закривних {c}',
    'lint.sameAsEn': 'Опис збігається з англійським — не перекладено?',
    'lint.missSecs': 'Бракує секцій з англійської: {list}',
    'lint.extraSecs': 'Зайві секції (немає в англійській): {list}',
    'lint.missUrls': 'Бракує посилань з англійської: {list}',
    'lint.extraUrls': 'Посилання, яких немає в англійській: {list}',
    'lint.nums': 'Числа розходяться з англійською (бракує: {miss}; зайві: {extra})',
    'err.noForm': 'На сторінці немає форми (сесія закінчилася?)',
    'err.otherLang': 'Steam повернув іншу мову ({id})',
    'err.load': 'Не вдалося завантажити',
    'common.close': 'Закрити',
    'common.cancel': 'Скасувати',
    'common.retry': 'Повторити',
    'common.loading': 'Завантаження…',
    'common.changes': 'Зміни',
    'common.title': 'Назва',
    'common.desc': 'Опис',
    'common.section': 'Секція',
    'save.btn': 'Зберегти…',
    'save.btnN': 'Зберегти ({n})…',
    'side.noTr': 'немає перекладу',
    'side.willCreate': 'Буде створено новий переклад',
    'side.changed': 'Змінено',
    'side.errors': 'Помилки',
    'side.warnings': 'Попередження',
    'side.error': 'Помилка: {err}',
    'side.newTr': 'новий переклад — буде створено',
    'side.updated': 'оновлено {when}',
    'side.never': 'не оновлювалося',
    'side.onlyDirty': 'лише змінені',
    'side.hideEmpty': 'сховати без перекладу',
    'side.filter': 'Фільтр мов',
    'tab.edit': 'Одна мова',
    'tab.grid': 'Секція в усіх мовах',
    'hist.btn': '↶ Історія',
    'hist.btnN': '↶ Історія ({n})',
    'hist.btnTip': 'Попередні тексти, запам’ятані перед збереженням у Steam',
    'main.noLangs': 'Не знайшов список мов на сторінці.',
    'ed.loadFailed': 'Не вдалося завантажити: {err}',
    'ed.srcAria': 'Оригінал (англійська)',
    'ed.srcLabel': 'Оригінал (англійська), лише читання',
    'ed.descLabel': 'Опис — {name}',
    'ed.prevLabel': 'Попередній перегляд (приблизний)',
    'ed.diffLabel': 'Зміни: було − / стало +',
    'ed.noTrHead': 'Перекладу цією мовою немає. ',
    'ed.noTrText': 'Steam показує англійський текст, на сервері для цієї мови нічого не зберігається. ',
    'ed.willCreate': 'Під час збереження переклад буде створено.',
    'ed.createTr': 'Створити переклад з англійської',
    'ed.takeEn': 'Взяти назву й текст з англійської',
    'ed.takeEnConfirm': 'Замінити назву й опис цієї мови англійськими?',
    'ed.revert': 'Скасувати правки',
    'ed.show': 'Показати:',
    'ed.tgSrc': 'Оригінал',
    'ed.tgPrev': 'Перегляд',
    'ed.diffTip': 'Підсвічування правок відносно тексту в Steam, як у git diff',
    'ed.sync': '⇅ Спільне прокручування',
    'ed.syncTip': 'Синхронне прокручування оригіналу, опису й перегляду; позиція зберігається під час зміни мови',
    'ed.lintOk': 'Зауважень немає',
    'grid.none': 'Секцій не знайдено. Секція — це блок, що починається з [h2].',
    'grid.note': 'Правки потрапляють в опис кожної мови й чекають на збереження.',
    'grid.noTr': 'Перекладу немає — мову не зачеплено.',
    'grid.cellAria': '{name}: секція {key}',
    'grid.noSec': 'У цій мові секції немає.',
    'grid.addFromEn': 'Додати з англійської',
    'load.progress': 'Завантаження мов: {done}/{total}…',
    'load.withErr': 'Завантажено, помилок: {n}',
    'load.all': 'Усі мови завантажено ({n})',
    'load.noTr': ' · без перекладу: {n}',
    'quick.title': '⚡ Спільні дані',
    'quick.collapse': 'Згорнути',
    'quick.expand': 'Розгорнути',
    'quick.badNum': 'Не число. Пишіть 100000 або 100,000 (після роздільника рівно 3 цифри).',
    'quick.badDec': 'Потрібне значення на кшталт 42.16 або 42.16.1',
    'quick.loading': 'Завантаження мов…',
    'quick.noSecs': 'Секцій [h2] не знайдено.',
    'quick.apply': 'Застосувати до всіх',
    'quick.newLink': 'нове посилання',
    'quick.keep': 'не змінювати',
    'quick.replaceAria': 'Замінити {what}',
    'quick.seenIn': 'Трапляється в мовах: {n}',
    'quick.intro': 'Секція є в {n} з {total} мов. Впишіть нове значення — порожнє поле не змінюється.',
    'quick.nums': 'Числа, версії, дати',
    'quick.links': 'Посилання',
    'quick.names': 'Назви',
    'quick.flagsAll': 'Прапори: буде замінено весь список',
    'quick.flagsHint': 'Прапори: натисніть, щоб змінити список',
    'quick.flagsReset': 'Скинути прапори',
    'quick.custom': 'Свій текст (у цій секції, як є)',
    'quick.find': 'знайти',
    'quick.replaceWith': 'замінити на',
    'quick.morePair': '+ ще пара',
    'quick.done': 'Секція {key}: змінено мов — {n}{miss}. Перевірте й збережіть.',
    'quick.doneMiss': ', секції немає в {n}',
    'diff.none': 'Змін немає',
    'diff.gap': '… {n} рядків без змін',
    'save.dlgTitle': 'Збереження в Steam',
    'save.newMark': 'новий переклад',
    'save.go': 'Зберегти вибрані',
    'save.sumLangs': 'Змінено мов: {n} · ',
    'save.lines': ' рядків',
    'save.sumTitles': ' · назв: {n}',
    'save.sumNew': ' · нових перекладів: {n}',
    'save.expandAll': 'Розгорнути всі',
    'save.collapseAll': 'Згорнути всі',
    'save.verify': 'Після збереження завантажити мову знову й звірити текст',
    'save.dry': 'Пробний прогін — нічого не надсилати в Steam',
    'save.histNote': 'Попередні тексти мов, що зберігаються, запам’ятовуються — їх можна повернути через «Історія».',
    'save.sending': 'надсилання…',
    'save.dryRes': 'пробний прогін: було б надіслано {n} симв.',
    'save.justNow': 'щойно',
    'save.sent': 'надіслано',
    'save.verified': 'збережено, звірено ✓',
    'save.mismatch': 'надіслано, але Steam повернув інший текст — див. «Зміни» мови',
    'save.err': 'помилка: {err}',
    'save.done': 'Готово: {ok} успішно{bad}',
    'save.doneBad': ', проблем: {n}',
    'hist.applied': '{label}: підставлено мов — {n}. Перевірте й збережіть.',
    'hist.waitLoad': 'Спочатку дочекайтеся завантаження мов',
    'hist.title': 'Історія збережень',
    'hist.intro': 'Перед кожним збереженням у Steam тут запам’ятовуються попередні тексти мов, що зберігаються. «Повернути» підставляє їх у редактор — до Steam вони потраплять лише після «Зберегти». У «Змінах» «+» — те, що з’явиться після повернення, «−» — те, що зникне.',
    'hist.empty': 'Записів поки немає — перший з’явиться під час наступного збереження.',
    'hist.langs': ' · мов: {n}',
    'hist.diffTip': 'Чим запис відрізняється від поточного тексту: {name}',
    'hist.restore': 'Повернути: {name}',
    'hist.restoreAll': 'Повернути все',
    'hist.restoreAllConfirm': 'Підставити в редактор тексти всіх мов з цього запису? Поточні правки цих мов буде замінено.',
    'hist.entry': 'Запис від {date}',
    'bar.rootAria': 'Редактор назви й опису всіма мовами',
    'bar.native': '⇄ Початкова форма Steam',
    'bar.nativeTip': 'Рідна форма Steam (правки редактора залишаються в пам’яті)',
    'bar.reload': 'Оновити',
    'bar.reloadConfirm': 'Незбережені правки буде втрачено. Продовжити?',
    'bar.toItem': '← До предмета',
    'native.note': 'Відкрито початкову форму Steam. Незбережені правки редактора залишилися в пам’яті.',
    'native.back': '← Повернутися до редактора всіх мов',
  },
  'zh-CN': {
    'lint.emptyTitle': '标题为空 — Steam 无法保存',
    'lint.titleLong': '标题超过 {max} 个字符（{n}）',
    'lint.descLong': '描述超过 {max} 个字符（{n}）',
    'lint.placeholders': '仍有未展开的占位符：{list}',
    'lint.unbalanced': '标签 [{tag}] 不配对：开始 {o} 个，结束 {c} 个',
    'lint.sameAsEn': '描述与英文相同 — 尚未翻译？',
    'lint.missSecs': '缺少英文中的章节：{list}',
    'lint.extraSecs': '多余的章节（英文中没有）：{list}',
    'lint.missUrls': '缺少英文中的链接：{list}',
    'lint.extraUrls': '英文中没有的链接：{list}',
    'lint.nums': '数字与英文不一致（缺少：{miss}；多余：{extra}）',
    'err.noForm': '页面上没有编辑表单（会话已过期？）',
    'err.otherLang': 'Steam 返回了其他语言（{id}）',
    'err.load': '加载失败',
    'common.close': '关闭',
    'common.cancel': '取消',
    'common.retry': '重试',
    'common.loading': '加载中…',
    'common.changes': '更改',
    'common.title': '标题',
    'common.desc': '描述',
    'common.section': '章节',
    'save.btn': '保存…',
    'save.btnN': '保存（{n}）…',
    'side.noTr': '无翻译',
    'side.willCreate': '将创建新翻译',
    'side.changed': '已修改',
    'side.errors': '错误',
    'side.warnings': '警告',
    'side.error': '错误：{err}',
    'side.newTr': '新翻译 — 将被创建',
    'side.updated': '更新于 {when}',
    'side.never': '从未更新',
    'side.onlyDirty': '仅显示已修改',
    'side.hideEmpty': '隐藏未翻译',
    'side.filter': '筛选语言',
    'tab.edit': '单个语言',
    'tab.grid': '所有语言中的章节',
    'hist.btn': '↶ 历史',
    'hist.btnN': '↶ 历史（{n}）',
    'hist.btnTip': '保存到 Steam 前记录的旧文本',
    'main.noLangs': '在页面上找不到语言列表。',
    'ed.loadFailed': '加载失败：{err}',
    'ed.srcAria': '原文（英文）',
    'ed.srcLabel': '原文（英文），只读',
    'ed.descLabel': '描述 — {name}',
    'ed.prevLabel': '预览（近似）',
    'ed.diffLabel': '更改：之前 − / 之后 +',
    'ed.noTrHead': '此语言没有翻译。',
    'ed.noTrText': 'Steam 显示英文文本，服务器上没有为此语言存储任何内容。',
    'ed.willCreate': '保存时将创建翻译。',
    'ed.createTr': '从英文创建翻译',
    'ed.takeEn': '使用英文的标题和文本',
    'ed.takeEnConfirm': '用英文替换此语言的标题和描述？',
    'ed.revert': '放弃修改',
    'ed.show': '显示：',
    'ed.tgSrc': '原文',
    'ed.tgPrev': '预览',
    'ed.diffTip': '相对 Steam 中的文本高亮显示修改，类似 git diff',
    'ed.sync': '⇅ 同步滚动',
    'ed.syncTip': '原文、描述和预览同步滚动；切换语言时保留位置',
    'ed.lintOk': '没有问题',
    'grid.none': '未找到章节。章节是以 [h2] 开头的块。',
    'grid.note': '修改会写入每种语言的描述，等待保存。',
    'grid.noTr': '无翻译 — 不会改动此语言。',
    'grid.cellAria': '{name}：章节 {key}',
    'grid.noSec': '此语言中没有该章节。',
    'grid.addFromEn': '从英文添加',
    'load.progress': '正在加载语言：{done}/{total}…',
    'load.withErr': '已加载，错误：{n}',
    'load.all': '所有语言已加载（{n}）',
    'load.noTr': ' · 未翻译：{n}',
    'quick.title': '⚡ 共享数据',
    'quick.collapse': '收起',
    'quick.expand': '展开',
    'quick.badNum': '不是数字。请写 100000 或 100,000（分隔符后正好 3 位数字）。',
    'quick.badDec': '需要类似 42.16 或 42.16.1 的值',
    'quick.loading': '正在加载语言…',
    'quick.noSecs': '未找到 [h2] 章节。',
    'quick.apply': '应用到全部',
    'quick.newLink': '新链接',
    'quick.keep': '不更改',
    'quick.replaceAria': '替换 {what}',
    'quick.seenIn': '出现在语言数：{n}',
    'quick.intro': '该章节存在于 {total} 种语言中的 {n} 种。输入新值 — 空字段保持不变。',
    'quick.nums': '数字、版本、日期',
    'quick.links': '链接',
    'quick.names': '名称',
    'quick.flagsAll': '旗帜：将替换整个列表',
    'quick.flagsHint': '旗帜：点击以更改列表',
    'quick.flagsReset': '重置旗帜',
    'quick.custom': '自定义文本（在此章节中，原样替换）',
    'quick.find': '查找',
    'quick.replaceWith': '替换为',
    'quick.morePair': '+ 再加一组',
    'quick.done': '章节 {key}：已修改语言 — {n}{miss}。请检查并保存。',
    'quick.doneMiss': '，{n} 种语言中没有该章节',
    'diff.none': '没有更改',
    'diff.gap': '… {n} 行未更改',
    'save.dlgTitle': '保存到 Steam',
    'save.newMark': '新翻译',
    'save.go': '保存所选',
    'save.sumLangs': '已修改语言：{n} · ',
    'save.lines': ' 行',
    'save.sumTitles': ' · 标题：{n}',
    'save.sumNew': ' · 新翻译：{n}',
    'save.expandAll': '全部展开',
    'save.collapseAll': '全部收起',
    'save.verify': '保存后重新下载该语言并核对文本',
    'save.dry': '试运行 — 不向 Steam 发送任何内容',
    'save.histNote': '所保存语言的旧文本会被记录 — 可以通过“历史”恢复。',
    'save.sending': '发送中…',
    'save.dryRes': '试运行：将发送 {n} 个字符',
    'save.justNow': '刚刚',
    'save.sent': '已发送',
    'save.verified': '已保存，已核对 ✓',
    'save.mismatch': '已发送，但 Steam 返回了不同的文本 — 请查看该语言的“更改”',
    'save.err': '错误：{err}',
    'save.done': '完成：成功 {ok}{bad}',
    'save.doneBad': '，问题：{n}',
    'hist.applied': '{label}：已填入语言 — {n}。请检查并保存。',
    'hist.waitLoad': '请先等待语言加载完成',
    'hist.title': '保存历史',
    'hist.intro': '每次保存到 Steam 之前，这里会记录所保存语言的旧文本。“恢复”会把它们填入编辑器 — 只有点击“保存”后才会发送到 Steam。在“更改”中，“+”表示恢复后会出现的内容，“−”表示会消失的内容。',
    'hist.empty': '暂无记录 — 下次保存时会出现第一条。',
    'hist.langs': ' · 语言：{n}',
    'hist.diffTip': '此记录与当前文本的差异：{name}',
    'hist.restore': '恢复：{name}',
    'hist.restoreAll': '全部恢复',
    'hist.restoreAllConfirm': '将此记录中所有语言的文本填入编辑器？这些语言当前的修改将被替换。',
    'hist.entry': '{date} 的记录',
    'bar.rootAria': '所有语言的标题和描述编辑器',
    'bar.native': '⇄ Steam 原始表单',
    'bar.nativeTip': 'Steam 原生表单（编辑器中的修改保留在内存中）',
    'bar.reload': '刷新',
    'bar.reloadConfirm': '未保存的修改将丢失。继续？',
    'bar.toItem': '← 返回物品',
    'native.note': '已打开 Steam 原始表单。编辑器中未保存的修改仍保留在内存中。',
    'native.back': '← 返回多语言编辑器',
  },
  'zh-TW': {
    'lint.emptyTitle': '標題為空 — Steam 無法儲存',
    'lint.titleLong': '標題超過 {max} 個字元（{n}）',
    'lint.descLong': '描述超過 {max} 個字元（{n}）',
    'lint.placeholders': '仍有未展開的預留位置：{list}',
    'lint.unbalanced': '標籤 [{tag}] 不成對：開始 {o} 個，結束 {c} 個',
    'lint.sameAsEn': '描述與英文相同 — 尚未翻譯？',
    'lint.missSecs': '缺少英文中的章節：{list}',
    'lint.extraSecs': '多餘的章節（英文中沒有）：{list}',
    'lint.missUrls': '缺少英文中的連結：{list}',
    'lint.extraUrls': '英文中沒有的連結：{list}',
    'lint.nums': '數字與英文不一致（缺少：{miss}；多餘：{extra}）',
    'err.noForm': '頁面上沒有編輯表單（工作階段已過期？）',
    'err.otherLang': 'Steam 傳回了其他語言（{id}）',
    'err.load': '載入失敗',
    'common.close': '關閉',
    'common.cancel': '取消',
    'common.retry': '重試',
    'common.loading': '載入中…',
    'common.changes': '變更',
    'common.title': '標題',
    'common.desc': '描述',
    'common.section': '章節',
    'save.btn': '儲存…',
    'save.btnN': '儲存（{n}）…',
    'side.noTr': '無翻譯',
    'side.willCreate': '將建立新翻譯',
    'side.changed': '已修改',
    'side.errors': '錯誤',
    'side.warnings': '警告',
    'side.error': '錯誤：{err}',
    'side.newTr': '新翻譯 — 將被建立',
    'side.updated': '更新於 {when}',
    'side.never': '從未更新',
    'side.onlyDirty': '僅顯示已修改',
    'side.hideEmpty': '隱藏未翻譯',
    'side.filter': '篩選語言',
    'tab.edit': '單一語言',
    'tab.grid': '所有語言中的章節',
    'hist.btn': '↶ 歷史',
    'hist.btnN': '↶ 歷史（{n}）',
    'hist.btnTip': '儲存到 Steam 前記錄的舊文字',
    'main.noLangs': '在頁面上找不到語言清單。',
    'ed.loadFailed': '載入失敗：{err}',
    'ed.srcAria': '原文（英文）',
    'ed.srcLabel': '原文（英文），唯讀',
    'ed.descLabel': '描述 — {name}',
    'ed.prevLabel': '預覽（近似）',
    'ed.diffLabel': '變更：之前 − / 之後 +',
    'ed.noTrHead': '此語言沒有翻譯。',
    'ed.noTrText': 'Steam 顯示英文文字，伺服器上沒有為此語言儲存任何內容。',
    'ed.willCreate': '儲存時將建立翻譯。',
    'ed.createTr': '從英文建立翻譯',
    'ed.takeEn': '使用英文的標題和文字',
    'ed.takeEnConfirm': '用英文取代此語言的標題和描述？',
    'ed.revert': '捨棄修改',
    'ed.show': '顯示：',
    'ed.tgSrc': '原文',
    'ed.tgPrev': '預覽',
    'ed.diffTip': '相對 Steam 中的文字醒目提示修改，類似 git diff',
    'ed.sync': '⇅ 同步捲動',
    'ed.syncTip': '原文、描述和預覽同步捲動；切換語言時保留位置',
    'ed.lintOk': '沒有問題',
    'grid.none': '找不到章節。章節是以 [h2] 開頭的區塊。',
    'grid.note': '修改會寫入每種語言的描述，等待儲存。',
    'grid.noTr': '無翻譯 — 不會變動此語言。',
    'grid.cellAria': '{name}：章節 {key}',
    'grid.noSec': '此語言中沒有該章節。',
    'grid.addFromEn': '從英文新增',
    'load.progress': '正在載入語言：{done}/{total}…',
    'load.withErr': '已載入，錯誤：{n}',
    'load.all': '所有語言已載入（{n}）',
    'load.noTr': ' · 未翻譯：{n}',
    'quick.title': '⚡ 共用資料',
    'quick.collapse': '收合',
    'quick.expand': '展開',
    'quick.badNum': '不是數字。請寫 100000 或 100,000（分隔符號後正好 3 位數字）。',
    'quick.badDec': '需要類似 42.16 或 42.16.1 的值',
    'quick.loading': '正在載入語言…',
    'quick.noSecs': '找不到 [h2] 章節。',
    'quick.apply': '套用到全部',
    'quick.newLink': '新連結',
    'quick.keep': '不變更',
    'quick.replaceAria': '取代 {what}',
    'quick.seenIn': '出現的語言數：{n}',
    'quick.intro': '該章節存在於 {total} 種語言中的 {n} 種。輸入新值 — 空白欄位保持不變。',
    'quick.nums': '數字、版本、日期',
    'quick.links': '連結',
    'quick.names': '名稱',
    'quick.flagsAll': '旗幟：將取代整個清單',
    'quick.flagsHint': '旗幟：點擊以變更清單',
    'quick.flagsReset': '重設旗幟',
    'quick.custom': '自訂文字（在此章節中，原樣取代）',
    'quick.find': '尋找',
    'quick.replaceWith': '取代為',
    'quick.morePair': '+ 再加一組',
    'quick.done': '章節 {key}：已修改語言 — {n}{miss}。請檢查並儲存。',
    'quick.doneMiss': '，{n} 種語言中沒有該章節',
    'diff.none': '沒有變更',
    'diff.gap': '… {n} 行未變更',
    'save.dlgTitle': '儲存到 Steam',
    'save.newMark': '新翻譯',
    'save.go': '儲存所選',
    'save.sumLangs': '已修改語言：{n} · ',
    'save.lines': ' 行',
    'save.sumTitles': ' · 標題：{n}',
    'save.sumNew': ' · 新翻譯：{n}',
    'save.expandAll': '全部展開',
    'save.collapseAll': '全部收合',
    'save.verify': '儲存後重新下載該語言並核對文字',
    'save.dry': '試執行 — 不向 Steam 傳送任何內容',
    'save.histNote': '所儲存語言的舊文字會被記錄 — 可以透過「歷史」還原。',
    'save.sending': '傳送中…',
    'save.dryRes': '試執行：將傳送 {n} 個字元',
    'save.justNow': '剛剛',
    'save.sent': '已傳送',
    'save.verified': '已儲存，已核對 ✓',
    'save.mismatch': '已傳送，但 Steam 傳回了不同的文字 — 請查看該語言的「變更」',
    'save.err': '錯誤：{err}',
    'save.done': '完成：成功 {ok}{bad}',
    'save.doneBad': '，問題：{n}',
    'hist.applied': '{label}：已填入語言 — {n}。請檢查並儲存。',
    'hist.waitLoad': '請先等待語言載入完成',
    'hist.title': '儲存歷史',
    'hist.intro': '每次儲存到 Steam 之前，這裡會記錄所儲存語言的舊文字。「還原」會把它們填入編輯器 — 只有點擊「儲存」後才會傳送到 Steam。在「變更」中，「+」表示還原後會出現的內容，「−」表示會消失的內容。',
    'hist.empty': '暫無記錄 — 下次儲存時會出現第一筆。',
    'hist.langs': ' · 語言：{n}',
    'hist.diffTip': '此記錄與目前文字的差異：{name}',
    'hist.restore': '還原：{name}',
    'hist.restoreAll': '全部還原',
    'hist.restoreAllConfirm': '將此記錄中所有語言的文字填入編輯器？這些語言目前的修改將被取代。',
    'hist.entry': '{date} 的記錄',
    'bar.rootAria': '所有語言的標題和描述編輯器',
    'bar.native': '⇄ Steam 原始表單',
    'bar.nativeTip': 'Steam 原生表單（編輯器中的修改保留在記憶體中）',
    'bar.reload': '重新整理',
    'bar.reloadConfirm': '未儲存的修改將遺失。繼續？',
    'bar.toItem': '← 返回物品',
    'native.note': '已開啟 Steam 原始表單。編輯器中未儲存的修改仍保留在記憶體中。',
    'native.back': '← 返回多語言編輯器',
  },
  ja: {
    'lint.emptyTitle': 'タイトルが空です — Steam で保存できません',
    'lint.titleLong': 'タイトルが {max} 文字を超えています（{n}）',
    'lint.descLong': '説明が {max} 文字を超えています（{n}）',
    'lint.placeholders': '展開されていないプレースホルダーがあります：{list}',
    'lint.unbalanced': 'タグ [{tag}] の対応が取れていません：開始 {o}、終了 {c}',
    'lint.sameAsEn': '説明が英語と同じです — 未翻訳では？',
    'lint.missSecs': '英語にあるセクションがありません：{list}',
    'lint.extraSecs': '余分なセクション（英語にはない）：{list}',
    'lint.missUrls': '英語にあるリンクがありません：{list}',
    'lint.extraUrls': '英語にないリンク：{list}',
    'lint.nums': '数値が英語と一致しません（不足：{miss}、余分：{extra}）',
    'err.noForm': 'ページに編集フォームがありません（セッション切れ？）',
    'err.otherLang': 'Steam が別の言語を返しました（{id}）',
    'err.load': '読み込みに失敗しました',
    'common.close': '閉じる',
    'common.cancel': 'キャンセル',
    'common.retry': '再試行',
    'common.loading': '読み込み中…',
    'common.changes': '変更',
    'common.title': 'タイトル',
    'common.desc': '説明',
    'common.section': 'セクション',
    'save.btn': '保存…',
    'save.btnN': '保存（{n}）…',
    'side.noTr': '翻訳なし',
    'side.willCreate': '新しい翻訳が作成されます',
    'side.changed': '変更あり',
    'side.errors': 'エラー',
    'side.warnings': '警告',
    'side.error': 'エラー：{err}',
    'side.newTr': '新しい翻訳 — 作成されます',
    'side.updated': '更新：{when}',
    'side.never': '未更新',
    'side.onlyDirty': '変更ありのみ',
    'side.hideEmpty': '未翻訳を隠す',
    'side.filter': '言語を絞り込む',
    'tab.edit': '1 言語',
    'tab.grid': '全言語のセクション',
    'hist.btn': '↶ 履歴',
    'hist.btnN': '↶ 履歴（{n}）',
    'hist.btnTip': 'Steam に保存する前に記録された以前のテキスト',
    'main.noLangs': 'ページに言語リストが見つかりません。',
    'ed.loadFailed': '読み込みに失敗しました：{err}',
    'ed.srcAria': '原文（英語）',
    'ed.srcLabel': '原文（英語）、読み取り専用',
    'ed.descLabel': '説明 — {name}',
    'ed.prevLabel': 'プレビュー（おおよそ）',
    'ed.diffLabel': '変更：変更前 − / 変更後 +',
    'ed.noTrHead': 'この言語の翻訳はありません。',
    'ed.noTrText': 'Steam は英語のテキストを表示しており、この言語のデータはサーバーに保存されていません。',
    'ed.willCreate': '保存時に翻訳が作成されます。',
    'ed.createTr': '英語から翻訳を作成',
    'ed.takeEn': '英語のタイトルとテキストを使う',
    'ed.takeEnConfirm': 'この言語のタイトルと説明を英語のものに置き換えますか？',
    'ed.revert': '変更を破棄',
    'ed.show': '表示：',
    'ed.tgSrc': '原文',
    'ed.tgPrev': 'プレビュー',
    'ed.diffTip': 'Steam のテキストに対する変更をハイライト（git diff のように）',
    'ed.sync': '⇅ スクロール連動',
    'ed.syncTip': '原文・説明・プレビューを同時にスクロール。言語を切り替えても位置を保持します',
    'ed.lintOk': '問題はありません',
    'grid.none': 'セクションが見つかりません。セクションとは [h2] で始まるブロックです。',
    'grid.note': '変更は各言語の説明に反映され、保存を待ちます。',
    'grid.noTr': '翻訳なし — この言語は変更されません。',
    'grid.cellAria': '{name}：セクション {key}',
    'grid.noSec': 'この言語にはこのセクションがありません。',
    'grid.addFromEn': '英語から追加',
    'load.progress': '言語を読み込み中：{done}/{total}…',
    'load.withErr': '読み込み完了、エラー：{n}',
    'load.all': 'すべての言語を読み込みました（{n}）',
    'load.noTr': ' · 未翻訳：{n}',
    'quick.title': '⚡ 共通データ',
    'quick.collapse': '折りたたむ',
    'quick.expand': '展開',
    'quick.badNum': '数値ではありません。100000 または 100,000 と入力してください（区切りの後はちょうど 3 桁）。',
    'quick.badDec': '42.16 や 42.16.1 のような値が必要です',
    'quick.loading': '言語を読み込み中…',
    'quick.noSecs': '[h2] セクションが見つかりません。',
    'quick.apply': 'すべてに適用',
    'quick.newLink': '新しいリンク',
    'quick.keep': '変更しない',
    'quick.replaceAria': '{what} を置換',
    'quick.seenIn': '出現する言語数：{n}',
    'quick.intro': 'このセクションは {total} 言語中 {n} 言語にあります。新しい値を入力してください — 空欄は変更されません。',
    'quick.nums': '数値・バージョン・日付',
    'quick.links': 'リンク',
    'quick.names': '名前',
    'quick.flagsAll': '国旗：リスト全体が置き換えられます',
    'quick.flagsHint': '国旗：クリックしてリストを変更',
    'quick.flagsReset': '国旗をリセット',
    'quick.custom': '任意のテキスト（このセクション内でそのまま置換）',
    'quick.find': '検索',
    'quick.replaceWith': '置換後',
    'quick.morePair': '+ もう 1 組',
    'quick.done': 'セクション {key}：変更した言語 — {n}{miss}。確認して保存してください。',
    'quick.doneMiss': '、{n} 言語にセクションなし',
    'diff.none': '変更はありません',
    'diff.gap': '… 変更のない {n} 行',
    'save.dlgTitle': 'Steam に保存',
    'save.newMark': '新しい翻訳',
    'save.go': '選択したものを保存',
    'save.sumLangs': '変更した言語：{n} · ',
    'save.lines': ' 行',
    'save.sumTitles': ' · タイトル：{n}',
    'save.sumNew': ' · 新しい翻訳：{n}',
    'save.expandAll': 'すべて展開',
    'save.collapseAll': 'すべて折りたたむ',
    'save.verify': '保存後に言語を再ダウンロードしてテキストを照合する',
    'save.dry': 'テスト実行 — Steam には何も送信しない',
    'save.histNote': '保存する言語の以前のテキストは記録されます — 「履歴」から元に戻せます。',
    'save.sending': '送信中…',
    'save.dryRes': 'テスト実行：{n} 文字を送信する予定',
    'save.justNow': 'たった今',
    'save.sent': '送信済み',
    'save.verified': '保存済み、照合済み ✓',
    'save.mismatch': '送信しましたが、Steam が別のテキストを返しました — その言語の「変更」を確認してください',
    'save.err': 'エラー：{err}',
    'save.done': '完了：成功 {ok}{bad}',
    'save.doneBad': '、問題：{n}',
    'hist.applied': '{label}：反映した言語 — {n}。確認して保存してください。',
    'hist.waitLoad': '先に言語の読み込みが終わるまでお待ちください',
    'hist.title': '保存履歴',
    'hist.intro': 'Steam に保存するたびに、保存する言語の以前のテキストがここに記録されます。「元に戻す」はそれをエディターに反映します — Steam に送られるのは「保存」の後だけです。「変更」では「+」が元に戻した後に現れる部分、「−」が消える部分です。',
    'hist.empty': 'まだ記録はありません — 次回の保存時に最初の記録が作成されます。',
    'hist.langs': ' · 言語：{n}',
    'hist.diffTip': 'この記録と現在のテキストの違い：{name}',
    'hist.restore': '元に戻す：{name}',
    'hist.restoreAll': 'すべて元に戻す',
    'hist.restoreAllConfirm': 'この記録のすべての言語のテキストをエディターに反映しますか？これらの言語の現在の変更は置き換えられます。',
    'hist.entry': '{date} の記録',
    'bar.rootAria': '全言語のタイトルと説明のエディター',
    'bar.native': '⇄ Steam の元のフォーム',
    'bar.nativeTip': 'Steam 標準のフォーム（エディターの変更はメモリに残ります）',
    'bar.reload': '再読み込み',
    'bar.reloadConfirm': '保存されていない変更は失われます。続行しますか？',
    'bar.toItem': '← アイテムに戻る',
    'native.note': 'Steam の元のフォームを開いています。エディターの未保存の変更はメモリに残っています。',
    'native.back': '← 全言語エディターに戻る',
  },
  ko: {
    'lint.emptyTitle': '제목이 비어 있음 — Steam에서 저장할 수 없습니다',
    'lint.titleLong': '제목이 {max}자를 넘습니다 ({n})',
    'lint.descLong': '설명이 {max}자를 넘습니다 ({n})',
    'lint.placeholders': '펼쳐지지 않은 자리 표시자가 남아 있습니다: {list}',
    'lint.unbalanced': '[{tag}] 태그의 짝이 맞지 않습니다: 여는 태그 {o}, 닫는 태그 {c}',
    'lint.sameAsEn': '설명이 영어와 같습니다 — 번역되지 않았나요?',
    'lint.missSecs': '영어에 있는 섹션이 없습니다: {list}',
    'lint.extraSecs': '불필요한 섹션 (영어에 없음): {list}',
    'lint.missUrls': '영어에 있는 링크가 없습니다: {list}',
    'lint.extraUrls': '영어에 없는 링크: {list}',
    'lint.nums': '숫자가 영어와 다릅니다 (없음: {miss}; 추가: {extra})',
    'err.noForm': '페이지에 편집 양식이 없습니다 (세션 만료?)',
    'err.otherLang': 'Steam이 다른 언어를 반환했습니다 ({id})',
    'err.load': '불러오지 못했습니다',
    'common.close': '닫기',
    'common.cancel': '취소',
    'common.retry': '다시 시도',
    'common.loading': '불러오는 중…',
    'common.changes': '변경 사항',
    'common.title': '제목',
    'common.desc': '설명',
    'common.section': '섹션',
    'save.btn': '저장…',
    'save.btnN': '저장 ({n})…',
    'side.noTr': '번역 없음',
    'side.willCreate': '새 번역이 생성됩니다',
    'side.changed': '수정됨',
    'side.errors': '오류',
    'side.warnings': '경고',
    'side.error': '오류: {err}',
    'side.newTr': '새 번역 — 생성 예정',
    'side.updated': '업데이트: {when}',
    'side.never': '업데이트된 적 없음',
    'side.onlyDirty': '수정된 것만',
    'side.hideEmpty': '번역 없는 언어 숨기기',
    'side.filter': '언어 필터',
    'tab.edit': '단일 언어',
    'tab.grid': '모든 언어의 섹션',
    'hist.btn': '↶ 기록',
    'hist.btnN': '↶ 기록 ({n})',
    'hist.btnTip': 'Steam에 저장하기 전에 보관된 이전 텍스트',
    'main.noLangs': '페이지에서 언어 목록을 찾을 수 없습니다.',
    'ed.loadFailed': '불러오지 못했습니다: {err}',
    'ed.srcAria': '원문 (영어)',
    'ed.srcLabel': '원문 (영어), 읽기 전용',
    'ed.descLabel': '설명 — {name}',
    'ed.prevLabel': '미리 보기 (대략적)',
    'ed.diffLabel': '변경 사항: 이전 − / 이후 +',
    'ed.noTrHead': '이 언어의 번역이 없습니다. ',
    'ed.noTrText': 'Steam은 영어 텍스트를 표시하며, 서버에는 이 언어로 저장된 내용이 없습니다. ',
    'ed.willCreate': '저장하면 번역이 생성됩니다.',
    'ed.createTr': '영어에서 번역 만들기',
    'ed.takeEn': '영어 제목과 텍스트 가져오기',
    'ed.takeEnConfirm': '이 언어의 제목과 설명을 영어로 바꿀까요?',
    'ed.revert': '수정 취소',
    'ed.show': '표시:',
    'ed.tgSrc': '원문',
    'ed.tgPrev': '미리 보기',
    'ed.diffTip': 'Steam의 텍스트 대비 수정 사항 강조 (git diff처럼)',
    'ed.sync': '⇅ 스크롤 연동',
    'ed.syncTip': '원문, 설명, 미리 보기를 함께 스크롤합니다. 언어를 바꿔도 위치가 유지됩니다',
    'ed.lintOk': '문제 없음',
    'grid.none': '섹션을 찾을 수 없습니다. 섹션은 [h2]로 시작하는 블록입니다.',
    'grid.note': '수정 사항은 각 언어의 설명에 반영되며 저장을 기다립니다.',
    'grid.noTr': '번역 없음 — 이 언어는 변경되지 않습니다.',
    'grid.cellAria': '{name}: 섹션 {key}',
    'grid.noSec': '이 언어에는 해당 섹션이 없습니다.',
    'grid.addFromEn': '영어에서 추가',
    'load.progress': '언어 불러오는 중: {done}/{total}…',
    'load.withErr': '불러옴, 오류: {n}',
    'load.all': '모든 언어를 불러왔습니다 ({n})',
    'load.noTr': ' · 번역 없음: {n}',
    'quick.title': '⚡ 공통 데이터',
    'quick.collapse': '접기',
    'quick.expand': '펼치기',
    'quick.badNum': '숫자가 아닙니다. 100000 또는 100,000으로 입력하세요 (구분자 뒤에 정확히 3자리).',
    'quick.badDec': '42.16 또는 42.16.1 같은 값이 필요합니다',
    'quick.loading': '언어 불러오는 중…',
    'quick.noSecs': '[h2] 섹션을 찾을 수 없습니다.',
    'quick.apply': '모두에 적용',
    'quick.newLink': '새 링크',
    'quick.keep': '변경 안 함',
    'quick.replaceAria': '{what} 바꾸기',
    'quick.seenIn': '등장하는 언어 수: {n}',
    'quick.intro': '이 섹션은 {total}개 언어 중 {n}개에 있습니다. 새 값을 입력하세요 — 빈 칸은 변경되지 않습니다.',
    'quick.nums': '숫자, 버전, 날짜',
    'quick.links': '링크',
    'quick.names': '이름',
    'quick.flagsAll': '국기: 전체 목록이 교체됩니다',
    'quick.flagsHint': '국기: 클릭하여 목록 변경',
    'quick.flagsReset': '국기 초기화',
    'quick.custom': '사용자 텍스트 (이 섹션에서 그대로 바꾸기)',
    'quick.find': '찾기',
    'quick.replaceWith': '바꿀 내용',
    'quick.morePair': '+ 한 쌍 더',
    'quick.done': '섹션 {key}: 변경된 언어 — {n}{miss}. 확인 후 저장하세요.',
    'quick.doneMiss': ', {n}개 언어에 섹션 없음',
    'diff.none': '변경 사항 없음',
    'diff.gap': '… 변경 없는 {n}줄',
    'save.dlgTitle': 'Steam에 저장',
    'save.newMark': '새 번역',
    'save.go': '선택 항목 저장',
    'save.sumLangs': '변경된 언어: {n} · ',
    'save.lines': '줄',
    'save.sumTitles': ' · 제목: {n}',
    'save.sumNew': ' · 새 번역: {n}',
    'save.expandAll': '모두 펼치기',
    'save.collapseAll': '모두 접기',
    'save.verify': '저장 후 언어를 다시 내려받아 텍스트 대조',
    'save.dry': '시험 실행 — Steam에 아무것도 보내지 않음',
    'save.histNote': '저장하는 언어의 이전 텍스트는 보관되며 “기록”에서 되돌릴 수 있습니다.',
    'save.sending': '보내는 중…',
    'save.dryRes': '시험 실행: {n}자를 보낼 예정',
    'save.justNow': '방금',
    'save.sent': '보냄',
    'save.verified': '저장됨, 대조 완료 ✓',
    'save.mismatch': '보냈지만 Steam이 다른 텍스트를 반환했습니다 — 해당 언어의 “변경 사항”을 확인하세요',
    'save.err': '오류: {err}',
    'save.done': '완료: 성공 {ok}{bad}',
    'save.doneBad': ', 문제: {n}',
    'hist.applied': '{label}: 반영된 언어 — {n}. 확인 후 저장하세요.',
    'hist.waitLoad': '먼저 언어를 모두 불러올 때까지 기다리세요',
    'hist.title': '저장 기록',
    'hist.intro': 'Steam에 저장할 때마다 저장하는 언어의 이전 텍스트가 여기에 보관됩니다. “되돌리기”는 이를 편집기에 넣으며, “저장”을 눌러야 Steam에 반영됩니다. “변경 사항”에서 “+”는 되돌린 후 나타날 내용, “−”는 사라질 내용입니다.',
    'hist.empty': '아직 기록이 없습니다 — 다음 저장 시 첫 기록이 생깁니다.',
    'hist.langs': ' · 언어: {n}',
    'hist.diffTip': '이 기록과 현재 텍스트의 차이: {name}',
    'hist.restore': '되돌리기: {name}',
    'hist.restoreAll': '모두 되돌리기',
    'hist.restoreAllConfirm': '이 기록의 모든 언어 텍스트를 편집기에 넣을까요? 해당 언어의 현재 수정 사항은 교체됩니다.',
    'hist.entry': '{date} 기록',
    'bar.rootAria': '모든 언어의 제목 및 설명 편집기',
    'bar.native': '⇄ Steam 원래 양식',
    'bar.nativeTip': 'Steam 기본 양식 (편집기의 수정 사항은 메모리에 남아 있음)',
    'bar.reload': '새로 고침',
    'bar.reloadConfirm': '저장하지 않은 수정 사항이 사라집니다. 계속할까요?',
    'bar.toItem': '← 아이템으로',
    'native.note': 'Steam 원래 양식이 열려 있습니다. 편집기의 저장하지 않은 수정 사항은 메모리에 남아 있습니다.',
    'native.back': '← 전체 언어 편집기로 돌아가기',
  },
  de: {
    'lint.emptyTitle': 'Leerer Titel — Steam lässt nicht speichern',
    'lint.titleLong': 'Titel ist länger als {max} Zeichen ({n})',
    'lint.descLong': 'Beschreibung ist länger als {max} Zeichen ({n})',
    'lint.placeholders': 'Nicht aufgelöste Platzhalter übrig: {list}',
    'lint.unbalanced': 'Unausgeglichenes Tag [{tag}]: {o} öffnende, {c} schließende',
    'lint.sameAsEn': 'Beschreibung ist identisch mit Englisch — nicht übersetzt?',
    'lint.missSecs': 'Abschnitte aus dem Englischen fehlen: {list}',
    'lint.extraSecs': 'Zusätzliche Abschnitte (nicht im Englischen): {list}',
    'lint.missUrls': 'Links aus dem Englischen fehlen: {list}',
    'lint.extraUrls': 'Links, die im Englischen fehlen: {list}',
    'lint.nums': 'Zahlen weichen vom Englischen ab (fehlen: {miss}; zusätzlich: {extra})',
    'err.noForm': 'Kein Bearbeitungsformular auf der Seite (Sitzung abgelaufen?)',
    'err.otherLang': 'Steam hat eine andere Sprache geliefert ({id})',
    'err.load': 'Laden fehlgeschlagen',
    'common.close': 'Schließen',
    'common.cancel': 'Abbrechen',
    'common.retry': 'Erneut versuchen',
    'common.loading': 'Wird geladen…',
    'common.changes': 'Änderungen',
    'common.title': 'Titel',
    'common.desc': 'Beschreibung',
    'common.section': 'Abschnitt',
    'save.btn': 'Speichern…',
    'save.btnN': 'Speichern ({n})…',
    'side.noTr': 'keine Übersetzung',
    'side.willCreate': 'Eine neue Übersetzung wird erstellt',
    'side.changed': 'Geändert',
    'side.errors': 'Fehler',
    'side.warnings': 'Warnungen',
    'side.error': 'Fehler: {err}',
    'side.newTr': 'neue Übersetzung — wird erstellt',
    'side.updated': 'aktualisiert {when}',
    'side.never': 'nie aktualisiert',
    'side.onlyDirty': 'nur geänderte',
    'side.hideEmpty': 'unübersetzte ausblenden',
    'side.filter': 'Sprachen filtern',
    'tab.edit': 'Eine Sprache',
    'tab.grid': 'Abschnitt in allen Sprachen',
    'hist.btn': '↶ Verlauf',
    'hist.btnN': '↶ Verlauf ({n})',
    'hist.btnTip': 'Frühere Texte, gemerkt vor dem Speichern in Steam',
    'main.noLangs': 'Sprachliste auf der Seite nicht gefunden.',
    'ed.loadFailed': 'Laden fehlgeschlagen: {err}',
    'ed.srcAria': 'Original (Englisch)',
    'ed.srcLabel': 'Original (Englisch), schreibgeschützt',
    'ed.descLabel': 'Beschreibung — {name}',
    'ed.prevLabel': 'Vorschau (ungefähr)',
    'ed.diffLabel': 'Änderungen: vorher − / nachher +',
    'ed.noTrHead': 'Für diese Sprache gibt es keine Übersetzung. ',
    'ed.noTrText': 'Steam zeigt den englischen Text; auf dem Server ist für diese Sprache nichts gespeichert. ',
    'ed.willCreate': 'Beim Speichern wird die Übersetzung erstellt.',
    'ed.createTr': 'Übersetzung aus Englisch erstellen',
    'ed.takeEn': 'Titel und Text aus Englisch übernehmen',
    'ed.takeEnConfirm': 'Titel und Beschreibung dieser Sprache durch die englischen ersetzen?',
    'ed.revert': 'Änderungen verwerfen',
    'ed.show': 'Anzeigen:',
    'ed.tgSrc': 'Original',
    'ed.tgPrev': 'Vorschau',
    'ed.diffTip': 'Änderungen gegenüber dem Text in Steam hervorheben, wie git diff',
    'ed.sync': '⇅ Gemeinsames Scrollen',
    'ed.syncTip': 'Original, Beschreibung und Vorschau gemeinsam scrollen; die Position bleibt beim Sprachwechsel erhalten',
    'ed.lintOk': 'Keine Auffälligkeiten',
    'grid.none': 'Keine Abschnitte gefunden. Ein Abschnitt ist ein Block, der mit [h2] beginnt.',
    'grid.note': 'Änderungen landen in der Beschreibung jeder Sprache und warten aufs Speichern.',
    'grid.noTr': 'Keine Übersetzung — diese Sprache bleibt unverändert.',
    'grid.cellAria': '{name}: Abschnitt {key}',
    'grid.noSec': 'Diese Sprache hat diesen Abschnitt nicht.',
    'grid.addFromEn': 'Aus Englisch hinzufügen',
    'load.progress': 'Sprachen werden geladen: {done}/{total}…',
    'load.withErr': 'Geladen, Fehler: {n}',
    'load.all': 'Alle Sprachen geladen ({n})',
    'load.noTr': ' · ohne Übersetzung: {n}',
    'quick.title': '⚡ Gemeinsame Daten',
    'quick.collapse': 'Einklappen',
    'quick.expand': 'Ausklappen',
    'quick.badNum': 'Keine Zahl. Schreiben Sie 100000 oder 100,000 (genau 3 Ziffern nach dem Trennzeichen).',
    'quick.badDec': 'Erwartet wird ein Wert wie 42.16 oder 42.16.1',
    'quick.loading': 'Sprachen werden geladen…',
    'quick.noSecs': 'Keine [h2]-Abschnitte gefunden.',
    'quick.apply': 'Auf alle anwenden',
    'quick.newLink': 'neuer Link',
    'quick.keep': 'nicht ändern',
    'quick.replaceAria': '{what} ersetzen',
    'quick.seenIn': 'Kommt vor in Sprachen: {n}',
    'quick.intro': 'Der Abschnitt existiert in {n} von {total} Sprachen. Neuen Wert eingeben — leere Felder bleiben unverändert.',
    'quick.nums': 'Zahlen, Versionen, Daten',
    'quick.links': 'Links',
    'quick.names': 'Namen',
    'quick.flagsAll': 'Flaggen: die ganze Liste wird ersetzt',
    'quick.flagsHint': 'Flaggen: klicken, um die Liste zu ändern',
    'quick.flagsReset': 'Flaggen zurücksetzen',
    'quick.custom': 'Eigener Text (in diesem Abschnitt, wörtlich)',
    'quick.find': 'suchen',
    'quick.replaceWith': 'ersetzen durch',
    'quick.morePair': '+ weiteres Paar',
    'quick.done': 'Abschnitt {key}: Sprachen geändert — {n}{miss}. Prüfen und speichern.',
    'quick.doneMiss': ', Abschnitt fehlt in {n}',
    'diff.none': 'Keine Änderungen',
    'diff.gap': '… {n} unveränderte Zeilen',
    'save.dlgTitle': 'In Steam speichern',
    'save.newMark': 'neue Übersetzung',
    'save.go': 'Ausgewählte speichern',
    'save.sumLangs': 'Geänderte Sprachen: {n} · ',
    'save.lines': ' Zeilen',
    'save.sumTitles': ' · Titel: {n}',
    'save.sumNew': ' · neue Übersetzungen: {n}',
    'save.expandAll': 'Alle ausklappen',
    'save.collapseAll': 'Alle einklappen',
    'save.verify': 'Nach dem Speichern die Sprache neu laden und den Text abgleichen',
    'save.dry': 'Probelauf — nichts an Steam senden',
    'save.histNote': 'Frühere Texte der gespeicherten Sprachen werden gemerkt — über „Verlauf“ lassen sie sich wiederherstellen.',
    'save.sending': 'wird gesendet…',
    'save.dryRes': 'Probelauf: würde {n} Zeichen senden',
    'save.justNow': 'gerade eben',
    'save.sent': 'gesendet',
    'save.verified': 'gespeichert, abgeglichen ✓',
    'save.mismatch': 'gesendet, aber Steam hat einen anderen Text geliefert — siehe „Änderungen“ der Sprache',
    'save.err': 'Fehler: {err}',
    'save.done': 'Fertig: {ok} erfolgreich{bad}',
    'save.doneBad': ', Probleme: {n}',
    'hist.applied': '{label}: Sprachen eingesetzt — {n}. Prüfen und speichern.',
    'hist.waitLoad': 'Warten Sie zuerst, bis die Sprachen geladen sind',
    'hist.title': 'Speicherverlauf',
    'hist.intro': 'Vor jedem Speichern in Steam werden hier die früheren Texte der gespeicherten Sprachen gemerkt. „Wiederherstellen“ setzt sie in den Editor ein — an Steam gehen sie erst nach „Speichern“. In „Änderungen“ ist „+“ das, was nach dem Wiederherstellen erscheint, „−“ das, was verschwindet.',
    'hist.empty': 'Noch keine Einträge — der erste erscheint beim nächsten Speichern.',
    'hist.langs': ' · Sprachen: {n}',
    'hist.diffTip': 'Wie sich der Eintrag vom aktuellen Text unterscheidet: {name}',
    'hist.restore': 'Wiederherstellen: {name}',
    'hist.restoreAll': 'Alle wiederherstellen',
    'hist.restoreAllConfirm': 'Texte aller Sprachen aus diesem Eintrag in den Editor einsetzen? Aktuelle Änderungen dieser Sprachen werden ersetzt.',
    'hist.entry': 'Eintrag vom {date}',
    'bar.rootAria': 'Editor für Titel und Beschreibung in allen Sprachen',
    'bar.native': '⇄ Originalformular von Steam',
    'bar.nativeTip': 'Natives Steam-Formular (Änderungen im Editor bleiben im Speicher)',
    'bar.reload': 'Neu laden',
    'bar.reloadConfirm': 'Ungespeicherte Änderungen gehen verloren. Fortfahren?',
    'bar.toItem': '← Zum Gegenstand',
    'native.note': 'Das Originalformular von Steam ist geöffnet. Ungespeicherte Änderungen im Editor bleiben im Speicher.',
    'native.back': '← Zurück zum Editor für alle Sprachen',
  },
  fr: {
    'lint.emptyTitle': 'Titre vide — Steam refusera l’enregistrement',
    'lint.titleLong': 'Le titre dépasse {max} caractères ({n})',
    'lint.descLong': 'La description dépasse {max} caractères ({n})',
    'lint.placeholders': 'Espaces réservés non développés : {list}',
    'lint.unbalanced': 'Balise [{tag}] non équilibrée : {o} ouvrantes, {c} fermantes',
    'lint.sameAsEn': 'La description est identique à l’anglais — non traduite ?',
    'lint.missSecs': 'Sections de l’anglais manquantes : {list}',
    'lint.extraSecs': 'Sections en trop (absentes de l’anglais) : {list}',
    'lint.missUrls': 'Liens de l’anglais manquants : {list}',
    'lint.extraUrls': 'Liens absents de l’anglais : {list}',
    'lint.nums': 'Les nombres diffèrent de l’anglais (manquants : {miss} ; en trop : {extra})',
    'err.noForm': 'Pas de formulaire sur la page (session expirée ?)',
    'err.otherLang': 'Steam a renvoyé une autre langue ({id})',
    'err.load': 'Échec du chargement',
    'common.close': 'Fermer',
    'common.cancel': 'Annuler',
    'common.retry': 'Réessayer',
    'common.loading': 'Chargement…',
    'common.changes': 'Modifications',
    'common.title': 'Titre',
    'common.desc': 'Description',
    'common.section': 'Section',
    'save.btn': 'Enregistrer…',
    'save.btnN': 'Enregistrer ({n})…',
    'side.noTr': 'pas de traduction',
    'side.willCreate': 'Une nouvelle traduction sera créée',
    'side.changed': 'Modifié',
    'side.errors': 'Erreurs',
    'side.warnings': 'Avertissements',
    'side.error': 'Erreur : {err}',
    'side.newTr': 'nouvelle traduction — sera créée',
    'side.updated': 'mis à jour {when}',
    'side.never': 'jamais mis à jour',
    'side.onlyDirty': 'modifiées uniquement',
    'side.hideEmpty': 'masquer les non traduites',
    'side.filter': 'Filtrer les langues',
    'tab.edit': 'Une langue',
    'tab.grid': 'Section dans toutes les langues',
    'hist.btn': '↶ Historique',
    'hist.btnN': '↶ Historique ({n})',
    'hist.btnTip': 'Textes précédents mémorisés avant l’enregistrement dans Steam',
    'main.noLangs': 'Liste des langues introuvable sur la page.',
    'ed.loadFailed': 'Échec du chargement : {err}',
    'ed.srcAria': 'Original (anglais)',
    'ed.srcLabel': 'Original (anglais), lecture seule',
    'ed.descLabel': 'Description — {name}',
    'ed.prevLabel': 'Aperçu (approximatif)',
    'ed.diffLabel': 'Modifications : avant − / après +',
    'ed.noTrHead': 'Il n’y a pas de traduction pour cette langue. ',
    'ed.noTrText': 'Steam affiche le texte anglais ; rien n’est stocké sur le serveur pour cette langue. ',
    'ed.willCreate': 'La traduction sera créée à l’enregistrement.',
    'ed.createTr': 'Créer la traduction depuis l’anglais',
    'ed.takeEn': 'Reprendre le titre et le texte anglais',
    'ed.takeEnConfirm': 'Remplacer le titre et la description de cette langue par ceux en anglais ?',
    'ed.revert': 'Annuler les modifications',
    'ed.show': 'Afficher :',
    'ed.tgSrc': 'Original',
    'ed.tgPrev': 'Aperçu',
    'ed.diffTip': 'Surligner les modifications par rapport au texte dans Steam, comme git diff',
    'ed.sync': '⇅ Défilement lié',
    'ed.syncTip': 'Faire défiler ensemble l’original, la description et l’aperçu ; la position est conservée au changement de langue',
    'ed.lintOk': 'Aucun problème',
    'grid.none': 'Aucune section trouvée. Une section est un bloc commençant par [h2].',
    'grid.note': 'Les modifications vont dans la description de chaque langue et attendent l’enregistrement.',
    'grid.noTr': 'Pas de traduction — cette langue n’est pas modifiée.',
    'grid.cellAria': '{name} : section {key}',
    'grid.noSec': 'Cette langue n’a pas cette section.',
    'grid.addFromEn': 'Ajouter depuis l’anglais',
    'load.progress': 'Chargement des langues : {done}/{total}…',
    'load.withErr': 'Chargé, erreurs : {n}',
    'load.all': 'Toutes les langues chargées ({n})',
    'load.noTr': ' · sans traduction : {n}',
    'quick.title': '⚡ Données communes',
    'quick.collapse': 'Réduire',
    'quick.expand': 'Déplier',
    'quick.badNum': 'Pas un nombre. Écrivez 100000 ou 100,000 (exactement 3 chiffres après le séparateur).',
    'quick.badDec': 'Valeur attendue du type 42.16 ou 42.16.1',
    'quick.loading': 'Chargement des langues…',
    'quick.noSecs': 'Aucune section [h2] trouvée.',
    'quick.apply': 'Appliquer à toutes',
    'quick.newLink': 'nouveau lien',
    'quick.keep': 'ne pas changer',
    'quick.replaceAria': 'Remplacer {what}',
    'quick.seenIn': 'Présent dans les langues : {n}',
    'quick.intro': 'La section existe dans {n} langues sur {total}. Saisissez une nouvelle valeur — un champ vide reste inchangé.',
    'quick.nums': 'Nombres, versions, dates',
    'quick.links': 'Liens',
    'quick.names': 'Noms',
    'quick.flagsAll': 'Drapeaux : toute la liste sera remplacée',
    'quick.flagsHint': 'Drapeaux : cliquez pour modifier la liste',
    'quick.flagsReset': 'Réinitialiser les drapeaux',
    'quick.custom': 'Texte libre (dans cette section, tel quel)',
    'quick.find': 'rechercher',
    'quick.replaceWith': 'remplacer par',
    'quick.morePair': '+ une autre paire',
    'quick.done': 'Section {key} : langues modifiées — {n}{miss}. Vérifiez et enregistrez.',
    'quick.doneMiss': ', section absente dans {n}',
    'diff.none': 'Aucune modification',
    'diff.gap': '… {n} lignes inchangées',
    'save.dlgTitle': 'Enregistrer dans Steam',
    'save.newMark': 'nouvelle traduction',
    'save.go': 'Enregistrer la sélection',
    'save.sumLangs': 'Langues modifiées : {n} · ',
    'save.lines': ' lignes',
    'save.sumTitles': ' · titres : {n}',
    'save.sumNew': ' · nouvelles traductions : {n}',
    'save.expandAll': 'Tout déplier',
    'save.collapseAll': 'Tout réduire',
    'save.verify': 'Après l’enregistrement, retélécharger la langue et vérifier le texte',
    'save.dry': 'Essai à blanc — ne rien envoyer à Steam',
    'save.histNote': 'Les textes précédents des langues enregistrées sont mémorisés — vous pouvez les restaurer via « Historique ».',
    'save.sending': 'envoi…',
    'save.dryRes': 'essai à blanc : {n} caractères seraient envoyés',
    'save.justNow': 'à l’instant',
    'save.sent': 'envoyé',
    'save.verified': 'enregistré, vérifié ✓',
    'save.mismatch': 'envoyé, mais Steam a renvoyé un autre texte — voir les « Modifications » de la langue',
    'save.err': 'erreur : {err}',
    'save.done': 'Terminé : {ok} réussi(s){bad}',
    'save.doneBad': ', problèmes : {n}',
    'hist.applied': '{label} : langues remplies — {n}. Vérifiez et enregistrez.',
    'hist.waitLoad': 'Attendez d’abord la fin du chargement des langues',
    'hist.title': 'Historique des enregistrements',
    'hist.intro': 'Avant chaque enregistrement dans Steam, les textes précédents des langues enregistrées sont mémorisés ici. « Restaurer » les place dans l’éditeur — ils ne partent vers Steam qu’après « Enregistrer ». Dans « Modifications », « + » est ce qui apparaîtra après la restauration, « − » ce qui disparaîtra.',
    'hist.empty': 'Aucune entrée pour l’instant — la première apparaîtra au prochain enregistrement.',
    'hist.langs': ' · langues : {n}',
    'hist.diffTip': 'Différences entre cette entrée et le texte actuel : {name}',
    'hist.restore': 'Restaurer : {name}',
    'hist.restoreAll': 'Tout restaurer',
    'hist.restoreAllConfirm': 'Placer dans l’éditeur les textes de toutes les langues de cette entrée ? Les modifications actuelles de ces langues seront remplacées.',
    'hist.entry': 'Entrée du {date}',
    'bar.rootAria': 'Éditeur du titre et de la description dans toutes les langues',
    'bar.native': '⇄ Formulaire Steam d’origine',
    'bar.nativeTip': 'Formulaire natif de Steam (les modifications de l’éditeur restent en mémoire)',
    'bar.reload': 'Recharger',
    'bar.reloadConfirm': 'Les modifications non enregistrées seront perdues. Continuer ?',
    'bar.toItem': '← Retour à l’objet',
    'native.note': 'Le formulaire Steam d’origine est ouvert. Les modifications non enregistrées de l’éditeur restent en mémoire.',
    'native.back': '← Retour à l’éditeur multilingue',
  },
  es: {
    'lint.emptyTitle': 'Título vacío — Steam no permitirá guardar',
    'lint.titleLong': 'El título supera los {max} caracteres ({n})',
    'lint.descLong': 'La descripción supera los {max} caracteres ({n})',
    'lint.placeholders': 'Quedan marcadores sin expandir: {list}',
    'lint.unbalanced': 'Etiqueta [{tag}] desequilibrada: {o} de apertura, {c} de cierre',
    'lint.sameAsEn': 'La descripción es igual a la inglesa — ¿sin traducir?',
    'lint.missSecs': 'Faltan secciones del inglés: {list}',
    'lint.extraSecs': 'Secciones de más (no están en inglés): {list}',
    'lint.missUrls': 'Faltan enlaces del inglés: {list}',
    'lint.extraUrls': 'Enlaces que no están en inglés: {list}',
    'lint.nums': 'Los números no coinciden con el inglés (faltan: {miss}; sobran: {extra})',
    'err.noForm': 'No hay formulario en la página (¿sesión caducada?)',
    'err.otherLang': 'Steam devolvió otro idioma ({id})',
    'err.load': 'No se pudo cargar',
    'common.close': 'Cerrar',
    'common.cancel': 'Cancelar',
    'common.retry': 'Reintentar',
    'common.loading': 'Cargando…',
    'common.changes': 'Cambios',
    'common.title': 'Título',
    'common.desc': 'Descripción',
    'common.section': 'Sección',
    'save.btn': 'Guardar…',
    'save.btnN': 'Guardar ({n})…',
    'side.noTr': 'sin traducción',
    'side.willCreate': 'Se creará una traducción nueva',
    'side.changed': 'Modificado',
    'side.errors': 'Errores',
    'side.warnings': 'Advertencias',
    'side.error': 'Error: {err}',
    'side.newTr': 'traducción nueva — se creará',
    'side.updated': 'actualizado {when}',
    'side.never': 'nunca actualizado',
    'side.onlyDirty': 'solo modificados',
    'side.hideEmpty': 'ocultar sin traducción',
    'side.filter': 'Filtrar idiomas',
    'tab.edit': 'Un idioma',
    'tab.grid': 'Sección en todos los idiomas',
    'hist.btn': '↶ Historial',
    'hist.btnN': '↶ Historial ({n})',
    'hist.btnTip': 'Textos anteriores guardados antes de enviar a Steam',
    'main.noLangs': 'No se encontró la lista de idiomas en la página.',
    'ed.loadFailed': 'No se pudo cargar: {err}',
    'ed.srcAria': 'Original (inglés)',
    'ed.srcLabel': 'Original (inglés), solo lectura',
    'ed.descLabel': 'Descripción — {name}',
    'ed.prevLabel': 'Vista previa (aproximada)',
    'ed.diffLabel': 'Cambios: antes − / después +',
    'ed.noTrHead': 'No hay traducción para este idioma. ',
    'ed.noTrText': 'Steam muestra el texto en inglés; en el servidor no hay nada guardado para este idioma. ',
    'ed.willCreate': 'La traducción se creará al guardar.',
    'ed.createTr': 'Crear traducción desde el inglés',
    'ed.takeEn': 'Tomar título y texto del inglés',
    'ed.takeEnConfirm': '¿Reemplazar el título y la descripción de este idioma por los ingleses?',
    'ed.revert': 'Descartar cambios',
    'ed.show': 'Mostrar:',
    'ed.tgSrc': 'Original',
    'ed.tgPrev': 'Vista previa',
    'ed.diffTip': 'Resaltar cambios respecto al texto en Steam, como git diff',
    'ed.sync': '⇅ Desplazamiento común',
    'ed.syncTip': 'Desplazar juntos el original, la descripción y la vista previa; la posición se mantiene al cambiar de idioma',
    'ed.lintOk': 'Sin observaciones',
    'grid.none': 'No se encontraron secciones. Una sección es un bloque que empieza con [h2].',
    'grid.note': 'Los cambios van a la descripción de cada idioma y esperan a guardarse.',
    'grid.noTr': 'Sin traducción — este idioma no se modifica.',
    'grid.cellAria': '{name}: sección {key}',
    'grid.noSec': 'Este idioma no tiene esta sección.',
    'grid.addFromEn': 'Añadir desde el inglés',
    'load.progress': 'Cargando idiomas: {done}/{total}…',
    'load.withErr': 'Cargado, errores: {n}',
    'load.all': 'Todos los idiomas cargados ({n})',
    'load.noTr': ' · sin traducción: {n}',
    'quick.title': '⚡ Datos comunes',
    'quick.collapse': 'Contraer',
    'quick.expand': 'Expandir',
    'quick.badNum': 'No es un número. Escribe 100000 o 100,000 (exactamente 3 cifras tras el separador).',
    'quick.badDec': 'Se espera un valor como 42.16 o 42.16.1',
    'quick.loading': 'Cargando idiomas…',
    'quick.noSecs': 'No se encontraron secciones [h2].',
    'quick.apply': 'Aplicar a todos',
    'quick.newLink': 'enlace nuevo',
    'quick.keep': 'no cambiar',
    'quick.replaceAria': 'Reemplazar {what}',
    'quick.seenIn': 'Aparece en idiomas: {n}',
    'quick.intro': 'La sección está en {n} de {total} idiomas. Escribe un valor nuevo — los campos vacíos no se cambian.',
    'quick.nums': 'Números, versiones, fechas',
    'quick.links': 'Enlaces',
    'quick.names': 'Nombres',
    'quick.flagsAll': 'Banderas: se reemplazará toda la lista',
    'quick.flagsHint': 'Banderas: haz clic para cambiar la lista',
    'quick.flagsReset': 'Restablecer banderas',
    'quick.custom': 'Texto propio (en esta sección, tal cual)',
    'quick.find': 'buscar',
    'quick.replaceWith': 'reemplazar por',
    'quick.morePair': '+ otro par',
    'quick.done': 'Sección {key}: idiomas modificados — {n}{miss}. Revisa y guarda.',
    'quick.doneMiss': ', la sección falta en {n}',
    'diff.none': 'Sin cambios',
    'diff.gap': '… {n} líneas sin cambios',
    'save.dlgTitle': 'Guardar en Steam',
    'save.newMark': 'traducción nueva',
    'save.go': 'Guardar seleccionados',
    'save.sumLangs': 'Idiomas modificados: {n} · ',
    'save.lines': ' líneas',
    'save.sumTitles': ' · títulos: {n}',
    'save.sumNew': ' · traducciones nuevas: {n}',
    'save.expandAll': 'Expandir todo',
    'save.collapseAll': 'Contraer todo',
    'save.verify': 'Tras guardar, volver a descargar el idioma y comprobar el texto',
    'save.dry': 'Prueba — no enviar nada a Steam',
    'save.histNote': 'Los textos anteriores de los idiomas guardados se recuerdan — puedes restaurarlos desde «Historial».',
    'save.sending': 'enviando…',
    'save.dryRes': 'prueba: se enviarían {n} caracteres',
    'save.justNow': 'ahora mismo',
    'save.sent': 'enviado',
    'save.verified': 'guardado, comprobado ✓',
    'save.mismatch': 'enviado, pero Steam devolvió otro texto — mira los «Cambios» del idioma',
    'save.err': 'error: {err}',
    'save.done': 'Listo: {ok} correctos{bad}',
    'save.doneBad': ', problemas: {n}',
    'hist.applied': '{label}: idiomas aplicados — {n}. Revisa y guarda.',
    'hist.waitLoad': 'Espera primero a que se carguen los idiomas',
    'hist.title': 'Historial de guardado',
    'hist.intro': 'Antes de cada guardado en Steam, aquí se recuerdan los textos anteriores de los idiomas guardados. «Restaurar» los pone en el editor — a Steam solo llegan tras «Guardar». En «Cambios», «+» es lo que aparecerá tras restaurar y «−» lo que desaparecerá.',
    'hist.empty': 'Aún no hay entradas — la primera aparecerá en el próximo guardado.',
    'hist.langs': ' · idiomas: {n}',
    'hist.diffTip': 'En qué se diferencia la entrada del texto actual: {name}',
    'hist.restore': 'Restaurar: {name}',
    'hist.restoreAll': 'Restaurar todo',
    'hist.restoreAllConfirm': '¿Poner en el editor los textos de todos los idiomas de esta entrada? Se reemplazarán los cambios actuales de esos idiomas.',
    'hist.entry': 'Entrada del {date}',
    'bar.rootAria': 'Editor del título y la descripción en todos los idiomas',
    'bar.native': '⇄ Formulario original de Steam',
    'bar.nativeTip': 'Formulario nativo de Steam (los cambios del editor se mantienen en memoria)',
    'bar.reload': 'Recargar',
    'bar.reloadConfirm': 'Se perderán los cambios sin guardar. ¿Continuar?',
    'bar.toItem': '← Volver al objeto',
    'native.note': 'Está abierto el formulario original de Steam. Los cambios sin guardar del editor siguen en memoria.',
    'native.back': '← Volver al editor de todos los idiomas',
  },
  'pt-BR': {
    'lint.emptyTitle': 'Título vazio — o Steam não vai salvar',
    'lint.titleLong': 'O título tem mais de {max} caracteres ({n})',
    'lint.descLong': 'A descrição tem mais de {max} caracteres ({n})',
    'lint.placeholders': 'Restaram marcadores não expandidos: {list}',
    'lint.unbalanced': 'Tag [{tag}] desbalanceada: {o} de abertura, {c} de fechamento',
    'lint.sameAsEn': 'A descrição é igual à em inglês — não traduzida?',
    'lint.missSecs': 'Faltam seções do inglês: {list}',
    'lint.extraSecs': 'Seções a mais (não existem no inglês): {list}',
    'lint.missUrls': 'Faltam links do inglês: {list}',
    'lint.extraUrls': 'Links que não existem no inglês: {list}',
    'lint.nums': 'Os números diferem do inglês (faltam: {miss}; sobram: {extra})',
    'err.noForm': 'Não há formulário na página (sessão expirada?)',
    'err.otherLang': 'O Steam retornou outro idioma ({id})',
    'err.load': 'Falha ao carregar',
    'common.close': 'Fechar',
    'common.cancel': 'Cancelar',
    'common.retry': 'Tentar novamente',
    'common.loading': 'Carregando…',
    'common.changes': 'Alterações',
    'common.title': 'Título',
    'common.desc': 'Descrição',
    'common.section': 'Seção',
    'save.btn': 'Salvar…',
    'save.btnN': 'Salvar ({n})…',
    'side.noTr': 'sem tradução',
    'side.willCreate': 'Uma nova tradução será criada',
    'side.changed': 'Modificado',
    'side.errors': 'Erros',
    'side.warnings': 'Avisos',
    'side.error': 'Erro: {err}',
    'side.newTr': 'nova tradução — será criada',
    'side.updated': 'atualizado {when}',
    'side.never': 'nunca atualizado',
    'side.onlyDirty': 'só modificados',
    'side.hideEmpty': 'ocultar sem tradução',
    'side.filter': 'Filtrar idiomas',
    'tab.edit': 'Um idioma',
    'tab.grid': 'Seção em todos os idiomas',
    'hist.btn': '↶ Histórico',
    'hist.btnN': '↶ Histórico ({n})',
    'hist.btnTip': 'Textos anteriores guardados antes de salvar no Steam',
    'main.noLangs': 'Não encontrei a lista de idiomas na página.',
    'ed.loadFailed': 'Falha ao carregar: {err}',
    'ed.srcAria': 'Original (inglês)',
    'ed.srcLabel': 'Original (inglês), somente leitura',
    'ed.descLabel': 'Descrição — {name}',
    'ed.prevLabel': 'Pré-visualização (aproximada)',
    'ed.diffLabel': 'Alterações: antes − / depois +',
    'ed.noTrHead': 'Não há tradução para este idioma. ',
    'ed.noTrText': 'O Steam mostra o texto em inglês; nada está armazenado no servidor para este idioma. ',
    'ed.willCreate': 'A tradução será criada ao salvar.',
    'ed.createTr': 'Criar tradução a partir do inglês',
    'ed.takeEn': 'Usar título e texto do inglês',
    'ed.takeEnConfirm': 'Substituir o título e a descrição deste idioma pelos em inglês?',
    'ed.revert': 'Descartar alterações',
    'ed.show': 'Mostrar:',
    'ed.tgSrc': 'Original',
    'ed.tgPrev': 'Pré-visualização',
    'ed.diffTip': 'Destacar alterações em relação ao texto no Steam, como git diff',
    'ed.sync': '⇅ Rolagem conjunta',
    'ed.syncTip': 'Rolar juntos o original, a descrição e a pré-visualização; a posição é mantida ao trocar de idioma',
    'ed.lintOk': 'Nenhum problema',
    'grid.none': 'Nenhuma seção encontrada. Uma seção é um bloco que começa com [h2].',
    'grid.note': 'As alterações vão para a descrição de cada idioma e aguardam o salvamento.',
    'grid.noTr': 'Sem tradução — este idioma não é alterado.',
    'grid.cellAria': '{name}: seção {key}',
    'grid.noSec': 'Este idioma não tem esta seção.',
    'grid.addFromEn': 'Adicionar do inglês',
    'load.progress': 'Carregando idiomas: {done}/{total}…',
    'load.withErr': 'Carregado, erros: {n}',
    'load.all': 'Todos os idiomas carregados ({n})',
    'load.noTr': ' · sem tradução: {n}',
    'quick.title': '⚡ Dados comuns',
    'quick.collapse': 'Recolher',
    'quick.expand': 'Expandir',
    'quick.badNum': 'Não é um número. Escreva 100000 ou 100,000 (exatamente 3 dígitos após o separador).',
    'quick.badDec': 'Esperado um valor como 42.16 ou 42.16.1',
    'quick.loading': 'Carregando idiomas…',
    'quick.noSecs': 'Nenhuma seção [h2] encontrada.',
    'quick.apply': 'Aplicar a todos',
    'quick.newLink': 'novo link',
    'quick.keep': 'não alterar',
    'quick.replaceAria': 'Substituir {what}',
    'quick.seenIn': 'Aparece em idiomas: {n}',
    'quick.intro': 'A seção existe em {n} de {total} idiomas. Digite um novo valor — campos vazios não são alterados.',
    'quick.nums': 'Números, versões, datas',
    'quick.links': 'Links',
    'quick.names': 'Nomes',
    'quick.flagsAll': 'Bandeiras: a lista inteira será substituída',
    'quick.flagsHint': 'Bandeiras: clique para alterar a lista',
    'quick.flagsReset': 'Redefinir bandeiras',
    'quick.custom': 'Texto próprio (nesta seção, como está)',
    'quick.find': 'localizar',
    'quick.replaceWith': 'substituir por',
    'quick.morePair': '+ outro par',
    'quick.done': 'Seção {key}: idiomas alterados — {n}{miss}. Revise e salve.',
    'quick.doneMiss': ', a seção não existe em {n}',
    'diff.none': 'Sem alterações',
    'diff.gap': '… {n} linhas sem alterações',
    'save.dlgTitle': 'Salvar no Steam',
    'save.newMark': 'nova tradução',
    'save.go': 'Salvar selecionados',
    'save.sumLangs': 'Idiomas alterados: {n} · ',
    'save.lines': ' linhas',
    'save.sumTitles': ' · títulos: {n}',
    'save.sumNew': ' · novas traduções: {n}',
    'save.expandAll': 'Expandir tudo',
    'save.collapseAll': 'Recolher tudo',
    'save.verify': 'Depois de salvar, baixar o idioma de novo e conferir o texto',
    'save.dry': 'Teste — não enviar nada ao Steam',
    'save.histNote': 'Os textos anteriores dos idiomas salvos são guardados — você pode restaurá-los em “Histórico”.',
    'save.sending': 'enviando…',
    'save.dryRes': 'teste: seriam enviados {n} caracteres',
    'save.justNow': 'agora mesmo',
    'save.sent': 'enviado',
    'save.verified': 'salvo, conferido ✓',
    'save.mismatch': 'enviado, mas o Steam retornou outro texto — veja as “Alterações” do idioma',
    'save.err': 'erro: {err}',
    'save.done': 'Pronto: {ok} com sucesso{bad}',
    'save.doneBad': ', problemas: {n}',
    'hist.applied': '{label}: idiomas aplicados — {n}. Revise e salve.',
    'hist.waitLoad': 'Aguarde primeiro o carregamento dos idiomas',
    'hist.title': 'Histórico de salvamentos',
    'hist.intro': 'Antes de cada salvamento no Steam, os textos anteriores dos idiomas salvos são guardados aqui. “Restaurar” os coloca no editor — eles só vão para o Steam depois de “Salvar”. Em “Alterações”, “+” é o que vai aparecer após restaurar e “−” o que vai sumir.',
    'hist.empty': 'Ainda não há registros — o primeiro aparecerá no próximo salvamento.',
    'hist.langs': ' · idiomas: {n}',
    'hist.diffTip': 'Como o registro difere do texto atual: {name}',
    'hist.restore': 'Restaurar: {name}',
    'hist.restoreAll': 'Restaurar tudo',
    'hist.restoreAllConfirm': 'Colocar no editor os textos de todos os idiomas deste registro? As alterações atuais desses idiomas serão substituídas.',
    'hist.entry': 'Registro de {date}',
    'bar.rootAria': 'Editor de título e descrição em todos os idiomas',
    'bar.native': '⇄ Formulário original do Steam',
    'bar.nativeTip': 'Formulário nativo do Steam (as alterações do editor ficam na memória)',
    'bar.reload': 'Recarregar',
    'bar.reloadConfirm': 'As alterações não salvas serão perdidas. Continuar?',
    'bar.toItem': '← Voltar ao item',
    'native.note': 'O formulário original do Steam está aberto. As alterações não salvas do editor continuam na memória.',
    'native.back': '← Voltar ao editor de todos os idiomas',
  },
  pl: {
    'lint.emptyTitle': 'Pusty tytuł — Steam nie pozwoli zapisać',
    'lint.titleLong': 'Tytuł jest dłuższy niż {max} znaków ({n})',
    'lint.descLong': 'Opis jest dłuższy niż {max} znaków ({n})',
    'lint.placeholders': 'Pozostały nierozwinięte symbole zastępcze: {list}',
    'lint.unbalanced': 'Niezrównoważony znacznik [{tag}]: otwierających {o}, zamykających {c}',
    'lint.sameAsEn': 'Opis jest taki sam jak angielski — nieprzetłumaczony?',
    'lint.missSecs': 'Brak sekcji z wersji angielskiej: {list}',
    'lint.extraSecs': 'Nadmiarowe sekcje (brak w angielskiej): {list}',
    'lint.missUrls': 'Brak linków z wersji angielskiej: {list}',
    'lint.extraUrls': 'Linki, których nie ma w angielskiej: {list}',
    'lint.nums': 'Liczby różnią się od angielskiej (brak: {miss}; nadmiarowe: {extra})',
    'err.noForm': 'Brak formularza na stronie (sesja wygasła?)',
    'err.otherLang': 'Steam zwrócił inny język ({id})',
    'err.load': 'Nie udało się wczytać',
    'common.close': 'Zamknij',
    'common.cancel': 'Anuluj',
    'common.retry': 'Ponów',
    'common.loading': 'Wczytywanie…',
    'common.changes': 'Zmiany',
    'common.title': 'Tytuł',
    'common.desc': 'Opis',
    'common.section': 'Sekcja',
    'save.btn': 'Zapisz…',
    'save.btnN': 'Zapisz ({n})…',
    'side.noTr': 'brak tłumaczenia',
    'side.willCreate': 'Zostanie utworzone nowe tłumaczenie',
    'side.changed': 'Zmieniono',
    'side.errors': 'Błędy',
    'side.warnings': 'Ostrzeżenia',
    'side.error': 'Błąd: {err}',
    'side.newTr': 'nowe tłumaczenie — zostanie utworzone',
    'side.updated': 'zaktualizowano {when}',
    'side.never': 'nigdy nie aktualizowano',
    'side.onlyDirty': 'tylko zmienione',
    'side.hideEmpty': 'ukryj bez tłumaczenia',
    'side.filter': 'Filtruj języki',
    'tab.edit': 'Jeden język',
    'tab.grid': 'Sekcja we wszystkich językach',
    'hist.btn': '↶ Historia',
    'hist.btnN': '↶ Historia ({n})',
    'hist.btnTip': 'Poprzednie teksty zapamiętane przed zapisem w Steam',
    'main.noLangs': 'Nie znaleziono listy języków na stronie.',
    'ed.loadFailed': 'Nie udało się wczytać: {err}',
    'ed.srcAria': 'Oryginał (angielski)',
    'ed.srcLabel': 'Oryginał (angielski), tylko do odczytu',
    'ed.descLabel': 'Opis — {name}',
    'ed.prevLabel': 'Podgląd (przybliżony)',
    'ed.diffLabel': 'Zmiany: było − / jest +',
    'ed.noTrHead': 'Brak tłumaczenia na ten język. ',
    'ed.noTrText': 'Steam pokazuje tekst angielski; na serwerze nic nie jest zapisane dla tego języka. ',
    'ed.willCreate': 'Tłumaczenie zostanie utworzone przy zapisie.',
    'ed.createTr': 'Utwórz tłumaczenie z angielskiego',
    'ed.takeEn': 'Weź tytuł i tekst z angielskiego',
    'ed.takeEnConfirm': 'Zastąpić tytuł i opis tego języka angielskimi?',
    'ed.revert': 'Odrzuć zmiany',
    'ed.show': 'Pokaż:',
    'ed.tgSrc': 'Oryginał',
    'ed.tgPrev': 'Podgląd',
    'ed.diffTip': 'Podświetlanie zmian względem tekstu w Steam, jak w git diff',
    'ed.sync': '⇅ Wspólne przewijanie',
    'ed.syncTip': 'Wspólne przewijanie oryginału, opisu i podglądu; pozycja zostaje przy zmianie języka',
    'ed.lintOk': 'Brak uwag',
    'grid.none': 'Nie znaleziono sekcji. Sekcja to blok zaczynający się od [h2].',
    'grid.note': 'Zmiany trafiają do opisu każdego języka i czekają na zapis.',
    'grid.noTr': 'Brak tłumaczenia — ten język pozostaje bez zmian.',
    'grid.cellAria': '{name}: sekcja {key}',
    'grid.noSec': 'Ten język nie ma tej sekcji.',
    'grid.addFromEn': 'Dodaj z angielskiego',
    'load.progress': 'Wczytywanie języków: {done}/{total}…',
    'load.withErr': 'Wczytano, błędów: {n}',
    'load.all': 'Wczytano wszystkie języki ({n})',
    'load.noTr': ' · bez tłumaczenia: {n}',
    'quick.title': '⚡ Wspólne dane',
    'quick.collapse': 'Zwiń',
    'quick.expand': 'Rozwiń',
    'quick.badNum': 'To nie liczba. Wpisz 100000 lub 100,000 (dokładnie 3 cyfry po separatorze).',
    'quick.badDec': 'Oczekiwana wartość w rodzaju 42.16 lub 42.16.1',
    'quick.loading': 'Wczytywanie języków…',
    'quick.noSecs': 'Nie znaleziono sekcji [h2].',
    'quick.apply': 'Zastosuj do wszystkich',
    'quick.newLink': 'nowy link',
    'quick.keep': 'bez zmian',
    'quick.replaceAria': 'Zastąp {what}',
    'quick.seenIn': 'Występuje w językach: {n}',
    'quick.intro': 'Sekcja jest w {n} z {total} języków. Wpisz nową wartość — puste pole pozostaje bez zmian.',
    'quick.nums': 'Liczby, wersje, daty',
    'quick.links': 'Linki',
    'quick.names': 'Nazwy',
    'quick.flagsAll': 'Flagi: zostanie zastąpiona cała lista',
    'quick.flagsHint': 'Flagi: kliknij, aby zmienić listę',
    'quick.flagsReset': 'Resetuj flagi',
    'quick.custom': 'Własny tekst (w tej sekcji, dosłownie)',
    'quick.find': 'znajdź',
    'quick.replaceWith': 'zamień na',
    'quick.morePair': '+ kolejna para',
    'quick.done': 'Sekcja {key}: zmieniono języków — {n}{miss}. Sprawdź i zapisz.',
    'quick.doneMiss': ', brak sekcji w {n}',
    'diff.none': 'Brak zmian',
    'diff.gap': '… {n} wierszy bez zmian',
    'save.dlgTitle': 'Zapis w Steam',
    'save.newMark': 'nowe tłumaczenie',
    'save.go': 'Zapisz wybrane',
    'save.sumLangs': 'Zmienione języki: {n} · ',
    'save.lines': ' wierszy',
    'save.sumTitles': ' · tytułów: {n}',
    'save.sumNew': ' · nowych tłumaczeń: {n}',
    'save.expandAll': 'Rozwiń wszystkie',
    'save.collapseAll': 'Zwiń wszystkie',
    'save.verify': 'Po zapisie pobierz język ponownie i porównaj tekst',
    'save.dry': 'Próba na sucho — nic nie wysyłaj do Steam',
    'save.histNote': 'Poprzednie teksty zapisywanych języków są zapamiętywane — można je przywrócić w „Historii”.',
    'save.sending': 'wysyłanie…',
    'save.dryRes': 'próba na sucho: wysłano by {n} znaków',
    'save.justNow': 'przed chwilą',
    'save.sent': 'wysłano',
    'save.verified': 'zapisano, sprawdzono ✓',
    'save.mismatch': 'wysłano, ale Steam zwrócił inny tekst — zobacz „Zmiany” języka',
    'save.err': 'błąd: {err}',
    'save.done': 'Gotowe: {ok} pomyślnie{bad}',
    'save.doneBad': ', problemów: {n}',
    'hist.applied': '{label}: wstawiono języków — {n}. Sprawdź i zapisz.',
    'hist.waitLoad': 'Najpierw poczekaj na wczytanie języków',
    'hist.title': 'Historia zapisów',
    'hist.intro': 'Przed każdym zapisem w Steam zapamiętywane są tu poprzednie teksty zapisywanych języków. „Przywróć” wstawia je do edytora — do Steam trafią dopiero po „Zapisz”. W „Zmianach” „+” to, co pojawi się po przywróceniu, a „−” to, co zniknie.',
    'hist.empty': 'Brak wpisów — pierwszy pojawi się przy następnym zapisie.',
    'hist.langs': ' · języków: {n}',
    'hist.diffTip': 'Czym wpis różni się od obecnego tekstu: {name}',
    'hist.restore': 'Przywróć: {name}',
    'hist.restoreAll': 'Przywróć wszystko',
    'hist.restoreAllConfirm': 'Wstawić do edytora teksty wszystkich języków z tego wpisu? Obecne zmiany tych języków zostaną zastąpione.',
    'hist.entry': 'Wpis z {date}',
    'bar.rootAria': 'Edytor tytułu i opisu we wszystkich językach',
    'bar.native': '⇄ Oryginalny formularz Steam',
    'bar.nativeTip': 'Natywny formularz Steam (zmiany w edytorze pozostają w pamięci)',
    'bar.reload': 'Odśwież',
    'bar.reloadConfirm': 'Niezapisane zmiany zostaną utracone. Kontynuować?',
    'bar.toItem': '← Do przedmiotu',
    'native.note': 'Otwarto oryginalny formularz Steam. Niezapisane zmiany edytora pozostały w pamięci.',
    'native.back': '← Wróć do edytora wszystkich języków',
  },
  tr: {
    'lint.emptyTitle': 'Başlık boş — Steam kaydetmeye izin vermez',
    'lint.titleLong': 'Başlık {max} karakterden uzun ({n})',
    'lint.descLong': 'Açıklama {max} karakterden uzun ({n})',
    'lint.placeholders': 'Açılmamış yer tutucular kaldı: {list}',
    'lint.unbalanced': '[{tag}] etiketi dengesiz: {o} açılış, {c} kapanış',
    'lint.sameAsEn': 'Açıklama İngilizceyle aynı — çevrilmedi mi?',
    'lint.missSecs': 'İngilizcedeki bölümler eksik: {list}',
    'lint.extraSecs': 'Fazla bölümler (İngilizcede yok): {list}',
    'lint.missUrls': 'İngilizcedeki bağlantılar eksik: {list}',
    'lint.extraUrls': 'İngilizcede olmayan bağlantılar: {list}',
    'lint.nums': 'Sayılar İngilizceyle uyuşmuyor (eksik: {miss}; fazla: {extra})',
    'err.noForm': 'Sayfada düzenleme formu yok (oturum sona erdi mi?)',
    'err.otherLang': 'Steam başka bir dil döndürdü ({id})',
    'err.load': 'Yüklenemedi',
    'common.close': 'Kapat',
    'common.cancel': 'İptal',
    'common.retry': 'Yeniden dene',
    'common.loading': 'Yükleniyor…',
    'common.changes': 'Değişiklikler',
    'common.title': 'Başlık',
    'common.desc': 'Açıklama',
    'common.section': 'Bölüm',
    'save.btn': 'Kaydet…',
    'save.btnN': 'Kaydet ({n})…',
    'side.noTr': 'çeviri yok',
    'side.willCreate': 'Yeni bir çeviri oluşturulacak',
    'side.changed': 'Değiştirildi',
    'side.errors': 'Hatalar',
    'side.warnings': 'Uyarılar',
    'side.error': 'Hata: {err}',
    'side.newTr': 'yeni çeviri — oluşturulacak',
    'side.updated': 'güncellendi: {when}',
    'side.never': 'hiç güncellenmedi',
    'side.onlyDirty': 'yalnızca değişenler',
    'side.hideEmpty': 'çevirisizleri gizle',
    'side.filter': 'Dilleri filtrele',
    'tab.edit': 'Tek dil',
    'tab.grid': 'Tüm dillerde bölüm',
    'hist.btn': '↶ Geçmiş',
    'hist.btnN': '↶ Geçmiş ({n})',
    'hist.btnTip': 'Steam’e kaydetmeden önce saklanan önceki metinler',
    'main.noLangs': 'Sayfada dil listesi bulunamadı.',
    'ed.loadFailed': 'Yüklenemedi: {err}',
    'ed.srcAria': 'Orijinal (İngilizce)',
    'ed.srcLabel': 'Orijinal (İngilizce), salt okunur',
    'ed.descLabel': 'Açıklama — {name}',
    'ed.prevLabel': 'Önizleme (yaklaşık)',
    'ed.diffLabel': 'Değişiklikler: önce − / sonra +',
    'ed.noTrHead': 'Bu dilde çeviri yok. ',
    'ed.noTrText': 'Steam İngilizce metni gösteriyor; sunucuda bu dil için hiçbir şey saklanmıyor. ',
    'ed.willCreate': 'Kaydederken çeviri oluşturulacak.',
    'ed.createTr': 'İngilizceden çeviri oluştur',
    'ed.takeEn': 'Başlığı ve metni İngilizceden al',
    'ed.takeEnConfirm': 'Bu dilin başlığı ve açıklaması İngilizceyle değiştirilsin mi?',
    'ed.revert': 'Düzenlemeleri geri al',
    'ed.show': 'Göster:',
    'ed.tgSrc': 'Orijinal',
    'ed.tgPrev': 'Önizleme',
    'ed.diffTip': 'Steam’deki metne göre düzenlemeleri vurgula, git diff gibi',
    'ed.sync': '⇅ Ortak kaydırma',
    'ed.syncTip': 'Orijinal, açıklama ve önizleme birlikte kaydırılır; dil değişince konum korunur',
    'ed.lintOk': 'Sorun yok',
    'grid.none': 'Bölüm bulunamadı. Bölüm, [h2] ile başlayan bir bloktur.',
    'grid.note': 'Düzenlemeler her dilin açıklamasına yazılır ve kaydedilmeyi bekler.',
    'grid.noTr': 'Çeviri yok — bu dile dokunulmaz.',
    'grid.cellAria': '{name}: {key} bölümü',
    'grid.noSec': 'Bu dilde bu bölüm yok.',
    'grid.addFromEn': 'İngilizceden ekle',
    'load.progress': 'Diller yükleniyor: {done}/{total}…',
    'load.withErr': 'Yüklendi, hata: {n}',
    'load.all': 'Tüm diller yüklendi ({n})',
    'load.noTr': ' · çevirisiz: {n}',
    'quick.title': '⚡ Ortak veriler',
    'quick.collapse': 'Daralt',
    'quick.expand': 'Genişlet',
    'quick.badNum': 'Sayı değil. 100000 veya 100,000 yazın (ayraçtan sonra tam 3 rakam).',
    'quick.badDec': '42.16 veya 42.16.1 gibi bir değer gerekli',
    'quick.loading': 'Diller yükleniyor…',
    'quick.noSecs': '[h2] bölümü bulunamadı.',
    'quick.apply': 'Tümüne uygula',
    'quick.newLink': 'yeni bağlantı',
    'quick.keep': 'değiştirme',
    'quick.replaceAria': '{what} değiştir',
    'quick.seenIn': 'Geçtiği dil sayısı: {n}',
    'quick.intro': 'Bölüm {total} dilin {n} tanesinde var. Yeni değeri yazın — boş alan değişmez.',
    'quick.nums': 'Sayılar, sürümler, tarihler',
    'quick.links': 'Bağlantılar',
    'quick.names': 'Adlar',
    'quick.flagsAll': 'Bayraklar: tüm liste değiştirilecek',
    'quick.flagsHint': 'Bayraklar: listeyi değiştirmek için tıklayın',
    'quick.flagsReset': 'Bayrakları sıfırla',
    'quick.custom': 'Özel metin (bu bölümde, olduğu gibi)',
    'quick.find': 'bul',
    'quick.replaceWith': 'şununla değiştir',
    'quick.morePair': '+ bir çift daha',
    'quick.done': '{key} bölümü: değişen dil — {n}{miss}. Kontrol edip kaydedin.',
    'quick.doneMiss': ', {n} dilde bölüm yok',
    'diff.none': 'Değişiklik yok',
    'diff.gap': '… değişmeyen {n} satır',
    'save.dlgTitle': 'Steam’e kaydet',
    'save.newMark': 'yeni çeviri',
    'save.go': 'Seçilenleri kaydet',
    'save.sumLangs': 'Değişen diller: {n} · ',
    'save.lines': ' satır',
    'save.sumTitles': ' · başlık: {n}',
    'save.sumNew': ' · yeni çeviri: {n}',
    'save.expandAll': 'Tümünü genişlet',
    'save.collapseAll': 'Tümünü daralt',
    'save.verify': 'Kaydettikten sonra dili yeniden indir ve metni karşılaştır',
    'save.dry': 'Deneme çalıştırması — Steam’e hiçbir şey gönderme',
    'save.histNote': 'Kaydedilen dillerin önceki metinleri saklanır — “Geçmiş” üzerinden geri yüklenebilir.',
    'save.sending': 'gönderiliyor…',
    'save.dryRes': 'deneme: {n} karakter gönderilecekti',
    'save.justNow': 'az önce',
    'save.sent': 'gönderildi',
    'save.verified': 'kaydedildi, doğrulandı ✓',
    'save.mismatch': 'gönderildi, ancak Steam farklı bir metin döndürdü — dilin “Değişiklikler” kısmına bakın',
    'save.err': 'hata: {err}',
    'save.done': 'Tamamlandı: {ok} başarılı{bad}',
    'save.doneBad': ', sorun: {n}',
    'hist.applied': '{label}: uygulanan dil — {n}. Kontrol edip kaydedin.',
    'hist.waitLoad': 'Önce dillerin yüklenmesini bekleyin',
    'hist.title': 'Kayıt geçmişi',
    'hist.intro': 'Steam’e her kaydetmeden önce, kaydedilen dillerin önceki metinleri burada saklanır. “Geri yükle” bunları düzenleyiciye koyar — Steam’e ancak “Kaydet”ten sonra gider. “Değişiklikler”de “+” geri yüklemeden sonra görünecekleri, “−” kaybolacakları gösterir.',
    'hist.empty': 'Henüz kayıt yok — ilki bir sonraki kaydetmede oluşacak.',
    'hist.langs': ' · dil: {n}',
    'hist.diffTip': 'Kaydın mevcut metinden farkı: {name}',
    'hist.restore': 'Geri yükle: {name}',
    'hist.restoreAll': 'Tümünü geri yükle',
    'hist.restoreAllConfirm': 'Bu kayıttaki tüm dillerin metinleri düzenleyiciye konsun mu? Bu dillerdeki mevcut düzenlemeler değiştirilecek.',
    'hist.entry': '{date} tarihli kayıt',
    'bar.rootAria': 'Tüm diller için başlık ve açıklama düzenleyicisi',
    'bar.native': '⇄ Steam’in orijinal formu',
    'bar.nativeTip': 'Steam’in kendi formu (düzenleyicideki değişiklikler bellekte kalır)',
    'bar.reload': 'Yenile',
    'bar.reloadConfirm': 'Kaydedilmemiş düzenlemeler kaybolacak. Devam edilsin mi?',
    'bar.toItem': '← Öğeye dön',
    'native.note': 'Steam’in orijinal formu açık. Düzenleyicideki kaydedilmemiş değişiklikler bellekte duruyor.',
    'native.back': '← Tüm diller düzenleyicisine dön',
  },
};
const STEAM_UI_LANG = { english: 'en', russian: 'ru', ukrainian: 'uk', schinese: 'zh-CN', tchinese: 'zh-TW', japanese: 'ja', koreana: 'ko', german: 'de', french: 'fr', spanish: 'es', latam: 'es', brazilian: 'pt-BR', portuguese: 'pt-BR', polish: 'pl', turkish: 'tr' };
function uiLangOf(tag) {
  tag = String(tag || '').toLowerCase();
  if (!tag) return null;
  if (/^zh-(tw|hk|mo|hant)/.test(tag)) return 'zh-TW';
  if (/^zh/.test(tag)) return 'zh-CN';
  if (/^pt/.test(tag)) return 'pt-BR';
  const base = tag.split(/[-_]/)[0];
  return I18N[base] ? base : null;
}
// Язык страницы Steam пишет во встроенный скрипт (g_strLanguage = "german"); у <html> атрибута lang нет.
function pageSteamLang() {
  for (const s of document.querySelectorAll('script:not([src])')) {
    const m = s.textContent.match(/g_strLanguage\s*=\s*["'](\w+)["']/);
    if (m) return m[1];
  }
  const ck = document.cookie.match(/(?:^|;\s*)Steam_Language=([^;]+)/);
  return ck ? decodeURIComponent(ck[1]) : '';
}
function detectUiLang() {
  if (typeof document === 'undefined') return 'en';
  const steam = pageSteamLang();
  if (steam) return STEAM_UI_LANG[steam] || 'en'; // язык Steam без словаря — английский, а не язык браузера
  const nav = typeof navigator !== 'undefined' ? [].concat(navigator.languages || navigator.language || []) : [];
  return uiLangOf(document.documentElement.lang) || nav.map(uiLangOf).find(Boolean) || 'en';
}
const UI = detectUiLang();
const UI_LOC = UI === 'en' ? 'en-US' : UI; // локаль для чисел и дат
function t(key, p) {
  const s = (I18N[UI] && I18N[UI][key]) || I18N.en[key] || key;
  return p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m)) : s;
}

/* ───────────── Языки Steam ───────────── */
// id → локаль для Intl, код страны для флага (flagcdn), короткая метка
const LANG_META = {
  0:  { loc: 'en-US', cc: 'gb', lbl: 'EN' },
  8:  { loc: 'ru-RU', cc: 'ru', lbl: 'RU' },
  6:  { loc: 'zh-CN', cc: 'cn', lbl: 'CN' },
  7:  { loc: 'zh-TW', cc: 'tw', lbl: 'TW' },
  10: { loc: 'ja-JP', cc: 'jp', lbl: 'JP' },
  4:  { loc: 'ko-KR', cc: 'kr', lbl: 'KR' },
  1:  { loc: 'de-DE', cc: 'de', lbl: 'DE' },
  2:  { loc: 'fr-FR', cc: 'fr', lbl: 'FR' },
  3:  { loc: 'it-IT', cc: 'it', lbl: 'IT' },
  5:  { loc: 'es-ES', cc: 'es', lbl: 'ES' },
  27: { loc: 'es-419', cc: 'mx', lbl: 'MX' },
  11: { loc: 'pt-PT', cc: 'pt', lbl: 'PT' },
  22: { loc: 'pt-BR', cc: 'br', lbl: 'BR' },
  12: { loc: 'pl-PL', cc: 'pl', lbl: 'PL' },
  26: { loc: 'uk-UA', cc: 'ua', lbl: 'UA' },
  19: { loc: 'cs-CZ', cc: 'cz', lbl: 'CZ' },
  14: { loc: 'nl-NL', cc: 'nl', lbl: 'NL' },
  17: { loc: 'sv-SE', cc: 'se', lbl: 'SE' },
  15: { loc: 'fi-FI', cc: 'fi', lbl: 'FI' },
  16: { loc: 'nb-NO', cc: 'no', lbl: 'NO' },
  13: { loc: 'da-DK', cc: 'dk', lbl: 'DK' },
  18: { loc: 'hu-HU', cc: 'hu', lbl: 'HU' },
  20: { loc: 'ro-RO', cc: 'ro', lbl: 'RO' },
  21: { loc: 'tr-TR', cc: 'tr', lbl: 'TR' },
  23: { loc: 'bg-BG', cc: 'bg', lbl: 'BG' },
  24: { loc: 'el-GR', cc: 'gr', lbl: 'GR' },
  9:  { loc: 'th-TH', cc: 'th', lbl: 'TH' },
  28: { loc: 'vi-VN', cc: 'vn', lbl: 'VN' },
  30: { loc: 'id-ID', cc: 'id', lbl: 'ID' },
  31: { loc: 'ms-MY', cc: 'my', lbl: 'MY' },
};
// порядок = порядок языков в списке и порядок флагов в {{langs}} (ключи объекта JS сортируются числами, поэтому массив явный)
const MASTER = [0, 8, 6, 7, 10, 4, 1, 2, 3, 5, 27, 11, 22, 12, 26, 19, 14, 17, 15, 16, 13, 18, 20, 21, 23, 24, 9, 28, 30, 31];
const metaOf = (id) => LANG_META[id] || { loc: 'en-US', cc: 'xx', lbl: '??' };
const orderOf = (id) => { const i = MASTER.indexOf(Number(id)); return i < 0 ? 999 : i; };

/* ───────────── Мелкие утилиты ───────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const normNL = (s) => String(s).replace(/\r\n?/g, '\n');

async function pool(items, n, worker, gap = 0) {
  let i = 0;
  async function run() {
    while (i < items.length) {
      const k = i++;
      await worker(items[k], k);
      if (gap) await sleep(gap);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

/* ───────────── Числа и форматы ───────────── */
const NUM_RE = /\d{1,3}(?:[ \u00a0\u202f.,']\d{3})+(?!\d)|\d+/g;

const toNum = (s) => {
  const d = String(s).replace(/[^\d]/g, '');
  return d === '' ? NaN : Number(d);
};
// Обход числовых токенов с защитой от URL, версий и «слипшихся» с буквами чисел.
function replaceNumbers(text, fn) {
  return text.replace(NUM_RE, (tok, off) => {
    const prev = text[off - 1] || '';
    const next = text[off + tok.length] || '';
    if (/[A-Za-z0-9_\/=.:#-]/.test(prev) || /[A-Za-z0-9_]/.test(next)) return tok;
    const r = fn(tok, toNum(tok));
    return r == null ? tok : r;
  });
}
function numbersIn(text) {
  const clean = String(text).replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ').replace(/https?:\/\/[^\s\[\]]+/g, ' ');
  const out = [];
  replaceNumbers(clean, (tok, v) => { out.push(v); return null; });
  return out;
}

/* ───────────── Секции описания ───────────── */
const EMOJI_RE = /\p{Extended_Pictographic}/u;

function parseSections(desc) {
  const re = /^[ \t]*\[h2\]/gim;
  const starts = [];
  let m;
  while ((m = re.exec(desc))) starts.push(m.index);
  const pre = starts.length ? desc.slice(0, starts[0]) : desc;
  const secs = [];
  const seen = {};
  starts.forEach((s, i) => {
    const raw = desc.slice(s, i + 1 < starts.length ? starts[i + 1] : desc.length);
    const head = raw.split('\n', 1)[0];
    const em = head.match(EMOJI_RE);
    let key = em ? em[0] : '#' + (i + 1);
    if (seen[key]) { seen[key]++; key += '~' + seen[key]; } else seen[key] = 1;
    const body = raw.replace(/\s+$/, '');
    secs.push({
      key,
      title: head.replace(/^\s*\[h2\]/i, '').replace(/\[\/h2\]\s*$/i, '').trim(),
      body,
      tail: raw.slice(body.length),
    });
  });
  return { pre, secs };
}
const joinSections = (p) => p.pre + p.secs.map((s) => s.body + s.tail).join('');

function setSection(desc, key, newBody, refOrder) {
  const p = parseSections(desc);
  const body = newBody.replace(/\s+$/, '');
  const i = p.secs.findIndex((s) => s.key === key);
  if (i >= 0) { p.secs[i].body = body; return joinSections(p); }
  // вставляем после ближайшей предшествующей (по порядку в английском) секции
  let at = -1;
  const pos = (refOrder || []).indexOf(key);
  for (let k = pos - 1; k >= 0; k--) {
    const j = p.secs.findIndex((s) => s.key === refOrder[k]);
    if (j >= 0) { at = j; break; }
  }
  const ns = { key, title: '', body, tail: '\n\n' };
  if (at === p.secs.length - 1) {            // вставка в конец
    if (p.secs.length) p.secs[p.secs.length - 1].tail = '\n\n';
    else if (p.pre.trim()) p.pre = p.pre.replace(/\s+$/, '') + '\n\n';
    else p.pre = '';
    ns.tail = '';
  }
  p.secs.splice(at + 1, 0, ns);
  return joinSections(p);
}

/* ───────────── Переменные и шаблоны ───────────── */
const PH_RE = /\{\{\s*([A-Za-z_]\w*)\s*(?:\|\s*(\w+)\s*)?\}\}/g;
const FLAG = '\\[img\\]https?:\\/\\/flagcdn\\.com\\/[^\\[\\]]+\\[\\/img\\]\\s*[^\\s,\\[\\]]+';
const FLAGS_RE = new RegExp(FLAG + '(?:\\s*,\\s*' + FLAG + ')*', 'g');

function renderLangs(ids) {
  return MASTER.filter((id) => ids.indexOf(id) >= 0)
    .map((id) => `[img]https://flagcdn.com/w20/${metaOf(id).cc}.png[/img] ${metaOf(id).lbl}`)
    .join(', ');
}
/* ───────────── Diff по строкам ───────────── */
function diffLines(aText, bText) {
  const a = aText.split('\n'), b = bText.split('\n');
  const n = a.length, m = b.length;
  if (n * m > 4e6) return [...a.map((s) => ({ t: '-', s })), ...b.map((s) => ({ t: '+', s }))];
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: ' ', s: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', s: a[i++] });
    else out.push({ t: '+', s: b[j++] });
  }
  while (i < n) out.push({ t: '-', s: a[i++] });
  while (j < m) out.push({ t: '+', s: b[j++] });
  return out;
}

// Построчный diff с подсветкой изменённых слов внутри заменённых строк (как в git diff --word-diff).
// Строки: { t: '+' | '-' | ' ', s, parts?: [[текст, подсвечен]] }
const WORD_RE = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
function wordParts(a, b) {
  const x = a.match(WORD_RE) || [], y = b.match(WORD_RE) || [];
  const n = x.length, m = y.length;
  if (n * m > 160000) return null;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const da = [], db = [];
  const push = (arr, txt, hl) => { const last = arr[arr.length - 1]; if (last && last[1] === hl) last[0] += txt; else arr.push([txt, hl]); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { push(da, x[i], false); push(db, y[j], false); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push(da, x[i++], true);
    else push(db, y[j++], true);
  }
  while (i < n) push(da, x[i++], true);
  while (j < m) push(db, y[j++], true);
  return [da, db];
}
function diffRows(aText, bText) {
  const ops = diffLines(aText, bText).map((o) => ({ t: o.t, s: o.s }));
  for (let i = 0; i < ops.length;) {
    if (ops[i].t === ' ') { i++; continue; }
    let k = i;
    while (k < ops.length && ops[k].t === '-') k++;
    const dels = ops.slice(i, k);
    let e = k;
    while (e < ops.length && ops[e].t === '+') e++;
    const adds = ops.slice(k, e);
    for (let p = 0; p < Math.min(dels.length, adds.length); p++) {
      const w = wordParts(dels[p].s, adds[p].s);
      if (w) { dels[p].parts = w[0]; adds[p].parts = w[1]; }
    }
    i = Math.max(e, i + 1);
  }
  return ops;
}

/* ───────────── Линтер ───────────── */
const TITLE_MAX = 128, DESC_MAX = 8000;
const BB_TAGS = ['b', 'i', 'u', 'strike', 'h1', 'h2', 'h3', 'list', 'olist', 'url', 'img', 'quote', 'code', 'spoiler', 'noparse', 'table', 'tr', 'th', 'td'];

function lint(title, desc, en, isEn) {
  const out = [];
  const err = (msg) => out.push({ lvl: 'err', msg });
  const warn = (msg) => out.push({ lvl: 'warn', msg });
  if (!title.trim()) err(t('lint.emptyTitle'));
  if (title.length > TITLE_MAX) err(t('lint.titleLong', { max: TITLE_MAX, n: title.length }));
  if (desc.length > DESC_MAX) err(t('lint.descLong', { max: DESC_MAX, n: desc.length }));
  const ph = (title + '\n' + desc).match(PH_RE);
  if (ph) err(t('lint.placeholders', { list: [...new Set(ph)].join(' ') }));
  BB_TAGS.forEach((tag) => {
    const o = (desc.match(new RegExp('\\[' + tag + '(?:=[^\\]]*)?\\]', 'gi')) || []).length;
    const c = (desc.match(new RegExp('\\[\\/' + tag + '\\]', 'gi')) || []).length;
    if (o !== c) warn(t('lint.unbalanced', { tag, o, c }));
  });
  if (en && !isEn) {
    if (desc.trim() === en.desc.trim()) warn(t('lint.sameAsEn'));
    const a = parseSections(en.desc).secs.map((s) => s.key);
    const b = parseSections(desc).secs.map((s) => s.key);
    const miss = a.filter((k) => b.indexOf(k) < 0), extra = b.filter((k) => a.indexOf(k) < 0);
    if (miss.length) warn(t('lint.missSecs', { list: miss.join(' ') }));
    if (extra.length) warn(t('lint.extraSecs', { list: extra.join(' ') }));
    const urls = (s) => new Set(s.match(/https?:\/\/[^\s\[\]]+/g) || []);
    const ue = urls(en.desc), ut = urls(desc);
    const um = [...ue].filter((u) => !ut.has(u)), ux = [...ut].filter((u) => !ue.has(u));
    if (um.length) warn(t('lint.missUrls', { list: um.join(' ') }));
    if (ux.length) warn(t('lint.extraUrls', { list: ux.join(' ') }));
    const ne = new Set(numbersIn(en.desc).filter((x) => x >= 10)), nt = new Set(numbersIn(desc).filter((x) => x >= 10));
    const nm = [...ne].filter((x) => !nt.has(x)), nx = [...nt].filter((x) => !ne.has(x));
    if (nm.length || nx.length) warn(t('lint.nums', { miss: nm.join(', ') || '—', extra: nx.join(', ') || '—' }));
  }
  return out;
}

/* ───────────── BBCode → HTML (приблизительный предпросмотр) ───────────── */
function bb2html(src) {
  let s = esc(src);
  s = s.replace(/\[noparse\]([\s\S]*?)\[\/noparse\]/gi, '$1');
  s = s.replace(/\[h([1-3])\]([\s\S]*?)\[\/h\1\]\n?/gi, '<h$1>$2</h$1>');
  s = s.replace(/\[hr\]\n?/gi, '<hr>');
  s = s.replace(/\[(o?)list\]\s*/gi, (m, o) => (o ? '<ol>' : '<ul>'));
  s = s.replace(/\s*\[\/(o?)list\]\n?/gi, (m, o) => (o ? '</ol>' : '</ul>'));
  s = s.replace(/\s*\[\*\]\s*/g, '<li>');
  s = s.replace(/\[(b|i|u)\]/gi, '<$1>').replace(/\[\/(b|i|u)\]/gi, '</$1>');
  s = s.replace(/\[strike\]/gi, '<s>').replace(/\[\/strike\]/gi, '</s>');
  s = s.replace(/\[quote(?:=[^\]]*)?\]/gi, '<blockquote>').replace(/\[\/quote\]\n?/gi, '</blockquote>');
  s = s.replace(/\[code\]/gi, '<pre>').replace(/\[\/code\]\n?/gi, '</pre>');
  s = s.replace(/\[spoiler\]/gi, '<span class="ptx-spoiler">').replace(/\[\/spoiler\]/gi, '</span>');
  s = s.replace(/\[url=(https?:\/\/[^\]\s]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noreferrer noopener">$2</a>');
  s = s.replace(/\[url\](https?:\/\/[^\[\s]+)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>');
  s = s.replace(/\[img\](https?:\/\/[^\[\s]+)\[\/img\]/gi, '<img src="$1" alt="">');
  return s.replace(/\n/g, '<br>');
}
// </core>

/* ───────────── Хранилище ───────────── */
// Страница грузит Prototype 1.7, который подменяет toJSON у Array/String — на время stringify убираем.
const PROTOS = [Array, String, Number, Boolean].map((c) => c.prototype);
function jstr(v, indent) {
  const saved = PROTOS.map((p) => [p, Object.prototype.hasOwnProperty.call(p, 'toJSON') ? p.toJSON : undefined]);
  saved.forEach(([p, f]) => { if (f) delete p.toJSON; });
  try { return JSON.stringify(v, null, indent); } finally { saved.forEach(([p, f]) => { if (f) p.toJSON = f; }); }
}
const store = {
  get(k, d) {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(k, null) : localStorage.getItem(k);
      return raw == null ? d : JSON.parse(raw);
    } catch (e) { return d; }
  },
  set(k, v) {
    try {
      const raw = jstr(v);
      if (typeof GM_setValue === 'function') GM_setValue(k, raw); else localStorage.setItem(k, raw);
      return true;
    } catch (e) { console.warn('[ptx] storage', e); return false; }
  },
};

/* ───────────── Состояние ───────────── */
const qs = new URLSearchParams(location.search);
const ITEM = qs.get('id') || (document.getElementById('id') || {}).value || '';
const SESSION = (document.getElementById('sessionid') || {}).value || '';
const K = (n) => `ptx:${n}:${ITEM}`;

const S = {
  langs: [], cur: 0, mode: 'edit', gridKey: null,
  filter: '', onlyDirty: false, loaded: false, loading: false,
  opts: { source: true, preview: true, sync: true, quick: false, diff: false }, scroll: { r: 0, tops: {} },
  quick: { key: null, vals: {}, flags: null, custom: [{ f: '', r: '' }] },
};
const byId = (id) => S.langs.find((l) => l.id === id);
const EN = () => { const l = byId(0); return l && l.state === 'ok' ? l : null; };
const cur = () => byId(S.cur) || S.langs[0];
const dirty = (l) => l.state === 'ok' && (l.title !== l.title0 || l.desc !== l.desc0 || !!l.create);
// Язык без перевода: на сервере ничего нет, поля показывают английский запасной текст. Пока его не правили и не нажали «Создать перевод», массовые операции такой язык не трогают.
const isEmpty = (l) => l.state === 'ok' && l.noContent && !dirty(l);
const dirtyList = () => S.langs.filter(dirty);
let histN = 0;

function langsFromPage() {
  const sel = document.getElementById('language');
  const list = sel ? [...sel.options] : [];
  const out = list.map((o) => {
    const txt = o.textContent.replace(/\s+/g, ' ').trim();
    const m = txt.match(/\(([^()]*:[^()]*)\)\s*$/);
    return {
      id: Number(o.value),
      name: (m ? txt.slice(0, m.index) : txt).trim(),
      updated: m ? m[1].replace(/^[^:]*:\s*/, '') : '',
      noContent: o.classList.contains('no_content'), create: false, // нет перевода: Steam подставляет английский текст
      title0: '', desc0: '', title: '', desc: '', state: 'idle', err: '',
    };
  });
  out.sort((a, b) => orderOf(a.id) - orderOf(b.id));
  return out;
}

/* ───────────── Сеть ───────────── */
function parseEditPage(html, lid) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ti = doc.querySelector('#title'), d = doc.querySelector('#description');
  if (!doc.querySelector('#ItemEditText') || !ti || !d) throw new Error(t('err.noForm'));
  const sel = doc.querySelector('#language option[selected]');
  if (sel && String(sel.value) !== String(lid)) throw new Error(t('err.otherLang', { id: sel.value }));
  return { title: normNL(ti.value), desc: normNL(d.value), empty: !!(sel && sel.classList.contains('no_content')) };
}
async function fetchLang(lid, tries = 3) {
  let last;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(`/sharedfiles/itemedittext/?id=${encodeURIComponent(ITEM)}&language=${lid}`, { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 429 || r.status >= 500) { last = new Error('HTTP ' + r.status); await sleep(1500 * (a + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return parseEditPage(await r.text(), lid);
    } catch (e) { last = e; if (a < tries - 1) await sleep(700 * (a + 1)); }
  }
  throw last || new Error(t('err.load'));
}
async function postLang(l) {
  const body = new URLSearchParams({
    id: ITEM, sessionid: SESSION, language: String(l.id),
    title: l.title.trim(), description: l.desc.replace(/\n/g, '\r\n'), // как браузер при отправке формы
  });
  const r = await fetch('/sharedfiles/itemedittext/', { method: 'POST', body, credentials: 'same-origin' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}

/* ───────────── DOM-помощник ───────────── */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) Object.keys(props).forEach((k) => {
    const v = props[k];
    if (k === 'class') el.className = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'hidden', 'readOnly', 'selected'].indexOf(k) >= 0) el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  });
  kids.flat(2).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return el;
}
const btn = (label, onclick, cls = '', title = '') => h('button', { type: 'button', class: 'ptx-btn ' + cls, onclick, title }, label);

/* ───────────── Стили ───────────── */
const CSS = `
.ptx-root,.ptx-root *{box-sizing:border-box}
.ptx-root{position:relative;display:grid;grid-template-rows:auto 1fr;height:calc(100vh - 24px);min-height:620px;width:100%;margin:0;background:#0d131a;color:#d3deea;font:14px/1.45 "Segoe UI",system-ui,sans-serif;text-align:left;border:1px solid #243446;border-radius:6px;overflow:hidden}
body.ptx-on #profileBlock,body.ptx-on #profileBlock .detailBox{width:100%!important;max-width:100%!important;float:none!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box}
body.ptx-on #rightContents{display:none!important}
/* освобождаем место: баннер Мастерской убираем (шапка остаётся со стилями Steam, ширина подгоняется в widen) */
body.ptx-on #BG_top_workshop{display:none!important}
body.ptx-on #ig_bottom{margin-top:0!important;padding-top:6px!important;background-image:none!important}
.ptx-native-bar{padding:8px 0}
.ptx-root[hidden]{display:none}
.ptx-root h1,.ptx-root h3,.ptx-root h4{margin:0;font-weight:600;color:#e8f0f8}
.ptx-bar{display:flex;align-items:center;gap:8px;padding:9px 14px;background:#131c26;border-bottom:1px solid #243446;flex-wrap:wrap}
.ptx-bar h1{font-size:15px;margin-right:6px}
.ptx-sp{flex:1}
.ptx-status{color:#8aa0b6;font-size:13px}
.ptx-btn{font:inherit;font-size:13px;color:#d3deea;background:#1b2836;border:1px solid #2d4157;border-radius:5px;padding:5px 11px;cursor:pointer}
.ptx-btn:hover{background:#223245;border-color:#3a5472}
.ptx-btn:disabled{opacity:.45;cursor:default}
.ptx-btn.pri{background:#2f7fb8;border-color:#4a9ad3;color:#fff}
.ptx-btn.pri:hover{background:#3a90cc}
.ptx-btn.sm{padding:2px 8px;font-size:12px}
.ptx-btn.on{background:#27415a;border-color:#66c0f4;color:#fff}
.ptx-root :focus-visible{outline:2px solid #66c0f4;outline-offset:1px}
.ptx-body{display:grid;grid-template-columns:270px 1fr;min-height:0}
.ptx-side{display:flex;flex-direction:column;min-height:0;background:#101822;border-right:1px solid #243446}
.ptx-side-t{padding:10px;display:grid;gap:7px;border-bottom:1px solid #1c2a3a}
.ptx-list{overflow:auto;flex:1}
.ptx-li{position:relative;display:grid;grid-template-columns:1fr auto;gap:0 8px;width:100%;text-align:left;font:inherit;color:inherit;background:none;border:0;border-bottom:1px solid #16212d;padding:7px 10px 7px 14px;cursor:pointer}
.ptx-li:hover{background:#16222f}
.ptx-li.act{background:#1d3248}
.ptx-li::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:transparent}
.ptx-li.d::before{background:#e3b341}
.ptx-li.w::before{background:#c98a2b}
.ptx-li.e::before{background:#ef6b6b}
.ptx-li.f{opacity:.6}
.ptx-li small{color:#7d93a9;grid-column:1/3;font-size:11.5px}
.ptx-bd{font-size:12px;display:flex;gap:6px}
.ptx-bd .b-d{color:#e3b341}.ptx-bd .b-w{color:#d9a24a}.ptx-bd .b-e{color:#ef6b6b}
.ptx-main{display:flex;flex-direction:column;min-width:0;min-height:0}
.ptx-tabs{display:flex;gap:4px;padding:8px 14px 0;border-bottom:1px solid #243446;align-items:flex-end}
.ptx-tab{font:inherit;color:#8aa0b6;background:none;border:0;border-bottom:2px solid transparent;padding:6px 12px;cursor:pointer}
.ptx-tab.act{color:#fff;border-bottom-color:#66c0f4}
.ptx-view{flex:1;min-height:0;overflow:auto;padding:14px}
.ptx-in,.ptx-ta,.ptx-sel{font:inherit;font-size:13.5px;color:#e2ebf4;background:#0a1017;border:1px solid #2b3e53;border-radius:5px;padding:6px 8px;width:100%}
.ptx-ta{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:13px;line-height:1.5;resize:vertical;white-space:pre-wrap}
.ptx-in:focus,.ptx-ta:focus,.ptx-sel:focus{border-color:#66c0f4;outline:none}
.ptx-ed{display:grid;grid-template-rows:auto auto auto 1fr auto;gap:10px;height:100%;min-height:480px}
.ptx-ed-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ptx-ed-h h3{font-size:16px;margin-right:6px}
.ptx-cnt{font-size:12px;color:#8aa0b6}
.ptx-cnt.over{color:#ef6b6b;font-weight:600}
.ptx-cols{display:grid;gap:10px;min-height:0}
.ptx-col{display:flex;flex-direction:column;gap:4px;min-width:0;min-height:0}
.ptx-col label{font-size:12px;color:#8aa0b6}
.ptx-col .ptx-ta{flex:1;resize:none;min-height:300px}
.ptx-prev{flex:1;overflow:auto;background:#0a1017;border:1px solid #2b3e53;border-radius:5px;padding:10px 14px;min-height:300px;line-height:1.55}
.ptx-prev h1,.ptx-prev h2,.ptx-prev h3{margin:.7em 0 .3em;color:#66c0f4}
.ptx-prev h2{font-size:17px}
.ptx-prev ul,.ptx-prev ol{margin:.3em 0 .6em 1.2em;padding:0}
.ptx-prev img{height:14px;vertical-align:-2px}
.ptx-prev a{color:#66c0f4}
.ptx-prev blockquote{margin:.4em 0;padding-left:10px;border-left:3px solid #2f4a63;color:#9db2c7}
.ptx-prev pre{background:#0f1822;padding:6px;border-radius:4px;overflow:auto}
.ptx-spoiler{background:#2a3a4b;color:#2a3a4b;border-radius:3px}.ptx-spoiler:hover{color:inherit}
.ptx-lint{display:grid;gap:3px;font-size:13px}
.ptx-lint div{padding:3px 8px;border-left:3px solid}
.ptx-lint .err{border-color:#ef6b6b;color:#f2a1a1}
.ptx-lint .warn{border-color:#c98a2b;color:#e5be83}
.ptx-lint .ok{border-color:#3f8f55;color:#8cc79c}
.ptx-grid-h{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.ptx-grid-h .ptx-sel{width:auto;min-width:260px}
.ptx-row{display:grid;grid-template-columns:150px 1fr;gap:10px;padding:8px 0;border-top:1px solid #1a2837;align-items:start}
.ptx-row-n{font-size:13px;color:#b7c8d9;padding-top:6px}
.ptx-row-n b{color:#e3b341;font-weight:600}
.ptx-miss{padding:8px;color:#8aa0b6;border:1px dashed #2d4157;border-radius:5px;display:flex;gap:10px;align-items:center}
.ptx-back{position:fixed;inset:0;z-index:2147483100;background:rgba(3,8,13,.72);display:grid;place-items:center;padding:20px}
.ptx-dlg{width:min(760px,100%);max-height:92vh;display:flex;flex-direction:column;background:#131c26;border:1px solid #2d4157;border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,.6)}
.ptx-dlg.wide{width:min(1060px,100%)}
.ptx-dlg-h{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #243446}
.ptx-dlg-h h3{font-size:15px}
.ptx-x{font-size:20px;line-height:1;background:none;border:0;color:#8aa0b6;cursor:pointer}
.ptx-dlg-b{padding:14px 16px;overflow:auto;display:grid;gap:12px}
.ptx-dlg-f{padding:10px 16px;border-top:1px solid #243446;display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
.ptx-dlg h4{font-size:13.5px;margin-bottom:6px}
.ptx-note{font-size:12.5px;color:#8aa0b6}
.ptx-vt{display:grid;grid-template-columns:130px 110px 1fr auto;gap:6px;align-items:start}
.ptx-chips{display:flex;flex-wrap:wrap;gap:4px}
.ptx-chip{font:inherit;font-size:12px;padding:1px 7px;border-radius:10px;border:1px solid #2d4157;background:#0f1822;color:#8aa0b6;cursor:pointer}
.ptx-chip.on{background:#27415a;border-color:#66c0f4;color:#fff}
.ptx-tr{display:grid;grid-template-columns:140px 1fr;gap:8px;padding:5px 0;border-top:1px solid #1a2837;align-items:start}
.ptx-tr .ptx-ta{min-height:0}
.ptx-chk{display:flex;gap:8px;align-items:center;font-size:13px}
.ptx-srow{border:1px solid #243446;border-radius:6px}
.ptx-srow-h{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;padding:7px 10px;align-items:center}
.ptx-srow-h .st{font-size:12.5px;color:#8aa0b6}
.ptx-srow-h .st.ok{color:#7bc08c}.ptx-srow-h .st.err{color:#ef6b6b}.ptx-srow-h .st.warn{color:#e3b341}
.ptx-diff{border-top:1px solid #243446;font:12px/1.45 ui-monospace,Consolas,monospace;max-height:300px;overflow:auto;background:#0a1017}
.ptx-dl{padding:0 10px;white-space:pre-wrap;word-break:break-word}
.ptx-dl.add{background:#10281a;color:#9fe0b0}.ptx-dl.del{background:#2c1416;color:#f0a4a4}
.ptx-dl.ctx{color:#7d93a9}.ptx-dl.gap{color:#587089;text-align:center;font-style:italic}
.ptx-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483200;background:#223a52;border:1px solid #4a7ba3;color:#fff;padding:8px 16px;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.5);max-width:80vw}
@media (max-width:900px){.ptx-body{grid-template-columns:1fr;grid-template-rows:200px 1fr}.ptx-cols{grid-template-columns:1fr!important}.ptx-row{grid-template-columns:1fr}}
@media (prefers-reduced-motion:no-preference){.ptx-toast{animation:ptxin .15s ease-out}@keyframes ptxin{from{opacity:0;transform:translate(-50%,6px)}}}

/* ── Оформление под Steam: прозрачный корень, полупрозрачные панели, родные цвета и кнопки ── */
.ptx-root{height:auto;min-height:0;overflow:visible;border:0;border-radius:0;background:none;color:#c6d4df;font:13px/1.5 "Motiva Sans",Arial,Helvetica,sans-serif;gap:10px}
.ptx-root h1,.ptx-root h3,.ptx-root h4,.ptx-dlg h3,.ptx-dlg h4{color:#fff;font-family:inherit}
.ptx-bar{background:none;border:0;padding:0;gap:6px}
.ptx-bar .ptx-btn{padding:5px 10px}.ptx-bar-top{flex:1 1 100%;display:flex;align-items:center;gap:10px;margin-bottom:4px}
.ptx-bar-top .ptx-status{flex:1}.ptx-bar .ptx-sp{display:none}
.ptx-status,.ptx-note,.ptx-cnt,.ptx-col label,.ptx-li small{color:#8f98a0}
.ptx-row-n{color:#c6d4df}
.ptx-btn{font:inherit;font-size:13px;background:rgba(103,193,245,.2);border:0;border-radius:2px;color:#67c1f5;padding:5px 14px;line-height:1.5;text-decoration:none;display:inline-block}
.ptx-btn:hover{background:linear-gradient(-60deg,#417a9b 5%,#67c1f5 95%);color:#fff;border:0}
.ptx-btn.pri{background:linear-gradient(to bottom,#75b022 5%,#588a1b 95%);color:#d2efa9}
.ptx-btn.pri:hover{background:linear-gradient(to bottom,#8ed629 5%,#6aa621 95%);color:#fff}
.ptx-btn.on{background:#67c1f5;color:#1b2838}
.ptx-btn.sm{padding:1px 9px;font-size:12px}
.ptx-btn:disabled{opacity:.4}
.ptx-root :focus-visible,.ptx-dlg :focus-visible{outline:1px solid #67c1f5;outline-offset:1px}
.ptx-body{grid-template-columns:200px minmax(0,1fr);gap:10px;align-items:start}
.ptx-root{max-width:100%}.ptx-main,.ptx-view{min-width:0}
.ptx-side{position:sticky;top:8px;max-height:calc(100vh - 16px);background:rgba(0,0,0,.25);border:0;border-radius:3px}
.ptx-side-t{border-bottom:1px solid rgba(255,255,255,.06)}
.ptx-li{color:#c6d4df;border-bottom:1px solid rgba(255,255,255,.04)}
.ptx-li:hover{background:rgba(103,193,245,.1)}
.ptx-li.act{background:rgba(103,193,245,.22);color:#fff}
.ptx-main{background:rgba(0,0,0,.2);border-radius:3px}
.ptx-tabs{border-bottom:1px solid rgba(255,255,255,.08);padding:8px 14px 0}
.ptx-tab{font-family:inherit;color:#8f98a0}
.ptx-tab:hover{color:#c6d4df}
.ptx-tab.act{color:#fff;border-bottom-color:#67c1f5}
.ptx-view{overflow:visible;padding:14px}
.ptx-ed{height:auto;min-height:0}
.ptx-col .ptx-ta{min-height:max(380px,calc(100vh - 340px))}
.ptx-in,.ptx-ta,.ptx-sel{background:rgba(0,0,0,.3);border:1px solid #000;border-radius:3px;color:#fff;box-shadow:1px 1px 0 rgba(255,255,255,.08)}
.ptx-in:focus,.ptx-ta:focus,.ptx-sel:focus{border-color:#67c1f5;outline:none}
.ptx-prev{background:rgba(0,0,0,.3);border:1px solid #000;color:#c6d4df}
.ptx-prev a,.ptx-prev h1,.ptx-prev h2,.ptx-prev h3{color:#67c1f5}
.ptx-row,.ptx-tr{border-top-color:rgba(255,255,255,.06)}
.ptx-miss{border-color:rgba(255,255,255,.15);color:#8f98a0}
.ptx-chip{background:rgba(0,0,0,.3);border-color:#000;color:#8f98a0}
.ptx-chip.on{background:#67c1f5;border-color:#67c1f5;color:#1b2838}
.ptx-srow{border-color:rgba(255,255,255,.1)}
.ptx-diff{background:rgba(0,0,0,.35);border-top-color:rgba(255,255,255,.08)}
.ptx-back{background:rgba(0,0,0,.8)}
.ptx-dlg{background:linear-gradient(to bottom,#2a475e 0,#1b2838 140px);border:1px solid #000;border-radius:3px;color:#c6d4df;font:13px/1.5 "Motiva Sans",Arial,Helvetica,sans-serif}
.ptx-dlg-h,.ptx-dlg-f{border-color:rgba(255,255,255,.08)}
.ptx-x{color:#8f98a0}.ptx-x:hover{color:#fff}
.ptx-toast{background:#2a475e;border:1px solid #67c1f5;font-family:"Motiva Sans",Arial,sans-serif}
.ptx-viewbar{display:flex;align-items:center;gap:6px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)}
.ptx-btn.warn{background:linear-gradient(to bottom,#e8a33d 5%,#b97a1e 95%);color:#fff;font-weight:600;padding:6px 16px;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.ptx-btn.warn:hover{background:linear-gradient(to bottom,#f5b955 5%,#d18d27 95%);color:#fff}
.ptx-li.n{opacity:.6}.ptx-li.n small{font-style:italic}.ptx-bd .b-n{color:#8f98a0}
.ptx-banner{padding:8px 12px;border-left:3px solid #e8a33d;background:rgba(232,163,61,.12);color:#e5c48a;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ptx-banner b{color:#f3d399}
.ptx-native-bar{padding:0 0 10px}
.ptx-body.q-open{grid-template-columns:250px 200px minmax(0,1fr)}
.ptx-body.q-shut{grid-template-columns:34px 200px minmax(0,1fr)}
.ptx-quick{position:sticky;top:8px;align-self:start;display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 16px);overflow:hidden;background:rgba(0,0,0,.25);border-radius:3px}
.ptx-qtoggle{font:inherit;font-weight:600;color:#fff;background:none;border:0;cursor:pointer;text-align:left;padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.06)}
.ptx-qtoggle:hover{background:rgba(103,193,245,.12)}
.q-shut .ptx-qtoggle{writing-mode:vertical-rl;color:#67c1f5;padding:12px 8px;border:0;white-space:nowrap}
.q-shut .ptx-quick-b{display:none}
.ptx-quick-b{padding:10px;display:grid;gap:10px;overflow:auto;align-content:start}
.ptx-qlist{display:grid;gap:5px}
.ptx-qrow{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:6px;align-items:center}
.ptx-qold{font-variant-numeric:tabular-nums;color:#c6d4df;max-width:105px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptx-qrow.wide{grid-template-columns:minmax(0,1fr)}.ptx-qrow.wide .ptx-qold{max-width:none;font-size:12px}
.ptx-qpair{display:grid;gap:4px}
.ptx-qerr{grid-column:1/-1;color:#ef6b6b;font-size:12px;line-height:1.3}
.ptx-quick .ptx-in.bad{border-color:#ef6b6b}
.ptx-quick .ptx-sel{width:100%}.ptx-quick .ptx-in{padding:3px 6px;min-width:0}
.ptx-ed{--ptx-h:max(420px,calc(100vh - 300px))}
.ptx-col .ptx-ta,.ptx-col .ptx-prev{flex:none;height:var(--ptx-h);min-height:0;overflow:auto}
.ptx-col .ptx-prev{overflow-wrap:anywhere}
.ptx-native-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px;padding:10px 14px;background:rgba(0,0,0,.25);border-radius:3px;border-left:3px solid #67c1f5}
.ptx-native-bar[hidden]{display:none}
.ptx-native-t{color:#8f98a0;font:13px/1.4 "Motiva Sans",Arial,Helvetica,sans-serif}
.ptx-diffpane{height:var(--ptx-h);overflow:auto;background:rgba(0,0,0,.35);border:1px solid #000;border-radius:3px;font:12px/1.45 ui-monospace,Consolas,monospace}
.ptx-dl .sg{display:inline-block;width:1.4em;opacity:.7;user-select:none}
.ptx-dl .w{border-radius:2px;color:#fff}
.ptx-dl.add .w{background:rgba(63,185,80,.45)}.ptx-dl.del .w{background:rgba(248,81,73,.45)}
.ptx-dl.gap{padding:1px 10px;background:rgba(103,193,245,.08)}
.ptx-stat i{font-style:normal;font-weight:600}.ptx-stat .a{color:#7bc08c}.ptx-stat .r{color:#ef6b6b}
.ptx-sum{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;background:rgba(0,0,0,.25);border-radius:3px}
`;

/* ───────────── Корневой интерфейс ───────────── */
let elHeader = document.querySelector('#mainContents > .header');
let root, elList, elView, elStatus, elSaveBtn, elTabs, elFilter, nativeForm, nativeBar;
let dlgStack = [];
let tmr;

function toast(msg, ms = 3200) {
  const t = h('div', { class: 'ptx-toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
const setStatus = (s) => { if (elStatus) elStatus.textContent = s; };

function dialog(title, body, footer, wide) {
  const back = h('div', { class: 'ptx-back' });
  const close = () => { back.remove(); dlgStack = dlgStack.filter((d) => d !== api); };
  const api = { close, back };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.append(h('div', { class: 'ptx-dlg' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'ptx-dlg-h' }, h('h3', null, title), h('button', { class: 'ptx-x', type: 'button', 'aria-label': t('common.close'), onclick: close }, '×')),
    h('div', { class: 'ptx-dlg-b' }, body),
    h('div', { class: 'ptx-dlg-f' }, footer)));
  document.body.append(back);
  dlgStack.push(api);
  api.footer = back.querySelector('.ptx-dlg-f');
  api.body = back.querySelector('.ptx-dlg-b');
  return api;
}

function lintOf(l) {
  if (isEmpty(l)) return [];
  const en = EN();
  return lint(l.title, l.desc, en ? { title: en.title, desc: en.desc } : null, l.id === 0);
}

function refreshAll() { renderSidebar(); if (elTabs) renderTabs(); renderMain(); renderQuick(); updateChrome(); }
function touch() {
  clearTimeout(tmr);
  tmr = setTimeout(() => { renderSidebar(); updateChrome(); if (S.mode === 'edit') { renderLintBox(); renderPreview(); renderDiffPane(); } }, 220);
}
const baseTitle = document.title;
function updateChrome() {
  const n = dirtyList().length;
  if (elSaveBtn) { elSaveBtn.textContent = n ? t('save.btnN', { n }) : t('save.btn'); elSaveBtn.disabled = !n; }
  document.title = (n ? `✎${n} · ` : '') + baseTitle;
}

function renderSidebar() {
  if (!elList) return;
  const f = S.filter.trim().toLowerCase();
  elList.replaceChildren(...S.langs
    .filter((l) => (!f || l.name.toLowerCase().indexOf(f) >= 0 || metaOf(l.id).lbl.toLowerCase() === f) && (!S.onlyDirty || dirty(l)) && !(S.hideEmpty && isEmpty(l)))
    .map((l) => {
      const issues = l.state === 'ok' ? lintOf(l) : [];
      const ne = issues.filter((i) => i.lvl === 'err').length, nw = issues.length - ne;
      const cls = ['ptx-li'];
      if (l.id === S.cur) cls.push('act');
      if (isEmpty(l)) cls.push('n');
      if (l.state === 'err') cls.push('f'); else if (ne) cls.push('e'); else if (dirty(l)) cls.push('d'); else if (nw) cls.push('w');
      const badges = h('span', { class: 'ptx-bd' },
        l.state === 'loading' ? '…' : null, l.state === 'err' ? h('span', { class: 'b-e', title: l.err }, '✕') : null,
        isEmpty(l) ? h('span', { class: 'b-n', title: t('side.noTr') }, '∅') : null,
        dirty(l) ? h('span', { class: 'b-d', title: l.noContent ? t('side.willCreate') : t('side.changed') }, l.noContent ? '＋' : '✎') : null,
        ne ? h('span', { class: 'b-e', title: t('side.errors') }, '⛔' + ne) : null,
        nw ? h('span', { class: 'b-w', title: t('side.warnings') }, '⚠' + nw) : null);
      return h('button', { type: 'button', class: cls.join(' '), onclick: () => { S.cur = l.id; if (S.mode === 'grid') S.mode = 'edit'; refreshAll(); } },
        h('span', null, `${l.name} `, h('span', { class: 'ptx-cnt' }, metaOf(l.id).lbl)), badges,
        h('small', null, l.state === 'err' ? t('side.error', { err: l.err }) : l.noContent ? (dirty(l) ? t('side.newTr') : t('side.noTr')) : l.updated ? t('side.updated', { when: l.updated }) : t('side.never')));
    }));
}

function renderTabs() {
  elTabs.replaceChildren(
    ...[['edit', t('tab.edit')], ['grid', t('tab.grid')]].map(([m, label]) =>
      h('button', { type: 'button', class: 'ptx-tab' + (S.mode === m ? ' act' : ''), onclick: () => { S.mode = m; renderTabs(); renderMain(); } }, label)),
    h('span', { style: 'flex:1' }),
    h('span', { style: 'padding-bottom:4px' }, btn(histN ? t('hist.btnN', { n: histN }) : t('hist.btn'), openHistory, 'sm', t('hist.btnTip'))));
}
function renderMain() {
  if (!elView) return;
  const x = window.scrollX, y = window.scrollY; // позиция страницы не должна «прыгать» при перерисовке
  resetWide();
  elView.replaceChildren();
  if (!S.langs.length) { elView.append(h('p', null, t('main.noLangs'))); return; }
  if (S.mode === 'grid') { renderGrid(); widen(); } else renderEditor();
  window.scrollTo(x, y);
}

/* ── Редактор одного языка ── */
let eLint, ePrev, eDiff, eCT, eCD, eGrid, elBody, ePanes = [], eN = 1;
const HDR_PROPS = ['width', 'max-width', 'margin-left', 'margin-right', 'box-sizing', 'float'];
function resetWide() {
  if (root) { root.style.width = ''; root.style.maxWidth = ''; root.style.marginLeft = ''; }
  if (elHeader) HDR_PROPS.forEach((k) => elHeader.style.removeProperty(k));
}
// Шапка Steam (хлебные крошки и заголовок) остаётся со своими стилями, но занимает ту же ширину и стоит на том же месте, что и редактор.
// Стили ставятся с !important: у шапки в CSS Steam могут быть фиксированная ширина и margin:auto.
function alignHeader() {
  if (!elHeader || !root || root.hidden) return;
  HDR_PROPS.forEach((k) => elHeader.style.removeProperty(k));
  const pr = elHeader.parentNode.getBoundingClientRect(), rr = root.getBoundingClientRect();
  if (!rr.width) return;
  const put = (k, v) => elHeader.style.setProperty(k, v, 'important');
  put('box-sizing', 'border-box'); put('float', 'none'); put('max-width', 'none');
  put('margin-right', '0'); put('margin-left', `${Math.round(rr.left - pr.left)}px`);
  put('width', `${Math.round(rr.width)}px`);
}
function widen() { widenRoot(); alignHeader(); requestAnimationFrame(alignHeader); }
function widenRoot() {
  resetWide();
  if (!root || root.hidden) return;
  const cols = S.mode === 'edit' ? eN : 0;
  const mainNeed = cols >= 2 ? cols * 360 + (cols - 1) * 10 + 28 : 820;
  const r = root.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const leftRoom = Math.max(0, r.left - 14), rightRoom = Math.max(0, vw - r.right - 14);
  const want = mainNeed + 210 + (S.opts.quick ? 260 : 44) - r.width; // 210 = список языков + отступ; левая колонка: 250+10 или 34+10
  const extra = Math.floor(Math.max(0, Math.min(leftRoom + rightRoom, want)));
  if (extra < 20) return;
  const left = Math.min(leftRoom, Math.max(extra / 2, extra - rightRoom));
  root.style.maxWidth = 'none';
  root.style.width = `calc(100% + ${extra}px)`;
  root.style.marginLeft = `${-left}px`;
}

/* ── Общий скролл ── */
let uiTmr;
function saveUi() { clearTimeout(uiTmr); uiTmr = setTimeout(() => store.set(K('ui'), { opts: S.opts, r: S.scroll.r }), 400); }
const ratioOf = (el) => { const m = el.scrollHeight - el.clientHeight; return m > 0 ? el.scrollTop / m : 0; };
// Программная прокрутка помечается ожидаемым значением, чтобы её собственное событие scroll не запускало синхронизацию обратно.
function setTop(el, t) {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  t = Math.max(0, Math.min(max, Math.round(t)));
  if (Math.abs(el.scrollTop - t) < 1) return;
  el._x = t; el.scrollTop = t;
  requestAnimationFrame(() => requestAnimationFrame(() => { el._x = null; }));
}
const setRatio = (el, r) => { const m = el.scrollHeight - el.clientHeight; if (m > 0) setTop(el, r * m); };
function restoreScroll() {
  if (S.opts.sync) ePanes.forEach((p) => setRatio(p, S.scroll.r));
  else ePanes.forEach((p) => { const t = S.scroll.tops[p.dataset.pane]; if (t != null) setTop(p, t); });
}
function bindScroll() {
  ePanes.forEach((el) => el.addEventListener('scroll', () => {
    if (el._x != null && Math.abs(el.scrollTop - el._x) <= 2) return;
    S.scroll.r = ratioOf(el);
    if (S.opts.sync) ePanes.forEach((o) => { if (o !== el) setRatio(o, S.scroll.r); });
    ePanes.forEach((p) => { S.scroll.tops[p.dataset.pane] = p.scrollTop; });
    saveUi();
  }, { passive: true }));
}

function renderEditor() {
  const l = cur();
  if (!l) return;
  if (l.state === 'loading' || l.state === 'idle') { elView.append(h('p', { class: 'ptx-note' }, t('common.loading'))); return; }
  if (l.state === 'err') { elView.append(h('p', null, t('ed.loadFailed', { err: l.err })), btn(t('common.retry'), () => reloadOne(l))); return; }
  const en = EN();
  const showSrc = S.opts.source && en && l.id !== 0;
  eCT = h('span', { class: 'ptx-cnt' }); eCD = h('span', { class: 'ptx-cnt' });
  const title = h('input', { class: 'ptx-in', value: l.title, 'aria-label': t('common.title'), oninput: (e) => { l.title = e.target.value; updCounts(l); touch(); } });
  const ta = h('textarea', { class: 'ptx-ta', value: l.desc, spellcheck: 'false', 'aria-label': t('common.desc'), 'data-pane': 'edit', oninput: (e) => { l.desc = e.target.value; updCounts(l); touch(); } });
  const taSrc = showSrc ? h('textarea', { class: 'ptx-ta', value: en.desc, readOnly: true, spellcheck: 'false', 'aria-label': t('ed.srcAria'), 'data-pane': 'src' }) : null;
  eLint = h('div', { class: 'ptx-lint' });
  ePrev = S.opts.preview ? h('div', { class: 'ptx-prev', 'data-pane': 'prev' }) : null;
  eDiff = S.opts.diff ? h('div', { class: 'ptx-diffpane' }) : null;
  const cols = [];
  if (taSrc) cols.push(h('div', { class: 'ptx-col' }, h('label', null, t('ed.srcLabel')), taSrc));
  cols.push(h('div', { class: 'ptx-col' }, h('label', null, t('ed.descLabel', { name: l.name })), ta));
  if (ePrev) cols.push(h('div', { class: 'ptx-col' }, h('label', null, t('ed.prevLabel')), ePrev));
  if (eDiff) cols.push(h('div', { class: 'ptx-col' }, h('label', null, t('ed.diffLabel')), eDiff));
  eN = cols.length;
  ePanes = [taSrc, ta, ePrev].filter(Boolean);
  const grid = h('div', { class: 'ptx-cols' }, cols);
  eGrid = grid;
  grid.style.gridTemplateColumns = `repeat(${cols.length}, minmax(0, 1fr))`;
  const tg = (key, label) => btn(label, () => { S.opts[key] = !S.opts[key]; saveUi(); renderMain(); }, S.opts[key] ? 'on' : '');
  const banner = l.noContent ? h('div', { class: 'ptx-banner' }, h('b', null, t('ed.noTrHead')), t('ed.noTrText'),
    dirty(l) ? t('ed.willCreate') : btn(t('ed.createTr'), () => { l.create = true; refreshAll(); }, 'sm')) : null;
  elView.append(h('div', { class: 'ptx-ed' },
    h('div', { class: 'ptx-ed-h' },
      h('h3', null, l.name), eCT, eCD, h('span', { class: 'ptx-sp' }),
      l.id !== 0 && en ? btn(t('ed.takeEn'), () => { if (confirm(t('ed.takeEnConfirm'))) { l.title = en.title; l.desc = en.desc; refreshAll(); } }, 'sm') : null,
      dirty(l) ? btn(t('ed.revert'), () => { l.title = l.title0; l.desc = l.desc0; l.create = false; refreshAll(); }, 'sm') : null,
      ),
    banner,
    h('div', { class: 'ptx-viewbar' }, h('span', { class: 'ptx-note' }, t('ed.show')), l.id !== 0 && en ? tg('source', t('ed.tgSrc')) : null, tg('preview', t('ed.tgPrev')), btn(t('common.changes') + (dirty(l) ? ' ✎' : ''), () => { S.opts.diff = !S.opts.diff; saveUi(); renderMain(); }, S.opts.diff ? 'on' : '', t('ed.diffTip')),
      h('span', { class: 'ptx-sp' }),
      ePanes.length > 1 ? btn(t('ed.sync'), () => { S.opts.sync = !S.opts.sync; saveUi(); renderMain(); }, S.opts.sync ? 'on' : '', t('ed.syncTip')) : null),
    h('div', null, h('div', { class: 'ptx-col' }, h('label', null, t('common.title')), title)),
    grid, eLint));
  if (banner) elView.firstChild.style.gridTemplateRows = 'auto auto auto auto 1fr auto';
  widen(); updCounts(l); renderLintBox(); renderPreview(); renderDiffPane();
  restoreScroll(); bindScroll();
  requestAnimationFrame(restoreScroll); // повторно: после окончательной вёрстки (перенос строк, подгрузка флагов)
}
function updCounts(l) {
  if (!eCT) return;
  eCT.textContent = `${t('common.title')} ${l.title.length}/${TITLE_MAX}`; eCT.className = 'ptx-cnt' + (l.title.length > TITLE_MAX ? ' over' : '');
  eCD.textContent = `${t('common.desc')} ${l.desc.length}/${DESC_MAX}`; eCD.className = 'ptx-cnt' + (l.desc.length > DESC_MAX ? ' over' : '');
}
function renderLintBox() {
  if (!eLint || S.mode !== 'edit') return;
  const l = cur();
  if (!l || l.state !== 'ok') return;
  const issues = lintOf(l);
  eLint.replaceChildren(...(issues.length ? issues.map((i) => h('div', { class: i.lvl }, i.msg)) : [h('div', { class: 'ok' }, t('ed.lintOk'))]));
}
function renderPreview() {
  if (!ePrev || !ePrev.isConnected) return;
  const top = ePrev.scrollTop, ed = ePanes.find((p) => p.dataset.pane === 'edit');
  ePrev.innerHTML = bb2html(cur().desc); // bb2html экранирует весь ввод, пропуская только http(s)-ссылки
  if (S.opts.sync && ed) setRatio(ePrev, ratioOf(ed)); else setTop(ePrev, top);
  ePrev.querySelectorAll('img').forEach((i) => i.addEventListener('error', () => i.replaceWith(document.createTextNode('▣'))));
}

function renderDiffPane() {
  if (!eDiff || !eDiff.isConnected) return;
  const l = cur(), top = eDiff.scrollTop;
  if (!l || l.state !== 'ok') return;
  const box = diffBox(l.title0, l.desc0, l.title, l.desc, 3);
  eDiff.replaceChildren(...box.childNodes);
  eDiff.scrollTop = top;
}

/* ── Одна секция во всех языках ── */
function sectionKeys() {
  const ks = [];
  const add = (d) => parseSections(d).secs.forEach((s) => { if (ks.indexOf(s.key) < 0) ks.push(s.key); });
  const en = EN(); if (en) add(en.desc);
  S.langs.forEach((l) => { if (l.state === 'ok') add(l.desc); });
  return ks;
}
function keyLabel(k) {
  const en = EN();
  let t = '';
  const look = (l) => { const s = parseSections(l.desc).secs.find((x) => x.key === k); if (s && !t) t = s.title; };
  if (en) look(en);
  if (!t) S.langs.forEach((l) => l.state === 'ok' && look(l));
  return t || k;
}
function removeSection(desc, key) {
  const p = parseSections(desc);
  const i = p.secs.findIndex((s) => s.key === key);
  if (i < 0) return desc;
  p.secs.splice(i, 1);
  if (i === p.secs.length && p.secs.length) p.secs[p.secs.length - 1].tail = '';
  return joinSections(p);
}
function renderGrid() {
  const keys = sectionKeys();
  if (!keys.length) { elView.append(h('p', null, t('grid.none'))); return; }
  if (keys.indexOf(S.gridKey) < 0) S.gridKey = keys[0];
  const key = S.gridKey;
  const en = EN();
  const order = en ? parseSections(en.desc).secs.map((s) => s.key) : keys;
  const sel = h('select', { class: 'ptx-sel', 'aria-label': t('common.section'), onchange: (e) => { S.gridKey = e.target.value; renderMain(); } },
    keys.map((k) => h('option', { value: k, selected: k === key }, `${k}  ${keyLabel(k)}`)));
  elView.append(h('div', { class: 'ptx-grid-h' }, sel,
    h('span', { class: 'ptx-note' }, t('grid.note'))));
  S.langs.forEach((l) => {
    if (l.state !== 'ok') { elView.append(h('div', { class: 'ptx-row' }, h('div', { class: 'ptx-row-n' }, l.name), h('div', { class: 'ptx-note' }, l.state === 'err' ? t('ed.loadFailed', { err: l.err }) : t('common.loading')))); return; }
    if (isEmpty(l)) { elView.append(h('div', { class: 'ptx-row' }, h('div', { class: 'ptx-row-n' }, l.name), h('div', { class: 'ptx-miss' }, t('grid.noTr'), btn(t('ed.createTr'), () => { l.create = true; refreshAll(); }, 'sm')))); return; }
    const sec = parseSections(l.desc).secs.find((s) => s.key === key);
    const name = h('div', { class: 'ptx-row-n' }, l.name, dirty(l) ? h('b', null, ' ✎') : null);
    let cell;
    if (sec) {
      cell = h('textarea', {
        class: 'ptx-ta', value: sec.body, spellcheck: 'false', 'aria-label': t('grid.cellAria', { name: l.name, key }),
        rows: Math.max(3, Math.min(14, sec.body.split('\n').length + 1)),
        oninput: (e) => {
          const v = e.target.value;
          l.desc = v.trim() === '' ? removeSection(l.desc, key) : setSection(l.desc, key, v, order);
          touch();
        },
      });
    } else {
      const src = en ? parseSections(en.desc).secs.find((s) => s.key === key) : null;
      cell = h('div', { class: 'ptx-miss' }, t('grid.noSec'),
        src ? btn(t('grid.addFromEn'), () => { l.desc = setSection(l.desc, key, src.body, order); refreshAll(); }, 'sm') : null);
    }
    elView.append(h('div', { class: 'ptx-row' }, name, cell));
  });
}

/* ───────────── Загрузка ───────────── */
async function reloadOne(l) {
  l.state = 'loading'; refreshAll();
  try { const r = await fetchLang(l.id); l.title0 = l.title = r.title; l.desc0 = l.desc = r.desc; l.noContent = r.empty; l.create = false; l.state = 'ok'; l.err = ''; }
  catch (e) { l.state = 'err'; l.err = e.message || String(e); }
  refreshAll();
}
async function loadAll() {
  if (S.loading) return;
  S.loading = true;
  const todo = S.langs.filter((l) => l.state !== 'ok');
  todo.forEach((l) => { l.state = 'loading'; l.err = ''; });
  let done = 0;
  setStatus(t('load.progress', { done: 0, total: todo.length }));
  renderSidebar();
  await pool(todo, 3, async (l) => {
    try { const r = await fetchLang(l.id); l.title0 = l.title = r.title; l.desc0 = l.desc = r.desc; l.noContent = r.empty; l.state = 'ok'; }
    catch (e) { l.state = 'err'; l.err = e.message || String(e); }
    setStatus(t('load.progress', { done: ++done, total: todo.length }));
    renderSidebar();
  }, 120);
  S.loading = false; S.loaded = true;
  const bad = S.langs.filter((l) => l.state === 'err').length;
  const ne = S.langs.filter((l) => l.noContent).length;
  setStatus((bad ? t('load.withErr', { n: bad }) : t('load.all', { n: S.langs.length })) + (ne ? t('load.noTr', { n: ne }) : ''));
  refreshAll();
}

/* ───────────── Общие данные: числа и флаги секции ───────────── */
function loadPrefs() {
  const ui = store.get(K('ui'), {});
  if (ui.opts) Object.keys(S.opts).forEach((k) => { if (typeof ui.opts[k] === 'boolean') S.opts[k] = ui.opts[k]; });
  if (typeof ui.r === 'number') S.scroll.r = ui.r;
}
// Меняем только то, что вне картинок и ссылок.
const outsideTags = (text, fn) => text.split(/(\[img\][\s\S]*?\[\/img\]|https?:\/\/[^\s\[\]]+)/gi).map((p, i) => (i % 2 ? p : fn(p))).join('');
// Новое число пишем в том же формате, что и старое в этом языке: 300,000 → 350,000; 300 000 → 350 000; 800 → 900.
function formatLike(tok, n) {
  const m = tok.match(/[^\d]/);
  const plain = String(n);
  return m ? plain.replace(/\B(?=(\d{3})+(?!\d))/g, m[0]) : plain;
}
// Разбор «значений» секции. Целые с разделителями тысяч (300 000, 300,000) — число; «42.15», «42,15», версии и даты — одно десятичное значение.
const VAL_RE = /\d{1,3}(?:[ \u00a0\u202f.,']\d{3})+(?!\d)|\d+(?:[.,]\d+)+|\d+/g;
const THOUS_RE = /^\d{1,3}(?:[ \u00a0\u202f.,']\d{3})+$/;
const URL_RE = /https?:\/\/[^\s\[\]]+/g;
const NAME_RE = /(?<![A-Za-z0-9])[A-Z][A-Za-z0-9]{2,}(?: [A-Z][A-Za-z0-9]+)*(?![A-Za-z0-9])/g;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trimUrl = (m) => { const u = m.replace(/[.,;:!?)»"']+$/, ''); return [u, m.slice(u.length)]; };
const outsideImg = (text, fn) => text.split(/(\[img\][\s\S]*?\[\/img\])/gi).map((p, i) => (i % 2 ? p : fn(p))).join('');
function eachValue(text, fn) {
  return text.replace(VAL_RE, (tok, off) => {
    const prev = text[off - 1] || '', next = text[off + tok.length] || '';
    const dec = /[.,]/.test(tok) && !THOUS_RE.test(tok);
    if (/[A-Za-z0-9_\/=.:#-]/.test(prev) && !(dec && /[vV]/.test(prev))) return tok; // не трогаем куски URL, идентификаторов; «v42.15» — версия
    if (/[A-Za-z0-9_]/.test(next)) return tok;
    const kind = dec ? 'd' : 'n';
    const r = fn(tok, kind, dec ? tok.replace(/,/g, '.') : String(toNum(tok)));
    return r == null ? tok : r;
  });
}
// Десятичное значение пишем с тем разделителем, который уже стоит в этом языке (42,15 ↔ 42.15).
// Целое: если разделитель тысяч указан в поле ввода (200,000) — он ставится во всех языках; если введено без разделителя (200000) — у каждого языка остаётся его формат.
const groupBy = (n, sep) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
const formatValue = (tok, kind, c) => (kind === 'n' ? (c.sep ? groupBy(c.nv, c.sep) : formatLike(tok, c.nv)) : (/,/.test(tok) && !/\./.test(tok) ? String(c.nv).replace(/\./g, ',') : String(c.nv)));

// Что есть в выбранной секции: числа и версии, ссылки, названия (общие слова латиницей), набор флагов.
function quickScan() {
  const keys = sectionKeys();
  if (keys.indexOf(S.quick.key) < 0) S.quick.key = keys.indexOf('📊') >= 0 ? '📊' : keys[0];
  const cnt = new Map();
  let flagIds = null, withSec = 0, total = 0;
  S.langs.forEach((l) => {
    if (l.state !== 'ok' || isEmpty(l)) return;
    total++;
    const sec = parseSections(l.desc).secs.find((s) => s.key === S.quick.key);
    if (!sec) return;
    withSec++;
    const seen = new Set();
    const bump = (kind, key, label) => { const id = kind + ':' + key; if (seen.has(id)) return; seen.add(id); const e = cnt.get(id) || { id, kind, key, label, count: 0 }; e.count++; cnt.set(id, e); };
    outsideTags(sec.body, (part) => { eachValue(part, (tok, kind, key) => { bump(kind, key, kind === 'n' ? Number(key).toLocaleString(UI_LOC) : key); return null; }); return part; });
    (sec.body.replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ').match(URL_RE) || []).forEach((m) => { const u = trimUrl(m)[0]; bump('u', u, u); });
    outsideTags(sec.body.replace(FLAGS_RE, ' '), (part) => { (part.replace(/\[[^\]]*\]/g, ' ').match(NAME_RE) || []).forEach((n) => bump('w', n, n)); return part; });
    if (flagIds == null) {
      const ccs = (sec.body.match(/flagcdn\.com\/w\d+\/([a-z-]+)\.png/g) || []).map((x) => x.replace(/.*\/([a-z-]+)\.png/, '$1'));
      if (ccs.length) flagIds = MASTER.filter((id) => ccs.indexOf(metaOf(id).cc) >= 0);
    }
  });
  const all = [...cnt.values()];
  const pick = (kinds, min) => all.filter((e) => kinds.indexOf(e.kind) >= 0 && e.count >= min).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const minN = total >= 3 ? 2 : 1; // «общее» — то, что встречается минимум в двух языках
  return { keys, withSec, total, flagIds, nums: pick(['n', 'd'], minN), urls: pick(['u'], minN), names: pick(['w'], Math.max(2, Math.ceil(withSec * 0.6))).slice(0, 10) };
}
let elQuick, elQuickBody, elQuickToggle;
function setQuick(on) {
  S.opts.quick = on; saveUi();
  if (elBody) { elBody.classList.toggle('q-open', on); elBody.classList.toggle('q-shut', !on); }
  if (elQuickToggle) { elQuickToggle.textContent = t('quick.title') + (on ? '  ‹' : ''); elQuickToggle.title = on ? t('quick.collapse') : t('quick.expand'); elQuickToggle.setAttribute('aria-expanded', String(on)); }
  renderQuick(); widen();
}
// Проверка введённого значения: возвращает текст ошибки или ''.
function quickInvalid(id, raw) {
  raw = String(raw).trim();
  if (!raw) return '';
  if (id[0] === 'n' && !/^(?:\d{1,3}(?:[ \u00a0\u202f.,']\d{3})+|\d+)$/.test(raw)) return t('quick.badNum');
  if (id[0] === 'd' && !/^\d+(?:[.,]\d+)+$/.test(raw)) return t('quick.badDec');
  return '';
}
function quickChanges() {
  const out = [];
  Object.keys(S.quick.vals).forEach((id) => {
    const raw = String(S.quick.vals[id]).trim();
    if (!raw) return;
    const kind = id[0], key = id.slice(2);
    if (kind === 'n') {
      if (quickInvalid(id, raw)) return;
      const nv = toNum(raw), m = raw.match(/\d([ \u00a0\u202f.,'])\d{3}(?!\d)/);
      if (isFinite(nv) && String(nv) !== key) out.push({ kind, key, nv, sep: m ? m[1] : '' });
    }
    else if (kind === 'd') { const nv = raw.replace(/,/g, '.'); if (!quickInvalid(id, raw) && nv !== key) out.push({ kind, key, nv }); }
    else if (raw !== key) out.push({ kind, key, nv: raw });
  });
  return out;
}
function renderQuick() {
  if (!elQuickBody || !S.opts.quick) return;
  if (!S.loaded) { elQuickBody.replaceChildren(h('p', { class: 'ptx-note' }, t('quick.loading'))); return; }
  const sc = quickScan();
  if (!sc.keys.length) { elQuickBody.replaceChildren(h('p', { class: 'ptx-note' }, t('quick.noSecs'))); return; }
  const q = S.quick;
  const apply = btn(t('quick.apply'), applyQuick, 'pri');
  const refreshApply = () => { apply.disabled = Object.keys(q.vals).some((id) => quickInvalid(id, q.vals[id])) || (!quickChanges().length && !q.flags && !q.custom.some((p) => p.f)); };
  const sel = h('select', { class: 'ptx-sel', 'aria-label': t('common.section'), onchange: (e) => { q.key = e.target.value; q.vals = {}; q.flags = null; renderQuick(); } },
    sc.keys.map((k) => h('option', { value: k, selected: k === q.key }, `${k}  ${keyLabel(k)}`)));
  const row = (e, wide) => {
    const err = h('span', { class: 'ptx-qerr', hidden: true });
    const check = (inp) => { const m = quickInvalid(e.id, inp.value); err.hidden = !m; err.textContent = m; inp.classList.toggle('bad', !!m); };
    const inp = h('input', { class: 'ptx-in', placeholder: wide ? t('quick.newLink') : t('quick.keep'), value: q.vals[e.id] || '', 'aria-label': t('quick.replaceAria', { what: e.label }), oninput: (ev) => { q.vals[e.id] = ev.target.value; check(ev.target); refreshApply(); } });
    check(inp);
    return h('label', { class: 'ptx-qrow' + (wide ? ' wide' : ''), title: `${e.label}\n${t('quick.seenIn', { n: e.count })}` }, h('span', { class: 'ptx-qold' }, e.label), wide ? null : '→', inp, err);
  };
  const group = (title, list, wide, hint) => (list.length ? h('div', { class: 'ptx-qlist' }, h('div', { class: 'ptx-note' }, title), hint ? h('div', { class: 'ptx-note' }, hint) : null, list.map((e) => row(e, wide))) : null);
  const nodes = [h('div', { class: 'ptx-note' }, t('quick.intro', { n: sc.withSec, total: sc.total })), sel,
    group(t('quick.nums'), sc.nums, false), group(t('quick.links'), sc.urls, true), group(t('quick.names'), sc.names)];
  if (sc.flagIds) {
    const on = q.flags || sc.flagIds;
    nodes.push(h('div', { class: 'ptx-qlist' }, h('div', { class: 'ptx-note' }, q.flags ? t('quick.flagsAll') : t('quick.flagsHint')),
      h('div', { class: 'ptx-chips' }, MASTER.filter((id) => byId(id)).map((id) => {
        const isOn = on.indexOf(id) >= 0;
        return h('button', { type: 'button', class: 'ptx-chip' + (isOn ? ' on' : ''), title: byId(id).name, 'aria-pressed': String(isOn),
          onclick: () => { const a = (q.flags || sc.flagIds).slice(); const k = a.indexOf(id); if (k >= 0) a.splice(k, 1); else a.push(id); q.flags = a; renderQuick(); } }, metaOf(id).lbl);
      })),
      q.flags ? btn(t('quick.flagsReset'), () => { q.flags = null; renderQuick(); }, 'sm') : null));
  }
  nodes.push(h('div', { class: 'ptx-qlist' }, h('div', { class: 'ptx-note' }, t('quick.custom')),
    q.custom.map((p) => h('div', { class: 'ptx-qpair' },
      h('input', { class: 'ptx-in', placeholder: t('quick.find'), value: p.f, 'aria-label': t('quick.find'), oninput: (ev) => { p.f = ev.target.value; refreshApply(); } }),
      h('input', { class: 'ptx-in', placeholder: t('quick.replaceWith'), value: p.r, 'aria-label': t('quick.replaceWith'), oninput: (ev) => { p.r = ev.target.value; } }))),
    btn(t('quick.morePair'), () => { q.custom.push({ f: '', r: '' }); renderQuick(); }, 'sm')));
  nodes.push(apply);
  elQuickBody.replaceChildren(...nodes.filter(Boolean));
  refreshApply();
}
function applyQuick() {
  const key = S.quick.key, ch = quickChanges(), cu = S.quick.custom.filter((p) => p.f), flags = S.quick.flags;
  if (!ch.length && !cu.length && !flags) return;
  const nmap = new Map(ch.filter((c) => c.kind === 'n' || c.kind === 'd').map((c) => [c.kind + ':' + c.key, c]));
  const umap = new Map(ch.filter((c) => c.kind === 'u').map((c) => [c.key, c.nv]));
  const names = ch.filter((c) => c.kind === 'w');
  let n = 0, miss = 0;
  S.langs.forEach((l) => {
    if (l.state !== 'ok' || isEmpty(l)) return;
    const sec = parseSections(l.desc).secs.find((s) => s.key === key);
    if (!sec) { miss++; return; }
    let body = sec.body;
    if (flags) body = body.replace(FLAGS_RE, () => renderLangs(flags));
    if (nmap.size) body = outsideTags(body, (part) => eachValue(part, (tok, kind, k) => { const c = nmap.get(kind + ':' + k); return c ? formatValue(tok, kind, c) : null; }));
    if (umap.size) body = outsideImg(body, (part) => part.replace(URL_RE, (m) => { const [u, tail] = trimUrl(m); return umap.has(u) ? umap.get(u) + tail : m; }));
    names.forEach((c) => { const re = new RegExp(`(?<![A-Za-z0-9])${escRe(c.key)}(?![A-Za-z0-9])`, 'g'); body = outsideTags(body, (part) => part.replace(re, () => c.nv)); });
    cu.forEach((p) => { body = body.split(p.f).join(p.r); });
    if (body !== sec.body) { l.desc = setSection(l.desc, key, body, []); n++; }
  });
  S.quick.vals = {}; S.quick.flags = null; S.quick.custom = [{ f: '', r: '' }];
  refreshAll();
  toast(t('quick.done', { key, n, miss: miss ? t('quick.doneMiss', { n: miss }) : '' }), 5000);
}

/* ───────────── Сохранение ───────────── */
// Строка diff: знак, текст; изменённые слова внутри строки подсвечены.
function dlEl(o) {
  const kids = o.parts ? o.parts.map(([txt, hl]) => (hl ? h('span', { class: 'w' }, txt) : txt)) : [o.s];
  return h('div', { class: 'ptx-dl ' + ({ '+': 'add', '-': 'del', ' ': 'ctx' })[o.t] }, h('span', { class: 'sg' }, o.t === ' ' ? ' ' : o.t), kids);
}
function diffBox(t0, d0, t1, d1, ctx = 2) {
  const box = h('div', { class: 'ptx-diff' });
  if (t1 !== t0) {
    const tw = wordParts(t0, t1);
    box.append(h('div', { class: 'ptx-dl gap' }, t('common.title')),
      dlEl({ t: '-', s: t0, parts: tw && tw[0] }), dlEl({ t: '+', s: t1, parts: tw && tw[1] }));
    if (d1 !== d0) box.append(h('div', { class: 'ptx-dl gap' }, t('common.desc')));
  }
  if (d1 === d0) { if (t1 === t0) box.append(h('div', { class: 'ptx-dl gap' }, t('diff.none'))); return box; }
  const ops = diffRows(d0, d1);
  let gap = 0;
  ops.forEach((o, i) => {
    const near = ops.slice(Math.max(0, i - ctx), i + ctx + 1).some((x) => x.t !== ' ');
    if (!near) { gap++; return; }
    if (gap) { box.append(h('div', { class: 'ptx-dl gap' }, t('diff.gap', { n: gap }))); gap = 0; }
    box.append(dlEl(o));
  });
  if (gap) box.append(h('div', { class: 'ptx-dl gap' }, t('diff.gap', { n: gap })));
  return box;
}
const diffStat = (l) => { const ops = diffLines(l.desc0, l.desc); return { add: ops.filter((o) => o.t === '+').length, del: ops.filter((o) => o.t === '-').length }; };
// История хранится в хранилище юзерскриптов (GM_setValue), на каждый мод отдельно: в записи — прежние (серверные) тексты тех языков, что сохраняются.
function makeSnapshot(list) {
  const snap = { ts: Date.now(), items: {} };
  list.forEach((l) => { if (l.state === 'ok' && !l.noContent) snap.items[l.id] = { title: l.title0, desc: l.desc0 }; });
  if (!Object.keys(snap.items).length) return;
  const arr = store.get(K('snap'), []);
  arr.unshift(snap);
  while (arr.length > 10) arr.pop();
  while (!store.set(K('snap'), arr) && arr.length > 1) arr.pop();
  histN = arr.length;
}

function openSave() {
  const list = dirtyList();
  if (!list.length) { toast(t('diff.none')); return; }
  const rows = {};
  const verify = h('input', { type: 'checkbox', checked: true }), dry = h('input', { type: 'checkbox' });
  const wrap = h('div', { style: 'display:grid;gap:8px' });
  const diffs = [];
  let totAdd = 0, totDel = 0, nNew = 0, nTitle = 0;
  list.forEach((l) => {
    const errs = lintOf(l).filter((i) => i.lvl === 'err');
    const diff = diffBox(l.title0, l.desc0, l.title, l.desc, 1); // по умолчанию развёрнуто: все правки видны сразу
    diffs.push(diff);
    const { add, del } = diffStat(l);
    totAdd += add; totDel += del; if (l.noContent) nNew++; if (l.title !== l.title0) nTitle++;
    const cb = h('input', { type: 'checkbox', checked: !errs.length, disabled: !!errs.length, 'aria-label': l.name });
    const st = h('span', { class: 'st' + (errs.length ? ' err' : '') }, errs.length ? errs[0].msg : '');
    rows[l.id] = { cb, st };
    wrap.append(h('div', { class: 'ptx-srow' },
      h('div', { class: 'ptx-srow-h' }, cb, h('span', null, h('b', null, l.name), ' ', h('span', { class: 'ptx-stat' }, h('i', { class: 'a' }, '+' + add), ' ', h('i', { class: 'r' }, '−' + del)), l.title !== l.title0 ? ' · ' + t('common.title') : '', l.noContent ? ' · ' + t('save.newMark') : ''), st,
        btn(t('common.changes'), () => { diff.hidden = !diff.hidden; }, 'sm')), diff));
  });
  const go = btn(t('save.go'), run, 'pri');
  const summary = h('div', { class: 'ptx-sum' },
    h('span', null, t('save.sumLangs', { n: list.length }), h('span', { class: 'ptx-stat' }, h('i', { class: 'a' }, '+' + totAdd), ' ', h('i', { class: 'r' }, '−' + totDel)), t('save.lines'),
      nTitle ? t('save.sumTitles', { n: nTitle }) : '', nNew ? t('save.sumNew', { n: nNew }) : ''),
    h('span', { class: 'ptx-sp' }),
    btn(t('save.expandAll'), () => diffs.forEach((x) => { x.hidden = false; }), 'sm'),
    btn(t('save.collapseAll'), () => diffs.forEach((x) => { x.hidden = true; }), 'sm'));
  const d = dialog(t('save.dlgTitle'), h('div', { style: 'display:grid;gap:10px' }, summary, wrap,
    h('label', { class: 'ptx-chk' }, verify, t('save.verify')),
    h('label', { class: 'ptx-chk' }, dry, t('save.dry')),
    h('p', { class: 'ptx-note' }, t('save.histNote'))),
  [btn(t('common.cancel'), () => d.close()), go], true);
  const setSt = (id, text, cls) => { rows[id].st.textContent = text; rows[id].st.className = 'st ' + (cls || ''); };

  async function run() {
    const sel = list.filter((l) => rows[l.id].cb.checked && !rows[l.id].cb.disabled);
    if (!sel.length) return;
    const isDry = dry.checked, doVerify = verify.checked;
    go.disabled = true; dry.disabled = true; verify.disabled = true;
    Object.keys(rows).forEach((id) => { rows[id].cb.disabled = true; });
    if (!isDry) makeSnapshot(sel);
    let ok = 0, bad = 0;
    await pool(sel, 2, async (l) => {
      setSt(l.id, t('save.sending'));
      try {
        if (isDry) { await sleep(60); setSt(l.id, t('save.dryRes', { n: l.title.length + l.desc.length }), 'ok'); ok++; return; }
        await postLang(l);
        l.noContent = false; l.create = false; l.updated = t('save.justNow');
        if (!doVerify) { l.title0 = l.title; l.desc0 = l.desc; setSt(l.id, t('save.sent'), 'ok'); ok++; return; }
        const r = await fetchLang(l.id);
        const same = r.title.trim() === l.title.trim() && r.desc.trim() === l.desc.trim();
        l.title0 = r.title; l.desc0 = r.desc;
        if (same) { l.title = r.title; l.desc = r.desc; setSt(l.id, t('save.verified'), 'ok'); ok++; }
        else { setSt(l.id, t('save.mismatch'), 'warn'); bad++; }
      } catch (e) { setSt(l.id, t('save.err', { err: e.message || e }), 'err'); bad++; }
      renderSidebar(); updateChrome();
    }, 250);
    refreshAll();
    d.footer.replaceChildren(h('span', { class: 'ptx-note' }, t('save.done', { ok, bad: bad ? t('save.doneBad', { n: bad }) : '' })), btn(t('common.close'), () => d.close(), 'pri'));
  }
}

/* ───────────── История сохранений ───────────── */
function applyImport(items, label) {
  let n = 0;
  Object.keys(items).forEach((id) => {
    const l = byId(Number(id)), it = items[id];
    if (!l || l.state !== 'ok' || !it || typeof it.title !== 'string' || typeof it.desc !== 'string') return;
    l.title = it.title; l.desc = normNL(it.desc); n++;
  });
  refreshAll();
  toast(t('hist.applied', { label, n }));
}
function openHistory() {
  if (!S.loaded) { toast(t('hist.waitLoad')); return; }
  const snaps = store.get(K('snap'), []);
  const fmt = (ts) => new Date(ts).toLocaleString(UI_LOC);
  const l = cur();
  const list = h('div', { style: 'display:grid;gap:8px' });
  const d = dialog(t('hist.title'), h('div', { style: 'display:grid;gap:10px' },
    h('p', { class: 'ptx-note' }, t('hist.intro')),
    list), [btn(t('common.close'), () => d.close())], true);
  if (!snaps.length) list.append(h('p', { class: 'ptx-note' }, t('hist.empty')));
  snaps.forEach((s) => {
    const mine = l && l.state === 'ok' ? s.items[l.id] : null;
    const diff = mine ? diffBox(l.title, l.desc, mine.title, mine.desc) : null;
    if (diff) diff.hidden = true;
    list.append(h('div', { class: 'ptx-srow' },
      h('div', { class: 'ptx-srow-h', style: 'grid-template-columns:1fr auto auto auto' },
        h('span', null, h('b', null, fmt(s.ts)), t('hist.langs', { n: Object.keys(s.items).length })),
        mine ? btn(t('common.changes'), () => { diff.hidden = !diff.hidden; }, 'sm', t('hist.diffTip', { name: l.name })) : h('span'),
        mine ? btn(t('hist.restore', { name: l.name }), () => { applyImport({ [l.id]: mine }, t('hist.entry', { date: fmt(s.ts) })); d.close(); }, 'sm') : h('span'),
        btn(t('hist.restoreAll'), () => { if (confirm(t('hist.restoreAllConfirm'))) { applyImport(s.items, t('hist.entry', { date: fmt(s.ts) })); d.close(); } }, 'sm')),
      diff));
  });
}

/* ───────────── Сборка интерфейса ───────────── */
function build() {
  elStatus = h('span', { class: 'ptx-status', 'aria-live': 'polite' });
  elSaveBtn = btn(t('save.btn'), openSave, 'pri', 'Ctrl+S');
  elFilter = h('input', { class: 'ptx-in', placeholder: t('side.filter'), 'aria-label': t('side.filter'), oninput: (e) => { S.filter = e.target.value; renderSidebar(); } });
  elList = h('div', { class: 'ptx-list' });
  elQuickBody = h('div', { class: 'ptx-quick-b' });
  elQuickToggle = h('button', { type: 'button', class: 'ptx-qtoggle', onclick: () => setQuick(!S.opts.quick) });
  elQuick = h('aside', { class: 'ptx-quick' }, elQuickToggle, elQuickBody);
  elTabs = h('div', { class: 'ptx-tabs', role: 'tablist' });
  elView = h('div', { class: 'ptx-view' });
  root = h('div', { class: 'ptx-root', role: 'application', 'aria-label': t('bar.rootAria') },
    h('div', { class: 'ptx-bar' },
      h('div', { class: 'ptx-bar-top' }, elStatus,
        btn(t('bar.native'), () => showNative(true), 'warn', t('bar.nativeTip'))),
      h('span', { class: 'ptx-sp' }),
      btn(t('bar.reload'), () => { if (dirtyList().length && !confirm(t('bar.reloadConfirm'))) return; S.loaded = false; S.langs.forEach((l) => { l.state = 'idle'; }); loadAll(); }),
      elSaveBtn,
      h('a', { class: 'ptx-btn', href: `/sharedfiles/filedetails/?id=${ITEM}`, style: 'text-decoration:none' }, t('bar.toItem'))),
    h('div', { class: 'ptx-body' },
      elQuick,
      h('aside', { class: 'ptx-side' }, h('div', { class: 'ptx-side-t' }, elFilter,
        h('label', { class: 'ptx-chk' }, h('input', { type: 'checkbox', onchange: (e) => { S.onlyDirty = e.target.checked; renderSidebar(); } }), t('side.onlyDirty')),
        h('label', { class: 'ptx-chk' }, h('input', { type: 'checkbox', onchange: (e) => { S.hideEmpty = e.target.checked; renderSidebar(); } }), t('side.hideEmpty'))), elList),
      h('main', { class: 'ptx-main' }, elTabs, elView)));
  elBody = root.querySelector('.ptx-body');
  setQuick(S.opts.quick);
  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!dlgStack.length) openSave(); }
    else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !dlgStack.length) {
      e.preventDefault();
      const i = S.langs.findIndex((l) => l.id === S.cur), n = S.langs.length;
      S.cur = S.langs[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].id; S.mode = 'edit'; refreshAll();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dlgStack.length) dlgStack[dlgStack.length - 1].close(); });
  renderTabs();
}
function showNative(on) {
  root.hidden = on; nativeForm.style.display = on ? '' : 'none'; nativeBar.hidden = !on;
  document.body.classList.toggle('ptx-on', !on);
  if (on) resetWide(); else if (S.langs.length && elView) renderMain(); // ширина считается уже по итоговой вёрстке
}
// Встраиваемся вместо родной формы: форма остаётся в DOM (запасной выход), но скрыта.
function mount() {
  build();
  // родная кнопка Steam (стили из buttons.css страницы) на полупрозрачной панели в духе остального интерфейса
  nativeBar = h('div', { class: 'ptx-native-bar', hidden: true },
    h('span', { class: 'ptx-native-t' }, t('native.note')),
    h('a', { class: 'btn_blue_steamui btn_medium', href: '#', onclick: (e) => { e.preventDefault(); showNative(false); } }, h('span', null, t('native.back'))));
  nativeForm.before(nativeBar, root);
  showNative(false);
}

/* ───────────── Старт ───────────── */
(function init() {
  nativeForm = document.getElementById('ItemEditText');
  if (!ITEM || !nativeForm) return;
  S.langs = langsFromPage();
  if (!S.langs.length) return;
  const sel = document.getElementById('language');
  const startLang = Number(qs.get('language') || (sel ? sel.value : 0));
  S.cur = byId(startLang) ? startLang : S.langs[0].id;
  // Текущий язык уже есть на странице — открываем его мгновенно, остальные догрузятся в фоне.
  const l0 = byId(S.cur), t0 = document.getElementById('title'), d0 = document.getElementById('description');
  if (l0 && t0 && d0) { l0.title0 = l0.title = normNL(t0.value); l0.desc0 = l0.desc = normNL(d0.value); l0.state = 'ok'; }
  loadPrefs();
  histN = store.get(K('snap'), []).length;
  if (typeof GM_addStyle === 'function') GM_addStyle(CSS); else document.head.append(h('style', null, CSS));
  mount();
  refreshAll();
  if (window.__PTX_TEST) window.__PTX = { S, makeSnapshot, openSave, openHistory, applyQuick, renderQuick, quickScan, renderGrid, dirtyList, lintOf, byId, isEmpty, loadAll, showNative, refreshAll, widen };
  window.addEventListener('resize', widen);
  if (window.ResizeObserver) { const ro = new ResizeObserver(widen); ro.observe(root.parentNode); if (elHeader) ro.observe(elHeader.parentNode); }
  window.addEventListener('beforeunload', (e) => { if (dirtyList().length) { e.preventDefault(); e.returnValue = ''; } });
  loadAll();
})();

})();
