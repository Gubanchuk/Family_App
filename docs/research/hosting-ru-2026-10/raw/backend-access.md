---
type: research-raw
slug: hosting-ru
topic: backend-access
created: 2026-10-18
---

# Доступ к Supabase из РФ: прокси, свой Supabase, цены VPS

Все страницы прочитаны 18.10.2026. Дата рядом со ссылкой — дата, которая стоит на самой странице; если её нет, так и написано.

Уровни уверенности:
- **Strong** — официальная документация или прайс, первичный замер (Cloudflare, OONI, наш собственный замер).
- **Moderate** — два и больше независимых источника (форумы, статьи).
- **Speculative** — одно упоминание.

## 0. Наш замер (18.10.2026, с ПК владельца)

- `pbipnjlsxkbhdyfebdeo.supabase.co` резолвится в `104.18.38.10` и `172.64.149.246` — адреса Cloudflare. Ответ API: `Server: cloudflare`, `CF-RAY: …-ZRH`, cookie `__cf_bm`. Запись от 13.10 подтверждена. **Strong.**
- `family-app-pearl-three.vercel.app` резолвится в `64.29.17.3` и `216.198.79.3`. Это те же подсети /24, что и у адресов, которые в ветке Vercel от 26.09.2026 не отвечали из Мурманска (`64.29.17.67` — таймаут TCP, `216.198.79.67` — таймаут TLS). Адреса не те же самые, поэтому вывод «наш сайт тоже не откроется» отсюда не следует. **Speculative.**
- Замер сделан не из российской сети (CF-RAY показывает Цюрих), поэтому о доступности из РФ он ничего не говорит.

## 1. Режут ли сейчас Cloudflare и зарубежный хостинг

### Что известно наверняка

- С 09.06.2025 российские провайдеры дают загрузить только первые ~16 КБ любого ресурса за Cloudflare; затронуты HTTP/1.1, HTTP/2, HTTP/3. Названы Ростелеком, МегаФон, ВымпелКом, МТС, МГТС. Похожее происходит у Hetzner, DigitalOcean, OVH. [blog.cloudflare.com](https://blog.cloudflare.com/russian-internet-users-are-unable-to-access-the-open-internet/), 26.06.2025 (в метаданных `dateModified` 15.07.2026, но текст обновлений не содержит, о снятии ограничения ничего нет). **Strong.**
- Механизм по замерам сообщества: при TLS к «подозрительному» IP (зарубежный дата-центр) соединение молча замерзает после 15–20 КБ от сервера, позже уточнено как ~25 пакетов в любую сторону. «Особенно на мобильных сетях»; в комментарии от 28.06.2025 — «в основном мобильные операторы (t2, МегаФон, Билайн, Yota, МТС), но зависит от региона». [net4people #490](https://github.com/net4people/bbs/issues/490), открыт 27.06.2025, ссылки из чужих репозиториев идут до 10.10.2026 (например, «Add the TSPU 16/20 quota freeze to the fault engine», 21.08.2026; «a TSPU freeze probe — ping, then 64 KB», 26.09.2026). То есть заморозку продолжают учитывать в инструментах осенью 2026. **Moderate.**

### Свежие сообщения (август–октябрь 2026)

- **Vercel, 08.09.2026:** из РФ ответ 200, загрузка останавливается на 16 604 байтах из 28 101, маленький файл доходит. [community.vercel.com/…/48992](https://community.vercel.com/t/sigmaclub-ru-tls-resets-despite-valid-ssl-vercel-app-responds-on-the-same-ip/48992), 08.09.2026. **Speculative** (один автор), но картина ровно та же, что у Cloudflare.
- **Vercel, 02.09–28.09.2026:** свои домены «на нескольких российских домашних и мобильных сетях» открываются частично. Замеры: остановка на 20 856 из 47 160 байт (21.09), на ~10 173 из 60 414 байт (28.09); `*.vercel.app` в этих случаях работал. Сотрудник Vercel передал отчёт сетевой команде, причин и сроков нет. [community.vercel.com/…/48756](https://community.vercel.com/t/custom-domain-unreachable-from-some-russian-isps-while-vercel-app-works/48756), посты 02.09–28.09.2026. Ещё один такой же случай на мобильных сетях: [community.vercel.com/…/49440](https://community.vercel.com/t/custom-domain-stalls-from-russian-networks-while-vercel-app-alias-works/49440), 19.09.2026. **Moderate.**
- **Vercel, 26.09.2026, Мурманск:** не открывается уже и `*.vercel.app` — `ERR_CONNECTION_RESET` на офисном Wi‑Fi и мобильном, работает через VPN. Доступность зависит от IP Vercel: `216.198.79.195` и `76.76.21.21` отвечали, `216.198.79.67`, `64.29.17.67` — нет. **В той же сети бэкенд Supabase был доступен напрямую.** Ответа Vercel нет. [community.vercel.com/…/49777](https://community.vercel.com/t/regional-access-to-vercel-app-varies-by-ingress-ip-from-russia/49777), 26.09.2026. **Speculative** (один пост).
- **Проверка записи от 13.10:** жалоба 29.10.2025 существует (Ростелеком и МТС, сброс посреди передачи), но 02.11.2025 автор написал, что всё заработало само. [community.vercel.com/…/26433](https://community.vercel.com/t/custom-domains-not-working-from-russia/26433), 29.10–03.11.2025. Жалоба 08.09.2026 — это ветка 48992 выше. Жалоба 26.09.2026 — ветка 49777. Записи от 13.10 верны, но первая устарела.
- **Мобильный против домашнего, 30.09.2026:** в тестах Теплицы из дата-центров и домашнего ШПД Москвы и Петербурга сбоев не нашли; опрошенные пользователи сообщают об «удовлетворительной работоспособности на домашних сетях» и «частых сбоях на мобильных операторах». Паттерн «16 КБ, дальше заморозка» описан как характерный для февральской волны; в сентябрьских тестах серия запросов за ~3 минуты прошла без разрывов. [te-st.org/2026/09/30/vlessmore](https://te-st.org/2026/09/30/vlessmore/), 30.09.2026. Тесты касались VPN-протокола, а не обычного HTTPS к Cloudflare. **Speculative** для нашего вопроса.
- **Июнь 2026:** в феврале 16 КБ-паттерн видели на проводных (Дом.ру, Skynet, Ростелеком), при этом LTE Билайн и МТС на том же устройстве работали; автор за 12 часов на Ростелекоме заморозок не нашёл. «Крупные CDN (Cloudflare, Akamai, Google) в „подозрительный“ список целиком не входят» — правило висит на отдельных диапазонах. [habr.com/ru/articles/1047442](https://habr.com/ru/articles/1047442/), 15.06.2026. Это объясняет, почему у одних всё открывается, у других нет. **Speculative.**
- **Белые списки на мобильном:** действуют с сентября 2025, Минцифры ведёт перечень разрешённых сервисов; регионы с отключениями — Омск, Тюмень, Архангельск, Ростов, Брянск, Краснодар, центр Москвы почти три недели в марте 2026. Отключения касаются мобильного интернета. [en.zona.media](https://en.zona.media/article/2026/04/07/russian_internet_censorship_2026), 07.04.2026. Пока включён белый список, открывается только то, чей IP или подсеть в списке; «на домашнем инете» белых списков нет. [habr.com/ru/articles/1027276](https://habr.com/ru/articles/1027276/), 25.04 (год из текста — 2026). **Moderate.**

### supabase.co

- Блокировок supabase.co именно в РФ не найдено. Supabase описывает блокировки в ОАЭ (сентябрь 2025), Йемене (февраль 2026), Индии (24.02–03.03.2026), Россию не упоминает. [supabase.com/blog/navigating-regional-network-blocks](https://supabase.com/blog/navigating-regional-network-blocks), 26.03.2026. **Strong** (для «Supabase о России не сообщал»).
- Значит, проблема Supabase в РФ — не блокировка домена, а общее ограничение Cloudflare: маленькие ответы проходят, большие (список рецептов, синхронизация) замерзают. Ровно то, что было на телефоне 15.10. **Moderate** (по совокупности: Cloudflare + ветки Vercel + наш симптом).

### Пусто

- OONI за 2026 по Cloudflare или supabase.co не нашёл. Есть только данные OONI по GitHub: доля неудачных подключений 10% 05.05.2026 и 16% 06–07.05.2026 против ≤4% в апреле. [meduza.io](https://meduza.io/en/news/2026/05/08/github-access-deteriorates-in-russia-as-internet-regulator-denies-blocking), 08.05.2026.
- Отчёты Cloudflare Radar за 2026 о России не нашёл; в RSS блога Cloudflare по тегу Russia после 26.06.2025 новых постов нет.
- Обсуждения Supabase на GitHub о России не нашёл (#42752 — Южная Азия, февраль 2026).
- Отдельных отчётов по AWS и Fastly из РФ за 2026 не нашёл.

**Ответ на вопрос 1:** ограничение ~16 КБ к Cloudflare и зарубежным дата-центрам не снято, свежие замеры по Vercel в сентябре 2026 показывают ту же остановку на 10–20 КБ. Сильнее страдает мобильный интернет, домашний — по ситуации и по диапазону IP. Блокировки supabase.co как домена нет. **Moderate.**

## 2. Прокси на российском VPS перед Supabase

### Режется ли трафик из российского дата-центра за границу

- Прямых замеров «VPS в РФ → Cloudflare, большой ответ» не нашёл. Отчётов, что с российских серверов ломается загрузка с Cloudflare, тоже не нашёл. Отрицательный результат.
- Косвенно — работает:
  - Теплица 30.09.2026: узлы в дата-центрах Москвы и Петербурга подключались к зарубежным серверам, 9 из 9 запросов успешно в каждом городе, «не нашли блокировок ни по IP, ни обрывов». [te-st.org/2026/09/30/vlessmore](https://te-st.org/2026/09/30/vlessmore/), 30.09.2026.
  - Каскадные VPN «телефон → VPS в РФ → VPS за рубежом» массово используются в 2026, им нужен рабочий участок РФ → заграница. [habr.com/ru/articles/1040846](https://habr.com/ru/articles/1040846/), 28.05.2026; [habr.com/ru/articles/1021160](https://habr.com/ru/articles/1021160/), 09.04.2026. В одной инструкции: «десятимегабайтная передача через оба туннеля у меня прошла без потерь». [habr.com/ru/articles/1056220](https://habr.com/ru/articles/1056220/), 07.07 (год не указан).
  - Cloudflare пишет, что сбои происходят «внутри российских провайдеров, близко к пользователям». [blog.cloudflare.com](https://blog.cloudflare.com/russian-internet-users-are-unable-to-access-the-open-internet/), 26.06.2025.
  - Итог: **Moderate**, что участок VPS в РФ → Cloudflare сейчас не режется. Проверяется за минуту: `curl` с VPS ответа больше 64 КБ от Supabase.
- Против: блокировки по реестру РКН на дата-центрах действуют («Telegram оказался заблокирован со всех российских IP», включая VPS Timeweb). [habr.com/ru/articles/1040846](https://habr.com/ru/articles/1040846/), 28.05.2026. supabase.co и Cloudflare в реестре нет, но механизм на стороне хостера есть. **Speculative.**

### Работает ли прокси для Supabase

- Готовых отчётов «проксировал Supabase через российский VPS» не нашёл. Отрицательный результат.
- Первичное подтверждение схемы: в ОАЭ Supabase сам запустил прокси-домен, он вернул PostgREST, Realtime и Edge Functions; колбэки Auth и ссылки на объекты Storage остались сломаны из-за «hardcoded domain references». [supabase.com/blog/navigating-regional-network-blocks](https://supabase.com/blog/navigating-regional-network-blocks), 26.03.2026. **Strong** для «прокси перед `<ref>.supabase.co` возвращает REST, WebSocket Realtime и функции».
- Что это значит для нас:
  - REST, Realtime, Edge Functions идут через прокси, если клиент создан с адресом прокси. Для Realtime в nginx нужны заголовки `Upgrade`/`Connection` и длинный `proxy_read_timeout` (стандартная настройка, отдельного источника по Supabase нет).
  - Вход через Google: Supabase Auth сообщает Google колбэк `<ref>.supabase.co/auth/v1/callback`, и браузер придёт туда напрямую, мимо прокси. Ответ колбэка — короткий редирект, он может пройти и под ограничением 16 КБ, но это моя догадка, замеров нет. **Speculative.** Надёжнее — вход по коду на почту, он целиком идёт через API.
  - Ссылки на фото из Storage строятся от адреса клиента, но Supabase отмечает, что часть адресов «зашита». Проверять на своём коде.
- Риск хостера: некоторые оферты запрещают «прокси-сервисы» вообще (Beget для shared-хостинга), RUVDS — «средства для получения доступа к ресурсам, доступ к которым ограничен». [te-st.org/2026/05/12/hostingrules](https://te-st.org/2026/05/12/hostingrules/), 12.05.2026, обновлено 11.07.2026. Обратный прокси к незаблокированному сервису под формулировку закона явно не попадает, но может нарушать конкретную оферту. 07–08.10.2026 Selectel по указанию ЦМУ ССОП отключил Xbox DNS; владельца личного VPS с WireGuard между своими сетями хостер попросил выключить сервер. [te-st.org/2026/10/12/xboxdns](https://te-st.org/2026/10/12/xboxdns/), 12.10.2026. **Moderate**: риск отключения есть, для прокси к своему API — небольшой, но не нулевой.
- Риск IP хостера: 05.06.2026 после обновления ТСПУ тысячи сайтов на Beget, Timeweb, Selectel, SpaceWeb частично не открывались у российских пользователей. [ebyebots.ru](https://ebyebots.ru/blog/sboj-interneta-v-rossii-iz-za-tspu-pochemu-ne-rabotayut-sajty-httphttps-i-zakryt-dostup-k-serveram-sshrdp-icmp-beget-timeweb-i-selectel/), 06.06.2026; [amnezia.org](https://amnezia.org/ru/blog/cascading-hosting-issues-may-june-2026), дата не указана. В августе 2026 РКН блокировал IP-адреса хостеров, где стояли VPN, VirtualDC предупредил, что «под блокировку могут попасть целые подсети». [news.vdc.ru](https://news.vdc.ru/2026/08/04/o-massovoj-blokirovke-ip-adresov-tspurkn-oficzialnaya-pozicziya-kompanii/), 04.08.2026. **Moderate.**
- При белых списках на мобильном прокси сработает, только если подсеть VPS в списке. Подсети Yandex Cloud, Timeweb, Beget, Selectel, REG.RU, VK частично в списках (любительский скан, погрешность 20–30% по словам автора). [habr.com/ru/articles/1027276](https://habr.com/ru/articles/1027276/), 25.04.2026. Автор другой статьи позже признал, что VM Yandex Cloud «спокойно режется при белых списках» — у Yandex.Cloud и Яндекса разные AS. [habr.com/ru/articles/1021160](https://habr.com/ru/articles/1021160/), 09.04.2026, UPD2. **Speculative.**

### Свой домен Supabase

- Аддон Custom Domain — $10 в месяц за домен и проект, только на платном тарифе; Pro — от $25 в месяц. [supabase.com/pricing.md](https://supabase.com/pricing.md), дата не указана. **Strong.**
- Свой домен настраивается CNAME на `<ref>.supabase.co`. [supabase.com/docs/guides/platform/custom-domains](https://supabase.com/docs/guides/platform/custom-domains), дата не указана. **Strong.**
- `<ref>.supabase.co` резолвится в адреса Cloudflare (наш замер выше). Значит, свой домен приходит на те же адреса Cloudflare и от ограничения 16 КБ не спасает: правило висит на IP-диапазонах, а не на имени. В Индии свой домен помогал, потому что там отравляли DNS имени `*.supabase.co`. **Moderate** (вывод из официальной схемы DNS плюс наш замер; прямого подтверждения «свой домен Supabase идёт через Cloudflare» в документации нет).
- Плюс аддона: после включения «OAuth flows will advertise the custom domain as a callback URL» — колбэк Google переедет на свой домен. Через прокси на VPS это уже не поможет, потому что сам домен смотрит на Cloudflare.

**Ответ на вопрос 2:** прокси на российском VPS, скорее всего, работает: участок дата-центр РФ → Cloudflare сейчас не режут, Supabase сам вернул так REST, Realtime и функции в ОАЭ. Слабые места — колбэк Google и риски хостера (IP, оферта). Свой домен Supabase за $35 в месяц ничего не даёт. **Moderate.**

## 3. Supabase на своём сервере

### Требования

- Минимум 4 ГБ RAM, 2 ядра, 40 ГБ SSD; рекомендуют 8 ГБ+, 4 ядра+, 80 ГБ+. Можно выключить ненужное (Realtime, Storage). [supabase.com/docs/guides/self-hosting/docker](https://supabase.com/docs/guides/self-hosting/docker), дата не указана. **Strong.**

### Что входит в официальный docker compose

Прочитан [docker-compose.yml](https://raw.githubusercontent.com/supabase/supabase/master/docker/docker-compose.yml) из ветки master, 18.10.2026. **Strong.**

| Сервис | Образ |
|---|---|
| Studio | `supabase/studio:2026.10.12-sha-3699278` |
| Шлюз | `envoyproxy/envoy:v1.39.1` (Kong — по желанию) |
| Auth | `supabase/gotrue:v2.197.0` |
| REST | `postgrest/postgrest:v14.18` |
| Realtime | `supabase/realtime:v2.143.3` |
| Storage | `supabase/storage-api:v1.81.0`, файлы на диске |
| imgproxy | `darthsim/imgproxy:v3.31.4` |
| Edge Functions | `supabase/edge-runtime:v1.77.4`, включён по умолчанию |
| Postgres | `supabase/postgres:17.6.1.136` |
| Пулер | `supabase/supavisor:2.9.13` |

- pg_cron 1.6.4 и pg_net 0.20.x собраны в образ для Postgres 17. [supabase/postgres nix/ext/versions.json](https://github.com/supabase/postgres/blob/develop/nix/ext/versions.json), ветка develop, 18.10.2026. **Strong.** Наша связка pg_cron + pg_net + Edge Function для пушей переносится.
- Функции кладутся в `volumes/functions/<имя>/index.ts`, после правки — перезапуск сервиса `functions`. SMTP — переменные `SMTP_*` в `.env`. Перед шлюзом нужен свой обратный прокси с HTTPS, «especially for OAuth». [docs/self-hosting/docker](https://supabase.com/docs/guides/self-hosting/docker). **Strong.**
- Чего нет по сравнению с облаком: бэкапов и восстановления на точку во времени, веток, расширенных метрик, Management API; Studio без ролей. Обслуживание, обновления, бэкапы, мониторинг — на владельце. [supabase.com/docs/guides/self-hosting](https://supabase.com/docs/guides/self-hosting), дата не указана. **Strong.**

### Переезд из облака

[supabase.com/docs/guides/self-hosting/restore-from-platform](https://supabase.com/docs/guides/self-hosting/restore-from-platform), дата не указана. **Strong.**

- Выгрузка: `supabase db dump --role-only`, обычный дамп схемы, `--data-only --use-copy`; загрузка через `psql` с `session_replication_role = replica`.
- Переезжают схема, данные, роли, RLS, функции, триггеры и `auth.users` — аккаунты сохраняются.
- Не переезжают: файлы Storage, Edge Functions, секреты и ключи, настройки провайдеров входа и SMTP, пароли своих ролей с LOGIN.
- Все войдут заново: JWT-секреты другие, старые токены недействительны.
- Известные поломки дампа: `SET transaction_timeout = 0` (только PG17), `COPY` в таблицы и колонки, которых нет в своей версии Auth. Совет — сначала прогнать без `--single-transaction`.

### Больные места (по отзывам)

[github.com/orgs/supabase/discussions/39820](https://github.com/orgs/supabase/discussions/39820), открыто мейнтейнером 23.10.2025, ответы до 18.05.2026. **Moderate.**

- Обновления иногда ломают сборку; миграции образа Postgres не запускаются на существующей базе (27.10.2025, 07.05.2026).
- Логи забивают диск, чистить вручную (07.05.2026); сервис аналитики ест много CPU и RAM (07.11.2025), в стандартной сборке он выключен.
- Edge Functions работают, холодный старт дольше облачного (29.04.2026).
- Перезапуск сервисов теряет текущие задачи Realtime (07.05.2026).
- Studio без ролей: у кого адрес, тот админ (29.04.2026) — закрывать доступ самому.
- Положительные: «when it runs, it runs» (29.10.2025); Realtime и Storage заработали с первого раза (07.11.2025); для малых нагрузок стабильно (29.04.2026).

**Ответ на вопрос 3:** официальный compose включает всё, чем мы пользуемся (Auth, REST, Realtime, Storage, Edge Functions, pg_cron, pg_net). Нужен VPS от 4 ГБ. Переезд — дамп базы плюс ручной перенос фото, функций, настроек входа; все войдут заново. **Strong.**

## 4. Цены VPS в рублях (18.10.2026)

На всех страницах дата цен не указана, кроме Yandex Cloud. Цена — за месяц, публичный IPv4 указан отдельно, если оплачивается отдельно.

| Провайдер, локация | ~1–2 ГБ | ~4 ГБ | IPv4 | Тест / бонус |
|---|---|---|---|---|
| VDSina, Москва или Амстердам ([vdsina.ru/pricing/standard](https://vdsina.ru/pricing/standard)) | 1 ядро/1 ГБ/10 ГБ — 150 ₽ (трафик 1 ТБ); 1/2 ГБ/50 ГБ — 600 ₽ | 2/4 ГБ/100 ГБ — 1 200 ₽ | один включён (можно докупить ещё два) | теста нет, оплата посуточно |
| FirstVDS, Москва ([firstvds.ru](https://firstvds.ru/products/vds_vps_hosting)) | «Прогрев» 1/1 ГБ — 299 ₽ (канал 100 Мбит/с, без акций); «Старт» 1/2 ГБ — 519 ₽ | «Разгон» 2/4 ГБ — 1 069 ₽ | один включён | «тестовый период по согласованию» |
| Beget, Санкт-Петербург ([beget.com/ru/vps](https://beget.com/ru/vps)) | Prime 2/2 ГБ/30 ГБ — 810 ₽ | Plus 2/4 ГБ/40 ГБ — 990 ₽ | +5 ₽/сутки (~150 ₽) | не указано |
| REG.RU (Рег.облако), Москва/СПб/Самара ([reg.cloud/cloud/servers](https://reg.cloud/cloud/servers)) | Std C1-M1-D10 (SATA) — 491,01 ₽; Std C2-M2-D40 — 1 199,27 ₽ | Std C4-M4-D80 — 2 398,55 ₽ | +187,38 ₽ | Free Tier: 1 ядро/1 ГБ/10 ГБ NVMe до 3 месяцев; почасовая оплата, минимум 100 ₽ |
| Selectel, Shared Line 10% vCPU ([калькулятор](https://selectel.ru/prices/calculator/)) | 1 vCPU/1 ГБ — 414,12 ₽; 1/2 ГБ — 681,46 ₽ | 2/4 ГБ — 1 362,92 ₽ | цену одного адреса не нашёл («Публичная сеть от 1 138,34 ₽») | теста нет, минимум 100 ₽; диск отдельно (сетевой SSD от 8,99 ₽/ГБ) |
| Timeweb Cloud, Москва ([timeweb.cloud/services/vds-vps](https://timeweb.cloud/services/vds-vps)) | MSK 15 (1/1 ГБ) — 1 180 ₽; MSK 30 (1/2 ГБ) — 1 940 ₽ | MSK 50 (2/4 ГБ) — 3 640 ₽ | +200 ₽ ([timeweb.cloud/prices](https://timeweb.cloud/prices)) | бонусы по запросу в поддержку; оплата: карты (в т.ч. иностранные), СБП, ЮMoney, SberPay; минимум 500 ₽ |
| Yandex Cloud, Ice Lake ([docs/compute/pricing](https://yandex.cloud/ru/docs/compute/pricing), обновлено 16.10.2026) | 2 vCPU 20% + 2 ГБ ≈ 1 224 ₽ (расчёт: (2×0,52 + 2×0,33) ₽/ч × 720 ч) | 2 vCPU 20% + 4 ГБ ≈ 1 699 ₽ | 0,26352 ₽/ч ≈ 190 ₽ ([docs/vpc/pricing](https://yandex.cloud/ru/docs/vpc/pricing), 09.09.2026) | стартового гранта для новых клиентов нет ([usage-grant](https://yandex.cloud/ru/docs/getting-started/usage-grant), 14.10.2026); диск отдельно |

Примечания:
- Timeweb: на странице видна линейка Ultra (MSK Ultra 15 — 1 920 ₽ с IP). Цены остальных линеек взяты из данных, встроенных в ту же страницу; там же есть пресеты «Cloud EKB/KZN» за 350, 550 и 1 000 ₽ (1, 2, 4 ГБ), но в списке локаций на странице их нет. Не полагаться без проверки в панели. **Speculative.**
- Yandex Cloud, прерываемые ВМ: живут не дольше 24 часов и могут быть остановлены в любой момент, «доступны по более низкой цене» без цифр ([preemptible-vm](https://yandex.cloud/ru/docs/compute/concepts/preemptible-vm), 16.10.2026). Прайс-лист отдал 403, цену прерываемой ВМ не получил. Для прокси, который должен работать круглосуточно, прерываемая ВМ не подходит.
- Yandex Cloud: число vCPU в расчёте (2) — моё допущение для примера; минимальную конфигурацию на странице не проверял.
- REG.RU: в линейке «Производительный» (30% vCPU) — 560,57 ₽ за 1 ГБ, 1 381,89 ₽ за 2 ГБ, 2 763,78 ₽ за 4 ГБ.
- Оплата российской картой: явно указана только у Timeweb. У остальных на прочитанных страницах способы оплаты не раскрыты, но это российские юрлица с рублёвыми ценами.
- VDSina: 03.06.2026 VPS были недоступны ~12 часов, затем переезд площадки ([amnezia.org](https://amnezia.org/ru/blog/cascading-hosting-issues-may-june-2026), дата не указана).

**Ответ на вопрос 4:** для прокси и статики (1–2 ГБ) самое дешёвое — VDSina 150–600 ₽, FirstVDS 299–519 ₽ с IP в цене, бесплатно на 3 месяца — Free Tier REG.RU. Для своего Supabase (4 ГБ) — Beget ~1 140 ₽ с IP, FirstVDS 1 069 ₽, VDSina 1 200 ₽. **Strong** (официальные прайсы).

## 5. 199-ФЗ и вход через Google

Разъяснений для частного семейного приложения не нашёл. Статьи [vc.ru](https://vc.ru/legal/3010282-shtrafy-za-avtorizatsiyu) (03.07.2026) и [garant.ru](https://www.garant.ru/article/2136195/) (текст страницы повреждён) повторяют общие правила: с 07.07.2026 иностранные сервисы входа запрещены, разрешены телефон, ЕСИА, ЕБС, российские SSO; штраф гражданину 10–20 тыс. ₽. Про вход по почте и паролю и про закрытые приложения без публичной регистрации — ничего. Отсылок к Минцифры или РКН нет. Пропускаю, как и просили.

## Что искал и не нашёл

- Замеры «VPS в РФ → Cloudflare, ответ > 16 КБ» — ни одного.
- Отчёты о прокси Supabase через российский VPS — ни одного.
- Блокировку supabase.co в РФ — нет (ни у Supabase, ни в сообществах).
- OONI и Cloudflare Radar по России за 2026, кроме GitHub, — нет.
- Цену прерываемой ВМ Yandex Cloud и одного публичного IP Selectel — не получил (прайс-лист 403, калькулятор показывает только подсеть).
- Разъяснения по 199-ФЗ для закрытых приложений — нет.
- ntc.party не открылся (отказ соединения и 429), треды оттуда не прочитаны.
