// «Как у всех», improved: the family-organizer standard at the level of T-Bank and Yandex apps.
// One archetype, four versions. Versions differ in hue (CSS) and in the Home composition.
window.FA_VARIANTS = window.FA_VARIANTS || {};
(() => {
  const WHO_ACC = { papa: 'Папу', mama: 'Маму', son: 'Сына', dima: 'Диму' };
  const MEAL_ICON = { 'Завтрак': 'sun', 'Обед': 'bowl', 'Полдник': 'apple', 'Ужин': 'moon' };
  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const greeting = (now) => { const h = Number(now.split(':')[0]); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : 'Добрый вечер'; };
  const inTime = (from, to) => { const d = mins(to) - mins(from); const h = Math.floor(d / 60), m = d % 60; return `через ${h ? `${h} ч ` : ''}${m ? `${m} мин` : ''}`.trim(); };

  const av = (D, id, size = '') => `<span class="av ${size}" style="--c:var(--${id})" aria-hidden="true">${D.people[id].initial}</span>`;
  const check = (icon) => `<span class="check" aria-hidden="true">${icon('check')}</span>`;
  const ico = (icon, name, hue) => `<span class="ico" style="--h:var(--k-${hue})" aria-hidden="true">${icon(name)}</span>`;

  // The most important thing for the viewer right now.
  function mainThing(ctx) {
    const { D, state, dinnerOf } = ctx;
    const reqs = D.days[state.viewer].filter((s) => s.kind === 'request' && !state.done.has(s.id));
    const top = reqs.find((s) => s.urgent) || reqs[0];
    if (top) return { id: top.id, title: top.title, sub: `Просит ${D.people[top.from].name}${top.urgent ? ', срочно' : ''}`, req: true, urgent: !!top.urgent };
    return { title: `Ужин в 19:00 — ${lowerFirst(dinnerOf(D.today.dayIndex).name)}`, sub: 'Все просьбы на сегодня закрыты', req: false };
  }

  function head(ctx, title, sub, action) {
    const { D, state } = ctx;
    return `<header class="k-head"><div><h1>${title}</h1><p>${sub}</p></div>
      <div class="k-head-r">${action || ''}<button type="button" class="av" style="--c:var(--${state.viewer})" data-act="profile" aria-label="Профиль: ${D.people[state.viewer].name}">${D.people[state.viewer].initial}</button></div></header>`;
  }

  function openCount(ctx) {
    const { D, state } = ctx;
    return D.days[state.viewer].filter((s) => (s.kind === 'request' || s.kind === 'own-request') && !state.done.has(s.id)).length;
  }

  function hero(ctx) {
    const { D, icon, dinnerOf } = ctx;
    const m = mainThing(ctx);
    return `<section class="hero" aria-label="Главное сейчас">
      <h2>${m.title}</h2><p>${m.sub}</p>
      ${m.req ? `<p class="hero-meal">${icon('moon')}Ужин в 19:00 · ${lowerFirst(dinnerOf(D.today.dayIndex).name)}</p>` : ''}
      <div class="hero-chips">
        ${m.req ? `<button type="button" class="hero-chip primary" data-act="station" data-id="${m.id}">${icon('check')}Сделаю</button>` : `<button type="button" class="hero-chip primary" data-act="tab" data-tab="menu">${icon('menu')}Меню на неделю</button>`}
        <button type="button" class="hero-chip" data-act="tab" data-tab="board" data-board="requests">Все дела · ${openCount(ctx)}</button>
      </div></section>`;
  }

  function familyRow(ctx) {
    const { D } = ctx;
    const status = { papa: '2 дела', mama: '1 дело', son: '1 дело', dima: 'без входа' };
    return `<div class="family" aria-label="Семья">${['papa', 'mama', 'son', 'dima'].map((id) =>
      `<button type="button" class="fam" style="--c:var(--${id})" data-act="tab" data-tab="board" data-board="requests">${av(D, id)}<b>${D.people[id].name}</b><small>${status[id]}</small></button>`).join('')}</div>`;
  }

  function requestsCard(ctx) {
    const { D, state, icon } = ctx;
    const mainId = mainThing(ctx).id;
    const reqs = D.days[state.viewer].filter((s) => (s.kind === 'request' || s.kind === 'own-request') && s.id !== mainId);
    if (!reqs.length) return `<section class="card"><div class="card-h"><h2>Ещё просьбы</h2></div><p class="note" style="margin:0">Других просьб на сегодня нет.</p></section>`;
    return `<section class="card"><div class="card-h"><h2>Ещё просьбы</h2><button type="button" class="more" data-act="tab" data-tab="board" data-board="requests">Все</button></div>
      ${reqs.map((s) => {
        const done = state.done.has(s.id);
        const who = s.kind === 'request' ? s.from : s.to;
        const sub = s.kind === 'request' ? `просит ${D.people[s.from].name}` : `ждёт ${WHO_ACC[s.to]}`;
        return `<div class="row ${done ? 'done' : ''}"><button type="button" class="row-btn" data-act="station" data-id="${s.id}" aria-pressed="${done}">${check(icon)}${av(D, who, 'sm')}
          <span class="row-main"><b>${s.title}</b><small>${sub}</small></span>${s.urgent ? '<span class="pill">срочно</span>' : ''}</button></div>`;
      }).join('')}</section>`;
  }

  // Tiles with live numbers; tap opens the section.
  const tiles = {
    menu(ctx, cls = '') {
      const { D, icon, dinnerOf, soupOf } = ctx;
      const s = soupOf(D.today.dayIndex);
      const list = cls.includes('tall') ? `<span class="t-list"><span><i>13:00</i>${s ? `${s.name}, ${s.day}-й день` : ''}</span><span><i>16:30</i>${D.meals[D.today.dayIndex].s}</span><span><i>19:00</i>ужин</span></span>` : '';
      return `<button type="button" class="tile ${cls}" style="--h:var(--k-meal)" data-act="tab" data-tab="menu">
        <span class="t-k">${icon('menu')}Сегодня едим</span><span class="t-v">${dinnerOf(D.today.dayIndex).name}</span>
        ${list}<span class="t-s">${list ? 'открыть меню недели' : `ужин в 19:00${s ? ` · обед — ${lowerFirst(s.name)}, ${s.day}-й день` : ''}`}</span></button>`;
    },
    shop(ctx, cls = '') {
      const { F, icon, shopTotals } = ctx;
      const t = shopTotals();
      return `<button type="button" class="tile ${cls}" style="--h:var(--k-shop)" data-act="tab" data-tab="shop">
        <span class="t-k">${icon('cart')}Покупки</span><span class="t-v num">${t.count - t.doneCount}</span>
        <span class="t-s">осталось купить · ≈&nbsp;${F.rub(t.left)}</span></button>`;
    },
    goal(ctx, cls = '') {
      const { D, F, icon } = ctx;
      const g = D.goals[0];
      return `<button type="button" class="tile ${cls}" style="--h:var(--k-goal)" data-act="tab" data-tab="board" data-board="goals">
        <span class="t-k">${icon('target')}${g.title}</span><span class="t-v num">${F.num(g.saved)} ₽</span>
        <span class="bar" aria-hidden="true"><i style="width:${(g.saved / g.target) * 100}%"></i></span><span class="t-s">из ${F.rub(g.target)}</span></button>`;
    },
    pay(ctx, cls = '') {
      const { D, F, icon } = ctx;
      const p = D.days.papa.find((s) => s.kind === 'payment');
      return `<button type="button" class="tile ${cls}" style="--h:var(--k-money)" data-act="tab" data-tab="money">
        <span class="t-k">${icon('money')}Скоро платить</span><span class="t-v">${p.title} · ${F.rub(p.amount)}</span><span class="t-s">${p.due}</span></button>`;
    },
    wish(ctx, cls = '') {
      const { D, F, icon } = ctx;
      const w = D.wishes[0];
      return `<button type="button" class="tile ${cls}" style="--h:var(--k-money)" data-act="tab" data-tab="board" data-board="wishes">
        <span class="t-k">${icon('gift')}Хотелки</span><span class="t-v">${w.title}</span><span class="t-s">в копилке ${F.rub(w.saved)}</span></button>`;
    },
  };
  const fourth = (ctx, cls) => (ctx.isParent() ? tiles.pay(ctx, cls) : tiles.wish(ctx, cls));

  // ---------- Home compositions ----------
  const HOME = {
    // Мандарин: hero, then tiles of different sizes, then requests.
    bento(ctx) {
      return `${hero(ctx)}<div class="bento">${tiles.menu(ctx, 'tall')}${tiles.shop(ctx)}${tiles.goal(ctx)}${fourth(ctx, 'wide')}</div>${requestsCard(ctx)}`;
    },
    // Ягода: family first (warmth before tasks), hero, the next meal large, the rest compact.
    stories(ctx) {
      const { D, icon, dinnerOf, soupOf, isParent } = ctx;
      const s = soupOf(D.today.dayIndex);
      const meals = [['Завтрак', '08:00', D.meals[D.today.dayIndex].b], ['Обед', '13:00', s ? `${s.name}, ${s.day}-й день из ${s.of}` : ''], ['Полдник', '16:30', D.meals[D.today.dayIndex].s], ['Ужин', '19:00', dinnerOf(D.today.dayIndex).name]];
      const nextIdx = meals.findIndex(([, t]) => mins(t) > mins(D.today.now));
      const [nk, nt, nv] = meals[nextIdx];
      return `${familyRow(ctx)}${hero(ctx)}
        <div class="sec-h"><h2>Сегодня едим</h2><button type="button" class="more" data-act="tab" data-tab="menu">Меню</button></div>
        <button type="button" class="meal-now" data-act="tab" data-tab="menu"><span class="mn-time">${nt}</span><span class="mn-main"><b>${nv}</b><small>${nk} · ${inTime(D.today.now, nt)}</small></span>${ico(icon, MEAL_ICON[nk], 'meal')}</button>
        <section class="card">${meals.filter((_, i) => i !== nextIdx).map(([k, t, v]) => `<div class="row ${mins(t) < mins(D.today.now) ? 'past' : ''}"><span class="tl-t">${t}</span><span class="row-main"><b>${v}</b><small>${k}</small></span></div>`).join('')}</section>
        ${requestsCard(ctx)}<div class="bento">${tiles.goal(ctx)}${isParent() ? tiles.pay(ctx) : tiles.shop(ctx)}</div>`;
    },
    // Лес: the whole day as one timeline; requests have no time, so they sit above it.
    timeline(ctx) {
      const { D, state, icon, isParent, dinnerOf, soupOf } = ctx;
      const s = soupOf(D.today.dayIndex);
      const mainId = mainThing(ctx).id;
      const reqs = D.days[state.viewer].filter((x) => (x.kind === 'request' || x.kind === 'own-request') && x.id !== mainId);
      const meals = D.days[state.viewer].filter((x) => x.kind === 'meal').map((x) => ({
        t: x.time, title: x.title === 'Ужин' ? dinnerOf(D.today.dayIndex).name : (x.title === 'Обед' && s ? `${s.name}, ${s.day}-й день из ${s.of}` : x.dish), sub: x.title,
      }));
      const now = mins(D.today.now);
      const rows = [];
      let nowShown = false;
      meals.forEach((it) => {
        if (!nowShown && mins(it.t) > now) { rows.push(`<div class="tl-now"><span>${D.today.now}</span><i aria-hidden="true"></i><span class="vh">сейчас</span></div>`); nowShown = true; }
        rows.push(`<div class="tl-row ${mins(it.t) < now ? 'past' : ''}"><span class="tl-t">${it.t}</span><span class="tl-dot" style="--h:var(--k-meal)" aria-hidden="true"></span><span class="row-main"><b>${it.title}</b><small>${it.sub}</small></span></div>`);
      });
      const reqRows = reqs.map((x) => {
        const done = state.done.has(x.id);
        const sub = x.kind === 'request' ? `просит ${D.people[x.from].name}` : `ждёт ${WHO_ACC[x.to]}`;
        return `<div class="row ${done ? 'done' : ''}"><button type="button" class="row-btn" data-act="station" data-id="${x.id}" aria-pressed="${done}">${check(icon)}<span class="row-main"><b>${x.title}</b><small>${sub}</small></span>${x.urgent ? '<span class="pill">срочно</span>' : ''}</button></div>`;
      }).join('');
      return `${hero(ctx)}
        <section class="card"><div class="card-h"><h2>Мой день</h2></div>
          ${reqRows ? `<p class="tl-group">Без времени</p>${reqRows}<p class="tl-group">По часам</p>` : ''}
          ${rows.join('')}</section>
        <div class="bento">${tiles.shop(ctx)}${tiles.goal(ctx)}${isParent() ? tiles.pay(ctx, 'wide') : ''}</div>`;
    },
    // Индиго: a dark hero holds the three lines that matter, tiles below.
    lines(ctx) {
      const { D, F, icon, isParent, dinnerOf } = ctx;
      const m = mainThing(ctx);
      const pay = D.days.papa.find((s) => s.kind === 'payment');
      return `<section class="hero" aria-label="Главное сейчас"><h2>${m.title}</h2><p>${m.sub}</p>
        <div class="hero-chips">${m.req ? `<button type="button" class="hero-chip primary" data-act="station" data-id="${m.id}">${icon('check')}Сделаю</button>` : ''}<button type="button" class="hero-chip" data-act="tab" data-tab="board" data-board="requests">Все дела · ${openCount(ctx)}</button>${m.urgent ? '<span class="pill">срочно</span>' : ''}</div>
        <div class="hero-lines">
          <button type="button" class="hero-line" data-act="tab" data-tab="menu" style="--h:var(--k-meal)">${icon('moon')}<span>Ужин в 19:00 · <b>${lowerFirst(dinnerOf(D.today.dayIndex).name)}</b></span></button>
          ${isParent() ? `<button type="button" class="hero-line" data-act="tab" data-tab="money" style="--h:var(--k-money)">${icon('money')}<span>${pay.title} · <b>${F.rub(pay.amount)}</b> ${pay.due}</span></button>` : ''}
        </div></section>
        ${familyRow(ctx)}
        <div class="bento">${tiles.menu(ctx, 'tall')}${tiles.shop(ctx)}${tiles.goal(ctx)}</div>${requestsCard(ctx)}`;
    },
  };

  function home(ctx, cfg) {
    const { D, state, icon } = ctx;
    return `${head(ctx, `${greeting(D.today.now)}, ${D.people[state.viewer].name}`, `${D.today.weekday}, ${D.today.date}`, `<button type="button" class="round-btn" data-act="add" aria-label="Добавить">${icon('plus')}</button>`)}${HOME[cfg.home](ctx)}`;
  }

  // ---------- Menu ----------
  function menu(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf, shopTotals } = ctx;
    const d = state.day;
    const s = soupOf(d);
    const din = dinnerOf(d);
    const pr = D.proposal;
    const yes = ['mama', 'son', 'papa'].filter((id) => state.votes[id] === 'yes');
    let chips = '';
    if (state.approved) chips = '<span class="hero-chip">Утверждено</span>';
    else {
      if (!state.votes[state.viewer]) chips += `<button type="button" class="hero-chip ${isParent() ? '' : 'primary'}" data-act="vote" data-v="yes">${icon('check')}За</button><button type="button" class="hero-chip" data-act="vote" data-v="edit">Есть правки</button>`;
      chips += isParent() ? '<button type="button" class="hero-chip primary" data-act="approve">Утвердить</button>' : '<span class="hero-chip">Утверждают родители</span>';
    }
    const row = (k, t, v, note, replace) => `<div class="row">${ico(icon, MEAL_ICON[k], 'meal')}<span class="row-main"><b>${v}</b><small>${k} · ${t}${note && isParent() ? ` · Диме: ${note}` : ''}</small></span>
      ${replace ? `<button type="button" class="btn soft sm" data-act="replace-simple" aria-label="Заменить ужин">${icon('swap')}</button>` : ''}</div>`;
    return `${head(ctx, 'Меню', `Неделя ${D.weekLabel} · утверждена`, `<button type="button" class="round-btn" data-act="filters" aria-label="Не едим">${icon('filter')}</button>`)}
      <section class="hero" aria-label="Предложение на следующую неделю">
        <h2>${D.people[pr.by].name} предлагает неделю «${pr.title}»</h2><p>На ${pr.forWeek}. ${yes.length ? `За: ${yes.map((id) => D.people[id].name).join(', ')}.` : 'Голосов пока нет.'}</p>
        <div class="hero-chips">${chips}</div>
      </section>
      <div class="days" role="group" aria-label="Дни недели">${D.weekDays.map((w, i) => `<button type="button" class="day ${i === D.today.dayIndex ? 'today' : ''}" data-act="day" data-day="${i}" aria-pressed="${i === d}" aria-label="${w.name}">${w.short}<b>${w.date}</b><i></i></button>`).join('')}</div>
      <div class="soup-line">${D.soups.map((x) => `<span class="pill soft" style="--h:var(--k-meal)">${x.name} · ${D.weekDays[x.from].short}–${D.weekDays[x.to].short}</span>`).join('')}</div>
      <section class="card"><div class="card-h"><h2>${D.weekDays[d].name}, ${D.weekDays[d].date} октября</h2><button type="button" class="more" data-act="replace-simple">Заменить день</button></div>
        ${row('Завтрак', '08:00', D.meals[d].b)}
        ${s ? row('Обед', '13:00', `${s.name}, ${s.day}-й день из ${s.of}`, s.dima) : ''}
        ${row('Полдник', '16:30', D.meals[d].s)}
        ${row('Ужин', '19:00', din.name, din.dima, true)}
      </section>
      <div class="bento"><button type="button" class="tile wide" style="--h:var(--k-shop)" data-act="tab" data-tab="shop"><span class="t-k">${icon('cart')}Продукты на неделю</span><span class="t-v">≈&nbsp;${F.rub(shopTotals().menuSum)}</span><span class="t-s">Не едим: ${D.notEat.join(', ')} · открыть список покупок</span></button></div>`;
  }

  // ---------- Shopping ----------
  function shop(ctx) {
    const { D, F, state, icon, added, shopTotals } = ctx;
    const t = shopTotals();
    return `${head(ctx, 'Покупки', `Отмечено ${t.doneCount} из ${t.count}`, `<button type="button" class="round-btn" data-act="add" aria-label="Добавить в список">${icon('plus')}</button>`)}
      <div class="bento"><div class="tile wide" style="--h:var(--k-shop);cursor:default"><span class="t-k">${icon('cart')}Куплено на ${F.rub(t.bought)}</span><span class="t-v">Осталось ≈&nbsp;${F.rub(t.left)}</span>
        <span class="bar" aria-hidden="true"><i style="width:${t.total ? (t.bought / t.total) * 100 : 0}%"></i></span></div></div>
      <div class="btns fill" style="margin:0 16px 14px"><button type="button" class="btn" data-act="go-shop">${icon('bag')}Иду в магазин</button><button type="button" class="btn soft" data-act="copy">${icon('copy')}Скопировать</button></div>
      ${D.shop.map((dep) => `<section class="card"><div class="card-h"><h2>${dep.dept}</h2><span class="note" style="margin:0">${dep.items.filter((i) => state.shopDone.has(i.id)).length} из ${dep.items.length}</span></div>
        ${dep.items.map((i) => {
          const done = state.shopDone.has(i.id);
          return `<div class="row ${done ? 'done' : ''}"><button type="button" class="row-btn" data-act="shop-item" data-id="${i.id}" aria-pressed="${done}">${check(icon)}
            <span class="row-main"><b>${i.name}</b><small>${i.qty} · ${i.from === 'menu' ? 'из меню' : `${added(i.by)} ${D.people[i.by].name}`}</small></span>${i.urgent ? '<span class="pill">срочно</span>' : ''}<span class="amount">${F.rub(i.price)}</span></button></div>`;
        }).join('')}</section>`).join('')}`;
  }

  // ---------- Board ----------
  function board(ctx) {
    const { D, F, state, icon, isParent } = ctx;
    const tabsDef = [['wishes', 'Хотелки'], ['needs', 'Надо купить'], ['goals', 'Цели'], ['requests', 'Просьбы']];
    const GEN = { papa: 'Папы', mama: 'Мамы', son: 'Сына', dima: 'Димы' };
    let panel = '';
    if (state.boardTab === 'wishes') {
      panel = `<div class="wish-grid">${D.wishes.map((w) => {
        const set = state.metoo[w.id];
        return `<article class="wish"><div class="w-top">${av(D, w.owner, 'sm')}<span class="amount">${F.rub(w.price)}</span></div><b>${w.title}</b>
          ${w.saved ? `<span class="bar" style="--h:var(--${w.owner})" aria-hidden="true"><i style="width:${(w.saved / w.price) * 100}%"></i></span><small>в копилке ${F.rub(w.saved)}</small>` : `<small>${D.people[w.owner].name} хочет</small>`}
          ${w.gift && isParent() ? `<span class="secret">${icon('gift')}Подарок от ${GEN[w.gift]}</span>` : ''}
          ${w.owner !== state.viewer ? `<button type="button" class="btn soft sm" data-act="metoo" data-id="${w.id}" aria-pressed="${set.has(state.viewer)}">${icon('metoo')}Я тоже · ${set.size}</button>` : `<small>тоже хотят: ${set.size}</small>`}</article>`;
      }).join('')}</div>`;
    } else if (state.boardTab === 'needs') {
      panel = `<section class="card">${D.needs.map((n) => `<div class="row">${av(D, n.who, 'sm')}<span class="row-main"><b>${n.title}</b><small>${D.people[n.who].name} · ${n.note} · ${n.by.startsWith('до') ? n.by : 'к ' + n.by} · ≈&nbsp;${F.rub(n.price)}</small></span><button type="button" class="btn soft sm" data-act="to-shop" data-title="${n.title}" aria-label="В покупки">${icon('cart')}</button></div>`).join('')}</section>`;
    } else if (state.boardTab === 'goals') {
      panel = D.goals.map((g) => {
        const next = g.steps.find((x) => !x.done);
        return `<section class="card"><div class="card-h"><h2>${g.title}</h2><span class="pill soft" style="--h:var(--k-goal)">${g.scope}</span></div>
          <div class="cat-top"><span class="amount">${F.rub(g.saved)}</span><span class="note" style="margin:0">из ${F.rub(g.target)}</span></div>
          <span class="bar" style="--h:var(--k-goal);display:block" aria-hidden="true"><i style="width:${(g.saved / g.target) * 100}%"></i></span>
          <p class="note">Дальше: ${next ? lowerFirst(next.t) : 'всё готово'} · шагов ${g.steps.filter((x) => x.done).length} из ${g.steps.length}</p></section>`;
      }).join('');
    } else {
      const rq = D.requests[state.viewer];
      panel = `<section class="card"><div class="card-h"><h2>Мне</h2></div>${rq.toMe.map((q) => {
        const done = state.reqDone.has(q.id);
        return `<div class="row ${done ? 'done' : ''}"><button type="button" class="row-btn" data-act="req-done" data-id="${q.id}" aria-pressed="${done}">${check(icon)}${av(D, q.from, 'sm')}<span class="row-main"><b>${q.title}</b><small>${q.when}</small></span>${q.urgent ? '<span class="pill">срочно</span>' : ''}</button></div>`;
      }).join('')}</section>
      <section class="card"><div class="card-h"><h2>От меня</h2></div>${rq.fromMe.map((q) => `<div class="row ${q.cancelled ? 'done' : ''}">${av(D, q.to, 'sm')}<span class="row-main"><b>${q.title}</b><small>${D.people[q.to].name} · ${q.cancelled ? 'отменено' : q.when}</small></span></div>`).join('')}</section>`;
    }
    return `${head(ctx, 'Доска', 'Видно всей семье', `<button type="button" class="round-btn" data-act="add" aria-label="Добавить на доску">${icon('plus')}</button>`)}
      <div class="segs" role="tablist" aria-label="Разделы доски">${tabsDef.map(([id, label]) => `<button type="button" role="tab" data-act="board-tab" data-b="${id}" aria-selected="${state.boardTab === id}">${label}</button>`).join('')}</div>${panel}`;
  }

  // ---------- Money ----------
  function money(ctx) {
    const { D, F, icon } = ctx;
    const total = D.payments.reduce((a, p) => a + p.amount, 0);
    const paid = D.payments.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
    const next = D.payments.find((p) => !p.paid && p.day >= D.month.today);
    const maxC = Math.max(...D.spend.map((c) => c.sum));
    const maxW = Math.max(...Object.values(D.spendBy));
    return `${head(ctx, 'Деньги', 'Октябрь · видят только родители', `<button type="button" class="round-btn" data-act="pay-add" aria-label="Добавить расход">${icon('plus')}</button>`)}
      <section class="hero" aria-label="Ближайший платёж"><h2>${next.title} — ${F.rub(next.amount)}</h2><p>${next.note}, ${next.day} октября. Обязательных в октябре ${F.rub(total)}, оплачено ${F.rub(paid)}.</p>
        <div class="hero-chips"><button type="button" class="hero-chip primary" data-act="pay-add">${icon('check')}Отметить оплаченным</button></div></section>
      <section class="card"><div class="card-h"><h2>Платежи</h2><span class="note" style="margin:0">осталось ${F.rub(total - paid)}</span></div>
        ${D.payments.map((p) => `<div class="row ${p.paid ? 'done' : ''}"><span class="ico" style="--h:var(--k-money)" aria-hidden="true"><b style="font-size:15px">${p.day}</b></span><span class="row-main"><b>${p.title}</b><small>${p.paid ? 'оплачено' : p.note || `${p.day} октября`}</small></span><span class="amount">${F.rub(p.amount)}</span></div>`).join('')}</section>
      <section class="card"><div class="card-h"><h2>Расходы</h2><span class="note" style="margin:0">пришло ${F.rub(D.month.income)}</span></div>
        ${D.spend.map((c) => `<div class="cat"><div class="cat-top"><span>${c.cat}<small>${c.note}</small></span><span class="amount">${F.rub(c.sum)}</span></div><span class="bar" style="--h:var(--k-money);display:block" aria-hidden="true"><i style="width:${(c.sum / maxC) * 100}%"></i></span></div>`).join('')}</section>
      <section class="card"><div class="card-h"><h2>Кто тратил</h2></div>
        ${Object.entries(D.spendBy).map(([id, sum]) => `<div class="cat"><div class="cat-top"><span style="display:flex;align-items:center;gap:8px">${av(D, id, 'sm')}${D.people[id].name}</span><span class="amount">${F.rub(sum)}</span></div><span class="bar" style="--h:var(--${id});display:block" aria-hidden="true"><i style="width:${(sum / maxW) * 100}%"></i></span></div>`).join('')}</section>`;
  }

  // Brand block shared by all versions: the «Дом» mark in the family colours.
  const house = '<g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 30 32 13" stroke="var(--papa)"/><path d="M32 13 50 30" stroke="var(--mama)"/><path d="M14 30v21h16" stroke="var(--son)"/><path d="M50 30v21H34" stroke="var(--dima)"/></g><circle cx="32" cy="36" r="7" fill="none" stroke="var(--logo-ink)" stroke-width="4"/>';
  const brand = `<h3>Логотип и иконка</h3><div class="n-logo">
    <div class="lockup"><svg viewBox="0 0 64 64" width="56" height="56" role="img" aria-label="Знак «Дом»">${house}</svg><span>Семейный<br>помощник</span></div>
    <div class="lockup inverse"><svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">${house}</svg><span>Семейный<br>помощник</span></div></div>
    <p class="n-note">Иконка «Дом», которую ты выбрал: дом из четырёх цветов семьи, окно посередине. Цвета взяты из аватаров участников.</p>`;

  const COMMON_CON = 'Это всё ещё стандарт: узнаваемо, но не уникально.';
  const VERSIONS = [
    { id: 'mandarin', title: 'Мандарин', sw: '#FF7A21', home: 'bento',
      thesis: 'Тёплый оранжевый, энергичный. Наверху главное дело и ужин, ниже плитки разного размера: меню, покупки, цель, платёж.',
      pros: ['Сразу видно главное и цифры по разделам.', 'Плитки разные по размеру и цвету: глазу есть за что зацепиться.'],
      cons: [COMMON_CON, 'Оранжевый на весь главный блок может утомлять вечером.'] },
    { id: 'berry', title: 'Ягода', sw: '#C92A62', home: 'stories',
      thesis: 'Малиновый. Сверху вся семья кружками, как сторис, ниже главное, ближайшая еда крупно и остальное меню дня.',
      pros: ['Больше всего тепла: семья — первое, что видишь.', 'Ближайшая еда крупно, со временем «через сколько».'],
      cons: [COMMON_CON, 'Главная длиннее: до плиток надо долистать.'] },
    { id: 'forest', title: 'Лес', sw: '#137A52', home: 'timeline',
      thesis: 'Глубокий зелёный, спокойный. «Мой день»: просьбы без времени сверху, ниже еда по часам с линией «сейчас».',
      pros: ['Понятно, что когда: день читается сверху вниз.', 'Спокойнее остальных, меньше цветовых пятен.'],
      cons: [COMMON_CON, 'Плиток меньше, разделы видны хуже, чем в Мандарине.'] },
    { id: 'indigo', title: 'Индиго', sw: '#3E40D8', home: 'lines',
      thesis: 'Синий с тёмным главным блоком: в нём три строки — дело, ужин, платёж. Ниже семья и плитки.',
      pros: ['Самый собранный и взрослый.', 'Тёмный блок сразу тянет взгляд к главному.'],
      cons: [COMMON_CON, 'Холоднее остальных.'] },
  ];

  VERSIONS.forEach((v) => {
    window.FA_VARIANTS[v.id] = {
      label: v.title,
      swatch: v.sw,
      screen(tab, ctx) {
        if (tab === 'home') return home(ctx, v);
        return { menu, shop, board, money }[tab](ctx);
      },
      handle(name, el, ctx) {
        if (name === 'replace-simple') { ctx.toast('Здесь откроется список блюд на замену с фильтром «не едим».'); return true; }
        return false;
      },
      notes: {
        title: `Как у всех · ${v.title}`,
        thesis: v.thesis,
        pros: v.pros,
        cons: v.cons,
        try: ['Переключай версии сверху: скелет один, меняются цвет и Главная.', 'На Главной нажми «Сделаю» в цветном блоке: главное сменится на следующее.', 'Переключи «Смотрю как: Сын»: пропадут Деньги и подарки.', 'Включи «Ночь»: у каждой версии своя тёмная тема.'],
        extra: brand,
      },
    };
  });
})();
