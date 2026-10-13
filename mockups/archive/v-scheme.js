// «Семейная схема»: every family member is a metro line, the day is a sequence of stations.
window.FA_VARIANTS = window.FA_VARIANTS || {};
(() => {
  const STATION_Y = 22;
  const TRAIN_H = 28;
  const ACC = { papa: 'Папу', mama: 'Маму', son: 'Сына', dima: 'Диму' };

  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const plural = (n, forms) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  };
  const urgentTag = '<span class="tag-urgent">срочно</span>';
  // Dima's line leaves the trunk below a meal station: his adaptation of the same dish.
  const dimaBranch = (text) => (text ? `<span class="dima-branch"><svg class="db-svg" width="56" height="26" viewBox="0 0 56 26" aria-hidden="true">
      <path d="M0 0 L18 18 H44" fill="none" stroke="var(--dima)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="48" cy="18" r="6" fill="var(--dima)"/></svg><span class="db-label">Диме: ${text}</span></span>` : '');
  // Other members' lines touching a shared station (dinner is eaten together).
  const nodeStubs = (ids) => {
    const paths = [
      (c) => `<path d="M34 -34 L0 0" stroke="var(--${c})"/>`,
      (c) => `<path d="M40 0 H0" stroke="var(--${c})"/>`,
      (c) => `<path d="M34 34 L0 0" stroke="var(--${c})"/>`,
    ];
    return `<svg class="node-stubs" width="44" height="80" viewBox="0 -40 44 80" aria-hidden="true"><g fill="none" stroke-width="6" stroke-linecap="round">${ids.map((id, i) => paths[i](id)).join('')}</g></svg>`;
  };
  const batchDots = (day, of) =>
    `<span class="batch" aria-hidden="true">${Array.from({ length: of }, (_, i) => `<i class="${i < day ? 'on' : ''}"></i>`).join('')}</span><span>день ${day} из ${of}</span>`;

  function branch(color, label, dashed) {
    return `<svg class="branch" width="150" height="30" viewBox="0 0 150 30" aria-hidden="true">
      <path d="M0 0 L22 22 H138" fill="none" stroke="var(--${color})" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="9 8"' : ''}/>
      <circle cx="142" cy="22" r="7" fill="var(--${color})"/></svg><span class="branch-label">${label}</span>`;
  }

  function goalLine(g, width, color, F) {
    const n = g.steps.length;
    const pct = Math.min(100, Math.round((g.saved / g.target) * 1000) / 10);
    const stations = g.steps.map((st, i) => {
      const pos = n === 1 ? 0 : (i / (n - 1)) * 100;
      return `<span class="gl-st ${st.done || pos <= pct ? 'on' : ''}" style="left:${pos}%"></span>`;
    }).join('');
    return `<div class="gl" style="--w:${width}%;--c:${color}" role="img" aria-label="${g.title}: накоплено ${F.rub(g.saved)} из ${F.rub(g.target)}">
      <div class="gl-in"><span class="gl-track"></span><span class="gl-fill" style="width:${pct}%"></span>${stations}<span class="gl-train" style="left:${pct}%"></span></div></div>`;
  }

  // ---------- Home ----------
  function station(s, ctx) {
    const { state, D, F, dinnerOf, soupOf, isParent } = ctx;
    const done = state.done.has(s.id);
    const fresh = s.fresh && !state.seen.has(s.id);
    const cls = ['st'];
    let title = '';
    let meta = '';
    let extra = '';
    if (s.kind === 'meal') {
      title = `${s.title} · ${lowerFirst(s.dish)}`;
      const parts = [`<span>${s.time}</span>`];
      if (s.batch) parts.push(batchDots(s.batch.day, s.batch.of));
      // Dinner is the family node: the other lines touch this station.
      if (s.title === 'Ужин') {
        cls.push('node');
        parts.push('<span>всей семьёй</span>');
        const others = ['papa', 'mama', 'son'].filter((id) => id !== state.viewer);
        extra += nodeStubs(isParent() ? others : [...others, 'dima']);
      }
      meta = parts.join('');
      // Adaptation notes matter to whoever cooks, so children do not see them.
      if (isParent() && s.title === 'Обед') { const soup = soupOf(D.today.dayIndex); if (soup) extra += dimaBranch(soup.dima); }
      if (isParent() && s.title === 'Ужин') extra += dimaBranch(dinnerOf(D.today.dayIndex).dima);
    } else if (s.kind === 'request') {
      cls.push('xfer', 'has-branch');
      title = s.title + (s.urgent ? urgentTag : '');
      extra = branch(s.from, `просит ${D.people[s.from].name}`, false);
    } else if (s.kind === 'own-request') {
      cls.push('xfer', 'has-branch');
      title = s.title;
      extra = branch(s.to, `ждёт ${ACC[s.to]}`, true);
    } else if (s.kind === 'payment') {
      cls.push('pay');
      title = `${s.title} · ${F.rub(s.amount)}`;
      meta = `<span>платёж ${s.due}</span>`;
    }
    if (done) cls.push('done');
    if (fresh) cls.push('fresh');
    return `<button type="button" class="${cls.join(' ')}" data-act="station" data-id="${s.id}" aria-pressed="${done}">
      <span class="dot" aria-hidden="true"></span>
      <span class="st-title">${title}</span>${meta ? `<span class="st-meta">${meta}</span>` : ''}${extra}</button>`;
  }

  function home(ctx) {
    const { D, F, state, icon, isParent } = ctx;
    const me = D.people[state.viewer];
    const stations = D.days[state.viewer].filter((s) => s.kind !== 'payment' || isParent());
    const legend = ['papa', 'mama', 'son', 'dima'].map((id) =>
      `<li class="${id === state.viewer ? 'me' : ''}"><i style="--c:var(--${id})"></i>${D.people[id].name}${D.people[id].noLogin ? ' (без входа)' : ''}</li>`).join('');
    const g = D.goals[0];
    return `
      <header class="s-head">
        <div><h1 class="s-title">Твоя линия сегодня</h1><p class="s-sub">${D.today.weekday}, ${D.today.date} · сейчас ${D.today.now}</p></div>
        <div class="s-actions">
          <button type="button" class="icon-btn" data-act="add" aria-label="Добавить дело, просьбу или покупку">${icon('plus')}</button>
          <button type="button" class="avatar" data-act="profile" aria-label="Профиль: ${me.name}">${me.initial}</button>
        </div>
      </header>
      <ul class="legend" aria-label="Линии семьи">${legend}</ul>
      <section class="rail-wrap day" data-mode="between" aria-label="Дела на сегодня по порядку">
        <span class="r-track" aria-hidden="true"></span><span class="r-fill" aria-hidden="true"></span><span class="r-train" aria-hidden="true"></span>
        ${stations.map((s) => station(s, ctx)).join('')}
      </section>
      <section class="s-section">
        <div class="s-row"><h2 class="s-h2">Цели семьи</h2><button type="button" class="s-link" data-act="tab" data-tab="board" data-board="goals">Все цели</button></div>
        ${goalLine(g, 100, 'var(--family)', F)}
        <p class="s-caption">${g.title} · <b>${F.rub(g.saved)}</b> из ${F.rub(g.target)}</p>
      </section>`;
  }

  // ---------- Menu ----------
  function proposal(ctx) {
    const { D, state, icon, isParent } = ctx;
    const pr = D.proposal;
    const mine = pr.by === state.viewer;
    const statusText = (id) => {
      const v = state.votes[id];
      if (v === 'yes') return 'за';
      if (v === 'edit') return 'есть правки';
      if (id === state.viewer) return 'ждём твой голос';
      return id === 'mama' ? 'ещё не смотрела' : 'ещё не смотрел';
    };
    const votes = ['mama', 'son', 'papa'].map((id) =>
      `<li class="${state.votes[id] === 'yes' ? 'yes' : ''}"><span class="mini-av" style="--c:var(--${id})" aria-hidden="true">${D.people[id].initial}</span>${D.people[id].name}: ${statusText(id)}</li>`).join('');
    let actions = '';
    if (state.approved) {
      actions = '<span class="hint">Утверждено. Продукты попадут в список в воскресенье.</span>';
    } else {
      if (!state.votes[state.viewer]) {
        actions += `<button type="button" class="btn-line sm" data-act="vote" data-v="yes">${icon('check')}За</button>`;
        actions += '<button type="button" class="btn-line sm" data-act="vote" data-v="edit">Есть правки</button>';
      }
      actions += isParent()
        ? '<button type="button" class="btn-solid sm" data-act="approve">Утвердить неделю</button>'
        : '<span class="hint">Утверждают родители</span>';
    }
    const title = mine
      ? `Ты предложил неделю «${pr.title}» на ${pr.forWeek}`
      : `<b>${D.people[pr.by].name}</b> предлагает неделю «${pr.title}» на ${pr.forWeek}`;
    return `<section class="proposal" aria-label="Предложение меню на следующую неделю">
      <div class="pr-line ${state.approved ? 'solid' : ''}" style="--c:var(--${pr.by})" aria-hidden="true">${'<i></i>'.repeat(7)}</div>
      <p class="pr-title">${title}</p>
      <ul class="votes">${votes}</ul>
      <div class="pr-actions">${actions}</div>
    </section>`;
  }

  function menu(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf, shopTotals } = ctx;
    const t = shopTotals();
    const day = state.day;
    const wd = D.weekDays[day];
    const soup = soupOf(day);
    const m = D.meals[day];
    const din = dinnerOf(day);
    const daysWord = (n) => `${n} ${plural(n, ['день', 'дня', 'дней'])}`;
    // The day plan is a static family line: each meal is a station, slot and time sit under the dish.
    const row = (slot, time, name, meta, dima, opts = {}) => `
      <div class="st static ${opts.changed ? 'changed' : ''} ${opts.replace ? 'has-action' : ''}">
        <span class="dot" aria-hidden="true"></span>
        <span class="st-title">${name}</span>
        <span class="st-meta"><span>${slot} · ${time}</span>${meta || ''}</span>
        ${isParent() ? dimaBranch(dima) : ''}
        ${opts.replace ? `<button type="button" class="icon-btn st-action" data-act="replace" data-day="${day}" aria-label="Заменить ужин">${icon('swap')}</button>` : ''}
      </div>`;
    return `
      <header class="s-head">
        <div><h1 class="s-title">Меню</h1><p class="s-sub">Неделя ${D.weekLabel} · утверждена</p></div>
        <div class="s-actions"><button type="button" class="icon-btn" data-act="filters" aria-label="Настроить «не едим»">${icon('filter')}</button></div>
      </header>
      <p class="noteat">Не едим: <b>${D.notEat.join(', ')}</b>. Такие блюда не попадают ни в меню, ни в замены. <button type="button" class="link-btn" data-act="filters">Изменить</button></p>
      ${proposal(ctx)}
      <section class="week" aria-label="Неделя ${D.weekLabel}">
        <div class="week-line"><span class="wl-track" aria-hidden="true"></span>
          ${D.weekDays.map((d, i) => `<button type="button" class="wd ${i === day ? 'sel' : ''} ${i === D.today.dayIndex ? 'today' : ''}" data-act="day" data-day="${i}" aria-pressed="${i === day}" aria-label="${d.name}, ${d.date} октября"><span class="wd-dot" aria-hidden="true"></span><span class="wd-name">${d.short}</span><span class="wd-date">${d.date}</span></button>`).join('')}
        </div>
        <div class="soups">${D.soups.map((s) => `<div class="soup" style="grid-column:${s.from + 1} / ${s.to + 2}"><span class="soup-bar" aria-hidden="true"></span><span class="soup-name">${s.name}</span><span class="soup-days">${daysWord(s.to - s.from + 1)}</span></div>`).join('')}</div>
        <p class="s-caption">Отрезки под днями — супы: одну кастрюлю едим несколько дней.</p>
      </section>
      <section class="dayplan" aria-label="${wd.name}">
        <div class="s-row" style="padding:0 16px"><h2 class="s-h2" style="padding:0">${wd.name}, ${wd.date} октября</h2><button type="button" class="s-link" data-act="day-swap">Заменить день</button></div>
        <div class="rail-wrap menu-rail" data-mode="static" style="--line:var(--family)">
          <span class="r-track" aria-hidden="true"></span>
          ${row('Завтрак', '08:00', m.b)}
          ${soup ? row('Обед', '13:00', soup.name, batchDots(soup.day, soup.of), soup.dima) : ''}
          ${row('Полдник', '16:30', m.s)}
          ${row('Ужин', '19:00', din.name, `<span>${din.min} мин</span>`, din.dima, { replace: true, changed: din.changed })}
        </div>
      </section>
      <div class="week-total">
        <div><b>Продукты на неделю ≈ ${F.rub(t.menuSum)}</b><span>${t.menuCount} ${plural(t.menuCount, ['позиция', 'позиции', 'позиций'])} уже в списке покупок</span></div>
        <button type="button" class="btn-line sm" data-act="tab" data-tab="shop">В покупки ${icon('chev')}</button>
      </div>`;
  }

  function sheet(ctx) {
    const { D, F, state, icon } = ctx;
    const wd = D.weekDays[state.sheet.day];
    const tile = (it) => `
      <div class="tile">
        <button type="button" class="tile-pick" data-act="tile" aria-expanded="false">
          <span class="tile-time" style="--w:${Math.min(100, Math.round((it.min / 60) * 100))}%" aria-hidden="true"><i></i></span>
          <span class="tile-name">${it.name}</span>
          <span class="tile-meta">${it.min} мин · ≈ ${F.rub(it.cost)}</span>
          <span class="tile-dima">${it.dima === 'ok' ? 'Диме подходит' : 'Диме: адаптировать'}</span>
        </button>
        <div class="tile-more">
          <span class="tile-ing">${it.ing.join(', ')}</span>
          <button type="button" class="btn-solid sm" data-act="place" data-id="${it.id}">Поставить на ${wd.acc}</button>
        </div>
      </div>`;
    return `
      <button type="button" class="sheet-backdrop" data-act="sheet-close" aria-label="Закрыть"></button>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
        <span class="handle" aria-hidden="true"></span>
        <header class="sheet-head"><h2 id="sheet-t">Заменить ужин на ${wd.acc}</h2>
          <button type="button" class="icon-btn" data-act="sheet-close" aria-label="Закрыть">${icon('x')}</button></header>
        <p class="sheet-sub">Без грибов и печени: фильтр «не едим» уже применён. Полоска на плитке — время готовки, полная — час.</p>
        ${D.replacements.map((g) => `<h3 class="rail-h">${g.group}</h3><div class="tiles">${g.items.map(tile).join('')}</div>`).join('')}
      </section>`;
  }

  // ---------- Shopping ----------
  function shop(ctx) {
    const { D, F, state, icon, added, shopTotals } = ctx;
    const t = shopTotals();
    const pct = t.total ? Math.round((t.bought / t.total) * 100) : 0;
    const chip = (f, label, n) => `<button type="button" class="chip" data-act="filter" data-f="${f}" aria-pressed="${state.filter === f}">${label} ${n}</button>`;
    const item = (i) => {
      const done = state.shopDone.has(i.id);
      const who = i.from === 'menu' ? '<span>из меню</span>' : `<i style="--c:var(--${i.by})" aria-hidden="true"></i><span>${added(i.by)} ${D.people[i.by].name}</span>`;
      return `<li class="item ${done ? 'done' : ''} ${i.urgent ? 'is-urgent' : ''} ${i.from === 'menu' ? 'is-menu' : 'is-manual'}">
        <button type="button" class="item-btn" data-act="shop-item" data-id="${i.id}" aria-pressed="${done}">
          <span class="cb" aria-hidden="true">${icon('check')}</span>
          <span><span class="it-name">${i.name}${i.urgent ? urgentTag : ''}</span><span class="it-meta">${i.qty} · ${who}</span></span>
          <span class="it-price">${F.rub(i.price)}</span>
        </button></li>`;
    };
    const dept = (d) => {
      const n = d.items.length;
      const dn = d.items.filter((i) => state.shopDone.has(i.id)).length;
      return `<div class="dept ${dn === n ? 'done' : ''}">
        <div class="dept-head"><span class="dot" aria-hidden="true"></span><h3>${d.dept}</h3><span class="dept-count">${dn} из ${n}</span></div>
        <ul class="items">${d.items.map(item).join('')}</ul></div>`;
    };
    return `
      <header class="s-head">
        <div><h1 class="s-title">Покупки</h1><p class="s-sub" id="shop-sub">Маршрут по магазину · отмечено ${t.doneCount} из ${t.count}</p></div>
        <div class="s-actions"><button type="button" class="icon-btn" data-act="add" aria-label="Добавить в список">${icon('plus')}</button></div>
      </header>
      <div class="shop-actions">
        <button type="button" class="btn-solid" data-act="go-shop">${icon('bag')}Иду в магазин</button>
        <button type="button" class="btn-line" data-act="copy">${icon('copy')}Скопировать</button>
      </div>
      <div class="spent">
        <div class="hl" aria-hidden="true"><span class="hl-fill" id="spent-fill" style="transform:scaleX(${pct / 100})"></span></div>
        <p><span>Куплено <b id="spent-bought">${F.rub(t.bought)}</b></span><span>Осталось ≈ <b id="spent-left">${F.rub(t.left)}</b></span></p>
      </div>
      <p class="activity"><i style="--c:var(--mama)" aria-hidden="true"></i>Мама добавила молоко и хлеб · 10 минут назад</p>
      <div class="chips" role="group" aria-label="Фильтр списка">
        ${chip('all', 'Все', t.count)}${chip('urgent', 'Срочно', t.urgent)}${chip('menu', 'Из меню', t.menuCount)}${chip('manual', 'Дописали', t.manual)}
      </div>
      <section class="rail-wrap route" data-mode="at" data-filter="${state.filter}" aria-label="Список по отделам магазина">
        <span class="r-track" aria-hidden="true"></span><span class="r-fill" aria-hidden="true"></span><span class="r-train" aria-hidden="true"></span>
        ${D.shop.map(dept).join('')}
      </section>`;
  }

  // ---------- Board ----------
  function miniLine(pct, color) {
    return `<div class="gl" style="--c:${color}" aria-hidden="true"><div class="gl-in"><span class="gl-track"></span><span class="gl-fill" style="width:${pct}%"></span><span class="gl-train" style="left:${pct}%"></span></div></div>`;
  }

  function board(ctx) {
    const { D, F, state, icon, isParent } = ctx;
    const tabsDef = [['wishes', 'Хотелки'], ['needs', 'Надо купить'], ['goals', 'Цели'], ['requests', 'Просьбы']];
    let panel = '';
    if (state.boardTab === 'wishes') {
      panel = D.wishes.map((w) => {
        const owner = D.people[w.owner];
        const set = state.metoo[w.id];
        const ownerLine = w.owner === state.viewer ? 'Твоя хотелка' : owner.noLogin ? `${owner.name} хочет · ведут родители` : `${owner.name} хочет`;
        const pct = Math.round((w.saved / w.price) * 100);
        const progress = w.saved > 0
          ? `${miniLine(pct, `var(--${w.owner})`)}<span class="b-meta">В копилке ${F.rub(w.saved)} из ${F.rub(w.price)}</span>`
          : '<span class="b-meta">Без копилки</span>';
        const avs = [...set].map((id) => `<span class="mini-av" style="--c:var(--${id})" title="${D.people[id].name}">${D.people[id].initial}</span>`).join('');
        const metoo = w.owner !== state.viewer
          ? `<button type="button" class="react" data-act="metoo" data-id="${w.id}" aria-pressed="${set.has(state.viewer)}">${icon('metoo')}Я тоже</button>` : '';
        const reacts = (avs || metoo) ? `<div class="reacts">${avs ? `<span class="avs" aria-label="Тоже хотят: ${[...set].map((id) => D.people[id].name).join(', ')}">${avs}</span>` : ''}${metoo}</div>` : '';
        const gift = w.gift && isParent()
          ? `<div class="gift">${icon('gift')}<span><b>Берём в подарок</b>: ${D.people[w.gift].name}. ${owner.name} этого не видит.</span></div>` : '';
        return `<article class="b-row"><span class="b-dot" style="--c:var(--${w.owner})" aria-hidden="true"></span>
          <div class="b-title"><h3>${w.title}</h3><span class="b-price">≈ ${F.rub(w.price)}</span></div>
          <div class="b-body"><span class="b-meta">${ownerLine}</span>${progress}${reacts}${gift}</div></article>`;
      }).join('');
    } else if (state.boardTab === 'needs') {
      panel = D.needs.map((n) => `<article class="b-row"><span class="b-dot" style="--c:var(--${n.who})" aria-hidden="true"></span>
        <div class="b-title"><h3>${n.title}</h3><span class="b-price">≈ ${F.rub(n.price)}</span></div>
        <div class="b-body"><span class="b-meta">${D.people[n.who].name} · ${n.note} · ${n.by.startsWith('до') ? n.by : 'к ' + n.by}</span>
        <div><button type="button" class="btn-line sm" data-act="to-shop" data-title="${n.title}">${icon('cart')}В покупки</button></div></div></article>`).join('');
    } else if (state.boardTab === 'goals') {
      const max = Math.max(...D.goals.map((g) => g.target));
      panel = `<p class="scale-note">Линии в одном масштабе: чем длиннее линия, тем больше сумма цели.</p>` + D.goals.map((g) => {
        const next = g.steps.find((s) => !s.done);
        const dn = g.steps.filter((s) => s.done).length;
        const color = g.scope === 'Семья' ? 'var(--family)' : 'var(--son)';
        return `<article class="goal"><div class="b-title"><h3>${g.title}<span class="scope">${g.scope}</span></h3><span class="b-price">${F.rub(g.saved)} из ${F.rub(g.target)}</span></div>
          ${goalLine(g, (g.target / max) * 100, color, F)}
          <p class="next-step">Следующий шаг: <b>${next ? next.t : 'всё готово'}</b> · шагов пройдено ${dn} из ${g.steps.length}</p></article>`;
      }).join('');
    } else {
      const rq = D.requests[state.viewer];
      const row = (q, toMe) => {
        const other = toMe ? q.from : q.to;
        const done = state.reqDone.has(q.id);
        const fresh = q.fresh && !done;
        const sub = toMe ? `просит ${D.people[q.from].name}` : `Попросил ${ACC[q.to]}`;
        let right = '<span class="b-meta">ждём</span>';
        if (toMe) right = done ? '<span class="b-meta">Сделано</span>' : `<button type="button" class="btn-line sm" data-act="req-done" data-id="${q.id}">${icon('check')}Сделано</button>`;
        if (q.cancelled) right = '<span class="b-meta">отменено</span>';
        return `<article class="req ${fresh ? 'fresh' : ''} ${done ? 'done' : ''} ${q.cancelled ? 'cancelled' : ''}"><span class="req-x" style="--c:var(--${other})" aria-hidden="true"></span>
          <div><h3>${q.title}${q.urgent ? urgentTag : ''}</h3><p>${sub} · ${q.when}</p></div>${right}</article>`;
      };
      panel = `<h3 class="req-group">Мне</h3>${rq.toMe.map((q) => row(q, true)).join('')}<h3 class="req-group">От меня</h3>${rq.fromMe.map((q) => row(q, false)).join('')}`;
    }
    return `
      <header class="s-head">
        <div><h1 class="s-title">Доска</h1><p class="s-sub">Видно всей семье</p></div>
        <div class="s-actions"><button type="button" class="icon-btn" data-act="add" aria-label="Добавить на доску">${icon('plus')}</button></div>
      </header>
      <div class="seg" role="tablist" aria-label="Разделы доски">${tabsDef.map(([id, label]) =>
        `<button type="button" role="tab" data-act="board-tab" data-b="${id}" aria-selected="${state.boardTab === id}">${label}</button>`).join('')}</div>
      <div role="tabpanel">${panel}</div>`;
  }

  // ---------- Money ----------
  function ring(ctx) {
    const { D, F } = ctx;
    const { month } = D;
    const cx = 150, cy = 150, r = 112;
    const C = 2 * Math.PI * r;
    const frac = (month.today - 1) / month.days;
    const ang = (day) => ((day - 1) / month.days) * 2 * Math.PI - Math.PI / 2;
    const pt = (day, rad) => [cx + rad * Math.cos(ang(day)), cy + rad * Math.sin(ang(day))];
    const next = D.payments.find((p) => !p.paid && p.day >= month.today);
    const stations = D.payments.map((p) => {
      const [x, y] = pt(p.day, r);
      const [lx, ly] = pt(p.day, r + 26);
      const isNext = next && p === next;
      return `${isNext ? `<circle cx="${x}" cy="${y}" r="15" fill="var(--signal)"/>` : ''}
        <circle cx="${x}" cy="${y}" r="9" fill="${p.paid ? 'var(--ring)' : 'var(--bg)'}" stroke="var(--ring)" stroke-width="4"/>
        <text class="day-l" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${p.day}</text>`;
    }).join('');
    const [tx, ty] = pt(month.today, r);
    const tdeg = (ang(month.today) * 180) / Math.PI + 90;
    const daysLeft = next ? next.day - month.today : 0;
    return `<svg class="ring" viewBox="-10 -10 320 320" role="img" aria-label="Кольцо месяца: оплачено ${D.payments.filter((p) => p.paid).length} платежа из ${D.payments.length}, следующий — ${next ? next.title : 'нет'}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="color-mix(in srgb, var(--ring) 28%, var(--bg))" stroke-width="10"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ring)" stroke-width="10" stroke-dasharray="${frac * C} ${C}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>
      ${stations}
      <g transform="translate(${tx} ${ty}) rotate(${tdeg})"><rect x="-14" y="-9" width="28" height="18" rx="9" fill="var(--ring)" stroke="var(--bg)" stroke-width="3"/></g>
      <text class="c-small" x="${cx}" y="${cy - 34}" text-anchor="middle">Сегодня ${month.today} октября</text>
      <text class="c-big" x="${cx}" y="${cy + 2}" text-anchor="middle">${next ? `через ${daysLeft} ${plural(daysLeft, ['день', 'дня', 'дней'])}` : 'всё оплачено'}</text>
      <text class="c-small" x="${cx}" y="${cy + 28}" text-anchor="middle">${next ? `${next.title} · ${F.rub(next.amount)}` : ''}</text>
    </svg>`;
  }

  function money(ctx) {
    const { D, F, icon } = ctx;
    const total = D.payments.reduce((a, p) => a + p.amount, 0);
    const paid = D.payments.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
    const spent = D.spend.reduce((a, c) => a + c.sum, 0);
    const next = D.payments.find((p) => !p.paid && p.day >= D.month.today);
    const maxCat = Math.max(...D.spend.map((c) => c.sum));
    const maxWho = Math.max(...Object.values(D.spendBy));
    const payRow = (p) => {
      const isNext = p === next;
      const status = p.paid ? 'оплачено' : (p.note && p.note.startsWith('через') ? p.note : `${p.day} октября`);
      return `<div class="pay-row ${p.paid ? 'paid' : ''} ${isNext ? 'next' : ''}">
        <span class="pay-date">${p.day} окт</span>
        <div><div class="pay-title">${p.title}</div>${p.note && !p.note.startsWith('через') ? `<div class="pay-note">платёж ${p.note}</div>` : ''}</div>
        <div><div class="pay-amt">${F.rub(p.amount)}</div><span class="pay-status">${status}</span></div></div>`;
    };
    return `
      <header class="s-head">
        <div><h1 class="s-title">Деньги</h1><p class="s-sub">Октябрь · видят только родители</p></div>
        <div class="s-actions"><button type="button" class="icon-btn" data-act="pay-add" aria-label="Добавить расход">${icon('plus')}</button></div>
      </header>
      <div class="ring-wrap">${ring(ctx)}</div>
      <p class="sum-line">Обязательных за октябрь <b>${F.rub(total)}</b>: оплачено ${F.rub(paid)}, осталось ${F.rub(total - paid)}.</p>
      <section class="s-section"><h2 class="s-h2">Обязательные платежи</h2></section>
      ${D.payments.map(payRow).join('')}
      <section class="s-section">
        <h2 class="s-h2">Расходы за октябрь</h2>
        <p class="s-caption">Пришло <b>${F.rub(D.month.income)}</b> · ушло <b>${F.rub(spent)}</b> · после обязательных останется <b>${F.rub(D.month.income - spent - (total - paid))}</b></p>
      </section>
      ${D.spend.map((c) => `<div class="cat"><div class="cat-top"><span>${c.cat}</span><span>${F.rub(c.sum)}</span></div><div class="cat-note">${c.note}</div><div class="cat-line" style="--w:${(c.sum / maxCat) * 100}%"></div></div>`).join('')}
      <section class="s-section"><h2 class="s-h2">Кто тратил</h2></section>
      ${Object.entries(D.spendBy).map(([id, sum]) => `<div class="cat"><div class="cat-top"><span>${D.people[id].name}</span><span>${F.rub(sum)}</span></div><div class="cat-line" style="--w:${(sum / maxWho) * 100}%;--c:var(--${id})"></div></div>`).join('')}`;
  }

  // ---------- Rail positioning (signature motion) ----------
  function positionRail(wrap, instant) {
    const mode = wrap.dataset.mode;
    const nodes = [...wrap.children].filter((n) => (mode === 'at' ? n.classList.contains('dept') : n.classList.contains('st')));
    if (!nodes.length) return;
    const top = wrap.getBoundingClientRect().top;
    const ys = nodes.map((n) => n.getBoundingClientRect().top - top + STATION_Y);
    const first = ys[0];
    const last = ys[ys.length - 1];
    const track = wrap.querySelector(':scope > .r-track');
    const fill = wrap.querySelector(':scope > .r-fill');
    const train = wrap.querySelector(':scope > .r-train');
    if (instant) wrap.classList.add('no-anim');
    // A Dima branch under the last station needs the trunk to continue to where it leaves.
    const tail = nodes[nodes.length - 1].querySelector('.dima-branch');
    const end = tail ? Math.max(last, tail.getBoundingClientRect().top - top) : last;
    track.style.top = first + 'px';
    track.style.height = (end - first) + 'px';
    if (fill && train) {
      const idx = nodes.findIndex((n) => !n.classList.contains('done'));
      let y;
      if (idx === -1) y = last;
      else if (mode === 'between') y = idx === 0 ? first : (ys[idx - 1] + ys[idx]) / 2;
      else y = ys[idx];
      fill.style.top = first + 'px';
      fill.style.height = (last - first) + 'px';
      fill.style.transform = `scaleY(${last > first ? (y - first) / (last - first) : 0})`;
      train.style.transform = `translateY(${y - TRAIN_H / 2}px)`;
    }
    if (instant) { void wrap.offsetHeight; requestAnimationFrame(() => wrap.classList.remove('no-anim')); }
  }

  function after(app) {
    app.querySelectorAll('.rail-wrap').forEach((w) => positionRail(w, true));
  }

  // In-place updates keep the train animation instead of re-rendering the screen.
  function handle(name, el, ctx) {
    const { state, F, shopTotals } = ctx;
    if (name === 'station') {
      const id = el.dataset.id;
      state.seen.add(id);
      const done = !state.done.has(id);
      if (done) state.done.add(id); else state.done.delete(id);
      el.classList.toggle('done', done);
      el.classList.remove('fresh');
      el.setAttribute('aria-pressed', String(done));
      positionRail(el.closest('.rail-wrap'), false);
      return true;
    }
    if (name === 'shop-item') {
      const id = el.dataset.id;
      const done = !state.shopDone.has(id);
      if (done) state.shopDone.add(id); else state.shopDone.delete(id);
      const li = el.closest('.item');
      li.classList.toggle('done', done);
      el.setAttribute('aria-pressed', String(done));
      const dept = el.closest('.dept');
      const items = [...dept.querySelectorAll('.item')];
      const dn = items.filter((x) => x.classList.contains('done')).length;
      dept.querySelector('.dept-count').textContent = `${dn} из ${items.length}`;
      dept.classList.toggle('done', dn === items.length);
      const t = shopTotals();
      const sub = document.getElementById('shop-sub');
      if (sub) sub.textContent = `Маршрут по магазину · отмечено ${t.doneCount} из ${t.count}`;
      const fill = document.getElementById('spent-fill');
      if (fill) fill.style.transform = `scaleX(${t.total ? t.bought / t.total : 0})`;
      const b = document.getElementById('spent-bought');
      if (b) b.textContent = F.rub(t.bought);
      const l = document.getElementById('spent-left');
      if (l) l.textContent = F.rub(t.left);
      positionRail(el.closest('.rail-wrap'), false);
      return true;
    }
    if (name === 'tile') {
      const tile = el.closest('.tile');
      const wasFocus = tile.classList.contains('focus');
      document.querySelectorAll('.sheet .tile.focus').forEach((x) => { x.classList.remove('focus'); x.querySelector('.tile-pick').setAttribute('aria-expanded', 'false'); });
      document.querySelectorAll('.sheet .tiles.has-focus').forEach((x) => x.classList.remove('has-focus'));
      if (!wasFocus) {
        tile.classList.add('focus');
        el.setAttribute('aria-expanded', 'true');
        tile.closest('.tiles').classList.add('has-focus');
      }
      return true;
    }
    if (name === 'day-swap') {
      ctx.toast('Здесь откроются дни из других шаблонов: «Осенняя», «Быстрая неделя», «Рыбная». Выбранный день встанет целиком.');
      return true;
    }
    return false;
  }

  window.FA_VARIANTS.scheme = {
    screen(tab, ctx) {
      return { home, menu, shop, board, money }[tab](ctx);
    },
    sheet,
    after,
    handle,
    notes: {
      extra: `<h3>Логотип</h3>
        <div class="n-logo">
          <div class="lockup"><svg viewBox="0 0 64 64" width="58" height="58" role="img" aria-label="Знак «Дом из линий»"><g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 30 32 13" stroke="#E42313"/><path d="M32 13 50 30" stroke="#0078C9"/><path d="M14 30v21h16" stroke="#3A9E48"/><path d="M50 30v21H34" stroke="#EE7A1F"/></g><circle cx="32" cy="13" r="4.5" fill="var(--logo-bg)" stroke="#0078C9" stroke-width="3"/><circle cx="14" cy="30" r="4.5" fill="var(--logo-bg)" stroke="#3A9E48" stroke-width="3"/><circle cx="50" cy="30" r="4.5" fill="var(--logo-bg)" stroke="#0078C9" stroke-width="3"/><circle cx="14" cy="51" r="4.5" fill="var(--logo-bg)" stroke="#3A9E48" stroke-width="3"/><circle cx="50" cy="51" r="4.5" fill="var(--logo-bg)" stroke="#EE7A1F" stroke-width="3"/><circle cx="32" cy="36" r="7" fill="none" stroke="var(--logo-ink)" stroke-width="4"/></svg><span>Семейный<br>помощник</span></div>
          <div class="lockup inverse"><svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true"><g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 30 32 13" stroke="#E42313"/><path d="M32 13 50 30" stroke="#0078C9"/><path d="M14 30v21h16" stroke="#3A9E48"/><path d="M50 30v21H34" stroke="#EE7A1F"/></g><circle cx="32" cy="13" r="4.5" fill="var(--logo-bg)" stroke="#0078C9" stroke-width="3"/><circle cx="14" cy="30" r="4.5" fill="var(--logo-bg)" stroke="#3A9E48" stroke-width="3"/><circle cx="50" cy="30" r="4.5" fill="var(--logo-bg)" stroke="#0078C9" stroke-width="3"/><circle cx="14" cy="51" r="4.5" fill="var(--logo-bg)" stroke="#3A9E48" stroke-width="3"/><circle cx="50" cy="51" r="4.5" fill="var(--logo-bg)" stroke="#EE7A1F" stroke-width="3"/><circle cx="32" cy="36" r="7" fill="none" stroke="var(--logo-ink)" stroke-width="4"/></svg><span>Семейный<br>помощник</span></div>
        </div>
        <p class="n-icon-note">Знак — дом из четырёх линий семьи, окно — пересадка. Собран вектором по эскизу ChatGPT, надпись набрана тем же узким шрифтом, что заголовки.</p>
        <h3>Иконка приложения</h3>
        <div class="n-icons">
          <figure><svg viewBox="0 0 64 64" width="60" height="60" role="img" aria-label="Иконка «Дом»" style="--logo-bg:#FFFFFF;--logo-ink:#14161A"><rect x="0.5" y="0.5" width="63" height="63" rx="15" fill="#FFFFFF" stroke="#D9DCE2"/><g transform="translate(5 6) scale(0.84)"><g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 30 32 13" stroke="#E42313"/><path d="M32 13 50 30" stroke="#0078C9"/><path d="M14 30v21h16" stroke="#3A9E48"/><path d="M50 30v21H34" stroke="#EE7A1F"/></g><circle cx="32" cy="13" r="4.5" fill="var(--logo-bg)" stroke="#0078C9" stroke-width="3"/><circle cx="14" cy="30" r="4.5" fill="var(--logo-bg)" stroke="#3A9E48" stroke-width="3"/><circle cx="50" cy="30" r="4.5" fill="var(--logo-bg)" stroke="#0078C9" stroke-width="3"/><circle cx="14" cy="51" r="4.5" fill="var(--logo-bg)" stroke="#3A9E48" stroke-width="3"/><circle cx="50" cy="51" r="4.5" fill="var(--logo-bg)" stroke="#EE7A1F" stroke-width="3"/><circle cx="32" cy="36" r="7" fill="none" stroke="var(--logo-ink)" stroke-width="4"/></g></svg><figcaption>Дом</figcaption></figure>
          <figure><svg viewBox="0 0 64 64" width="60" height="60" role="img" aria-label="Иконка «Узел»"><rect x="0.5" y="0.5" width="63" height="63" rx="15" fill="#FFFFFF" stroke="#D9DCE2"/><g fill="none" stroke-width="6" stroke-linecap="round"><path d="M32 12v14" stroke="#E42313"/><path d="M12 32h14" stroke="#3A9E48"/><path d="M38 32h14" stroke="#0078C9"/><path d="M32 38v14" stroke="#EE7A1F"/></g><circle cx="32" cy="11" r="5" fill="#E42313"/><circle cx="11" cy="32" r="5" fill="#3A9E48"/><circle cx="53" cy="32" r="5" fill="#0078C9"/><circle cx="32" cy="53" r="5" fill="#EE7A1F"/><circle cx="32" cy="32" r="7.5" fill="#FFFFFF" stroke="#14161A" stroke-width="3.5"/></svg><figcaption>Узел</figcaption></figure>
          <figure><svg viewBox="0 0 64 64" width="60" height="60" role="img" aria-label="Иконка «Кольцо»"><rect x="0.5" y="0.5" width="63" height="63" rx="15" fill="#FFFFFF" stroke="#D9DCE2"/><g fill="none" stroke-width="6"><path d="M32 15A17 17 0 0 1 49 32" stroke="#3A9E48"/><path d="M49 32A17 17 0 0 1 32 49" stroke="#0078C9"/><path d="M32 49A17 17 0 0 1 15 32" stroke="#EE7A1F"/><path d="M15 32A17 17 0 0 1 32 15" stroke="#E42313"/></g><circle cx="32" cy="15" r="5" fill="#E42313"/><circle cx="49" cy="32" r="5" fill="#3A9E48"/><circle cx="32" cy="49" r="5" fill="#0078C9"/><circle cx="15" cy="32" r="5" fill="#EE7A1F"/></svg><figcaption>Кольцо</figcaption></figure>
        </div>
        <p class="n-icon-note">«Дом» совпадает со знаком логотипа и читается на экране телефона. «Кольцо» спорит с кольцом платежей в Деньгах.</p>
        <div class="n-sheets">
          <figure><img src="img/logo-sheet.jpg" alt="Лист логотипов из ChatGPT" loading="lazy" width="640"><figcaption>Эскизы логотипа из ChatGPT</figcaption></figure>
          <figure><img src="img/icon-sheet.jpg" alt="Лист иконок из ChatGPT" loading="lazy" width="640"><figcaption>Эскизы иконки из ChatGPT</figcaption></figure>
        </div>`,
      title: 'Семейная схема',
      comp: 'img/comp-scheme.jpg',
      thesis: 'У каждого своя линия метро, дела — станции по порядку дня, просьбы — пересадки на линию того, кто просит.',
      pros: [
        'Картинка работает на смысл: суп на три дня — отрезок, цель — линия со станциями-шагами, месяц платежей — кольцевая.',
        'Не детсад и не банк: строгая схема, но цветная и живая.',
        'Список покупок идёт маршрутом по отделам: удобно в магазине одной рукой.',
        'Тёмная тема получается сама: это ночная эмаль.',
      ],
      cons: [
        'Если увлечься, линии превратятся в украшение. Каждая обязана что-то значить.',
        'Нужно привыкнуть к условностям: пересадка — просьба, пунктир — ждёт решения.',
        'Дороже в разработке, чем карточки: линии и вагончик рисуются кодом.',
      ],
      try: [
        'На Главной нажми на станцию: вагончик проедет дальше.',
        'В Меню выбери другой день, потом нажми «Заменить» у ужина и выбери плитку.',
        'В Покупках отмечай товары: когда отдел собран, вагончик едет к следующему.',
        'Переключи «Смотрю как: Сын»: пропадут Деньги и отметка о подарке Диме.',
        'Включи «Ночь»: это бывшая «Ночная схема».',
      ],
    },
  };
})();
