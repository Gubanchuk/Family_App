// «Плакат»: Russian constructivist poster. Red, black and white; red lives only in assigned planes.
// Family members are geometric marks instead of colours: Папа square, Мама circle, Сын triangle, Дима diamond.
window.FA_VARIANTS = window.FA_VARIANTS || {};
(() => {
  const SHAPE = {
    papa: '<rect x="3" y="3" width="18" height="18"/>',
    mama: '<circle cx="12" cy="12" r="9.5"/>',
    son: '<path d="M12 2.5 22 21H2Z"/>',
    dima: '<path d="M12 1.5 22.5 12 12 22.5 1.5 12Z"/>',
  };
  const WHO = { papa: 'Папа', mama: 'Мама', son: 'Сын', dima: 'Дима' };
  const mark = (id, cls = '') => `<svg class="p-mark ${cls}" viewBox="0 0 24 24" aria-hidden="true">${SHAPE[id]}</svg>`;
  const arrow = '<svg class="p-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h15M12 5l7 7-7 7"/></svg>';
  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const ddmm = (d) => `${String(d).padStart(2, '0')}.10`;

  function band(word, sub, ctx, action) {
    const { D, state } = ctx;
    return `<header class="p-hero">
      <div class="p-band" aria-hidden="true"><span>${word}</span></div>
      <h1 class="vh">${word}</h1>
      <div class="p-hero-row">
        <p class="p-sub">${sub}</p>
        <div class="p-hero-act">${action || ''}<button type="button" class="p-me" data-act="profile" aria-label="Профиль: ${D.people[state.viewer].name}">${mark(state.viewer, 'red')}</button></div>
      </div>
    </header>`;
  }

  function home(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf } = ctx;
    const day = D.days[state.viewer];
    const reqs = day.filter((s) => s.kind === 'request' || s.kind === 'own-request');
    const soup = soupOf(D.today.dayIndex);
    const din = dinnerOf(D.today.dayIndex);
    const g = D.goals[0];
    const rows = reqs.map((s) => {
      const done = state.done.has(s.id);
      const who = s.kind === 'request' ? s.from : s.to;
      const sub = s.kind === 'request' ? `просит ${WHO[s.from]}` : `ждёт ${WHO[s.to] === 'Папа' ? 'Папу' : WHO[s.to]}`;
      return `<button type="button" class="p-row ${done ? 'done' : ''} ${s.urgent ? 'urgent' : ''}" data-act="station" data-id="${s.id}" aria-pressed="${done}">
        ${arrow}<span class="p-row-main"><b>${s.title}</b><small>${mark(who)}${sub}</small></span>${s.urgent ? '<span class="p-tag">срочно</span>' : ''}</button>`;
    }).join('');
    const sched = [
      ['08:00', 'Завтрак', D.meals[D.today.dayIndex].b, true],
      ['13:00', 'Обед', soup ? `${soup.name} <span class="p-tag">${soup.day}/${soup.of}</span>` : '', false, isParent() && soup ? soup.dima : ''],
      ['16:30', 'Полдник', D.meals[D.today.dayIndex].s],
      ['19:00', 'Ужин', din.name, false, isParent() ? din.dima : ''],
    ];
    const pay = isParent() ? day.find((s) => s.kind === 'payment') : null;
    return `${band('СЕГОДНЯ', `${D.today.weekday} · ${ddmm(13)} · сейчас ${D.today.now}`, ctx, `<button type="button" class="p-plus" data-act="add" aria-label="Добавить">${icon('plus')}</button>`)}
      <section class="p-sec"><h2>Дела</h2>${rows}</section>
      <section class="p-sec"><h2>Едим</h2><div class="p-sched">${sched.map(([t, k, v, past, dima]) => `
        <div class="p-slot ${k === 'Обед' ? 'next' : ''} ${past ? 'past' : ''}"><span class="p-time">${t}</span><div><b>${v}</b><span class="p-k">${k}</span>${dima ? `<small>${mark('dima')}Диме: ${dima}</small>` : ''}</div></div>`).join('')}</div></section>
      <section class="p-sec"><h2>Цель семьи</h2>
        <div class="p-goal"><b>${g.title}</b><span class="p-num">${F.num(g.saved)} / ${F.num(g.target)} ₽</span></div>
        <div class="p-bar" role="img" aria-label="Накоплено ${Math.round((g.saved / g.target) * 100)}%"><i style="width:${(g.saved / g.target) * 100}%"></i></div></section>
      ${pay ? `<section class="p-sec p-black"><button type="button" class="p-pay" data-act="tab" data-tab="money"><span>${pay.title} · ${F.rub(pay.amount)}</span><b>${pay.due} ${arrow}</b></button></section>` : ''}`;
  }

  function menu(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf, shopTotals } = ctx;
    const d = state.day;
    const s = soupOf(d);
    const din = dinnerOf(d);
    const pr = D.proposal;
    const voters = ['mama', 'son', 'papa'];
    let actions = '';
    if (state.approved) actions = '<span class="p-tag">утверждено</span>';
    else {
      if (!state.votes[state.viewer]) actions += '<button type="button" class="p-btn" data-act="vote" data-v="yes">За</button><button type="button" class="p-btn ghost" data-act="vote" data-v="edit">Правки</button>';
      actions += isParent() ? `<button type="button" class="p-btn red" data-act="approve">Утвердить ${arrow}</button>` : '<span class="p-note">утверждают родители</span>';
    }
    return `${band('МЕНЮ', `Неделя ${D.weekLabel} · утверждена`, ctx, `<button type="button" class="p-plus" data-act="filters" aria-label="Не едим">${icon('filter')}</button>`)}
      <section class="p-sec">
        <div class="p-week">${D.weekDays.map((w, i) => `<button type="button" class="p-wd ${i === d ? 'sel' : ''} ${i === D.today.dayIndex ? 'today' : ''}" data-act="day" data-day="${i}" aria-pressed="${i === d}" aria-label="${w.name}"><span>${w.short}</span><b>${w.date}</b></button>`).join('')}</div>
        <div class="p-soups">${D.soups.map((x) => `<span style="grid-column:${x.from + 1} / ${x.to + 2}">${x.name} ×${x.to - x.from + 1}</span>`).join('')}</div>
        <p class="p-note">Красные полосы — супы: одну кастрюлю едим несколько дней. Не едим: ${D.notEat.join(', ')}.</p>
      </section>
      <section class="p-sec"><h2>${D.weekDays[d].name}</h2><div class="p-sched">
        <div class="p-slot"><span class="p-time">08:00</span><div><b>${D.meals[d].b}</b><span class="p-k">Завтрак</span></div></div>
        ${s ? `<div class="p-slot"><span class="p-time">13:00</span><div><b>${s.name} <span class="p-tag">${s.day}/${s.of}</span></b><span class="p-k">Обед</span>${isParent() ? `<small>${mark('dima')}Диме: ${s.dima}</small>` : ''}</div></div>` : ''}
        <div class="p-slot"><span class="p-time">16:30</span><div><b>${D.meals[d].s}</b><span class="p-k">Полдник</span></div></div>
        <div class="p-slot"><span class="p-time">19:00</span><div><b>${din.name}</b><span class="p-k">Ужин · ${din.min} мин</span>${isParent() ? `<small>${mark('dima')}Диме: ${din.dima}</small>` : ''}<button type="button" class="p-link" data-act="replace-simple">Заменить ${arrow}</button></div></div>
      </div></section>
      <section class="p-sec p-frame"><h2>Предложение</h2>
        <p class="p-lead">${WHO[pr.by]} предлагает неделю «${pr.title}» на ${pr.forWeek}</p>
        <ul class="p-votes">${voters.map((id) => `<li>${mark(id)}${WHO[id]}: <b>${state.votes[id] === 'yes' ? 'за' : state.votes[id] === 'edit' ? 'правки' : '—'}</b></li>`).join('')}</ul>
        <div class="p-actions">${actions}</div></section>
      <section class="p-sec"><button type="button" class="p-pay light" data-act="tab" data-tab="shop"><span>Продукты на неделю</span><b>≈ ${F.rub(shopTotals().menuSum)} ${arrow}</b></button></section>`;
  }

  function shop(ctx) {
    const { D, F, state, icon, added, shopTotals } = ctx;
    const t = shopTotals();
    return `${band('ПОКУПКИ', `Отмечено ${t.doneCount} из ${t.count}`, ctx)}
      <section class="p-sec">
        <button type="button" class="p-btn red wide" data-act="go-shop">${icon('bag')}Иду в магазин ${arrow}</button>
        <button type="button" class="p-btn ghost wide" data-act="copy">${icon('copy')}Скопировать для доставки</button>
        <div class="p-goal"><b>Куплено ${F.rub(t.bought)}</b><span class="p-num">≈ ${F.num(t.left)} ₽ осталось</span></div>
        <div class="p-bar"><i style="width:${t.total ? (t.bought / t.total) * 100 : 0}%"></i></div>
      </section>
      ${D.shop.map((dep) => {
        const dn = dep.items.filter((i) => state.shopDone.has(i.id)).length;
        return `<section class="p-dept"><h2><span>${dep.dept}</span><span class="p-num">${dn}/${dep.items.length}</span></h2>${dep.items.map((i) => {
          const done = state.shopDone.has(i.id);
          return `<button type="button" class="p-item ${done ? 'done' : ''}" data-act="shop-item" data-id="${i.id}" aria-pressed="${done}">
            <span class="p-box" aria-hidden="true">${icon('check')}</span>
            <span class="p-row-main"><b>${i.name}</b><small>${i.qty}${i.from === 'menu' ? ' · из меню' : ` · ${added(i.by)} ${WHO[i.by]}`}</small></span>
            ${i.urgent ? '<span class="p-tag">срочно</span>' : ''}<span class="p-num">${F.num(i.price)}</span></button>`;
        }).join('')}</section>`;
      }).join('')}`;
  }

  function board(ctx) {
    const { D, F, state, icon, isParent } = ctx;
    const tabsDef = [['wishes', 'Хотелки'], ['needs', 'Купить'], ['goals', 'Цели'], ['requests', 'Просьбы']];
    let panel = '';
    if (state.boardTab === 'wishes') {
      panel = D.wishes.map((w) => {
        const set = state.metoo[w.id];
        return `<article class="p-card"><div class="p-goal"><b>${mark(w.owner)}${w.title}</b><span class="p-num">${F.num(w.price)} ₽</span></div>
          ${w.saved ? `<div class="p-bar"><i style="width:${(w.saved / w.price) * 100}%"></i></div><p class="p-note">В копилке ${F.rub(w.saved)}</p>` : `<p class="p-note">${WHO[w.owner]} хочет · без копилки</p>`}
          <div class="p-actions">${w.owner !== state.viewer ? `<button type="button" class="p-btn ghost sm" data-act="metoo" data-id="${w.id}" aria-pressed="${set.has(state.viewer)}">${icon('metoo')}Я тоже · ${set.size}</button>` : `<span class="p-note">тоже хотят: ${set.size}</span>`}
          ${w.gift && isParent() ? `<span class="p-wedge">${icon('gift')}подарок · ${WHO[w.gift]}</span>` : ''}</div></article>`;
      }).join('');
    } else if (state.boardTab === 'needs') {
      panel = D.needs.map((n) => `<article class="p-card"><div class="p-goal"><b>${mark(n.who)}${n.title}</b><span class="p-num">${F.num(n.price)} ₽</span></div>
        <p class="p-note">${WHO[n.who]} · ${n.note} · ${n.by.startsWith('до') ? n.by : 'к ' + n.by}</p>
        <div class="p-actions"><button type="button" class="p-btn ghost sm" data-act="to-shop" data-title="${n.title}">В покупки ${arrow}</button></div></article>`).join('');
    } else if (state.boardTab === 'goals') {
      const max = Math.max(...D.goals.map((g) => g.target));
      panel = D.goals.map((g) => `<article class="p-card"><div class="p-goal"><b>${g.title}</b><span class="p-num">${F.num(g.saved)} / ${F.num(g.target)}</span></div>
        <div class="p-bar" style="width:${(g.target / max) * 100}%"><i style="width:${(g.saved / g.target) * 100}%"></i></div>
        <p class="p-note">${g.scope} · дальше: ${lowerFirst((g.steps.find((x) => !x.done) || { t: 'готово' }).t)}</p></article>`).join('') + '<p class="p-note p-pad">Полосы в одном масштабе: длиннее полоса — больше сумма цели.</p>';
    } else {
      const rq = D.requests[state.viewer];
      panel = rq.toMe.map((q) => {
        const done = state.reqDone.has(q.id);
        return `<div class="p-row-wrap"><div class="p-row ${done ? 'done' : ''} ${q.urgent ? 'urgent' : ''}">${arrow}<span class="p-row-main"><b>${q.title}</b><small>${mark(q.from)}просит ${WHO[q.from]} · ${q.when}</small></span>${done ? '<span class="p-note">сделано</span>' : `<button type="button" class="p-btn sm" data-act="req-done" data-id="${q.id}">Сделано</button>`}</div></div>`;
      }).join('') + rq.fromMe.map((q) => `<div class="p-row-wrap"><div class="p-row ${q.cancelled ? 'done' : ''}">${arrow}<span class="p-row-main"><b>${q.title}</b><small>${mark(q.to)}для: ${WHO[q.to]} · ${q.cancelled ? 'отменено' : q.when}</small></span></div></div>`).join('');
    }
    return `${band('ДОСКА', 'Видно всей семье', ctx, `<button type="button" class="p-plus" data-act="add" aria-label="Добавить на доску">${icon('plus')}</button>`)}
      <div class="p-tabs" role="tablist" aria-label="Разделы доски">${tabsDef.map(([id, label]) => `<button type="button" role="tab" data-act="board-tab" data-b="${id}" aria-selected="${state.boardTab === id}">${label}</button>`).join('')}</div>
      <section class="p-sec">${panel}</section>`;
  }

  function money(ctx) {
    const { D, F, icon } = ctx;
    const total = D.payments.reduce((a, p) => a + p.amount, 0);
    const paid = D.payments.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
    const next = D.payments.find((p) => !p.paid && p.day >= D.month.today);
    const maxC = Math.max(...D.spend.map((c) => c.sum));
    const maxW = Math.max(...Object.values(D.spendBy));
    return `${band('ДЕНЬГИ', 'Октябрь · видят только родители', ctx, `<button type="button" class="p-plus" data-act="pay-add" aria-label="Добавить расход">${icon('plus')}</button>`)}
      <section class="p-sec"><div class="p-goal"><b>Обязательные</b><span class="p-num">${F.num(paid)} / ${F.num(total)} ₽</span></div>
        <div class="p-bar"><i style="width:${(paid / total) * 100}%"></i></div><p class="p-note">Осталось оплатить ${F.rub(total - paid)}.</p></section>
      <section class="p-sec"><h2>Платежи</h2>${D.payments.map((p) => `<div class="p-led ${p.paid ? 'paid' : ''} ${p === next ? 'next' : ''}"><span class="p-day">${String(p.day).padStart(2, '0')}</span><span class="p-row-main"><b>${p.title}</b><small>${p.paid ? 'оплачено' : p.note || 'по графику'}</small></span><span class="p-num">${F.num(p.amount)}</span></div>`).join('')}</section>
      <section class="p-sec"><h2>Расходы</h2><p class="p-note">Пришло ${F.rub(D.month.income)}.</p>${D.spend.map((c) => `<div class="p-cat"><div class="p-goal"><b>${c.cat}</b><span class="p-num">${F.num(c.sum)}</span></div><div class="p-solid" style="width:${(c.sum / maxC) * 100}%"></div></div>`).join('')}</section>
      <section class="p-sec"><h2>Кто тратил</h2>${Object.entries(D.spendBy).map(([id, sum]) => `<div class="p-cat"><div class="p-goal"><b>${mark(id)}${WHO[id]}</b><span class="p-num">${F.num(sum)}</span></div><div class="p-solid" style="width:${(sum / maxW) * 100}%"></div></div>`).join('')}</section>`;
  }

  window.FA_VARIANTS.poster = {
    screen(tab, ctx) { return { home, menu, shop, board, money }[tab](ctx); },
    handle(name, el, ctx) {
      if (name === 'replace-simple') { ctx.toast('Здесь откроются блюда на замену крупными строками афиши.'); return true; }
      return false;
    },
    notes: {
      title: 'Плакат',
      thesis: 'Семейные дела как конструктивистский плакат: красный, чёрный, белый, косая полоса «Сегодня», крупные цифры. Члены семьи — фигуры: Папа квадрат, Мама круг, Сын треугольник, Дима ромб.',
      pros: [
        'Самый смелый вариант и самый «наш»: русский авангард, его узнают с первого взгляда.',
        'Крупные цифры и жирный шрифт читаются на ходу и в магазине.',
        'Фигуры вместо цветов: различимо даже при дальтонизме и в одном цвете.',
      ],
      cons: [
        'Громко. Если перебрать с красным, будет агитпроп, а не семья.',
        'Мало тепла: строгий шрифт и прямые углы.',
        'Фигуры нужно запомнить: кто квадрат, кто треугольник.',
      ],
      try: [
        'На Главной нажми дело: оно зачеркнётся красной чертой.',
        'В Меню переключай дни: красные полосы супов идут через несколько дней.',
        'В Покупках отмечай товары: квадратик заливается красным.',
      ],
    },
  };
})();
