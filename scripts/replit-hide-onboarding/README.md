# Replit Hide Onboarding

![Replit Hide Onboarding](https://github.com/user-attachments/assets/53c32587-0fc8-4542-a95e-e6a4b3d3797b)

Скрывает незакрываемое модальное окно онбординга на [replit.com](https://replit.com) — «Let's set up your account» с выбором имени пользователя, полным именем и последующим подтверждением телефона. Скрипт убирает оверлей (`display: none`), снимает блокировку скролла с `<html>` и возвращает корню приложения `aria-hidden`/`inert`, так что страница снова реагирует на клики и прокрутку. Работает в SPA: модалка отслеживается MutationObserver'ом и прячется при каждом повторном появлении. В меню Tampermonkey/Violentmonkey есть переключатель, чтобы временно вернуть онбординг (перезагружает страницу).

[![Install with Tampermonkey](https://img.shields.io/badge/Tampermonkey-Install-brightgreen?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/replit-hide-onboarding/replit-hide-onboarding.user.js)
