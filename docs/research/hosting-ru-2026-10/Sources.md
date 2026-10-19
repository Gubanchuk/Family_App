---
type: research-sources
slug: hosting-ru
created: 2026-10-18
---

# Источники: хостинг без VPN

Здесь те, на которые опираются выводы `SUMMARY.md`. Остальные (103 уникальных адреса) с датами и уверенностью по каждому утверждению: `raw/frontend-hosting.md`, `raw/backend-access.md`. Все страницы прочитаны 18.10.2026.

## Сильные

1. **Cloudflare, «Russian Internet users are unable to access the open Internet»**, 26.06.2025. https://blog.cloudflare.com/russian-internet-users-are-unable-to-access-the-open-internet/ С 09.06.2025 от ресурсов за Cloudflare в РФ приходят первые ~16 КБ; Ростелеком, МегаФон, ВымпелКом, МТС, МГТС. Об отмене ничего.
2. **Supabase, «Navigating regional network blocks»**, 26.03.2026. https://supabase.com/blog/navigating-regional-network-blocks Блокировки в ОАЭ, Йемене, Индии; Россия не упомянута. Прокси-домен Supabase вернул REST, Realtime и функции, колбэки Auth и ссылки Storage остались сломаны.
3. **Yandex Object Storage, тарифы**, 16.10.2026. https://yandex.cloud/ru/docs/storage/pricing Бесплатно: 1 ГБ, 10 000 PUT, 100 000 GET, 100 ГБ трафика в месяц.
4. **Yandex Object Storage, хостинг сайта и сертификат**, 28.08 и 15.10.2026. https://yandex.cloud/ru/docs/storage/concepts/hosting, https://yandex.cloud/ru/docs/storage/operations/hosting/certificate, https://yandex.cloud/ru/docs/storage/operations/hosting/setup HTTPS на `*.website.yandexcloud.net` без своего сертификата; для SPA `index.html` ставится страницей ошибки.
5. **Yandex API Gateway, интеграция с Object Storage и цены**, 22.05 и 16.10.2026. https://yandex.cloud/ru/docs/api-gateway/concepts/extensions/object-storage, https://yandex.cloud/ru/docs/api-gateway/pricing Поле `statusCode` у `error_object`; первые 100 000 запросов бесплатно.
6. **Timeweb App Platform**, дата не указана. https://timeweb.cloud/docs/apps/frontend-pricing.md, https://timeweb.cloud/docs/apps/reverse-proxy.md, https://timeweb.cloud/docs/apps/deploying-frontend-apps.md 4,95 ₽ за 10 000 запросов, SPA Fallback, деплой по коммиту. Код 200 на вложенном пути проверен curl'ом на их демо.
7. **SourceCraft Sites, FAQ**. Service worker запрещены, заголовок `worker-src 'none'` проверен curl'ом. Адрес в `raw/frontend-hosting.md`.
8. **VDSina, цены**, дата не указана. https://vdsina.ru/pricing/standard 1 ядро, 1 ГБ: 150 ₽; 2 ядра, 4 ГБ: 1 200 ₽; IP в цене, посуточная оплата.
9. **FirstVDS, цены**, дата не указана. https://firstvds.ru/products/vds_vps_hosting «Прогрев» 1 ГБ 299 ₽, «Старт» 2 ГБ 519 ₽, «Разгон» 4 ГБ 1 069 ₽, IP в цене.
10. **REG.RU облако, цены и Free Tier**, дата не указана. https://reg.cloud/cloud/servers Бесплатный VPS 1 ядро, 1 ГБ до 3 месяцев.
11. **Supabase self-hosting**, дата не указана. https://supabase.com/docs/guides/self-hosting/docker, https://supabase.com/docs/guides/self-hosting/restore-from-platform Минимум 4 ГБ RAM; состав compose; что переезжает при дампе, что нет.
12. **Домены .ru**, дата не указана. https://timeweb.com/ru/services/domains/ (200 ₽ / 399 ₽), https://beget.com/ru/domains (199 ₽ / 420 ₽).

## Средние

13. **Форум Vercel, обрывы из России**, 02.09–28.09.2026. https://community.vercel.com/t/custom-domain-unreachable-from-some-russian-isps-while-vercel-app-works/48756, https://community.vercel.com/t/custom-domain-stalls-from-russian-networks-while-vercel-app-alias-works/49440, https://community.vercel.com/t/sigmaclub-ru-tls-resets-despite-valid-ssl-vercel-app-responds-on-the-same-ip/48992 Обрезаются собственные домены, `*.vercel.app` отвечает: остановка на 16 604 из 28 101 (08.09), 20 856 из 47 160 и ~10 173 из 60 414 байт; отчёт передан сетевой команде.
14. **net4people #490**, с 27.06.2025, ссылки до 10.10.2026. https://github.com/net4people/bbs/issues/490 Механизм заморозки после 15–20 КБ, чаще на мобильных операторах.
15. **Хабр, 15.06.2026.** https://habr.com/ru/articles/1047442/ Крупные CDN под ограничение целиком не попадают, правило висит на отдельных диапазонах.
16. **Белые списки**: https://en.zona.media/article/2026/04/07/russian_internet_censorship_2026 (07.04.2026), https://habr.com/ru/articles/1027276/ (25.04.2026), https://www.anti-malware.ru/news/2026-08-31-111332/51227 (31.08.2026). Действуют на мобильном интернете, на домашнем нет; Минцифры просит хостеров вынести разрешённые сайты в отдельные подсети.
17. **Сбой ТСПУ 05.06.2026**: https://ebyebots.ru/blog/sboj-interneta-v-rossii-iz-za-tspu-pochemu-ne-rabotayut-sajty-httphttps-i-zakryt-dostup-k-serveram-sshrdp-icmp-beget-timeweb-i-selectel/ (06.06.2026), https://amnezia.org/ru/blog/cascading-hosting-issues-may-june-2026 (дата не указана; там же сбой VDSina 03.06.2026).
18. **Блокировки подсетей хостеров, август 2026**: https://news.vdc.ru/2026/08/04/o-massovoj-blokirovke-ip-adresov-tspurkn-oficzialnaya-pozicziya-kompanii/ (04.08.2026).
19. **Теплица, правила хостеров про прокси**, 12.05.2026, обновлено 11.07.2026: https://te-st.org/2026/05/12/hostingrules/
20. **Supabase self-hosting, отзывы**, 23.10.2025–18.05.2026: https://github.com/orgs/supabase/discussions/39820 Обновления иногда ломают сборку, логи забивают диск, для малой нагрузки стабильно.
21. **Обзор российских замен Vercel**, 14.08.2026: https://www.codesrc.ru/post/rossiyskie-alternativy-github-gitlab-vercel-i-heroku-2026-18fd4
22. **REG.RU, цена домена**: https://www.reg.ru/company/promotions/20202174, https://www.reg.ru/company/news/12857 (169 ₽ по акции до 31.12.2026, продление 999 ₽).

## Слабые

23. **Форум Vercel, Мурманск**, 26.09.2026. https://community.vercel.com/t/regional-access-to-vercel-app-varies-by-ingress-ip-from-russia/49777 Не открывается `*.vercel.app`, Supabase в той же сети доступен. Один пост.
24. **Теплица, тесты из дата-центров Москвы и Петербурга**, 30.09.2026. https://te-st.org/2026/09/30/vlessmore/ Сбоев на участке дата-центр → заграница не нашли. Тестировали VPN-протокол, не HTTPS к Cloudflare.

## Отброшены

- **beget-free.ru, «хостинги в белом списке»**, 08.06.2026. Партнёрский сайт Beget, методики нет.
- **Beget, бесплатный тариф.** HTTPS на `*.beget.tech` не подтверждён, единственное упоминание трёхлетней давности говорит, что нет.
