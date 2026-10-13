// «Кухонная полка»: everything the family tracks is a glass jar; how full it is shows progress.
window.FA_VARIANTS = window.FA_VARIANTS || {};
(() => {
  const FROM = { papa: 'просит Папа', mama: 'просит Мама', son: 'просит Сын', dima: 'просит Дима' };
  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  // Layer colours of the week jars: one colour per dish kind, a soup keeps its colour across its days.
  const SOUP_C = { 'Борщ': 'var(--j-beet)', 'Щи': 'var(--j-cabbage)', 'Уха': 'var(--j-fish)' };
  const LAYER = { b: 'var(--j-breakfast)', s: 'var(--j-snack)', d: 'var(--j-dinner)' };

  const jar = ({ fill, lid, h, label, fillC, tilt }) => `
    <div class="jar" style="--fill:${Math.max(0, Math.min(100, fill))}%;--lid:${lid};--h:${h}px;${fillC ? `--fill-c:${fillC};` : ''}">
      <span class="jar-lid" aria-hidden="true"></span>
      <span class="jar-body" aria-hidden="true"><span class="jar-fill"></span>${label ? `<span class="jar-tape" style="--tilt:${tilt || -2}deg">${label}</span>` : ''}</span>
    </div>`;

  const tape = (inner, opts = {}) =>
    `<${opts.tag || 'div'} class="tape ${opts.cls || ''}" style="--tilt:${opts.tilt || 0}deg" ${opts.attrs || ''}>${inner}</${opts.tag || 'div'}>`;

  function head(title, sub, ctx, action) {
    const { D, state, icon } = ctx;
    const me = D.people[state.viewer];
    return `<header class="j-head">
      <div><h1>${title}</h1><p>${sub}</p></div>
      <div class="j-head-r">${action || ''}<button type="button" class="j-lid-av" style="--lid:var(--${state.viewer})" data-act="profile" aria-label="Профиль: ${me.name}"><span>${me.initial}</span></button></div>
    </header>`;
  }

  function home(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf } = ctx;
    const day = D.days[state.viewer];
    const reqs = day.filter((s) => s.kind === 'request' || s.kind === 'own-request');
    const soup = soupOf(D.today.dayIndex);
    const din = dinnerOf(D.today.dayIndex);
    const maxT = Math.max(...D.goals.map((g) => g.target));
    const notes = reqs.map((s, i) => {
      const done = state.done.has(s.id);
      const who = s.kind === 'request' ? FROM[s.from] : 'ждёт Папу';
      return tape(`<span class="t-text">${s.title}</span><span class="t-who">${who}${s.urgent ? ' · срочно' : ''}</span>`, {
        tag: 'button', cls: `${s.urgent ? 'urgent' : ''} ${done ? 'peeled' : ''}`, tilt: i % 2 ? 1.2 : -1,
        attrs: `type="button" data-act="station" data-id="${s.id}" aria-pressed="${done}"`,
      });
    }).join('');
    const goals = D.goals.map((g, i) => `<figure class="j-item">
        ${jar({ fill: (g.saved / g.target) * 100, lid: g.scope === 'Семья' ? 'var(--j-ink)' : 'var(--son)', h: Math.round(70 + (g.target / maxT) * 70), label: g.title, fillC: 'var(--j-coin)', tilt: i % 2 ? 2 : -2 })}
        <figcaption><b>${F.rub(g.saved)}</b><span>из ${F.rub(g.target)}</span></figcaption></figure>`).join('');
    const meals = [
      ['Завтрак', D.meals[D.today.dayIndex].b],
      ['Обед', soup ? `${soup.name}, ${soup.day}-й день из ${soup.of}` : ''],
      ['Полдник', D.meals[D.today.dayIndex].s],
      ['Ужин', din.name],
    ];
    const total = D.payments.reduce((a, p) => a + p.amount, 0);
    const paid = D.payments.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
    return `${head('Полка на сегодня', `${D.today.weekday}, ${D.today.date}`, ctx, `<button type="button" class="j-btn-round" data-act="add" aria-label="Добавить">${icon('plus')}</button>`)}
      <section class="j-sec"><h2>Записки</h2><div class="tapes">${notes}</div></section>
      <section class="j-sec"><h2>Копилки семьи</h2><div class="shelf">${goals}</div><p class="j-note">Высота банки — сумма цели, наполнение — сколько уже отложено.</p></section>
      <section class="j-sec"><h2>Сегодня едим</h2><ul class="j-list">${meals.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}</ul></section>
      ${isParent() ? `<section class="j-sec"><h2>Октябрь</h2><div class="j-wide">${jar({ fill: (paid / total) * 100, lid: 'var(--ring)', h: 64, fillC: 'var(--ring)' })}<p>Обязательные платежи: оплачено <b>${F.rub(paid)}</b> из ${F.rub(total)}. Следующий: интернет, 650 ₽ через 3 дня.</p></div></section>` : ''}`;
  }

  function weekJar(i, ctx) {
    const { D, state, dinnerOf, soupOf } = ctx;
    const s = soupOf(i);
    const layers = [
      { c: LAYER.b, t: D.meals[i].b },
      { c: s ? SOUP_C[s.name] : LAYER.s, t: s ? s.name : '' },
      { c: LAYER.s, t: D.meals[i].s },
      { c: LAYER.d, t: dinnerOf(i).name },
    ];
    const sel = i === state.day;
    return `<button type="button" class="wjar ${sel ? 'sel' : ''} ${i === D.today.dayIndex ? 'today' : ''}" data-act="day" data-day="${i}" aria-pressed="${sel}" aria-label="${D.weekDays[i].name}">
      <span class="jar-lid" aria-hidden="true"></span>
      <span class="wjar-body" aria-hidden="true">${layers.map((l) => `<i style="--c:${l.c}"></i>`).join('')}</span>
      <span class="wjar-day">${D.weekDays[i].short}</span><span class="wjar-date">${D.weekDays[i].date}</span>
    </button>`;
  }

  function menu(ctx) {
    const { D, F, state, icon, isParent, dinnerOf, soupOf, shopTotals } = ctx;
    const day = state.day;
    const s = soupOf(day);
    const din = dinnerOf(day);
    const pr = D.proposal;
    const yes = ['mama', 'son', 'papa'].filter((id) => state.votes[id] === 'yes').map((id) => D.people[id].name);
    let actions = '';
    if (state.approved) actions = '<span class="j-note">Утверждено.</span>';
    else {
      if (!state.votes[state.viewer]) actions += `<button type="button" class="j-btn" data-act="vote" data-v="yes">${icon('check')}За</button><button type="button" class="j-btn ghost" data-act="vote" data-v="edit">Есть правки</button>`;
      actions += isParent() ? '<button type="button" class="j-btn solid" data-act="approve">Утвердить</button>' : '<span class="j-note">Утверждают родители</span>';
    }
    const row = (k, v, note, replace) => `<li><span>${k}</span><b>${v}</b>${note && isParent() ? `<small>Диме: ${note}</small>` : ''}${replace ? `<button type="button" class="j-btn ghost sm" data-act="replace-simple">${icon('swap')}Заменить</button>` : ''}</li>`;
    return `${head('Меню', `Неделя ${D.weekLabel} · утверждена`, ctx)}
      <section class="j-sec">
        <div class="week-shelf">${D.weekDays.map((_, i) => weekJar(i, ctx)).join('')}</div>
        <ul class="layer-key" aria-label="Слои банки снизу вверх">
          <li><i style="--c:var(--j-breakfast)"></i>завтрак</li><li><i style="--c:var(--j-beet)"></i><i style="--c:var(--j-cabbage)"></i><i style="--c:var(--j-fish)"></i>суп</li><li><i style="--c:var(--j-snack)"></i>полдник</li><li><i style="--c:var(--j-dinner)"></i>ужин</li>
        </ul>
        <p class="j-note">Одна банка — один день, слои снизу вверх. Суп одного цвета в соседних банках: одну кастрюлю едим несколько дней.</p>
      </section>
      <section class="j-sec"><h2>${D.weekDays[day].name}, ${D.weekDays[day].date} октября</h2>
        <ul class="j-list">
          ${row('Завтрак', D.meals[day].b)}
          ${s ? row('Обед', `${s.name}, ${s.day}-й день из ${s.of}`, s.dima) : ''}
          ${row('Полдник', D.meals[day].s)}
          ${row('Ужин', din.name, din.dima, true)}
        </ul>
        <p class="j-note">Не едим: ${D.notEat.join(', ')}. Продукты на неделю ≈ ${F.rub(shopTotals().menuSum)}.</p>
      </section>
      <section class="j-sec">${tape(`<span class="t-text">${D.people[pr.by].name} предлагает «${pr.title}» на ${pr.forWeek}</span><span class="t-who">${yes.length ? 'за: ' + yes.join(', ') : 'голосов пока нет'}</span>`, { cls: 'wide', tilt: -0.6 })}<div class="j-actions">${actions}</div></section>`;
  }

  function shop(ctx) {
    const { D, F, state, icon, shopTotals } = ctx;
    const t = shopTotals();
    return `${head('Покупки', `Куплено ${t.doneCount} из ${t.count}`, ctx)}
      <section class="j-sec"><div class="j-wide">${jar({ fill: t.total ? (t.bought / t.total) * 100 : 0, lid: `var(--${state.viewer})`, h: 64, fillC: 'var(--j-sage)' })}<p>Куплено на <b>${F.rub(t.bought)}</b>, осталось ≈ ${F.rub(t.left)}.</p></div>
        <div class="j-actions"><button type="button" class="j-btn solid" data-act="go-shop">${icon('bag')}Иду в магазин</button><button type="button" class="j-btn" data-act="copy">${icon('copy')}Скопировать</button></div></section>
      ${D.shop.map((d) => `<section class="j-sec"><h2>${d.dept}</h2><ul class="pantry">${d.items.map((i) => {
        const done = state.shopDone.has(i.id);
        return `<li class="${done ? 'got' : ''}"><button type="button" data-act="shop-item" data-id="${i.id}" aria-pressed="${done}">
          <span class="mini-jar" aria-hidden="true"><i></i></span>
          <span class="p-main"><b>${i.name}</b><small>${i.qty}${i.from === 'menu' ? ' · из меню' : ''}${i.urgent ? ' · срочно' : ''}</small></span>
          <span class="p-price">${F.rub(i.price)}</span></button></li>`;
      }).join('')}</ul></section>`).join('')}`;
  }

  function board(ctx) {
    const { D, F, state, icon, isParent } = ctx;
    const tabsDef = [['wishes', 'Хотелки'], ['needs', 'Надо купить'], ['goals', 'Цели'], ['requests', 'Просьбы']];
    let panel = '';
    if (state.boardTab === 'wishes') {
      panel = `<div class="shelf wrap">${D.wishes.map((w, i) => {
        const set = state.metoo[w.id];
        return `<figure class="j-item">
          ${jar({ fill: (w.saved / w.price) * 100, lid: `var(--${w.owner})`, h: 120, label: w.title, fillC: 'var(--j-coin)', tilt: i % 2 ? 2 : -2 })}
          <figcaption><b>≈ ${F.rub(w.price)}</b><span>${D.people[w.owner].name}${w.saved ? ` · в банке ${F.rub(w.saved)}` : ' · пустая банка'}</span>
          ${w.owner !== state.viewer ? `<button type="button" class="j-btn ghost sm" data-act="metoo" data-id="${w.id}" aria-pressed="${set.has(state.viewer)}">${icon('metoo')}Я тоже · ${set.size}</button>` : `<span>тоже хотят: ${set.size}</span>`}
          ${w.gift && isParent() ? `<span class="j-secret">${icon('gift')}В подарок: ${D.people[w.gift].name}</span>` : ''}</figcaption></figure>`;
      }).join('')}</div>`;
    } else if (state.boardTab === 'needs') {
      panel = `<div class="tapes">${D.needs.map((n, i) => tape(`<span class="t-text">${n.title} · ${D.people[n.who].name}, ${n.note}</span><span class="t-who">≈ ${F.rub(n.price)} · ${n.by.startsWith('до') ? n.by : 'к ' + n.by}</span><button type="button" class="j-btn ghost sm" data-act="to-shop" data-title="${n.title}">${icon('cart')}В покупки</button>`, { tilt: i % 2 ? 0.8 : -0.8 })).join('')}</div>`;
    } else if (state.boardTab === 'goals') {
      const maxT = Math.max(...D.goals.map((g) => g.target));
      panel = `<div class="shelf">${D.goals.map((g, i) => `<figure class="j-item">${jar({ fill: (g.saved / g.target) * 100, lid: g.scope === 'Семья' ? 'var(--j-ink)' : 'var(--son)', h: Math.round(70 + (g.target / maxT) * 90), label: g.title, fillC: 'var(--j-coin)', tilt: i % 2 ? 2 : -2 })}
        <figcaption><b>${F.rub(g.saved)}</b><span>из ${F.rub(g.target)} · ${g.scope.toLowerCase()}</span><span>дальше: ${(g.steps.find((x) => !x.done) || { t: 'готово' }).t.toLowerCase()}</span></figcaption></figure>`).join('')}</div>
        <p class="j-note">Банки в одном масштабе: чем выше банка, тем больше сумма цели.</p>`;
    } else {
      const rq = D.requests[state.viewer];
      panel = `<div class="tapes">${rq.toMe.map((q, i) => {
        const done = state.reqDone.has(q.id);
        return tape(`<span class="t-text">${q.title}</span><span class="t-who">${FROM[q.from]} · ${q.when}</span>${done ? '<span class="t-who">сделано</span>' : `<button type="button" class="j-btn ghost sm" data-act="req-done" data-id="${q.id}">${icon('check')}Сделано</button>`}`,
          { cls: `${q.urgent ? 'urgent' : ''} ${done ? 'peeled' : ''}`, tilt: i % 2 ? 1 : -1 });
      }).join('')}${rq.fromMe.map((q, i) => tape(`<span class="t-text">${q.title}</span><span class="t-who">для: ${D.people[q.to].name} · ${q.cancelled ? 'отменено' : q.when}</span>`, { cls: `mine ${q.cancelled ? 'peeled' : ''}`, tilt: i % 2 ? -0.6 : 0.6 })).join('')}</div>`;
    }
    return `${head('Доска', 'Видно всей семье', ctx, `<button type="button" class="j-btn-round" data-act="add" aria-label="Добавить на доску">${icon('plus')}</button>`)}
      <div class="j-tabs" role="tablist" aria-label="Разделы доски">${tabsDef.map(([id, label]) => `<button type="button" role="tab" data-act="board-tab" data-b="${id}" aria-selected="${state.boardTab === id}">${label}</button>`).join('')}</div>
      <section class="j-sec">${panel}</section>`;
  }

  function money(ctx) {
    const { D, F, icon } = ctx;
    const total = D.payments.reduce((a, p) => a + p.amount, 0);
    const paid = D.payments.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
    const maxC = Math.max(...D.spend.map((c) => c.sum));
    return `${head('Деньги', 'Октябрь · видят только родители', ctx, `<button type="button" class="j-btn-round" data-act="pay-add" aria-label="Добавить расход">${icon('plus')}</button>`)}
      <section class="j-sec"><div class="j-wide">${jar({ fill: (paid / total) * 100, lid: 'var(--ring)', h: 80, fillC: 'var(--ring)' })}<p>Обязательных <b>${F.rub(total)}</b>: оплачено ${F.rub(paid)}, осталось ${F.rub(total - paid)}.</p></div></section>
      <section class="j-sec"><h2>Платежи</h2><ul class="pantry">${D.payments.map((p) => `<li class="${p.paid ? 'got' : ''}"><div class="p-row"><span class="mini-jar ring" aria-hidden="true"><i></i></span><span class="p-main"><b>${p.title}</b><small>${p.day} октября${p.note ? ' · ' + p.note : ''}${p.paid ? ' · оплачено' : ''}</small></span><span class="p-price">${F.rub(p.amount)}</span></div></li>`).join('')}</ul></section>
      <section class="j-sec"><h2>Куда ушли деньги</h2><div class="shelf spend">${D.spend.map((c) => `<figure class="j-item">${jar({ fill: 100, lid: 'var(--ring)', h: Math.round(30 + (c.sum / maxC) * 110), fillC: 'var(--j-sage)' })}<figcaption><b>${F.rub(c.sum)}</b><span>${c.cat}</span></figcaption></figure>`).join('')}</div>
        <p class="j-note">Высота банки — сумма за месяц. Пришло ${F.rub(D.month.income)}.</p></section>`;
  }

  window.FA_VARIANTS.shelf = {
    screen(tab, ctx) { return { home, menu, shop, board, money }[tab](ctx); },
    handle(name, el, ctx) {
      if (name === 'replace-simple') { ctx.toast('Здесь откроются блюда на замену: банка дня перекрасит слой ужина.'); return true; }
      return false;
    },
    notes: {
      title: 'Кухонная полка',
      comp: 'img/comp-shelf.jpg',
      thesis: 'Всё, что семья копит и тратит, — стеклянные банки на полке. Насколько банка полная, настолько дело продвинулось.',
      pros: [
        'Прогресс понятен без цифр: копилка на море заполнена на треть, купленный товар — полная баночка.',
        'Неделя меню — семь банок со слоями: видно, какой суп тянется через три дня.',
        'Домашнее и тёплое, но взрослое: стекло, крышки цветов семьи, подписи на скотче.',
      ],
      cons: [
        'Банки хороши для «сколько накоплено», хуже — для просьб и списков: там это просто записки.',
        'Рисованные банки сложнее сделать красиво во всех размерах.',
        'Тёмной темы нет: кухня дневная.',
      ],
      try: [
        'На Главной нажми записку: она «отклеится».',
        'В Меню переключай банки дней: слои меняются, борщ виден в трёх банках подряд.',
        'В Покупках отмечай товары: баночка слева наполняется, большая банка сверху растёт.',
      ],
    },
  };
})();
