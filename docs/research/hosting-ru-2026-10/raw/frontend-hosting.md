# Российский хостинг для фронтенда (статика Vite + React)

Дата сбора: 18.10.2026. Вопрос: куда перенести `app/dist` (84 файла, 2,4 МБ, PWA с service worker и Web Push) с Vercel, чтобы сайт открывался из России без VPN. Бэкенд (Supabase) здесь не рассматривается.

Требования: HTTPS на бесплатном адресе; SPA fallback (любой путь отдаёт `index.html`, желательно с кодом 200); деплой по push в GitHub или хотя бы шагом загрузки в GitHub Actions; оплата российской картой; российская компания и российские IP, без зарубежного CDN.

Уверенность: **Strong** — официальная документация, прайс или моя прямая проверка (curl, 18.10.2026); **Moderate** — статья, форум, агрегатор; **Speculative** — одно непроверенное упоминание или мой вывод.

Мои проверки curl шли не из российской сети, поэтому они подтверждают сертификат, код ответа и владельца IP, но не доступность у российских операторов.

## Сводная таблица

| Вариант | ₽/мес при нашей нагрузке | HTTPS на бесплатном адресе | SPA fallback | Деплой | Карта | Итог |
|---|---|---|---|---|---|---|
| Yandex Object Storage | 0 (в пределах free tier) | да, `<бакет>.website.yandexcloud.net` | `index.html` как страница ошибки, код скорее всего 404; код 200 через API Gateway | шаг загрузки в GitHub Actions (`yc-actions/yc-obj-storage-upload`) | российская карта или СБП, при привязке карты блокируют 11 ₽ | подходит |
| Timeweb Cloud App Platform (frontend) | несколько рублей, формула ниже; первый платёж от 500 ₽ | да, `*.twc1.net` + Let's Encrypt | переключатель SPA Fallback, на их демо-приложении код 200 | автодеплой из GitHub по коммиту | карта, СБП, ЮMoney | подходит, ближе всех к Vercel |
| Timeweb Cloud S3 (сайт из бакета) | 1 ₽ за план 1 ГБ; 100 ГБ трафика бесплатно | да, `<бакет>.website.twcstorage.ru` | страница ошибки, код не описан | загрузка по S3 API из Actions | как у Timeweb | запасной |
| Amvera Cloud | 170 (тариф «Пробный») | да, `*.amvera.tech` | nginx в образе «для поддержки маршрутизации в SPA» | `git push` или вебхук из GitHub | российские карты, СБП (по статье) | подходит, но дороже |
| Selectel S3 | копейки за хранение + трафик ~1,38 ₽/ГБ | вероятно да, `<uuid>.selstorage.ru` | объект ошибки, можно выбрать код 200 | загрузка по S3 API из Actions | не проверял | запасной |
| GitVerse Pages (Сбер) | 0 | да, `<владелец>.gitverse.site` | только свой `404.html`, код не описан | автосборка из ветки или CI GitVerse | не нужна | слабый: только публичный репозиторий |
| SourceCraft Sites (Яндекс) | 0 | да | не описан | коммит в ветку SourceCraft (есть зеркало из GitHub) | не нужна | **не подходит: запрещены service worker** |
| Beget бесплатный тариф | 0 | не подтверждено для `*.beget.tech` | `.htaccess` не проверял | FTP | не нужна | слабый |
| VK Cloud Object Storage | — | **нет**, сайт из бакета только по HTTP | — | — | — | не подходит |
| REG.RU S3, Cloud.ru | — | режим сайта не нашёл | — | — | — | не нашёл |
| RelaxDev | 990 | свой домен + авто-SSL | не описан | автодеплой из Git | карты РФ, СБП | дорого |

## Сколько запросов у нас в месяц

Формула нужна для вариантов, где платят за запросы (Timeweb App Platform) или есть лимит запросов (Yandex free tier).

`запросы ≈ устройства × открытия в день × 30 × 3 + деплои × устройства × 84`

- 3 запроса на открытие: при живом service worker `index.html` берётся из кэша, в сеть идут проверка `sw.js` и пара служебных файлов. Это моя оценка, не замер.
- 84: столько файлов в `app/dist` сейчас, после деплоя Workbox заново скачивает изменившиеся файлы. Верхняя граница, обычно меньше.
- Пример: 10 устройств, 10 открытий в день, 30 деплоев в месяц → 9 000 + 25 200 ≈ 34 000 запросов. В Timeweb это ≈ 17 ₽ (4,95 ₽ за 10 000), в Яндексе укладывается в бесплатные 100 000 GET.
- Реальное число Timeweb показывает на вкладке «Дашборд», там же можно поставить жёсткий лимит запросов.

## 1. Yandex Cloud Object Storage

- Адрес сайта: `http(s)://<бакет>.website.yandexcloud.net` и `http(s)://website.yandexcloud.net/<бакет>`. Источник: https://yandex.cloud/ru/docs/storage/concepts/hosting (обновлена 28.08.2026). Strong.
- HTTPS без своего домена: для бакета без точки в имени «загружать собственный сертификат безопасности не требуется», но свой домен к такому бакету не привязать. https://yandex.cloud/ru/docs/storage/operations/hosting/certificate (15.10.2026). Strong. Проверил curl: wildcard-сертификат на `*.website.yandexcloud.net` валиден, IP 213.180.193.247, AS13238 YANDEX LLC, Москва. Strong.
- SPA: документация прямо советует для одностраничного приложения указать главную страницу (`index.html`) страницей ошибки. https://yandex.cloud/ru/docs/storage/operations/hosting/setup (15.10.2026). Strong. Код ответа при этом в документации не указан; по логике S3 он останется 404. Speculative. Для PWA это некритично: браузер рисует тело 404, а после установки service worker навигация идёт из кэша.
- Если нужен ровно 200: API Gateway с интеграцией `object_storage`, у `error_object` есть поле `statusCode` (https://yandex.cloud/ru/docs/api-gateway/concepts/extensions/object-storage, 22.05.2026), жадный путь `/{file+}` (https://yandex.cloud/ru/docs/api-gateway/concepts/extensions/greedy-parameters, 02.04.2025). Бесплатно первые 100 000 запросов в месяц, дальше 142,3 ₽ за миллион (https://yandex.cloud/ru/docs/api-gateway/pricing, 16.10.2026). Strong по полям, сама схема `index.html` + 200 — мой вывод (Speculative). Служебный домен `*.apigw.yandexcloud.net` отвечает по HTTPS с валидным сертификатом, IP 84.201.185.129, AS200350 Yandex.Cloud (curl). Strong.
- Бесплатно в месяц: 1 ГБ стандартного хранения, 10 000 операций PUT/POST/PATCH/LIST, 100 000 GET/HEAD/OPTIONS, 100 ГБ исходящего трафика. Сверх: хранение 2,376 ₽/ГБ, GET 0,46 ₽ за 10 000, трафик 1,67994 ₽/ГБ. https://yandex.cloud/ru/docs/storage/pricing (16.10.2026), https://yandex.cloud/ru/docs/billing/concepts/serverless-free-tier (30.06.2026). Strong. Наши 2,4 МБ и десятки тысяч запросов в эти рамки укладываются: 0 ₽.
- Карта и платёжный аккаунт: free tier привязан к платёжному аккаунту. Новым клиентам «пробный период и стартовый грант недоступны», работа сразу в платном потреблении (https://yandex.cloud/ru/docs/getting-started/free-trial/concepts/quickstart, 14.10.2026; https://yandex.cloud/ru/docs/billing/quickstart/, 16.10.2026). Физлица платят картой (Мир, Visa, MasterCard российских банков) или через СБП; при привязке карты блокируют 11 ₽ на проверку (https://yandex.cloud/ru/docs/billing/payment/payment-methods-individual, 18.06.2026). Страница quickstart при этом предлагает и «Пополнение вручную» без привязки карты — две страницы расходятся. Strong по фактам, Moderate по выводу «можно без карты».
- Деплой: Vercel-подобного подключения репозитория нет. Есть GitHub Action `yc-actions/yc-obj-storage-upload`: загружает папку в бакет, умеет `clear: true`, авторизация ключом сервисного аккаунта или через Workload Identity Federation (без хранения ключа). https://github.com/yc-actions/yc-obj-storage-upload (дата не указана, версия v5). Strong.
- Ограничение: хостинг не работает на бакете с шифрованием и без публичного доступа (setup, 15.10.2026). Strong.

## 2. Timeweb Cloud App Platform, frontend

- Цена: 0,000495 ₽ за входящий запрос, то есть 4,95 ₽ за 10 000; учитывается любой запрос, включая статику; списание раз в час; при нулевом балансе приложение останавливается; на приложение 2 ГБ NVMe; можно задать лимит запросов, по достижении приложение останавливается. https://timeweb.cloud/docs/apps/frontend-pricing.md (дата не указана). Strong. Бесплатного фронтенда нет.
- Минимальный платёж Timeweb Cloud 500 ₽; физлица платят картой, через СБП, ЮMoney или квитанцией; привязка карты необязательна. https://timeweb.cloud/docs/service-payments/llms-full.txt (дата не указана). Strong.
- Деплой: репозитории GitHub, GitLab, Bitbucket; опция «Сборка по последнему выполненному коммиту» включена по умолчанию; путь к проекту и директория сборки задаются отдельно (наш случай: проект `app`, сборка `dist`). https://timeweb.cloud/docs/apps, https://timeweb.cloud/docs/apps/deploying-frontend-apps.md (даты не указаны). Strong. Есть стенды на Pull Request: https://timeweb.cloud/docs/apps/pull-request-stands.md (по названию статьи, текст не читал).
- HTTPS: к приложению привязывается бесплатный технический домен с сертификатом Let's Encrypt, статика отдаётся через Caddy. https://timeweb.cloud/docs/apps/how-it-works.md (дата не указана). Strong. Формат домена `<имя>.twc1.net` видно по демо в https://github.com/timeweb-cloud/app-example-react. Strong.
- SPA: в «Настройках веб-сервера» для frontend есть SPA Fallback: «если опция включена, веб-сервер вернет файл `/index.html`»; без неё отдаётся `/404.html` или пустая 404. Там же до 10 редиректов и до 10 правил заголовков. https://timeweb.cloud/docs/apps/reverse-proxy.md (дата не указана). Strong. Проверил curl: `https://twc-app-example-react.twc1.net/some/deep/route` → 200, `Server: Caddy`, IP 82.97.243.54, AS9123 JSC TIMEWEB, Санкт-Петербург. Strong.
- Регион выбирается при создании. Дата-центры Timeweb Cloud есть в Москве, Петербурге, Новосибирске, а также в Казахстане, Нидерландах, Германии, США; нужно выбрать российский. https://timeweb.cloud/docs/nashi-data-centry/llms-full.txt. Strong.
- Отзывов 2026 года про App Platform для Vite не нашёл, только старые вопросы на qna.habr.com.

## 3. Timeweb Cloud S3 (сайт из бакета)

- Сайт по адресу `<бакет>.website.twcstorage.ru`, страница ошибки настраивается по коду; свой домен подключается через CDN, а «создание CDN временно недоступно из-за нехватки ресурсов». https://timeweb.cloud/docs/s3-storage/supported-features/static-websites.md (дата не указана). Strong. Какой код отдаётся со страницей ошибки, не сказано.
- HTTPS: wildcard-сертификат `*.website.twcstorage.ru` действует до 22.02.2027 (crt.sh), curl на несуществующий бакет даёт валидный TLS и 404, IP 217.78.234.243, AS9123 Timeweb, Санкт-Петербург. Strong.
- Цена: план 1 ГБ — 1 ₽/мес, 100 ГБ исходящего трафика бесплатно, сверх 1,3 ₽/ГБ. https://timeweb.cloud/services/s3-storage (дата не указана). Strong, но таблица на странице противоречива (рядом «в тариф включено 250 ГБ»).

## 4. Amvera Cloud

- Тарифы приложений за 30 дней: «Пробный» 0,1 CPU, 100 МБ RAM, 2 ГБ — 170 ₽; «Начальный» — 290 ₽. Учёт поминутный, списание почасовое. Бесплатного тарифа нет. https://docs.amvera.ru/general/price.html (дата не указана). Strong.
- Стартовый баланс «111 рублей на тест», хватает примерно на 19 дней «Пробного». Регионы: Москва, Майами, Варшава. На «Пробном» есть свои домены и бесплатный SSL. https://amvera.ru/ (дата не указана). Strong.
- Статика: окружение Node.JS Browser, сборка `npm run build`, раздача модифицированным nginx «для поддержки маршрутизации в SPA приложениях»; артефакты по умолчанию из `build/*`, для `dist` и подпапки `app` надо прописать `artifacts`. https://docs.amvera.ru/applications/environments/nodejs-browser.html (дата не указана). Strong по факту nginx для SPA; код 200 не проверял.
- Деплой: `git push` в репозиторий Amvera или вебхук из GitHub, после push «сборка начнется автоматически». https://docs.amvera.ru/applications/git/webhooks.html (дата не указана). Strong.
- Бесплатный домен `<проект>.<пользователь>.<регион>.amvera.tech` с HTTPS; с 26.09.2026 появились тарифы входящего трафика, по умолчанию включён бесплатный со своими лимитами (числа на странице не указаны). https://docs.amvera.ru/applications/configuration/network.html (состояние на 14.10.2026). Strong по наличию, лимиты неизвестны.
- Оплата российскими картами и СБП — по статье https://www.codesrc.ru/post/rossiyskie-alternativy-github-gitlab-vercel-i-heroku-2026-18fd4 (14.08.2026, обновлена 02.09.2026). Moderate. Официальный FAQ про оплату описывает только иностранные карты (https://docs.amvera.ru/general/FAQ/payments.html).

## 5. SourceCraft Sites (Яндекс)

- Бесплатный хостинг статики, HTTPS, адрес `https://<организация>.sourcecraft.site/<репозиторий>`, файлы только в публичном репозитории публичной организации, обновление через несколько минут после коммита. https://sourcecraft.dev/portal/docs/ru/sourcecraft/concepts/sites (дата не указана). Strong.
- **Service worker запрещён**: в FAQ сказано, что сайты не могут использовать service worker и встраиваться в iframe, ограничение задано заголовком CSP. https://sourcecraft.dev/portal/docs/ru/sourcecraft/qa/sourcecraft-sites. Strong. Проверил curl: `content-security-policy: frame-ancestors 'none'; worker-src 'none';`, IP 51.250.18.242, AS200350 Yandex.Cloud. Strong. Для нашей PWA с Web Push вариант отпадает.

## 6. GitVerse Pages (Сбер)

- Есть. Адрес `https://<владелец>.gitverse.site` или `https://<владелец>.gitverse.site/<репозиторий>`; доступно на тарифе Free; артефакт до 500 МБ; публикация из ветки или своим CI-workflow. https://gitverse.ru/docs/pages/overview (© 2026). Strong.
- Ограничения: репозиторий обязан быть публичным (приватные обещают в Pro), включён CI/CD, в именах файлов нельзя пробелы, кириллицу, точки в середине. https://gitverse.ru/docs/pages/docs/requirements, https://gitverse.ru/docs/pages/quick-start (© 2026). Strong. Свои домены «на текущем этапе не поддерживаются». https://gitverse.ru/docs/pages/faq. Strong.
- SPA: только свой `404.html` (https://gitverse.ru/docs/pages/docs/custom-404-page), код ответа не описан. В обзоре сказано, что пути к ресурсам должны быть относительными — для SPA с вложенными маршрутами это проблема. Speculative, на живом сайте не проверял.
- curl: `*.gitverse.site` отвечает по HTTPS, `Server: QRATOR`, IP 178.248.237.106, AS51115 HLL LLC, Москва. Несуществующий сайт отдаёт страницу «Страница не найдена» с кодом 200, вложенный путь — 301 на `http://…/` со слэшем. Strong по наблюдению.
- Из GitHub напрямую не деплоится: нужен репозиторий на GitVerse (зеркало или push из Actions).

## 7. Beget, бесплатный тариф

- 1 ГБ SSD, 1 сайт, 1 FTP и 1 БД, 25 000 файлов, без рекламы, без техподдержки; при регистрации ФИО, email, телефон. https://beget.com/ru/hosting/free (дата не указана). Strong.
- HTTPS на техническом домене не подтверждён. Единственное найденное — вопрос на qna.habr.com, где пользователь пишет, что Beget выдаёт SSL «только для реальных доменов, для технических доменов не дают» (https://qna.habr.com/q/555742, «более трёх лет назад»). Speculative.
- Загрузка по FTP, из Actions — через любой FTP-деплой. Поддержку `.htaccess` для SPA на бесплатном тарифе не проверял.
- Платный «Blog» — 420 ₽/мес (5 040 ₽ в год), SSL бесплатно, SSH/SFTP, 30 дней на тест. https://beget.com/ru/hosting. Strong.

## 8. Selectel S3

- Режим сайта: страница ошибки — объект бакета, по умолчанию код 400, опционально можно выбрать **200**; либо 307 на внешний URL. https://docs.selectel.ru/s3/buckets/website/ (05.03.2026). Strong. Это единственное объектное хранилище, где SPA с кодом 200 настраивается штатно.
- Публичный домен бакета `<uuid>.selstorage.ru`, для своих доменов нужен свой TLS-сертификат. https://docs.selectel.ru/s3/manage/domains/ (23.09.2026). Strong. HTTPS на публичном домене документация не обещает, но на `*.selstorage.ru` выпущен wildcard-сертификат GlobalSign до 20.03.2027 (crt.sh). Moderate.
- Цена: стандартное хранение «от 2,56 ₽/мес» за ГБ, почасовой биллинг (https://selectel.ru/services/cloud/storage/, дата не указана, Strong). По агрегатору: трафик 1,38 ₽/ГБ, GET 0,54 ₽ за 10 000, PUT 0,72 ₽ за 1 000 (https://market.cnews.ru/tariff/10737, дата не указана, Moderate). Прайс на selectel.ru/prices показывает «Актуализация цен…». Для нас — единицы рублей в месяц, в основном трафик.
- Регистрацию физлица и способ оплаты не проверял.

## 9. VK Cloud, REG.RU, Cloud.ru

- VK Cloud Object Storage: «статический хостинг веб-сайтов доступен только через HTTP». https://cloud.vk.ru/docs/storage/s3/concepts/about (© 2026). Strong. Без HTTPS service worker не работает — не подходит (кроме варианта с их платным CDN, не изучал).
- REG.RU S3: страница продукта не читается (антибот). По Хабру, платят только за объём, без платы за трафик и запросы (https://habr.com/ru/posts/932728, 31.07.2025, Moderate). Режима статического сайта не нашёл.
- Cloud.ru Evolution: в free tier есть 15 ГБ объектного хранилища (https://kod.ru/test-draiv-oblaka-cloud-ru, 13.12.2024, обновлена 23.05.2025, Moderate), но в документации Object Storage про хостинг сайтов ничего нет (https://cloud.ru/docs/s3e/ug/topics/overview__features). Не нашёл.

## 10. Другие «аналоги Vercel»

- RelaxDev: серверы в РФ, автодеплой из Git, PRO 990 ₽/мес, 500 ₽ на балансе при регистрации, SSL на свой домен, бесплатного домена нет. https://relaxdev.ru/vercel-alternative-russia (© 2026). Strong по цене. Для статики семьи дорого.
- Обзор https://www.codesrc.ru/post/rossiyskie-alternativy-github-gitlab-vercel-i-heroku-2026-18fd4 (14.08.2026) как замену Vercel для статики называет только Yandex Object Storage («деплой CLI / UI»), для SSR — Amvera и RelaxDev. Там же: IP Vercel и Netlify «частично блокируются у российских мобильных провайдеров». Moderate.
- GitFlic Pages: искал, ничего не нашёл.

## Домен .ru (нужен, если HTTPS только со своим доменом)

| Регистратор | Регистрация, первый год | Продление | Источник |
|---|---|---|---|
| REG.RU | 169 ₽ (акция 01.01–31.12.2026, продление по тарифу на момент продления) | 999 ₽ | акция: https://www.reg.ru/company/promotions/20202174; продление: новость от 18.12.2025 https://www.reg.ru/company/news/12857; на https://www.reg.ru/domain/new/ показано «169₽ 226₽». Читал через r.jina.ai, сайт закрыт антиботом. Moderate |
| Timeweb | 200 ₽ (зачёркнуто 399), в FAQ той же страницы 179 ₽ | 399 ₽ | https://timeweb.com/ru/services/domains/ (дата не указана). Strong, цена регистрации на странице противоречива |
| Beget | 199 ₽ | 420 ₽ | https://beget.com/ru/domains (дата не указана). Strong |

Для выбранных вариантов свой домен не обязателен: Yandex, Timeweb, Amvera, GitVerse дают HTTPS на своих адресах.

## Белые списки мобильного интернета

Отчётов о том, открываются ли при белых списках сайты на этих хостингах, не нашёл. Нашёл только описание механизма:

- 31.08.2026 Минцифры попросило хостеров, CDN и сервисы защиты выделить IP разрешённых сайтов в отдельные подсети, куда посторонних не пустят. https://www.anti-malware.ru/news/2026-08-31-111332/51227 (31.08.2026, со ссылкой на РБК). Moderate. Вывод (Speculative): сайт семьи, которого нет в списке, при включённых белых списках на мобильном интернете не откроется ни на одном из этих хостингов, даже если сейчас случайно делит IP с разрешённым сайтом.
- В обсуждении https://github.com/net4people/bbs/issues/650 (комментарии 19.08–08.10.2026) пишут, что у Билайна в июне блоки Timeweb (AS9123) и HLL (AS51115) в одной ASN частично проходили, частично нет; адреса Yandex Cloud у автора не прошли. Moderate.
- Утверждения вида «у Yandex Cloud 12 тысяч IP в whitelist» (https://beget-free.ru/kakie-xostingi-v-belom-spiske/, 08.06.2026) идут с партнёрского сайта Beget без методики. Speculative.
- Даже если фронтенд откроется, при белых списках не будет связи с Supabase Cloud.

## Отрицательные результаты

- Yandex: код ответа страницы ошибки при хостинге сайта в документации не указан; живой бакет для проверки не нашёл (единственный найденный `em4w-storage` уже удалён).
- Timeweb App Platform: в документации не указан ни формат технического домена (нашёл по демо), ни список регионов для App Platform, ни код ответа SPA Fallback (проверил на демо).
- Amvera: числовые лимиты бесплатного тарифа входящего трафика не опубликованы.
- Beget: официального ответа про SSL на `*.beget.tech` и про `.htaccess` на бесплатном тарифе не нашёл, страницы базы знаний по прямым ссылкам отдают 404.
- Selectel: прайс S3 на selectel.ru не отрисовывается, цены за трафик и запросы взяты с агрегатора.
- GitVerse: живого сайта на Pages для проверки SPA не нашёл.
- GitFlic Pages, статический хостинг REG.RU S3 и Cloud.ru: ничего не нашёл.

## Выбор

**Бесплатно и похоже на Vercel — Yandex Object Storage + GitHub Actions.** 0 ₽ в пределах free tier с запасом по запросам и трафику; HTTPS на `*.website.yandexcloud.net` без своего домена (проверено); SPA через `index.html` как страницу ошибки (код, вероятно, 404) или через API Gateway с кодом 200, тоже в бесплатных лимитах; push в GitHub запускает workflow с загрузкой в бакет. Минусы: нужен платёжный аккаунт с российской картой или СБП, деплой — свой workflow, а не подключение репозитория в панели.

**Дешёвый надёжный платный — Timeweb Cloud App Platform.** Единственный найденный вариант с настоящим автодеплоем из GitHub, как у Vercel, SPA Fallback с кодом 200 (проверено на их демо), бесплатным `*.twc1.net` с Let's Encrypt и серверами в Петербурге (AS9123). По формуле выше выходит единицы–десятки рублей в месяц, первый платёж 500 ₽ хватит надолго, лимит запросов в панели защищает от неожиданного счёта. Amvera даёт то же, но за 170 ₽/мес и через контейнер с nginx.
