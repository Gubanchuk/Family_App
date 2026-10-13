// «Ягода»: the family-organizer standard at the level of T-Bank and Yandex apps.
// Chosen by the family on 2026-10-13 out of four versions of one archetype (see archive/).
window.FA_VARIANTS = window.FA_VARIANTS || {};
(() => {
  const WHO_ACC = { papa: 'Папу', mama: 'Маму', son: 'Сына', dima: 'Диму' };
  const WHO_DAT = { papa: 'Папе', mama: 'Маме', son: 'Сыну', dima: 'Диме' };
  const MEAL_ICON = { 'Завтрак': 'sun', 'Обед': 'bowl', 'Полдник': 'apple', 'Ужин': 'moon' };
  const MEAL_TO = { 'Завтрак': 'на завтрак', 'Обед': 'на обед', 'Полдник': 'на полдник', 'Ужин': 'на ужин' };
  const DIMA = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' };
  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const greeting = (now) => { const h = Number(now.split(':')[0]); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : 'Добрый вечер'; };
  const inTime = (from, to) => { const d = mins(to) - mins(from); const h = Math.floor(d / 60), m = d % 60; return `через ${h ? `${h} ч ` : ''}${m ? `${m} мин` : ''}`.trim(); };

  const av = (D, id, size = '') => `<span class="av ${size}" style="--c:var(--${id})" aria-hidden="true">${D.people[id].initial}</span>`;
  const check = (icon) => `<span class="check" aria-hidden="true">${icon('check')}</span>`;
  const ico = (icon, name, hue) => `<span class="ico" style="--h:var(--k-${hue})" aria-hidden="true">${icon(name)}</span>`;
  const sw = (key, on, label) => `<button type="button" class="switch" role="switch" aria-checked="${on}" aria-label="${label}" data-act="toggle" data-k="${key}"><i></i></button>`;

  const ideaOf = (D, id) => D.ideas.find((i) => i.id === id);
  const onDay = (D, day) => (day === D.today.dayIndex ? 'сегодня' : day === D.today.dayIndex + 1 ? 'завтра' : `${day === 1 ? 'во' : 'в'} ${D.weekDays[day].acc}`);
  const allOffers = (ctx) => ctx.D.offers.concat(ctx.state.myOffers);

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
      <div class="k-head-r">${action || ''}<button type="button" class="av" style="--c:var(--${state.viewer})" data-act="profile" aria-label="Настройки и профиль: ${D.people[state.viewer].name}">${D.people[state.viewer].initial}</button></div></header>`;
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

  // A proposal row: «Сын предлагает панкейки на полдник».
  function offerRow(ctx, o) {
    const { D, state } = ctx;
    const it = ideaOf(D, o.idea);
    const st = state.offerStatus[o.id];
    const mine = o.from === state.viewer;
    const how = o.how === 'over' ? 'поверх меню' : `вместо блюда`;
    let sub;
    let action = '';
    if (st === 'taken') sub = `готовит ${D.people[state.viewer].name} · ${MEAL_TO[o.meal]}`;
    else if (st === 'later') sub = `${D.people[o.from].name} предложит другой день`;
    else if (mine) sub = `вы предложили ${o.to === 'all' ? 'всем' : WHO_DAT[o.to]} · ${MEAL_TO[o.meal]}`;
    else {
      sub = o.to === state.viewer ? `${D.people[o.from].name} просит ${MEAL_TO[o.meal]}, ${how}` : `${D.people[o.from].name} предлагает всем ${MEAL_TO[o.meal]}, ${how}`;
      action = `<button type="button" class="btn soft sm" data-act="offer-take" data-id="${o.id}">Сделаю</button>`;
    }
    return `<div class="row offer ${st === 'later' ? 'past' : ''}"><button type="button" class="row-btn" data-act="idea" data-id="${it.id}">${av(D, o.from, 'sm')}<span class="row-main"><b>${it.name}</b><small>${sub}</small></span></button>${action}</div>`;
  }

  // Tiles with live numbers; tap opens the section.
  const tiles = {
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
    wish(ctx, cls = '') {
      const { D, F, icon } = ctx;
      const w = D.wishes[0];
      return `<button type="button" class="tile ${cls}" style="--h:var(--k-money)" data-act="tab" data-tab="board" data-board="wishes">
        <span class="t-k">${icon('gift')}Хотелки</span><span class="t-v">${w.title}</span><span class="t-s">в копилке ${F.rub(w.saved)}</span></button>`;
    },
    pay(ctx, cls = '') {
      const { D, F, icon } = ctx;
      const p = D.days.papa.find((s) => s.kind === 'payment');
      return `<button type="button" class="tile ${cls}" style="--h:var(--k-money)" data-act="tab" data-tab="money">
        <span class="t-k">${icon('money')}Скоро платить</span><span class="t-v">${p.title} · ${F.rub(p.amount)}</span><span class="t-s">${p.due}</span></button>`;
    },
  };

  // ---------- Home: family first, the main thing, the next meal large, the rest compact ----------
  function home(ctx) {
    const { D, state, icon, dinnerOf, soupOf, isParent, mealText } = ctx;
    const ti = D.today.dayIndex;
    const s = soupOf(ti);
    const meals = [['Завтрак', '08:00', mealText(ti, 'b')], ['Обед', '13:00', s ? `${s.name}, ${s.day}-й день из ${s.of}` : ''], ['Полдник', '16:30', mealText(ti, 's')], ['Ужин', '19:00', dinnerOf(ti).name]];
    const nextIdx = meals.findIndex(([, t]) => mins(t) > mins(D.today.now));
    const [nk, nt, nv] = meals[nextIdx];
    const todays = allOffers(ctx).filter((o) => o.day === D.today.dayIndex);
    return `${head(ctx, `${greeting(D.today.now)}, ${D.people[state.viewer].name}`, `${D.today.weekday}, ${D.today.date}`)}
      ${familyRow(ctx)}${hero(ctx)}
      <div class="sec-h"><h2>Сегодня едим</h2><button type="button" class="more" data-act="tab" data-tab="menu">Меню</button></div>
      <button type="button" class="meal-now" data-act="tab" data-tab="menu"><span class="mn-time">${nt}</span><span class="mn-main"><b>${nv}</b><small>${nk} · ${inTime(D.today.now, nt)}</small></span>${ico(icon, MEAL_ICON[nk], 'meal')}</button>
      <section class="card">${meals.filter((_, i) => i !== nextIdx).map(([k, t, v]) => `<div class="row ${mins(t) < mins(D.today.now) ? 'past' : ''}"><span class="tl-t">${t}</span><span class="row-main"><b>${v}</b><small>${k}</small></span></div>`).join('')}
        ${todays.length ? `<p class="tl-group">Предложили на сегодня</p>${todays.map((o) => offerRow(ctx, o)).join('')}` : ''}</section>
      ${requestsCard(ctx)}<div class="bento">${tiles.goal(ctx, 'tall')}${tiles.shop(ctx)}${isParent() ? tiles.pay(ctx) : tiles.wish(ctx)}</div>`;
  }

  // ---------- Menu: the week and «Что покушать» ----------
  function menuSegs(ctx) {
    const { state } = ctx;
    return `<div class="segs" role="tablist" aria-label="Меню">${[['week', 'Неделя'], ['ideas', 'Что покушать']].map(([id, label]) =>
      `<button type="button" role="tab" data-act="menu-panel" data-p="${id}" aria-selected="${state.menuPanel === id}">${label}</button>`).join('')}</div>`;
  }

  const MEALS = [['b', 'Завтрак', '08:00'], ['l', 'Обед', '13:00'], ['s', 'Полдник', '16:30'], ['d', 'Ужин', '19:00']];
  const MEAL_IN = { b: 'на завтрак', l: 'на обед', s: 'на полдник', d: 'на ужин' };
  const short = (t, n = 64) => (t.length > n ? t.slice(0, n - 1).trim() + '…' : t);

  // One meal of a day: the dish, what goes with it, and a note for Dima.
  function mealRow(ctx, i, key, label, time) {
    const { D, icon, isParent, dayOf, dishName, soupOf } = ctx;
    const s = dayOf(i);
    const extra = [];
    let main;
    let note = '';
    if (key === 'l') {
      const sp = soupOf(i);
      main = sp ? sp.name : 'Без супа';
      if (sp && sp.of > 1) extra.push(`кастрюля на ${sp.of} дня, ${sp.day}-й день`);
      if (s.ls) extra.push(lowerFirst(dishName(s.ls)));
      note = sp ? sp.dima : '';
    } else if (key === 'd') {
      main = dishName(s.d);
      if (s.dd) extra.push(lowerFirst(dishName(s.dd)));
      if (s.dl) extra.push(lowerFirst(dishName(s.dl)));
      note = (D.dishes[s.d] || {}).dn || '';
    } else if (key === 's') main = s.s ? dishName(s.s) : s.st;
    else main = dishName(s.b);
    return `<button type="button" class="row meal-row" data-act="slot" data-day="${i}" data-meal="${key}" aria-label="${label}: ${main}. Заменить">${ico(icon, MEAL_ICON[label], 'meal')}
      <span class="row-main"><b>${main}</b><small>${label} · ${time}${extra.length ? ` · ${extra.join(', ')}` : ''}</small>${note && isParent() ? `<small class="dima-note">Диме: ${short(lowerFirst(note))}</small>` : ''}</span>${icon('chev', 'chev')}</button>`;
  }

  function soupBatches(ctx) {
    const { soupOf } = ctx;
    const out = [];
    for (let i = 0; i < 7; i += 1) { const sp = soupOf(i); if (sp && sp.from === i) out.push(sp); }
    return out;
  }

  function menuWeek(ctx) {
    const { D, F, state, icon, isParent, tplOf } = ctx;
    const d = state.day;
    const cur = tplOf(state.week.tpl);
    const pt = tplOf(state.proposal.tpl);
    const yes = ['mama', 'son', 'papa'].filter((id) => state.votes[id] === 'yes');
    const round100 = (n) => Math.round(n / 100) * 100;
    let chips = '';
    if (state.approved) chips = `<span class="hero-chip">Утверждено</span><button type="button" class="hero-chip" data-act="week-open" data-mode="next" data-tpl="${pt.id}">Посмотреть</button>`;
    else {
      chips += `<button type="button" class="hero-chip" data-act="week-open" data-mode="next" data-tpl="${pt.id}">Посмотреть или другая</button>`;
      if (isParent()) chips += '<button type="button" class="hero-chip primary" data-act="approve">Утвердить</button>';
      else if (!state.votes[state.viewer]) chips += `<button type="button" class="hero-chip primary" data-act="vote" data-v="yes">${icon('check')}За</button>`;
      else chips += '<span class="hero-chip">Утверждают родители</span>';
    }
    return `<section class="hero" aria-label="Неделя на ${D.proposal.forWeek}">
        <h2>${D.people[state.proposal.by].name} ${state.proposal.by === state.viewer ? '(вы) ' : ''}предлагает неделю «${pt.name}» на ${D.proposal.forWeek}</h2>
        <p>≈&nbsp;${F.rub(round100(pt.cost))} на неделю. ${yes.length ? `За: ${yes.map((id) => D.people[id].name).join(', ')}.` : 'Голосов пока нет.'}</p>
        <div class="hero-chips">${chips}</div>
      </section>
      <section class="week-bar"><span class="row-main"><b>Сейчас: «${cur.name}», ${D.weekLabel}</b><small>≈&nbsp;${F.rub(round100(cur.cost))} на семью · ${cur.note}</small></span>
        <button type="button" class="btn soft sm" data-act="week-open" data-mode="${isParent() ? 'current' : 'next'}">${isParent() ? 'Сменить' : 'Предложить'}</button></section>
      <div class="days" role="group" aria-label="Дни недели">${D.weekDays.map((w, i) => `<button type="button" class="day ${i === D.today.dayIndex ? 'today' : ''}" data-act="day" data-day="${i}" aria-pressed="${i === d}" aria-label="${w.name}">${w.short}<b>${w.date}</b><i></i></button>`).join('')}</div>
      <div class="soup-line">${soupBatches(ctx).map((x) => `<span class="pill soft" style="--h:var(--k-meal)">${x.name} · ${D.weekDays[x.from].short}${x.to > x.from ? `–${D.weekDays[x.to].short}` : ''}</span>`).join('')}</div>
      <section class="card"><div class="card-h"><h2>${D.weekDays[d].name}, ${D.weekDays[d].date} октября</h2><button type="button" class="more" data-act="day-open" data-day="${d}">Заменить день</button></div>
        ${MEALS.map(([k, label, time]) => mealRow(ctx, d, k, label, time)).join('')}
        ${(() => { const offers = allOffers(ctx).filter((o) => o.day === d); return offers.length ? `<p class="tl-group">Предложили поверх меню</p>${offers.map((o) => offerRow(ctx, o)).join('')}` : ''; })()}
        <p class="note">Нажмите на блюдо, чтобы заменить его блюдом из другой недели или из всех рецептов.</p>
      </section>
      <div class="bento"><button type="button" class="tile wide" style="--h:var(--k-shop)" data-act="tab" data-tab="shop"><span class="t-k">${icon('cart')}Продукты на неделю</span><span class="t-v">≈&nbsp;${F.rub(round100(cur.cost))}</span><span class="t-s">Не едим: ${D.notEat.join(', ')} · открыть список покупок</span></button></div>`;
  }

  // Which dishes fit a meal when choosing from all recipes.
  const FITS = {
    b: (x) => x.c === 'breakfast' || x.m.includes('breakfast'),
    l: (x) => x.c === 'soup',
    s: (x) => ['snack', 'dessert', 'drink'].includes(x.c) || x.m.includes('snack'),
    d: (x) => x.c === 'main',
  };
  const DIMA_SHORT = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' };

  function dayLine(ctx, src, key) {
    const { dishName } = ctx;
    if (key === 'l') return [dishName(src.l), dishName(src.ls)].filter(Boolean).join(', ');
    if (key === 'd') return [dishName(src.d), src.dd ? lowerFirst(dishName(src.dd)) : ''].filter(Boolean).join(' + ');
    if (key === 's') return src.s ? dishName(src.s) : src.st;
    return dishName(src.b);
  }

  function tplChips(ctx, act, selected) {
    const { D, state } = ctx;
    return `<div class="col-chips sheet-chips" role="group" aria-label="Неделя">${D.templates.map((t) =>
      `<button type="button" data-act="${act}" data-tpl="${t.id}" aria-pressed="${t.id === selected}">${t.name}${t.id === state.week.tpl ? ' · сейчас' : ''}</button>`).join('')}</div>`;
  }

  // Replace one meal: from another week's day or from all recipes.
  function slotSheet(ctx) {
    const { D, state, icon, tplOf, dishName } = ctx;
    const sh = state.sheet;
    const label = MEALS.find((m) => m[0] === sh.meal)[1];
    const cur = dayLine(ctx, state.week.slots[sh.day], sh.meal);
    let body;
    if (sh.tab === 'weeks') {
      const t = tplOf(sh.tpl);
      body = `${tplChips(ctx, 'slot-tpl', sh.tpl)}
        <div class="opts">${t.days.map((src, i) => `<button type="button" class="opt" data-act="slot-pick" data-tpl="${t.id}" data-src="${i}"><span class="opt-day">${D.weekDays[i].short}</span><span class="row-main"><b>${dayLine(ctx, src, sh.meal)}</b></span>${icon('swap')}</button>`).join('')}</div>`;
    } else {
      const list = Object.entries(D.dishes).filter(([, x]) => FITS[sh.meal](x)).sort((a, b) => a[1].n.localeCompare(b[1].n, 'ru'));
      body = `<label class="search sheet-search">${icon('search')}<span class="vh">Найти блюдо</span><input type="search" data-dish-search placeholder="Блюдо или продукт" autocomplete="off"></label>
        <div class="opts">${list.map(([id, x]) => `<button type="button" class="opt" data-act="slot-pick" data-dish="${id}" data-q="${x.n.toLowerCase()}"><span class="row-main"><b>${x.n}</b><small>${x.t} мин · ${DIMA_SHORT[x.dm]}${x.tags.length ? ` · ${x.tags.join(', ')}` : ''}</small></span>${icon('swap')}</button>`).join('')}</div>
        <p class="empty" data-empty hidden>Ничего не нашли.</p>`;
    }
    return `<button type="button" class="sheet-backdrop" data-act="sheet-close" aria-label="Закрыть"></button>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-head"><h2 id="sheet-title">${label} ${onDay(D, sh.day)}</h2><button type="button" class="round-btn" data-act="sheet-close" aria-label="Закрыть">${icon('x')}</button></div>
        <p class="sheet-sub">Сейчас: ${cur}</p>
        <div class="segs sheet-segs" role="tablist" aria-label="Откуда взять">${[['weeks', 'Из других недель'], ['all', 'Все рецепты']].map(([id, l]) => `<button type="button" role="tab" data-act="slot-tab" data-t="${id}" aria-selected="${sh.tab === id}">${l}</button>`).join('')}</div>
        ${body}
      </section>`;
  }

  // Replace a whole day with any day of any week.
  function daySheet(ctx) {
    const { D, state, icon, tplOf } = ctx;
    const sh = state.sheet;
    const src = tplOf(sh.tpl).days[sh.src];
    return `<button type="button" class="sheet-backdrop" data-act="sheet-close" aria-label="Закрыть"></button>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-head"><h2 id="sheet-title">Заменить ${D.weekDays[sh.day].acc} целиком</h2><button type="button" class="round-btn" data-act="sheet-close" aria-label="Закрыть">${icon('x')}</button></div>
        <p class="sheet-sub">Возьмите любой день из любой недели.</p>
        ${tplChips(ctx, 'day-tpl', sh.tpl)}
        <div class="days sheet-days" role="group" aria-label="День недели">${D.weekDays.map((w, i) => `<button type="button" class="day" data-act="day-src" data-src="${i}" aria-pressed="${i === sh.src}">${w.short}</button>`).join('')}</div>
        <div class="day-preview">${MEALS.map(([k, label, time]) => `<div class="row"><span class="tl-t">${time}</span><span class="row-main"><b>${dayLine(ctx, src, k)}</b><small>${label}</small></span></div>`).join('')}</div>
        <div class="sheet-actions"><button type="button" class="btn" data-act="day-apply">${icon('swap')}Поставить ${onDay(D, sh.day)}</button></div>
      </section>`;
  }

  // Choose a week: for this week (parents) or propose one for the next week.
  function weekSheet(ctx) {
    const { D, F, state, icon, tplOf, dishName } = ctx;
    const sh = state.sheet;
    const t = tplOf(sh.pick);
    const round100 = (n) => Math.round(n / 100) * 100;
    const title = `Неделя на <span class="nw">${sh.mode === 'current' ? D.weekLabel : D.proposal.forWeek}</span>`;
    return `<button type="button" class="sheet-backdrop" data-act="sheet-close" aria-label="Закрыть"></button>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-head"><h2 id="sheet-title">${title}</h2><button type="button" class="round-btn" data-act="sheet-close" aria-label="Закрыть">${icon('x')}</button></div>
        <p class="sheet-sub">${sh.mode === 'current' ? 'Выберите шаблон: меню и список покупок соберутся заново.' : 'Выберите шаблон и предложите семье, родители утвердят.'}</p>
        <div class="tpl-list" role="radiogroup" aria-label="Шаблоны недель">${D.templates.map((x) => `<button type="button" class="tpl" role="radio" aria-checked="${x.id === sh.pick}" data-act="week-pick" data-tpl="${x.id}">
          <span class="tpl-top"><b>${x.name}${x.id === state.week.tpl ? '<span class="tpl-now">сейчас</span>' : ''}</b><span class="amount">≈&nbsp;${F.rub(round100(x.cost))}</span></span>
          <small>${x.note}</small></button>`).join('')}</div>
        <h3 class="sh-h week-preview">«${t.name}» по дням</h3>
        <div class="day-preview">${t.days.map((x, i) => `<div class="row"><span class="tl-t">${D.weekDays[i].short}</span><span class="row-main"><b>${dishName(x.d)}</b><small>${dishName(x.b)} · ${dishName(x.l)} · ${x.s ? dishName(x.s) : x.st}</small></span></div>`).join('')}</div>
        <div class="sheet-actions"><button type="button" class="btn" data-act="week-apply">${sh.mode === 'current' ? `Поставить «${t.name}»` : `Предложить «${t.name}»`}</button></div>
      </section>`;
  }

  function ideaCard(ctx, it, wide) {
    const { F } = ctx;
    const q = `${it.name} ${it.about} ${it.ing.map((x) => x[0]).join(' ')}`.toLowerCase();
    return `<button type="button" class="idea ${wide ? 'wide' : ''}" data-act="idea" data-id="${it.id}" data-q="${q}">
      <b>${it.name}</b>${wide ? `<span class="i-about">${it.about}</span>` : ''}
      <span class="i-meta"><span class="i-min">${it.min}<small>мин</small></span>${it.cost ? `<span class="amount">≈&nbsp;${F.rub(it.cost)}</span>` : ''}</span>
      <span class="i-dima">${DIMA[it.dima]}</span></button>`;
  }

  function menuIdeas(ctx) {
    const { D, state, icon, dinnerOf } = ctx;
    const forMe = allOffers(ctx).find((o) => (o.to === state.viewer) && !state.offerStatus[o.id]);
    let top;
    if (state.replaceFor) {
      const day = state.replaceFor.day;
      top = `<section class="notice" aria-live="polite"><span class="row-main"><b>Меняем ужин ${onDay(D, day)}</b><small>Сейчас: ${lowerFirst(dinnerOf(day).name)}. Выберите блюдо ниже.</small></span><button type="button" class="btn soft sm" data-act="replace-cancel">Отмена</button></section>`;
    } else if (forMe) {
      const it = ideaOf(D, forMe.idea);
      top = `<section class="hero" aria-label="Вам предложили блюдо">
        <h2>${D.people[forMe.from].name} просит: сделай ${onDay(D, forMe.day)} ${it.acc}</h2>
        <p>${MEAL_TO[forMe.meal][0].toUpperCase() + MEAL_TO[forMe.meal].slice(1)}, ${forMe.how === 'over' ? 'поверх меню' : `вместо ${lowerFirst(forMe.meal === 'Ужин' ? dinnerOf(forMe.day).name : 'блюда по меню')}`}. ${it.min} минут.</p>
        <div class="hero-chips"><button type="button" class="hero-chip primary" data-act="offer-take" data-id="${forMe.id}">${icon('check')}Сделаю</button>
          <button type="button" class="hero-chip" data-act="idea" data-id="${it.id}">Рецепт</button>
          <button type="button" class="hero-chip" data-act="offer-later" data-id="${forMe.id}">Не ${forMe.day === D.today.dayIndex ? 'сегодня' : 'в этот день'}</button></div></section>`;
    } else {
      const it = D.ideas.find((x) => x.col.includes('weekend'));
      top = `<section class="hero" aria-label="Идея на выходные"><h2>На выходные: ${lowerFirst(it.name)}</h2><p>${it.about}. ${it.min} минут.</p>
        <div class="hero-chips"><button type="button" class="hero-chip primary" data-act="idea" data-id="${it.id}">Посмотреть и предложить</button></div></section>`;
    }
    const list = D.ideas.filter((x) => state.ideaCol === 'all' || x.col.includes(state.ideaCol));
    return `${top}
      <label class="search">${icon('search')}<span class="vh">Найти блюдо</span><input type="search" data-search placeholder="Блюдо или продукт: курица, яйца" autocomplete="off"></label>
      <div class="col-chips" role="group" aria-label="Подборки">${[{ id: 'all', name: 'Все' }].concat(D.collections).map((c) =>
        `<button type="button" data-act="idea-col" data-c="${c.id}" aria-pressed="${state.ideaCol === c.id}">${c.name}</button>`).join('')}</div>
      <div class="idea-grid">${list.map((it, i) => ideaCard(ctx, it, i === 0)).join('')}</div>
      <p class="empty" data-empty hidden>Ничего не нашли. Попробуйте продукт: «курица», «творог», «яйца».</p>`;
  }

  function menu(ctx) {
    const { D, icon } = ctx;
    return `${head(ctx, 'Меню', `Неделя ${D.weekLabel} · утверждена`, `<button type="button" class="head-pill" data-act="filters">${icon('filter')}Не едим</button>`)}
      ${menuSegs(ctx)}${ctx.state.menuPanel === 'ideas' ? menuIdeas(ctx) : menuWeek(ctx)}`;
  }

  // Recipe sheet: what it is, what to buy, how to cook, and whom to propose it to.
  function ideaSheet(ctx) {
    const { D, F, state, icon } = ctx;
    const it = ideaOf(D, state.sheet.id);
    const dr = state.offerDraft;
    const others = ['mama', 'papa', 'son'].filter((id) => id !== state.viewer);
    const pick = (k, v, label) => `<button type="button" class="pick" data-act="pick" data-k="${k}" data-v="${v}" aria-pressed="${dr[k] === v}">${label}</button>`;
    const offer = state.replaceFor ? '' : `<h3 class="sh-h">Кому и когда</h3><div class="offer-picks">
        <div class="pick-g"><span>Кому</span><div class="picks">${pick('to', 'all', 'Всем')}${others.map((id) => pick('to', id, WHO_DAT[id])).join('')}</div></div>
        <div class="pick-g"><span>Когда</span><div class="picks">${pick('when', 'today', 'Сегодня')}${pick('when', 'tomorrow', 'Завтра')}${pick('when', 'weekend', 'В выходные')}</div></div>
        <div class="pick-g"><span>Как</span><div class="picks">${pick('how', 'over', 'Поверх меню')}${pick('how', 'instead', 'Вместо блюда')}</div></div></div>`;
    const actions = state.replaceFor
      ? `<button type="button" class="btn" data-act="idea-place" data-id="${it.id}">${icon('swap')}Поставить на ужин ${onDay(D, state.replaceFor.day)}</button>`
      : `<div class="btns fill"><button type="button" class="btn" data-act="offer-send" data-id="${it.id}">Предложить</button><button type="button" class="btn soft" data-act="idea-cook" data-id="${it.id}">Приготовлю сам</button></div>`;
    return `<button type="button" class="sheet-backdrop" data-act="sheet-close" aria-label="Закрыть рецепт"></button>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-head"><h2 id="sheet-title">${it.name}</h2><button type="button" class="round-btn" data-act="sheet-close" aria-label="Закрыть">${icon('x')}</button></div>
        <p class="sheet-sub">${it.about}</p>
        <p class="meta-line"><span>${it.min} минут</span><span>${it.serv} ${it.serv < 5 ? 'порции' : 'порций'}</span>${it.cost ? `<span>≈&nbsp;${F.rub(it.cost)}${it.costPart ? ' без части продуктов' : ''}</span>` : ''}</p>
        <p class="dima-line">${av(D, 'dima', 'sm')}<span><b>${DIMA[it.dima]}</b>${it.dimaNote ? `<small>${it.dimaNote}</small>` : ''}</span></p>
        ${offer}<h3 class="sh-h">Продукты</h3>
        <ul class="ing">${it.ing.map(([n, q]) => `<li><span>${n}</span><span class="${q === 'есть дома' ? 'home' : ''}">${q}</span></li>`).join('')}</ul>
        <h3 class="sh-h">Как готовить</h3>
        <ol class="steps">${it.steps.map((x) => `<li>${x}</li>`).join('')}</ol>
        <div class="sheet-actions">${actions}</div>
      </section>`;
  }

  // ---------- Settings: profile, theme, family, food, notifications, sign-in ----------
  function settings(ctx) {
    const { D, state, icon, isParent, isDark } = ctx;
    const me = D.people[state.viewer];
    const n = state.notify;
    const auto = state.theme === 'auto';
    const tp = (t, label, iconName) => {
      const on = isDark() === (t === 'dark');
      return `<button type="button" class="tp ${auto ? 'auto' : ''}" role="radio" aria-checked="${on}" data-act="theme" data-t="${t}">
      <span class="tp-mini ${t}" aria-hidden="true"><i></i><b></b><b></b></span><span class="tp-l">${icon(iconName)}${label}${auto && on ? '<small>авто</small>' : ''}</span></button>`;
    };
    const setRow = (title, value, msg) => `<button type="button" class="row set-row" data-act="set-row" data-msg="${msg}"><span class="row-main"><b>${title}</b></span><span class="set-v">${value}</span>${icon('chev', 'chev')}</button>`;
    const swRow = (key, title, sub) => `<div class="row"><span class="row-main"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${sw(key, n[key], title)}</div>`;
    const family = isParent() ? `<section class="card"><div class="card-h"><h2>Семья</h2></div>
        ${['papa', 'mama', 'son', 'dima'].map((id) => `<button type="button" class="row set-row" data-act="set-row" data-msg="Роль меняет владелец семьи: родитель видит деньги и подарки, ребёнок — нет.">${av(D, id, 'sm')}<span class="row-main"><b>${D.people[id].name}</b><small>${D.settings.roles[id]}</small></span>${icon('chev', 'chev')}</button>`).join('')}
        <button type="button" class="row set-row add-row" data-act="set-row" data-msg="Ссылка-приглашение скопирована. Отправьте её в мессенджере: по ней войдут в вашу семью.">${ico(icon, 'plus', 'primary')}<span class="row-main"><b>Пригласить в семью</b><small>ссылка для входа</small></span></button>
      </section>` : '';
    const signIn = isParent()
      ? `<div class="row"><span class="row-main"><b>Google</b><small>основной вход</small></span><span class="pill soft" style="--h:var(--k-shop)">подключён</span></div>
        ${setRow('Пароль для входа по почте', 'задать', 'Запасной вход: почта и пароль, если Google не откроется.')}`
      : `<div class="row"><span class="row-main"><b>Почта и пароль</b><small>так входит ${me.name}</small></span></div>
        ${setRow('Сменить пароль', '', 'Новый пароль придёт на почту ссылкой.')}`;
    return `<header class="k-head sub"><button type="button" class="round-btn" data-act="back" aria-label="Назад">${icon('back')}</button><div><h1>Настройки</h1></div></header>
      <section class="card profile"><span class="av lg" style="--c:var(--${state.viewer})" aria-hidden="true">${me.initial}</span>
        <span class="row-main"><b>${me.name}</b><small>${D.settings.roles[state.viewer]}</small></span>
        <button type="button" class="btn soft sm" data-act="set-row" data-msg="Имя, фото и цвет кружка.">Изменить</button></section>
      <section class="card"><div class="card-h"><h2>Тема</h2></div>
        <div class="theme-pick" role="radiogroup" aria-label="Тема">${tp('light', 'День', 'sun')}${tp('dark', 'Ночь', 'moon')}</div>
        <div class="row"><span class="row-main"><b>Как в телефоне</b><small>сама переключится вечером, если так настроен телефон</small></span>${sw('theme-auto', auto, 'Тема как в телефоне')}</div>
      </section>
      ${family}
      <section class="card"><div class="card-h"><h2>Еда</h2></div>
        ${setRow('Не едим', D.notEat.join(', '), 'Блюда с этими продуктами не попадут в меню и «Что покушать».')}
        ${setRow('Время еды', D.settings.mealTimes.join(', '), 'Время завтрака, обеда, полдника и ужина: по нему напоминания и «через сколько».')}
        ${isParent() ? setRow('Суп варим', D.settings.soupDays, 'Сколько дней едим одну кастрюлю супа.') : ''}
        ${isParent() ? setRow('Готовим на', D.settings.portions, 'Двое взрослых, Сын как взрослый, Дима половину.') : ''}
      </section>
      <section class="card"><div class="card-h"><h2>Уведомления</h2></div>
        ${swRow('requests', 'Просьбы мне')}
        ${swRow('offers', 'Предложения блюд', '«Сделай сегодня…»')}
        ${swRow('votes', 'Голосование за меню')}
        ${swRow('shop', 'Кто идёт в магазин')}
        ${isParent() ? swRow('pay', 'Платежи', 'за 3 дня и в день оплаты') : ''}
        ${swRow('quiet', 'Тихие часы', 'с 22:00 до 8:00 без звука')}
      </section>
      <section class="card"><div class="card-h"><h2>Вход</h2></div>${signIn}
        <button type="button" class="btn danger" data-act="set-row" data-msg="После выхода данные останутся у семьи, а с этого телефона удалятся.">${icon('logout')}Выйти</button></section>
      <section class="card"><div class="card-h"><h2>Приложение</h2></div>
        <div class="row"><span class="row-main"><b>Работает без интернета</b><small>всё сохранено на телефоне · ${D.today.now}</small></span>${icon('check', 'ok')}</div>
        ${setRow('Установить на экран «Домой»', '', 'В Safari: «Поделиться» → «На экран Домой». В Chrome: меню → «Установить приложение».')}
        <div class="row"><span class="row-main"><b>Версия</b></span><span class="set-v">макет 0.2</span></div>
      </section>`;
  }

  // ---------- Shopping ----------
  function shop(ctx) {
    const { D, F, state, icon, added, shopTotals } = ctx;
    const t = shopTotals();
    return `${head(ctx, 'Покупки', `Отмечено ${t.doneCount} из ${t.count}`, `<button type="button" class="head-pill" data-act="add">${icon('plus')}Добавить</button>`)}
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
    return `${head(ctx, 'Доска', 'Видно всей семье', `<button type="button" class="head-pill" data-act="add">${icon('plus')}Добавить</button>`)}
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
    return `${head(ctx, 'Деньги', 'Октябрь · видят только родители', `<button type="button" class="head-pill" data-act="pay-add">${icon('plus')}Расход</button>`)}
      <section class="hero" aria-label="Ближайший платёж"><h2>${next.title} — ${F.rub(next.amount)}</h2><p>${next.note}, ${next.day} октября. Обязательных в октябре ${F.rub(total)}, оплачено ${F.rub(paid)}.</p>
        <div class="hero-chips"><button type="button" class="hero-chip primary" data-act="pay-add">${icon('check')}Отметить оплаченным</button></div></section>
      <section class="card"><div class="card-h"><h2>Платежи</h2><span class="note" style="margin:0">осталось ${F.rub(total - paid)}</span></div>
        ${D.payments.map((p) => `<div class="row ${p.paid ? 'done' : ''}"><span class="ico" style="--h:var(--k-money)" aria-hidden="true"><b style="font-size:15px">${p.day}</b></span><span class="row-main"><b>${p.title}</b><small>${p.paid ? 'оплачено' : p.note || `${p.day} октября`}</small></span><span class="amount">${F.rub(p.amount)}</span></div>`).join('')}</section>
      <section class="card"><div class="card-h"><h2>Расходы</h2><span class="note" style="margin:0">пришло ${F.rub(D.month.income)}</span></div>
        ${D.spend.map((c) => `<div class="cat"><div class="cat-top"><span>${c.cat}<small>${c.note}</small></span><span class="amount">${F.rub(c.sum)}</span></div><span class="bar" style="--h:var(--k-money);display:block" aria-hidden="true"><i style="width:${(c.sum / maxC) * 100}%"></i></span></div>`).join('')}</section>
      <section class="card"><div class="card-h"><h2>Кто тратил</h2></div>
        ${Object.entries(D.spendBy).map(([id, sum]) => `<div class="cat"><div class="cat-top"><span style="display:flex;align-items:center;gap:8px">${av(D, id, 'sm')}${D.people[id].name}</span><span class="amount">${F.rub(sum)}</span></div><span class="bar" style="--h:var(--${id});display:block" aria-hidden="true"><i style="width:${(sum / maxW) * 100}%"></i></span></div>`).join('')}</section>`;
  }

  // Brand block: the «Дом» mark in the family colours.
  const house = '<g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 30 32 13" stroke="var(--papa)"/><path d="M32 13 50 30" stroke="var(--mama)"/><path d="M14 30v21h16" stroke="var(--son)"/><path d="M50 30v21H34" stroke="var(--dima)"/></g><circle cx="32" cy="36" r="7" fill="none" stroke="var(--logo-ink)" stroke-width="4"/>';
  const brand = `<h3>Логотип и иконка</h3><div class="n-logo">
    <div class="lockup"><svg viewBox="0 0 64 64" width="56" height="56" role="img" aria-label="Знак «Дом»">${house}</svg><span>Семейный<br>помощник</span></div>
    <div class="lockup inverse"><svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">${house}</svg><span>Семейный<br>помощник</span></div></div>
    <p class="n-note">Дом из четырёх цветов семьи, окно посередине. Цвета взяты из аватаров участников.</p>`;

  window.FA_VARIANTS.berry = {
    label: 'Ягода',
    screen(tab, ctx) {
      return { home, menu, shop, board, money, settings }[tab](ctx);
    },
    sheet(ctx) {
      const k = ctx.state.sheet && ctx.state.sheet.kind;
      return k === 'idea' ? ideaSheet(ctx) : k === 'slot' ? slotSheet(ctx) : k === 'day' ? daySheet(ctx) : k === 'week' ? weekSheet(ctx) : '';
    },
    notes: {
      title: 'Ягода',
      thesis: 'Малиновый «Как у всех», который выбрала семья. Сверху семья кружками, ниже главное дело, ближайшая еда крупно, остальное меню дня.',
      news: [
        'Меню → «Сейчас: «Осенняя»» → «Сменить»: выбор недели из 6 шаблонов с ценой. Сверху — неделя, которую предложили на следующую, её можно посмотреть или предложить другую.',
        'Любое блюдо дня нажимается: заменить его блюдом из другой недели (любой день) или из всех 229 рецептов. «Заменить день» берёт целый день из любой недели.',
        'Тема «День» и «Ночь»: нажми на свой кружок справа сверху, откроются настройки.',
        'Настройки: профиль, тема, семья и роли, еда, уведомления, вход, работа без интернета.',
        'Меню → «Что покушать»: 40 настоящих блюд из собранной базы, у каждого рецепт с источником. Цена — по средним ценам Росстата за сентябрь 2026; где цены на продукт нет (например, куриное филе), сумму не показываем.',
        'Любое блюдо можно предложить: кому, когда, поверх меню или вместо блюда.',
      ],
      try: [
        'Меню → нажми на завтрак → «Из других недель» → «Зимняя» → выбери день.',
        'Меню → «Заменить день» → «Летняя» → «Сб» → «Поставить».',
        'На Главной у панкейков от Сына нажми «Сделаю».',
        'Меню → «Что покушать» → открой шакшуку → «Предложить».',
        'Меню → «Заменить ужин»: откроются идеи, выбранное встанет на ужин.',
        'Переключи «Смотрю как: Сын»: у него своя просьба про пиццу, нет денег и ролей семьи.',
      ],
      extra: brand,
    },
  };
})();
