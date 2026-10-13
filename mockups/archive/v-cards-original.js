// «Как у всех»: the category standard (white cards, member colours). Comparison variant.
window.FA_VARIANTS = window.FA_VARIANTS || {};
(() => {
  const av = (D, id, sm) => `<span class="c-av ${sm ? 'sm' : ''}" style="--c:var(--c-${id})" aria-hidden="true">${D.people[id].initial}</span>`;
  const checkBox = (icon) => `<span class="c-check" aria-hidden="true">${icon('check')}</span>`;
  const card = (title, link, body) => `<section class="c-card"><div class="c-card-h"><h2>${title}</h2>${link ? `<span>${link}</span>` : ''}</div>${body}</section>`;

  function home(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf } = ctx;
    const me = D.people[state.viewer];
    const day = D.days[state.viewer];
    const g = D.goals[0];
    const reqs = day.filter((s) => s.kind === 'request' || s.kind === 'own-request').map((s) => {
      const done = state.done.has(s.id);
      const who = s.kind === 'request' ? s.from : s.to;
      return `<div class="c-row ${done ? 'c-done' : ''}"><button type="button" class="c-btnrow" data-act="station" data-id="${s.id}" aria-pressed="${done}">${checkBox(icon)}${av(D, who, true)}
        <span class="c-row-main"><b>${s.title}</b><small>${s.kind === 'request' ? `просит ${D.people[s.from].name}` : 'ждёт Папу'}</small></span>${s.urgent ? '<span class="c-pill">срочно</span>' : ''}</button></div>`;
    }).join('');
    const soup = soupOf(D.today.dayIndex);
    const meals = day.filter((s) => s.kind === 'meal').map((s) => {
      const name = s.title === 'Ужин' ? dinnerOf(D.today.dayIndex).name : s.dish;
      const sub = s.title === 'Обед' && soup ? `${s.time} · день ${soup.day} из ${soup.of}` : s.time;
      return `<div class="c-row"><span class="c-meal-ic" style="--c:var(--c-accent)">${icon('menu')}</span><span class="c-row-main"><b>${name}</b><small>${s.title} · ${sub}</small></span></div>`;
    }).join('');
    const pay = isParent() ? day.filter((s) => s.kind === 'payment').map((p) => `<div class="c-row"><span class="c-meal-ic" style="--c:var(--c-mama)">${icon('money')}</span><span class="c-row-main"><b>${p.title}</b><small>${F.rub(p.amount)}, ${p.due}</small></span></div>`).join('') : '';
    return `<header class="c-head"><div><h1>Доброе утро, ${me.name}</h1><p>${D.today.weekday}, ${D.today.date}</p></div>${av(D, state.viewer)}</header>
      ${card('Мои дела', 'Все дела', reqs)}
      ${card('Сегодня едим', 'Меню', meals)}
      ${card('Цели семьи', 'Все цели', `<div class="c-row"><span class="c-row-main"><b>${g.title}</b><small>${F.rub(g.saved)} из ${F.rub(g.target)}</small><div class="c-bar" style="--c:var(--c-son)"><i style="width:${Math.round((g.saved / g.target) * 100)}%"></i></div></span></div>`)}
      ${pay ? card('Скоро платить', 'Все платежи', pay) : ''}`;
  }

  function menu(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf, shopTotals } = ctx;
    const day = state.day;
    const soup = soupOf(day);
    const din = dinnerOf(day);
    const pr = D.proposal;
    let actions = '';
    if (state.approved) actions = '<span class="c-card-h"><span>Утверждено</span></span>';
    else {
      if (!state.votes[state.viewer]) actions += `<button type="button" class="c-btn ghost" data-act="vote" data-v="yes">${icon('check')}За</button>`;
      if (isParent()) actions += '<button type="button" class="c-btn" data-act="approve">Утвердить</button>';
    }
    const row = (slot, name, sub, replace) => `<div class="c-row"><span class="c-row-main"><b>${name}</b><small>${slot}${sub ? ` · ${sub}` : ''}</small></span>${replace ? `<button type="button" class="c-btn ghost" data-act="replace-simple" aria-label="Заменить ужин">${icon('swap')}</button>` : ''}</div>`;
    return `<header class="c-head"><div><h1>Меню</h1><p>Неделя ${D.weekLabel}</p></div></header>
      ${card('Предложение на следующую неделю', '', `<p style="margin:0 0 12px">${D.people[pr.by].name} предлагает «${pr.title}» на ${pr.forWeek}</p><div class="c-actions" style="margin:0">${actions}</div>`)}
      <div class="c-days" role="group" aria-label="Дни недели">${D.weekDays.map((d, i) => `<button type="button" data-act="day" data-day="${i}" aria-pressed="${i === day}">${d.short}<small>${d.date}</small></button>`).join('')}</div>
      ${card(`${D.weekDays[day].name}, ${D.weekDays[day].date} октября`, '', [
        row('Завтрак', D.meals[day].b),
        soup ? row('Обед', soup.name, `день ${soup.day} из ${soup.of}`) : '',
        row('Полдник', D.meals[day].s),
        row('Ужин', din.name, `${din.min} мин · Диме: ${din.dima}`, true),
      ].join(''))}
      ${card('Продукты на неделю', '', `<div class="c-row"><span class="c-row-main"><b>≈ ${F.rub(shopTotals().menuSum)}</b><small>Не едим: ${D.notEat.join(', ')}</small></span><button type="button" class="c-btn ghost" data-act="tab" data-tab="shop">В покупки</button></div>`)}`;
  }

  function shop(ctx) {
    const { D, F, state, icon, shopTotals } = ctx;
    const t = shopTotals();
    return `<header class="c-head"><div><h1>Покупки</h1><p>Отмечено ${t.doneCount} из ${t.count}</p></div></header>
      <div class="c-actions"><button type="button" class="c-btn" data-act="go-shop">${icon('bag')}Иду в магазин</button><button type="button" class="c-btn ghost" data-act="copy">${icon('copy')}Скопировать</button></div>
      ${card('Итого', '', `<div class="c-money"><div><b>${F.rub(t.bought)}</b><small>куплено</small></div><div><b>≈ ${F.rub(t.left)}</b><small>осталось</small></div></div>`)}
      ${D.shop.map((d) => card(d.dept, `${d.items.filter((i) => state.shopDone.has(i.id)).length} из ${d.items.length}`, d.items.map((i) => {
        const done = state.shopDone.has(i.id);
        return `<div class="c-row ${done ? 'c-done' : ''}"><button type="button" class="c-btnrow" data-act="shop-item" data-id="${i.id}" aria-pressed="${done}">${checkBox(icon)}<span class="c-row-main"><b>${i.name}</b><small>${i.qty}${i.from === 'menu' ? ' · из меню' : ''}</small></span>${i.urgent ? '<span class="c-pill">срочно</span>' : ''}<span>${F.rub(i.price)}</span></button></div>`;
      }).join(''))).join('')}`;
  }

  function board(ctx) {
    const { D, F, state, icon, isParent } = ctx;
    const tabsDef = [['wishes', 'Хотелки'], ['needs', 'Надо купить'], ['goals', 'Цели'], ['requests', 'Просьбы']];
    let panel = '';
    if (state.boardTab === 'wishes') {
      panel = D.wishes.map((w) => card(w.title, `≈ ${F.rub(w.price)}`, `<div class="c-row">${av(D, w.owner, true)}<span class="c-row-main"><small>${D.people[w.owner].name}${w.saved ? ` · в копилке ${F.rub(w.saved)}` : ''}</small>${w.saved ? `<div class="c-bar" style="--c:var(--c-${w.owner})"><i style="width:${Math.round((w.saved / w.price) * 100)}%"></i></div>` : ''}</span>
        ${w.owner !== state.viewer ? `<button type="button" class="c-btn ghost" data-act="metoo" data-id="${w.id}" aria-pressed="${state.metoo[w.id].has(state.viewer)}">${icon('metoo')}${state.metoo[w.id].size}</button>` : ''}</div>
        ${w.gift && isParent() ? `<div class="c-row"><span class="c-row-main"><small>Берём в подарок: ${D.people[w.gift].name}. ${D.people[w.owner].name} не видит.</small></span></div>` : ''}`)).join('');
    } else if (state.boardTab === 'needs') {
      panel = D.needs.map((n) => card(n.title, `≈ ${F.rub(n.price)}`, `<div class="c-row">${av(D, n.who, true)}<span class="c-row-main"><small>${D.people[n.who].name} · ${n.note}</small></span><button type="button" class="c-btn ghost" data-act="to-shop" data-title="${n.title}">В покупки</button></div>`)).join('');
    } else if (state.boardTab === 'goals') {
      panel = D.goals.map((g) => card(g.title, g.scope, `<div class="c-row"><span class="c-row-main"><small>${F.rub(g.saved)} из ${F.rub(g.target)}</small><div class="c-bar"><i style="width:${Math.round((g.saved / g.target) * 100)}%"></i></div></span></div>`)).join('');
    } else {
      const rq = D.requests[state.viewer];
      panel = card('Мне', '', rq.toMe.map((q) => {
        const done = state.reqDone.has(q.id);
        return `<div class="c-row ${done ? 'c-done' : ''}"><button type="button" class="c-btnrow" data-act="req-done" data-id="${q.id}" aria-pressed="${done}">${checkBox(icon)}${av(D, q.from, true)}<span class="c-row-main"><b>${q.title}</b><small>${q.when}</small></span>${q.urgent ? '<span class="c-pill">срочно</span>' : ''}</button></div>`;
      }).join('')) + card('От меня', '', rq.fromMe.map((q) => `<div class="c-row">${av(D, q.to, true)}<span class="c-row-main"><b>${q.title}</b><small>${q.when}</small></span></div>`).join(''));
    }
    return `<header class="c-head"><div><h1>Доска</h1><p>Видно всей семье</p></div></header>
      <div class="c-seg" role="tablist" aria-label="Разделы доски">${tabsDef.map(([id, label]) => `<button type="button" role="tab" data-act="board-tab" data-b="${id}" aria-selected="${state.boardTab === id}">${label}</button>`).join('')}</div>
      ${panel}`;
  }

  function money(ctx) {
    const { D, F, icon } = ctx;
    const total = D.payments.reduce((a, p) => a + p.amount, 0);
    const paid = D.payments.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
    return `<header class="c-head"><div><h1>Деньги</h1><p>Октябрь</p></div></header>
      ${card('Обязательные платежи', '', `<div class="c-money"><div><b>${F.rub(total)}</b><small>всего</small></div><div><b>${F.rub(paid)}</b><small>оплачено</small></div><div><b>${F.rub(total - paid)}</b><small>осталось</small></div></div>`)}
      ${card('Платежи', '', D.payments.map((p) => `<div class="c-row ${p.paid ? 'c-done' : ''}">${checkBox(icon)}<span class="c-row-main"><b>${p.title}</b><small>${p.day} октября${p.note ? ' · ' + p.note : ''}</small></span><span>${F.rub(p.amount)}</span></div>`).join(''))}
      ${card('Расходы', '', D.spend.map((c) => `<div class="c-row"><span class="c-row-main"><b>${c.cat}</b><small>${c.note}</small></span><span>${F.rub(c.sum)}</span></div>`).join(''))}`;
  }

  window.FA_VARIANTS.cards = {
    screen(tab, ctx) { return { home, menu, shop, board, money }[tab](ctx); },
    handle(name, el, ctx) {
      if (name === 'replace-simple') { ctx.toast('Здесь откроется список блюд на замену, как в «Схеме», только карточками.'); return true; }
      return false;
    },
    notes: {
      title: 'Как у всех',
      comp: 'img/comp-cards.jpg',
      thesis: 'Стандарт семейных органайзеров вроде Cozi и FamilyWall: белые карточки, цвета участников, привычная раскладка.',
      pros: [
        'Ничего не надо объяснять: так устроено большинство приложений.',
        'Проще и дешевле всего в разработке.',
        'Новый раздел добавляется ещё одной карточкой.',
      ],
      cons: [
        'Похоже на любое приложение, своего лица нет.',
        'Ровно то, что ты отметил как «скука: одни белые карточки».',
        'Связь «меню → покупки → цели» не видна, это просто стопка карточек.',
      ],
      try: [
        'Сравни Главную с линией из «Схемы»: что быстрее читается?',
        'В Покупках отметь пару товаров.',
        'Включи «Ночь»: тёмная тема есть, но обычная.',
      ],
    },
  };
})();
