// Mockup shell: state, viewer switch, theme, tab routing, shared actions.
(() => {
  const D = window.FA_DATA;
  const F = window.FA_FMT;
  const VARIANTS = window.FA_VARIANTS;

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('fa-mock.' + key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('fa-mock.' + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
  };

  const initialDone = new Set();
  Object.values(D.days).flat().forEach((s) => { if (s.done) initialDone.add(s.id); });
  const initialShop = new Set();
  D.shop.forEach((d) => d.items.forEach((i) => { if (i.done) initialShop.add(i.id); }));

  const state = {
    variant: 'berry',
    viewer: store.get('viewer', 'papa'),
    tab: store.get('tab', 'home'),
    prevTab: 'home',
    theme: store.get('theme', 'auto'),
    menuPanel: 'week',
    ideaCol: 'all',
    replaceFor: null,
    offerStatus: {},
    myOffers: [],
    offerDraft: { to: 'all', when: 'today', how: 'over' },
    notify: { requests: true, offers: true, votes: true, shop: false, pay: true, quiet: true },
    boardTab: 'wishes',
    day: D.today.dayIndex,
    filter: 'all',
    sheet: null,
    done: initialDone,
    seen: new Set(),
    shopDone: initialShop,
    week: { tpl: 'autumn', slots: JSON.parse(JSON.stringify(D.templates.find((t) => t.id === 'autumn').days)) },
    proposal: { tpl: D.proposal.tpl, by: D.proposal.by },
    votes: Object.assign({}, D.proposal.votes),
    approved: false,
    metoo: Object.fromEntries(D.wishes.map((w) => [w.id, new Set(w.metoo)])),
    reqDone: new Set(),
  };
  if (!D.people[state.viewer] || D.people[state.viewer].noLogin) state.viewer = 'papa';

  const app = document.getElementById('app');
  const device = document.getElementById('device');
  const sheetRoot = document.getElementById('sheet-root');
  const notes = document.getElementById('notes');
  const toastEl = document.getElementById('toast');

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const isParent = () => D.people[state.viewer].role === 'parent';
  const tabs = () => (isParent() ? ['home', 'menu', 'shop', 'board', 'money'] : ['home', 'menu', 'shop', 'board']);
  const TAB = {
    home: { label: 'Главная', icon: 'home' },
    menu: { label: 'Меню', icon: 'menu' },
    shop: { label: 'Покупки', icon: 'cart' },
    board: { label: 'Доска', icon: 'board' },
    money: { label: 'Деньги', icon: 'money' },
  };
  const added = (id) => (id === 'mama' ? 'добавила' : 'добавил');

  // The current week is a copy of a template; any meal or whole day can be swapped.
  const tplOf = (id) => D.templates.find((t) => t.id === id);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const dishName = (id) => (id && D.dishes[id] ? D.dishes[id].n : '');
  const dayOf = (i) => state.week.slots[i];
  const dinnerOf = (i) => { const s = dayOf(i); const d = D.dishes[s.d] || {}; return { id: s.d, name: d.n || '', side: dishName(s.dd), dima: d.dn || '' }; };
  // Soups are cooked in batches: consecutive days with the same soup are one pot.
  const soupOf = (i) => {
    const id = dayOf(i).l;
    if (!id) return null;
    let from = i; while (from > 0 && dayOf(from - 1).l === id) from -= 1;
    let to = i; while (to < 6 && dayOf(to + 1).l === id) to += 1;
    return { id, name: dishName(id), day: i - from + 1, of: to - from + 1, from, to, dima: (D.dishes[id] || {}).dn || '' };
  };
  const mealText = (i, key) => { const s = dayOf(i); return key === 's' ? (s.s ? dishName(s.s) : s.st || '') : dishName(s[key]); };
  const MEAL_KEYS = { b: ['b'], l: ['l', 'ls'], s: ['s', 'st'], d: ['d', 'dd', 'dl'] };
  const MEAL_LABEL = { b: 'Завтрак', l: 'Обед', s: 'Полдник', d: 'Ужин' };
  const onDayText = (i) => (i === D.today.dayIndex ? 'сегодня' : `${i === 1 ? 'во' : 'в'} ${D.weekDays[i].acc}`);
  const shopItems = () => D.shop.flatMap((d) => d.items);
  const shopTotals = () => {
    const items = shopItems();
    const bought = items.filter((i) => state.shopDone.has(i.id)).reduce((a, i) => a + i.price, 0);
    const total = items.reduce((a, i) => a + i.price, 0);
    const menu = items.filter((i) => i.from === 'menu');
    return {
      bought, left: total - bought, total,
      count: items.length, doneCount: items.filter((i) => state.shopDone.has(i.id)).length,
      menuSum: menu.reduce((a, i) => a + i.price, 0), menuCount: menu.length,
      urgent: items.filter((i) => i.urgent).length,
      manual: items.filter((i) => i.from !== 'menu').length,
    };
  };

  // Theme: «День», «Ночь» or as the phone says. The host page may already set data-theme; «auto» restores it.
  const root = document.documentElement;
  const hostTheme = root.dataset.theme || null;
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && darkMq.matches);
  function applyTheme() {
    if (state.theme === 'auto') { if (hostTheme) root.dataset.theme = hostTheme; else delete root.dataset.theme; }
    else root.dataset.theme = state.theme;
  }

  const ctx = { D, F, state, esc, icon, isParent, isDark, added, dinnerOf, soupOf, shopTotals, toast, render, tplOf, dishName, dayOf, mealText };

  function tabbar() {
    const list = tabs();
    return `<nav class="tabbar" style="--tabs:${list.length}" aria-label="Разделы">${list.map((t) =>
      `<button type="button" class="tab" data-act="tab" data-tab="${t}" ${state.tab === t ? 'aria-current="page"' : ''}><span class="ic-wrap">${icon(TAB[t].icon)}</span><span>${TAB[t].label}</span></button>`
    ).join('')}</nav>`;
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function renderNotes() {
    const n = VARIANTS[state.variant].notes;
    notes.innerHTML = `
      <h2>${n.title}</h2>
      <p class="n-thesis">${n.thesis}</p>
      ${n.comp ? `<figure class="n-comp"><img src="${n.comp}" alt="Эталон варианта «${n.title}», нарисованный в ChatGPT" loading="lazy" width="640"><figcaption>Так этот вариант нарисовал ChatGPT. Это картинка-ориентир, живой макет слева.</figcaption></figure>` : ''}
      ${n.news ? `<h3>Что нового</h3><ul>${n.news.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
      <h3>Что потыкать</h3><ul class="n-try">${n.try.map((x) => `<li>${x}</li>`).join('')}</ul>
      ${n.extra || ''}
      <p class="n-foot">Данные демонстрационные: имена ролями, цены и суммы примерные.</p>`;
  }

  function syncChrome() {
    document.querySelectorAll('[data-viewer]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewer === state.viewer)));
  }

  function render(opts = {}) {
    if (!tabs().includes(state.tab) && state.tab !== 'settings') state.tab = 'home';
    const v = VARIANTS[state.variant];
    app.dataset.variant = state.variant;
    device.dataset.variant = state.variant;
    app.style.setProperty('--line', `var(--${state.viewer})`);
    sheetRoot.style.setProperty('--line', `var(--${state.viewer})`);
    app.innerHTML = `<div class="screen">${v.screen(state.tab, ctx)}</div>${tabbar()}`;
    sheetRoot.innerHTML = state.sheet && v.sheet ? v.sheet(ctx) : '';
    if (v.after) v.after(app, ctx);
    if (opts.top) {
      app.scrollTop = 0;
      if (window.matchMedia('(max-width: 599px)').matches) window.scrollTo({ top: 0 });
    }
    syncChrome();
    renderNotes();
  }

  function copyList() {
    const lines = ['Покупки'];
    D.shop.forEach((d) => {
      const left = d.items.filter((i) => !state.shopDone.has(i.id));
      if (!left.length) return;
      lines.push('', d.dept);
      left.forEach((i) => lines.push(`— ${i.name}, ${i.qty}${i.urgent ? ' (срочно)' : ''}`));
    });
    const text = lines.join('\n');
    const done = () => toast('Список скопирован. Вставьте его в приложение доставки.');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => toast('Не получилось скопировать: браузер не дал доступ к буферу.'));
    } else {
      toast('Не получилось скопировать: браузер не дал доступ к буферу.');
    }
  }

  // Shared actions. A variant may handle an action in place first (for animations).
  function act(name, el) {
    const v = VARIANTS[state.variant];
    if (v.handle && v.handle(name, el, ctx)) return;
    switch (name) {
      case 'tab': {
        const go = () => {
          state.tab = el.dataset.tab;
          if (el.dataset.board) state.boardTab = el.dataset.board;
          state.sheet = null;
          store.set('tab', state.tab);
          render({ top: true });
        };
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (el.classList.contains('tile') && document.startViewTransition && !calm) {
          el.style.viewTransitionName = 'k-expand';
          const t = document.startViewTransition(() => {
            go();
            const dest = app.querySelector('.k-head');
            if (dest) dest.style.viewTransitionName = 'k-expand';
          });
          t.finished.finally(() => { const d = app.querySelector('.k-head'); if (d) d.style.viewTransitionName = ''; });
        } else go();
        break;
      }
      case 'board-tab': state.boardTab = el.dataset.b; render(); break;
      case 'day': state.day = Number(el.dataset.day); render(); break;
      case 'station': {
        const id = el.dataset.id;
        state.seen.add(id);
        if (state.done.has(id)) state.done.delete(id); else state.done.add(id);
        render();
        break;
      }
      case 'shop-item': {
        const id = el.dataset.id;
        if (state.shopDone.has(id)) state.shopDone.delete(id); else state.shopDone.add(id);
        render();
        break;
      }
      case 'filter': state.filter = el.dataset.f; render(); break;
      case 'replace':
      case 'slot': {
        const day = el.dataset.day !== undefined ? Number(el.dataset.day) : state.day;
        const other = D.templates.find((t) => t.id !== state.week.tpl).id;
        state.sheet = { kind: 'slot', day, meal: el.dataset.meal || 'd', tab: 'weeks', tpl: other };
        render();
        break;
      }
      case 'slot-tab': state.sheet.tab = el.dataset.t; render(); break;
      case 'slot-tpl': state.sheet.tpl = el.dataset.tpl; render(); break;
      case 'slot-pick': {
        const { day, meal } = state.sheet;
        const slot = state.week.slots[day];
        if (el.dataset.tpl) {
          const src = tplOf(el.dataset.tpl).days[Number(el.dataset.src)];
          MEAL_KEYS[meal].forEach((k) => { slot[k] = src[k] === undefined ? null : src[k]; });
        } else {
          const id = el.dataset.dish;
          if (meal === 's') { slot.s = id; slot.st = null; } else slot[meal] = id;
          if (meal === 'd') { const sides = (D.dishes[id] || {}).sd || []; slot.dd = sides[0] || null; }
        }
        state.sheet = null;
        state.day = day;
        render();
        toast(`${MEAL_LABEL[meal]} ${onDayText(day)}: ${mealText(day, meal).toLowerCase()}. Список покупок пересчитается.`);
        break;
      }
      case 'day-open': {
        const day = Number(el.dataset.day);
        const other = D.templates.find((t) => t.id !== state.week.tpl).id;
        state.sheet = { kind: 'day', day, tpl: other, src: day };
        render();
        break;
      }
      case 'day-tpl': state.sheet.tpl = el.dataset.tpl; render(); break;
      case 'day-src': state.sheet.src = Number(el.dataset.src); render(); break;
      case 'day-apply': {
        const { day, tpl, src } = state.sheet;
        state.week.slots[day] = clone(tplOf(tpl).days[src]);
        state.sheet = null;
        state.day = day;
        render();
        toast(`${D.weekDays[day].name}: меню как ${D.weekDays[src].name.toLowerCase()} в неделе «${tplOf(tpl).name}». Список покупок пересчитается.`);
        break;
      }
      case 'week-open': {
        const mode = el.dataset.mode;
        state.sheet = { kind: 'week', mode, pick: el.dataset.tpl || (mode === 'next' ? state.proposal.tpl : state.week.tpl) };
        render();
        break;
      }
      case 'week-pick': {
        state.sheet.pick = el.dataset.tpl;
        render();
        sheetRoot.querySelector('.week-preview')?.scrollIntoView({ block: 'nearest' });
        break;
      }
      case 'week-apply': {
        const t = tplOf(state.sheet.pick);
        if (state.sheet.mode === 'current') {
          state.week = { tpl: t.id, slots: clone(t.days) };
          toast(`Неделя ${D.weekLabel}: «${t.name}». Список покупок собран заново.`);
        } else {
          state.proposal = { tpl: t.id, by: state.viewer };
          state.votes = { [state.viewer]: 'yes' };
          state.approved = false;
          toast(`Семья получила: ${D.people[state.viewer].name} предлагает «${t.name}» на ${D.proposal.forWeek}. Голосуют в Меню.`);
        }
        state.sheet = null;
        render();
        break;
      }
      case 'replace-cancel': state.replaceFor = null; state.menuPanel = 'week'; render(); break;
      case 'sheet-close': {
        const back = state.sheet && state.sheet.from;
        state.sheet = null;
        render();
        if (back) app.querySelector(`[data-act="idea"][data-id="${back}"]`)?.focus();
        break;
      }
      case 'menu-panel': state.menuPanel = el.dataset.p; if (state.menuPanel === 'week') state.replaceFor = null; render(); break;
      case 'idea-col': state.ideaCol = el.dataset.c; render(); break;
      case 'idea':
        state.sheet = { kind: 'idea', id: el.dataset.id, from: el.dataset.id };
        state.offerDraft = { to: 'all', when: 'today', how: 'over' };
        render();
        sheetRoot.querySelector('.sheet .round-btn')?.focus();
        break;
      case 'pick': {
        // Update in place so the sheet keeps its scroll position.
        state.offerDraft[el.dataset.k] = el.dataset.v;
        el.parentElement.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        break;
      }
      case 'idea-place': {
        const it = D.ideas.find((x) => x.id === el.dataset.id);
        const day = state.replaceFor.day;
        state.week.slots[day].d = it.id;
        state.week.slots[day].dd = null;
        state.replaceFor = null; state.menuPanel = 'week'; state.sheet = null; state.day = day;
        render({ top: true });
        toast(`Ужин ${day === 1 ? 'во' : 'в'} ${D.weekDays[day].acc}: ${it.name.toLowerCase()}. Продукты добавлены в покупки.`);
        break;
      }
      case 'offer-send': {
        const it = D.ideas.find((x) => x.id === el.dataset.id);
        const dr = state.offerDraft;
        const day = dr.when === 'today' ? D.today.dayIndex : dr.when === 'tomorrow' ? D.today.dayIndex + 1 : 5;
        state.myOffers.push({ id: 'm' + state.myOffers.length, from: state.viewer, to: dr.to, idea: it.id, day, meal: 'Ужин', how: dr.how });
        state.sheet = null;
        render();
        const WHO = { all: 'семье', papa: 'Папе', mama: 'Маме', son: 'Сыну' };
        const WHEN = { today: 'сегодня', tomorrow: 'завтра', weekend: 'в выходные' };
        toast(`Предложили ${WHO[dr.to]}: ${it.name.toLowerCase()} ${WHEN[dr.when]}. Кто возьмётся — продукты попадут в покупки.`);
        break;
      }
      case 'idea-cook': {
        const it = D.ideas.find((x) => x.id === el.dataset.id);
        const id = 'm' + state.myOffers.length;
        state.myOffers.push({ id, from: state.viewer, to: state.viewer, idea: it.id, day: D.today.dayIndex, meal: 'Ужин', how: 'over' });
        state.offerStatus[id] = 'taken';
        state.sheet = null;
        render();
        toast(`${it.name} — сегодня поверх меню. Семья увидит, продукты добавлены в покупки.`);
        break;
      }
      case 'offer-take': {
        const o = D.offers.concat(state.myOffers).find((x) => x.id === el.dataset.id);
        state.offerStatus[o.id] = 'taken';
        render();
        toast(`${D.people[o.from].name} увидит, что вы взялись. Продукты для блюда — в покупках.`);
        break;
      }
      case 'offer-later': {
        const o = D.offers.find((x) => x.id === el.dataset.id);
        state.offerStatus[o.id] = 'later';
        render();
        toast(`${D.people[o.from].name} увидит «не в этот день» и сможет предложить другой.`);
        break;
      }
      case 'back': state.tab = state.prevTab || 'home'; render({ top: true }); break;
      case 'theme': {
        state.theme = el.dataset.t;
        store.set('theme', state.theme);
        const go = () => { applyTheme(); render(); };
        if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(go); else go();
        break;
      }
      case 'toggle': {
        const k = el.dataset.k;
        if (k === 'theme-auto') {
          state.theme = state.theme === 'auto' ? (isDark() ? 'dark' : 'light') : 'auto';
          store.set('theme', state.theme);
          applyTheme();
        } else state.notify[k] = !state.notify[k];
        render();
        break;
      }
      case 'set-row': toast(el.dataset.msg); break;
      case 'vote':
        state.votes[state.viewer] = el.dataset.v;
        render();
        toast(el.dataset.v === 'yes' ? 'Голос «за» отправлен семье.' : 'Отметили: есть правки. Напишите, что поменять.');
        break;
      case 'approve':
        state.approved = true;
        render();
        toast(`Неделя «${tplOf(state.proposal.tpl).name}» на ${D.proposal.forWeek} утверждена. Продукты попадут в список в воскресенье.`);
        break;
      case 'go-shop': toast(`Семья получила: «${D.people[state.viewer].name} идёт в магазин». Можно дописать список.`); break;
      case 'copy': copyList(); break;
      case 'metoo': {
        const set = state.metoo[el.dataset.id];
        if (set.has(state.viewer)) set.delete(state.viewer); else set.add(state.viewer);
        render();
        break;
      }
      case 'to-shop': toast(`«${el.dataset.title}» добавлено в покупки, раздел «Одежда и обувь».`); break;
      case 'req-done': state.reqDone.add(el.dataset.id); render(); toast('Готово. Автор просьбы получит уведомление.'); break;
      case 'add': toast('Здесь будет быстрое добавление: дело, просьба, покупка или хотелка.'); break;
      case 'filters': toast('Здесь настраивается «не едим»: продукты и блюда, которые не показываются в меню.'); break;
      case 'pay-add': toast('Здесь будет быстрый ввод: сумма, категория, кто платил.'); break;
      case 'profile': if (state.tab !== 'settings') state.prevTab = state.tab; state.tab = 'settings'; state.sheet = null; render({ top: true }); break;
      default: break;
    }
  }

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && app.contains(el)) act(el.dataset.act, el);
  });
  sheetRoot.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el) act(el.dataset.act, el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.sheet) act('sheet-close', document.body);
  });

  // Search among all dishes in the replace sheet, in place so the field keeps focus.
  sheetRoot.addEventListener('input', (e) => {
    if (!e.target.matches('[data-dish-search]')) return;
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    sheetRoot.querySelectorAll('.opt[data-q]').forEach((o) => { const ok = !q || o.dataset.q.includes(q); o.hidden = !ok; if (ok) shown += 1; });
    const empty = sheetRoot.querySelector('[data-empty]');
    if (empty) empty.hidden = shown > 0;
  });

  // Search in «Что покушать» filters the cards in place so the field keeps focus.
  app.addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    app.querySelectorAll('.idea').forEach((c) => { const ok = !q || c.dataset.q.includes(q); c.hidden = !ok; if (ok) shown += 1; });
    const empty = app.querySelector('[data-empty]');
    if (empty) empty.hidden = shown > 0;
  });

  document.querySelector('.mock-bar').addEventListener('click', (e) => {
    const pb = e.target.closest('[data-viewer]');
    if (pb) { state.viewer = pb.dataset.viewer; state.sheet = null; state.replaceFor = null; store.set('viewer', state.viewer); render({ top: true }); }
  });

  darkMq.addEventListener('change', () => { if (state.theme === 'auto') render(); });
  applyTheme();

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { const v = VARIANTS[state.variant]; if (v.after) v.after(app, ctx, { instant: true }); }, 120);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { const v = VARIANTS[state.variant]; if (v.after) v.after(app, ctx, { instant: true }); });
  }

  render();
})();
