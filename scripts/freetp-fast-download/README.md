# FreeTP Fast Download + Magnet

![FreeTP Fast Download + Magnet](https://github.com/user-attachments/assets/f9fe323e-85ad-4ae6-bda8-705f56fff6bd)

Скрипт для [freetp.org](https://freetp.org) на странице скачивания файла (`/getfile-…`): кнопка скачивания `.torrent` видна сразу, без ожидания «Файл будет доступен через 0:29», а рядом появляется кнопка **Magnet** в стиле сайта.

Magnet-ссылка собирается из самого `.torrent`: скрипт скачивает файл, считает SHA-1 info-секции (info hash) и формирует `magnet:?xt=urn:btih=…&dn=…&tr=…` с трекерами раздачи. Клик по кнопке копирует magnet в буфер и открывает торрент-клиент; ссылка подгружается заранее при наведении.

[![Install with Tampermonkey](https://img.shields.io/badge/Tampermonkey-Install-brightgreen?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/qFamouse/Userscripts/refs/heads/master/scripts/freetp-fast-download/freetp-fast-download.user.js)
