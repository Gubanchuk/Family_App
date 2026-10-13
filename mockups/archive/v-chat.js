// «Семейный чат»: every module is a thread; requests, polls and reminders arrive as messages with buttons.
window.FA_VARIANTS = window.FA_VARIANTS || {};
(() => {
  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

  const av = (D, id) => `<span class="t-av" style="--c:var(--${id})" aria-hidden="true">${D.people[id].initial}</span>`;
  const helperAv = '<span class="t-av helper" aria-hidden="true"><svg viewBox="0 0 24 24" class="ic"><path d="M5 11 12 5l7 6"/><path d="M7 10v9h10v-9"/></svg></span>';

  // A message from a family member; mine = sent by the viewer (right side).
  function msg(ctx, { from, time, body, actions, status }) {
    const { D, state } = ctx;
    const mine = from === state.viewer;
    return `<div class="t-msg ${mine ? 'mine' : ''}" style="--c:var(--${from})">
      ${mine ? '' : av(D, from)}
      <div class="t-bubble">${mine ? '' : `<span class="t-name">${D.people[from].name}</span>`}<div class="t-text">${body}</div>
        ${status ? `<span class="t-status">${status}</span>` : ''}<span class="t-time">${time}</span></div>
      ${actions ? `<div class="t-actions">${actions}</div>` : ''}</div>`;
  }
  // A message from the helper (the app itself): reminders, summaries, polls.
  function helper(ctx, { time, title, body, actions }) {
    return `<div class="t-msg helper-msg">${helperAv}<div class="t-card"><span class="t-name">Помощник</span>${title ? `<b class="t-card-title">${title}</b>` : ''}<div class="t-text">${body}</div><span class="t-time">${time}</span></div>
      ${actions ? `<div class="t-actions">${actions}</div>` : ''}</div>`;
  }
  const day = (label) => `<div class="t-day"><span>${label}</span></div>`;

  function thread(ctx, { title, sub, pinned, feed, chips }) {
    const { D, icon } = ctx;
    return `<header class="t-head">
        <span class="t-group" aria-hidden="true">${['papa', 'mama', 'son', 'dima'].map((id) => `<i style="--c:var(--${id})"></i>`).join('')}</span>
        <div><h1>${title}</h1><p>${sub}</p></div>
      </header>
      ${pinned ? `<div class="t-pin"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg><div><b>Закреплено</b><span>${pinned}</span></div></div>` : ''}
      <div class="t-feed">${feed}</div>
      <div class="t-compose">
        <div class="t-chips">${chips.map(([act, label]) => `<button type="button" class="t-chip" data-act="${act}">${icon('plus')}${label}</button>`).join('')}</div>
        <div class="t-input" role="textbox" aria-label="Написать семье" tabindex="0">Написать семье…</div>
      </div>`;
  }

  function pollCard(ctx) {
    const { D, state, icon, isParent } = ctx;
    const pr = D.proposal;
    const yes = ['mama', 'son', 'papa'].filter((id) => state.votes[id] === 'yes');
    const edit = ['mama', 'son', 'papa'].filter((id) => state.votes[id] === 'edit');
    const bar = (label, ids) => `<div class="t-opt"><div class="t-opt-top"><span>${label}</span><span>${ids.length}</span></div><div class="t-opt-bar"><i style="width:${(ids.length / 3) * 100}%"></i></div><span class="t-opt-who">${ids.map((id) => D.people[id].name).join(', ') || 'пока никто'}</span></div>`;
    let actions = '';
    if (state.approved) actions = '<span class="t-status">Утверждено родителями</span>';
    else {
      if (!state.votes[state.viewer]) actions += `<button type="button" class="t-btn" data-act="vote" data-v="yes">${icon('check')}За</button><button type="button" class="t-btn" data-act="vote" data-v="edit">Есть правки</button>`;
      if (isParent()) actions += '<button type="button" class="t-btn solid" data-act="approve">Утвердить</button>';
    }
    return helper(ctx, { time: '10:40', title: `Опрос: меню «${pr.title}» на ${pr.forWeek}`, body: `Предложил ${D.people[pr.by].name}. ${bar('За', yes)}${bar('Есть правки', edit)}`, actions });
  }

  function home(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf } = ctx;
    const soup = soupOf(D.today.dayIndex);
    const pinned = `${D.today.weekday.toLowerCase()} ${D.today.date}: завтрак — ${lowerFirst(D.meals[D.today.dayIndex].b)}, обед — ${soup ? `${lowerFirst(soup.name)} (${soup.day}-й день из ${soup.of})` : '—'}, полдник — ${lowerFirst(D.meals[D.today.dayIndex].s)}, ужин — ${lowerFirst(dinnerOf(D.today.dayIndex).name)}`;
    const take = (id) => (state.done.has(id) ? null : `<button type="button" class="t-btn" data-act="station" data-id="${id}">${icon('check')}Сделаю</button><button type="button" class="t-btn" data-act="cant">Не могу</button>`);
    let feed = day('Сегодня');
    if (state.viewer === 'papa' || isParent()) {
      feed += msg(ctx, { from: 'mama', time: '10:05', body: 'Купи молоко и хлеб, срочно <span class="t-urgent">срочно</span>', actions: take('p4'), status: state.done.has('p4') ? 'Папа: сделаю' : '' });
      feed += msg(ctx, { from: 'son', time: '10:20', body: 'Поможешь завести аккаунт?', actions: take('p2'), status: state.done.has('p2') ? 'Папа: сделаю' : '' });
    } else {
      feed += msg(ctx, { from: 'mama', time: '10:05', body: 'Вынеси мусор, пожалуйста', actions: take('s2'), status: state.done.has('s2') ? 'Сын: сделаю' : '' });
      feed += msg(ctx, { from: 'son', time: '10:20', body: 'Пап, поможешь завести аккаунт?', status: 'ждёт ответа Папы' });
    }
    feed += pollCard(ctx);
    if (isParent()) feed += helper(ctx, { time: '11:00', title: 'Через 3 дня платёж', body: `Интернет и ТВ — ${F.rub(650)}, 16 октября. Видят только родители.`, actions: `<button type="button" class="t-btn" data-act="pay-add">Отметить оплаченным</button>` });
    const g = D.goals[0];
    feed += helper(ctx, { time: '11:30', title: `Цель «${g.title}»`, body: `Отложено ${F.rub(g.saved)} из ${F.rub(g.target)}.<div class="t-opt-bar"><i style="width:${(g.saved / g.target) * 100}%"></i></div>`, actions: `<button type="button" class="t-btn" data-act="tab" data-tab="board" data-board="goals">Все цели</button>` });
    return thread(ctx, { title: 'Семья', sub: '4 участника · Дима без входа', pinned, feed, chips: [['add', 'Просьба'], ['add', 'В покупки'], ['add', 'Хотелка']] });
  }

  function menu(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf, shopTotals } = ctx;
    const d = state.day;
    const s = soupOf(d);
    const din = dinnerOf(d);
    const days = `<div class="t-days">${D.weekDays.map((w, i) => `<button type="button" data-act="day" data-day="${i}" aria-pressed="${i === d}">${w.short}<small>${w.date}</small></button>`).join('')}</div>`;
    const plan = `<ul class="t-plan"><li><span>Завтрак</span>${D.meals[d].b}</li>${s ? `<li><span>Обед</span>${s.name}, ${s.day}-й день из ${s.of}</li>` : ''}<li><span>Полдник</span>${D.meals[d].s}</li><li><span>Ужин</span>${din.name}${isParent() ? `<small>Диме: ${din.dima}</small>` : ''}</li></ul>`;
    let feed = day('Понедельник');
    feed += helper(ctx, { time: '09:00', title: `Меню на ${D.weekLabel}`, body: `Утверждено. Супы: борщ пн–ср, щи чт–пт, уха сб–вс. Не едим: ${D.notEat.join(', ')}.` });
    feed += day('Сегодня');
    feed += helper(ctx, { time: '08:00', title: `${D.weekDays[d].name}, ${D.weekDays[d].date} октября`, body: days + plan, actions: `<button type="button" class="t-btn" data-act="replace-simple">${icon('swap')}Заменить ужин</button><button type="button" class="t-btn" data-act="tab" data-tab="shop">В покупки · ≈ ${F.rub(shopTotals().menuSum)}</button>` });
    feed += pollCard(ctx);
    feed += msg(ctx, { from: 'mama', time: '10:42', body: 'Мне нравится, только в четверг вместо котлет можно рыбу?' });
    return thread(ctx, { title: 'Меню', sub: `Неделя ${D.weekLabel}`, pinned: 'на этой неделе едим по шаблону «Обычная неделя», в среду рыба', feed, chips: [['add', 'Предложить неделю'], ['filters', 'Не едим']] });
  }

  function shop(ctx) {
    const { D, F, state, icon, shopTotals } = ctx;
    const t = shopTotals();
    const list = D.shop.map((dep) => `<div class="t-check-g"><b>${dep.dept}</b>${dep.items.map((i) => {
      const done = state.shopDone.has(i.id);
      return `<button type="button" class="t-check ${done ? 'done' : ''}" data-act="shop-item" data-id="${i.id}" aria-pressed="${done}"><span class="t-box" aria-hidden="true">${icon('check')}</span><span class="t-ci">${i.name}, ${i.qty}${i.urgent ? ' <span class="t-urgent">срочно</span>' : ''}</span><span class="t-cp">${F.rub(i.price)}</span></button>`;
    }).join('')}</div>`).join('');
    let feed = day('Сегодня');
    feed += msg(ctx, { from: 'mama', time: '10:05', body: 'Добавила молоко и хлеб, они срочные' });
    feed += helper(ctx, { time: '10:06', title: `Список покупок · ${t.doneCount} из ${t.count}`, body: `Куплено на ${F.rub(t.bought)}, осталось ≈ ${F.rub(t.left)}.${list}`, actions: `<button type="button" class="t-btn solid" data-act="go-shop">${icon('bag')}Иду в магазин</button><button type="button" class="t-btn" data-act="copy">${icon('copy')}Скопировать</button>` });
    return thread(ctx, { title: 'Покупки', sub: 'Список общий, отмечать может любой', pinned: 'продукты из меню на неделю добавляются сами в воскресенье', feed, chips: [['add', 'Добавить'], ['add', 'Срочно']] });
  }

  function board(ctx) {
    const { D, F, state, icon, isParent } = ctx;
    const tabsDef = [['wishes', 'Хотелки'], ['needs', 'Надо купить'], ['goals', 'Цели'], ['requests', 'Просьбы']];
    let feed = '';
    if (state.boardTab === 'wishes') {
      feed = D.wishes.map((w, i) => {
        const set = state.metoo[w.id];
        const progress = w.saved ? `<div class="t-opt-bar" style="--c:var(--${w.owner})"><i style="width:${(w.saved / w.price) * 100}%"></i></div><small>в копилке ${F.rub(w.saved)} из ${F.rub(w.price)}</small>` : `<small>≈ ${F.rub(w.price)}</small>`;
        const actions = w.owner !== state.viewer ? `<button type="button" class="t-btn" data-act="metoo" data-id="${w.id}" aria-pressed="${set.has(state.viewer)}">${icon('metoo')}Я тоже · ${set.size}</button>` : '';
        const from = D.people[w.owner].noLogin ? 'mama' : w.owner;
        return msg(ctx, { from, time: `${9 + i}:15`, body: `${D.people[w.owner].noLogin ? 'Диме бы: ' : 'Хочу: '}<b>${lowerFirst(w.title)}</b>${progress}`, actions }) +
          (w.gift && isParent() ? helper(ctx, { time: `${9 + i}:16`, title: 'Только для родителей', body: `${D.people[w.gift].name} берёт это Диме в подарок.` }) : '');
      }).join('');
    } else if (state.boardTab === 'needs') {
      feed = D.needs.map((n) => helper(ctx, { time: '09:00', title: `Надо купить: ${lowerFirst(n.title)}`, body: `${D.people[n.who].name}, ${n.note}, ${n.by.startsWith('до') ? n.by : 'к ' + n.by}. Примерно ${F.rub(n.price)}.`, actions: `<button type="button" class="t-btn" data-act="to-shop" data-title="${n.title}">${icon('cart')}В покупки</button>` })).join('');
    } else if (state.boardTab === 'goals') {
      feed = D.goals.map((g) => helper(ctx, { time: '09:00', title: `${g.title} · ${g.scope.toLowerCase()}`, body: `Отложено ${F.rub(g.saved)} из ${F.rub(g.target)}.<div class="t-opt-bar"><i style="width:${(g.saved / g.target) * 100}%"></i></div><small>Шаги: ${g.steps.map((s) => (s.done ? `<s>${s.t}</s>` : s.t)).join(' → ')}</small>` })).join('');
    } else {
      const rq = D.requests[state.viewer];
      feed = rq.toMe.map((q) => msg(ctx, { from: q.from, time: '10:00', body: `${q.title}${q.urgent ? ' <span class="t-urgent">срочно</span>' : ''}`, actions: state.reqDone.has(q.id) ? '' : `<button type="button" class="t-btn" data-act="req-done" data-id="${q.id}">${icon('check')}Сделано</button>`, status: state.reqDone.has(q.id) ? 'сделано' : q.when })).join('') +
        rq.fromMe.map((q) => msg(ctx, { from: state.viewer, time: '10:30', body: q.cancelled ? `<s>${q.title}</s>` : q.title, status: q.cancelled ? 'отменено' : `${D.people[q.to].name} · ${q.when}` })).join('');
    }
    return `<header class="t-head"><span class="t-group" aria-hidden="true">${['papa', 'mama', 'son', 'dima'].map((id) => `<i style="--c:var(--${id})"></i>`).join('')}</span><div><h1>Доска</h1><p>Видно всей семье</p></div></header>
      <div class="t-filter" role="tablist" aria-label="Разделы доски">${tabsDef.map(([id, label]) => `<button type="button" role="tab" data-act="board-tab" data-b="${id}" aria-selected="${state.boardTab === id}">${label}</button>`).join('')}</div>
      <div class="t-feed">${feed}</div>
      <div class="t-compose"><div class="t-chips"><button type="button" class="t-chip" data-act="add">${icon('plus')}Хотелка</button><button type="button" class="t-chip" data-act="add">${icon('plus')}Цель</button></div><div class="t-input" role="textbox" aria-label="Написать семье" tabindex="0">Написать семье…</div></div>`;
  }

  function money(ctx) {
    const { D, F, icon } = ctx;
    const total = D.payments.reduce((a, p) => a + p.amount, 0);
    const paid = D.payments.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
    let feed = day('1 октября');
    feed += helper(ctx, { time: '09:00', title: 'Обязательные платежи в октябре', body: `<ul class="t-plan">${D.payments.map((p) => `<li class="${p.paid ? 'paid' : ''}"><span>${p.day} окт</span>${p.title} — ${F.rub(p.amount)}${p.paid ? ' · оплачено' : p.note ? ' · ' + p.note : ''}</li>`).join('')}</ul>Всего ${F.rub(total)}, оплачено ${F.rub(paid)}, осталось ${F.rub(total - paid)}.` });
    feed += day('Сегодня');
    feed += msg(ctx, { from: 'mama', time: '09:40', body: 'Магнит — 3 400 ₽, продукты' });
    feed += helper(ctx, { time: '11:00', title: 'Через 3 дня платёж', body: `Интернет и ТВ — ${F.rub(650)}, 16 октября.`, actions: '<button type="button" class="t-btn" data-act="pay-add">Отметить оплаченным</button>' });
    feed += helper(ctx, { time: '20:00', title: 'Расходы за октябрь', body: `<ul class="t-plan">${D.spend.map((c) => `<li><span>${F.rub(c.sum)}</span>${c.cat} · ${c.note}</li>`).join('')}</ul>Пришло ${F.rub(D.month.income)}. Папа потратил ${F.rub(D.spendBy.papa)}, Мама — ${F.rub(D.spendBy.mama)}.` });
    return thread(ctx, { title: 'Деньги', sub: 'Только родители', pinned: 'расход пиши одним сообщением: «Магнит 3400 продукты»', feed, chips: [['pay-add', 'Расход'], ['pay-add', 'Доход']] });
  }

  window.FA_VARIANTS.chat = {
    screen(tab, ctx) { return { home, menu, shop, board, money }[tab](ctx); },
    handle(name, el, ctx) {
      if (name === 'replace-simple') { ctx.toast('Помощник пришлёт три блюда на замену кнопками.'); return true; }
      if (name === 'cant') { ctx.toast('Отправили: «Не могу». Автор просьбы увидит ответ.'); return true; }
      return false;
    },
    notes: {
      title: 'Семейный чат',
      comp: 'img/comp-chat.jpg',
      thesis: 'Приложение как семейная переписка: просьбы приходят сообщениями с кнопками, меню утверждается опросом, о платежах напоминает помощник.',
      pros: [
        'Ничему не надо учиться: все и так переписываются в мессенджерах.',
        'Просьбы и ответы видны в разговоре: кто попросил, кто взялся, кто сделал.',
        'Расход можно записать одной фразой, как сообщение.',
      ],
      cons: [
        'Лента копит шум: через неделю важное тонет в старых сообщениях.',
        'Обзор недели или месяца хуже, чем у схемы или банок: всё растянуто по времени.',
        'Легко скатиться в копию Telegram, а это уже не своё приложение.',
      ],
      try: [
        'На Главной нажми «Сделаю» под просьбой мамы.',
        'В Меню переключай дни в карточке помощника и проголосуй в опросе.',
        'В Покупках отмечай пункты прямо в сообщении-списке.',
      ],
    },
  };
})();
