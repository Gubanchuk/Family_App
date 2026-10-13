// Demo data for the mockup. Names are roles, prices are approximate examples.
window.FA_DATA = (() => {
  const people = {
    papa: { id: 'papa', name: 'Папа', initial: 'П', role: 'parent' },
    mama: { id: 'mama', name: 'Мама', initial: 'М', role: 'parent' },
    son: { id: 'son', name: 'Сын', initial: 'С', role: 'child' },
    dima: { id: 'dima', name: 'Дима', initial: 'Д', role: 'child', noLogin: true },
  };

  const today = { weekday: 'Вторник', date: '13 октября', dayIndex: 1, now: '11:40' };

  // Stations of a member's day. kind: meal | request | payment.
  const days = {
    papa: [
      { id: 'p1', kind: 'meal', time: '08:00', title: 'Завтрак', dish: 'Сырники со сметаной', done: true },
      { id: 'p2', kind: 'request', title: 'Помочь Сыну завести аккаунт', from: 'son', fresh: true },
      { id: 'p3', kind: 'meal', time: '13:00', title: 'Обед', dish: 'Борщ', batch: { day: 2, of: 3 } },
      { id: 'p4', kind: 'request', title: 'Купить молоко и хлеб', from: 'mama', urgent: true },
      { id: 'p5', kind: 'meal', time: '16:30', title: 'Полдник', dish: 'Творог с яблоком' },
      { id: 'p6', kind: 'meal', time: '19:00', title: 'Ужин', dish: 'Курица, запечённая с картошкой' },
      { id: 'p7', kind: 'payment', title: 'Интернет и ТВ', amount: 650, due: 'через 3 дня' },
    ],
    son: [
      { id: 's1', kind: 'meal', time: '08:00', title: 'Завтрак', dish: 'Сырники со сметаной', done: true },
      { id: 's2', kind: 'request', title: 'Вынести мусор', from: 'mama', fresh: true },
      { id: 's3', kind: 'meal', time: '13:00', title: 'Обед', dish: 'Борщ', batch: { day: 2, of: 3 } },
      { id: 's4', kind: 'own-request', title: 'Помочь завести аккаунт', to: 'papa', waiting: true },
      { id: 's5', kind: 'meal', time: '16:30', title: 'Полдник', dish: 'Творог с яблоком' },
      { id: 's6', kind: 'meal', time: '19:00', title: 'Ужин', dish: 'Курица, запечённая с картошкой' },
    ],
  };

  const weekLabel = '12–18 октября';
  const weekDays = [
    { short: 'Пн', name: 'Понедельник', acc: 'понедельник', date: 12 },
    { short: 'Вт', name: 'Вторник', acc: 'вторник', date: 13 },
    { short: 'Ср', name: 'Среда', acc: 'среду', date: 14 },
    { short: 'Чт', name: 'Четверг', acc: 'четверг', date: 15 },
    { short: 'Пт', name: 'Пятница', acc: 'пятницу', date: 16 },
    { short: 'Сб', name: 'Суббота', acc: 'субботу', date: 17 },
    { short: 'Вс', name: 'Воскресенье', acc: 'воскресенье', date: 18 },
  ];

  const notEat = ['грибы', 'печень'];

  // Next week: a template proposed by a member, the family votes, a parent approves.
  const proposal = { tpl: 'quick', by: 'son', forWeek: '19–25 октября', votes: { papa: null, mama: 'yes', son: 'yes' } };

  // Shopping list in store-route order. price is approximate, in rubles.
  const shop = [
    { dept: 'Овощи и фрукты', items: [
      { id: 'i1', name: 'Картофель', qty: '3 кг', price: 210, from: 'menu', done: true },
      { id: 'i2', name: 'Свёкла', qty: '1 кг', price: 60, from: 'menu', done: true },
      { id: 'i3', name: 'Морковь', qty: '1 кг', price: 65, from: 'menu', done: true },
      { id: 'i4', name: 'Лук', qty: '1 кг', price: 55, from: 'menu', done: true },
      { id: 'i5', name: 'Яблоки', qty: '1,5 кг', price: 225, from: 'menu', done: true },
      { id: 'i6', name: 'Помидоры', qty: '0,5 кг', price: 160, from: 'menu' },
      { id: 'i7', name: 'Бананы', qty: '1 кг', price: 150, by: 'son' },
    ]},
    { dept: 'Молочное', items: [
      { id: 'i8', name: 'Молоко', qty: '2 л', price: 180, by: 'mama', urgent: true },
      { id: 'i9', name: 'Творог 9%', qty: '800 г', price: 520, from: 'menu' },
      { id: 'i10', name: 'Сметана 20%', qty: '300 г', price: 140, from: 'menu' },
      { id: 'i11', name: 'Кефир', qty: '1 л', price: 105, from: 'menu' },
      { id: 'i12', name: 'Яйца', qty: '20 шт', price: 260, from: 'menu' },
    ]},
    { dept: 'Мясо и рыба', items: [
      { id: 'i13', name: 'Курица целая', qty: '1,8 кг', price: 450, from: 'menu' },
      { id: 'i14', name: 'Фарш говяжий', qty: '800 г', price: 560, from: 'menu' },
      { id: 'i15', name: 'Минтай', qty: '1 кг', price: 380, from: 'menu' },
      { id: 'i16', name: 'Горбуша', qty: '1 кг', price: 690, from: 'menu' },
    ]},
    { dept: 'Бакалея', items: [
      { id: 'i17', name: 'Гречка', qty: '900 г', price: 110, from: 'menu' },
      { id: 'i18', name: 'Рис', qty: '900 г', price: 120, from: 'menu' },
      { id: 'i19', name: 'Макароны', qty: '450 г', price: 80, from: 'menu' },
    ]},
    { dept: 'Хлеб', items: [
      { id: 'i20', name: 'Хлеб чёрный', qty: '1 шт', price: 95, by: 'mama', urgent: true },
      { id: 'i21', name: 'Батон', qty: '1 шт', price: 70, by: 'papa' },
    ]},
    { dept: 'Для дома', items: [
      { id: 'i22', name: 'Средство для посуды', qty: '1 шт', price: 180, by: 'papa' },
      { id: 'i23', name: 'Влажные салфетки для Димы', qty: '2 уп', price: 150, by: 'mama' },
    ]},
  ];

  const wishes = [
    { id: 'w1', owner: 'son', title: 'Велосипед', price: 25000, saved: 8000, metoo: ['papa'], gift: null },
    { id: 'w2', owner: 'mama', title: 'Роллы в пятницу', price: 2800, saved: 0, metoo: ['papa', 'son'] },
    { id: 'w3', owner: 'dima', title: 'Самокат', price: 4500, saved: 0, metoo: [], gift: 'mama' },
    { id: 'w4', owner: 'papa', title: 'Поездка в Казань на выходные', price: 30000, saved: 6000, metoo: ['mama'] },
  ];

  const needs = [
    { id: 'n1', who: 'son', title: 'Зимние ботинки', note: 'размер 37', by: '1 ноября', price: 6000 },
    { id: 'n2', who: 'dima', title: 'Зимний комбинезон', note: 'рост 98', by: '1 ноября', price: 5500 },
    { id: 'n3', who: 'son', title: 'Куртка', note: 'на вырост', by: 'до зимы', price: 7000 },
  ];

  // Goals share one scale: the line length is proportional to the target sum.
  const goals = [
    { id: 'g1', scope: 'Семья', title: 'Море летом', target: 120000, saved: 40000,
      steps: [{ t: 'Выбрать место', done: true }, { t: 'Накопить на билеты' }, { t: 'Забронировать жильё' }, { t: 'Собрать чемоданы' }] },
    { id: 'g2', scope: 'Семья', title: 'Ремонт детской', target: 60000, saved: 15000,
      steps: [{ t: 'Обои', done: true }, { t: 'Кровать на вырост' }, { t: 'Свет' }] },
    { id: 'g3', scope: 'Сын', title: 'Новый велосипед', target: 25000, saved: 8000,
      steps: [{ t: 'Выбрать модель', done: true }, { t: 'Накопить' }, { t: 'Купить' }] },
  ];

  const requests = {
    papa: {
      toMe: [
        { id: 'q1', title: 'Помочь завести аккаунт', from: 'son', when: 'сегодня', fresh: true },
        { id: 'q2', title: 'Купить молоко и хлеб', from: 'mama', when: 'сегодня', urgent: true },
      ],
      fromMe: [
        { id: 'q3', title: 'Забрать посылку с почты', to: 'mama', when: 'до четверга' },
        { id: 'q4', title: 'Выучить стих к пятнице', to: 'son', when: 'до пятницы' },
        { id: 'q6', title: 'Купить билеты в кино', to: 'son', when: 'на субботу', cancelled: true },
      ],
    },
    son: {
      toMe: [
        { id: 'q5', title: 'Вынести мусор', from: 'mama', when: 'сегодня', fresh: true },
        { id: 'q4', title: 'Выучить стих к пятнице', from: 'papa', when: 'до пятницы' },
      ],
      fromMe: [
        { id: 'q1', title: 'Помочь завести аккаунт', to: 'papa', when: 'сегодня' },
      ],
    },
  };

  // Mandatory payments for October; day = day of month.
  const payments = [
    { day: 1, title: 'Аренда квартиры', amount: 45000, paid: true },
    { day: 5, title: 'Рассрочка: стиральная машина', amount: 6200, paid: true, note: '3 из 12' },
    { day: 10, title: 'Коммуналка', amount: 7800, paid: true },
    { day: 16, title: 'Интернет и ТВ', amount: 650, note: 'через 3 дня' },
    { day: 20, title: 'Плавание, Сын', amount: 4500, note: 'через 7 дней' },
    { day: 25, title: 'Рассрочка: телефон', amount: 5300, note: '8 из 12' },
    { day: 28, title: 'Мобильная связь', amount: 1200 },
  ];

  const month = { name: 'октябрь', days: 31, today: 13, income: 185000 };

  const spend = [
    { cat: 'Обязательные', sum: 59000, note: 'аренда, рассрочка, ЖКХ' },
    { cat: 'Продукты', sum: 18400, note: 'Магнит, Пятёрочка, доставка' },
    { cat: 'Дети', sum: 6300, note: 'кружки, одежда' },
    { cat: 'Транспорт', sum: 3900, note: 'бензин, такси' },
    { cat: 'Кафе и доставка', sum: 2800, note: 'роллы' },
    { cat: 'Дом', sum: 1700, note: 'бытовая химия' },
  ];
  const spendBy = { papa: 52300, mama: 39800 };

  // «Что покушать»: ideas on top of the weekly menu. Placeholder set until the recipe base is merged.
  const collections = [
    { id: 'weekend', name: 'Выходной проект' },
    { id: 'world', name: 'Кухни мира' },
    { id: 'cafe', name: 'Как в кафе' },
    { id: 'quick-new', name: 'Быстро и необычно' },
    { id: 'sweet', name: 'Сладкое' },
    { id: 'kids-cook', name: 'Готовим с детьми' },
  ];
  const ideas = [
    { id: 'ex-shakshuka', cat: 'breakfast', name: 'Шакшука', acc: 'шакшуку', col: ['world', 'quick-new'], min: 25, serv: 4, cost: 320, dima: 'adapt', dimaNote: 'без острого перца, желток довести до готовности',
      about: 'Яйца в томатном соусе прямо в сковороде, хлебом макать',
      ing: [['Яйца', '6 шт'], ['Помидоры', '500 г'], ['Перец болгарский', '1 шт'], ['Лук репчатый', '1 шт'], ['Хлеб белый', '1 батон'], ['Паприка, соль', 'есть дома']],
      steps: ['Лук и перец мелко нарезать, потушить 5 минут.', 'Добавить нарезанные помидоры, тушить до густого соуса.', 'Сделать ямки, разбить яйца, накрыть крышкой на 6–8 минут.'] },
    { id: 'ex-pankeyki', cat: 'breakfast', name: 'Панкейки', acc: 'панкейки', col: ['kids-cook', 'sweet'], min: 25, serv: 4, cost: 180, dima: 'ok', dimaNote: '',
      about: 'Толстые пышные блинчики, тесто замешивает сын',
      ing: [['Мука пшеничная', '250 г'], ['Молоко', '300 мл'], ['Яйца', '2 шт'], ['Сахар, разрыхлитель', 'есть дома']],
      steps: ['Смешать яйца, молоко и сахар.', 'Всыпать муку с разрыхлителем, тесто как густая сметана.', 'Печь на сухой сковороде по минуте с каждой стороны.'] },
    { id: 'ex-khachapuri', cat: 'main', name: 'Хачапури по-аджарски', acc: 'хачапури', col: ['weekend', 'world'], min: 90, serv: 4, cost: 520, dima: 'adapt', dimaNote: 'желток пропечь, сыр не солёный',
      about: 'Лодочка из теста с сыром и яйцом посередине',
      ing: [['Мука пшеничная', '400 г'], ['Кефир', '250 мл'], ['Сыр моцарелла', '300 г'], ['Сыр брынза', '200 г'], ['Яйца', '5 шт'], ['Масло сливочное', '50 г']],
      steps: ['Замесить тесто на кефире, дать полежать 20 минут.', 'Раскатать лодочки, заполнить сыром.', 'Печь 15 минут, вбить яйцо и допечь 3 минуты.'] },
    { id: 'ex-pelmeni', cat: 'main', name: 'Пельмени домашние', acc: 'пельмени', col: ['weekend', 'kids-cook'], min: 120, serv: 6, cost: 650, dima: 'ok', dimaNote: 'отварные, без чесночной сметаны',
      about: 'Лепим всей семьёй, лишнее в морозилку',
      ing: [['Мука пшеничная', '500 г'], ['Фарш свино-говяжий', '600 г'], ['Лук репчатый', '2 шт'], ['Яйца', '1 шт']],
      steps: ['Замесить тесто, дать отдохнуть 30 минут.', 'Фарш смешать с луком и водой.', 'Раскатать, вырезать кружки, лепить.', 'Варить 7 минут после всплытия.'] },
    { id: 'ex-lagman', cat: 'soup', name: 'Лагман', acc: 'лагман', col: ['world'], min: 70, serv: 4, cost: 690, dima: 'adapt', dimaNote: 'без острого, мясо мельче',
      about: 'Тянутая лапша с говядиной и овощами в густом бульоне',
      ing: [['Говядина', '500 г'], ['Лапша яичная', '300 г'], ['Перец болгарский', '2 шт'], ['Помидоры', '300 г'], ['Морковь', '1 шт'], ['Лук репчатый', '1 шт']],
      steps: ['Обжарить мясо кусочками, добавить овощи.', 'Залить водой, тушить 40 минут.', 'Сварить лапшу, разложить по тарелкам и залить соусом.'] },
    { id: 'ex-burgery', cat: 'main', name: 'Бургеры домашние', acc: 'бургеры', col: ['cafe'], min: 40, serv: 4, cost: 720, dima: 'adapt', dimaNote: 'котлету запечь, без соуса и огурца',
      about: 'Котлета, сыр, огурчик: как в кафе, а дома дешевле',
      ing: [['Фарш говяжий', '600 г'], ['Булочки для бургеров', '4 шт'], ['Сыр твёрдый', '100 г'], ['Огурцы солёные', '2 шт'], ['Помидоры', '1 шт'], ['Салат листовой', '1 пучок']],
      steps: ['Сформовать 4 котлеты, посолить.', 'Обжарить по 4 минуты с каждой стороны, накрыть сыром.', 'Собрать с овощами в подсушенной булке.'] },
    { id: 'ex-kesadilya', cat: 'main', name: 'Кесадилья с курицей', acc: 'кесадилью', col: ['quick-new', 'cafe'], min: 20, serv: 4, cost: 430, dima: 'ok', dimaNote: '',
      about: 'Лепёшка с курицей и тянущимся сыром за 20 минут',
      ing: [['Тортильи', '4 шт'], ['Куриное филе', '400 г'], ['Сыр твёрдый', '200 г'], ['Перец болгарский', '1 шт']],
      steps: ['Курицу нарезать и обжарить с перцем.', 'Начинку и сыр на половину лепёшки, сложить.', 'Подрумянить на сухой сковороде, нарезать треугольниками.'] },
    { id: 'ex-chakhokhbili', cat: 'main', name: 'Чахохбили', acc: 'чахохбили', col: ['world'], min: 60, serv: 4, cost: 480, dima: 'adapt', dimaNote: 'без острого и чеснока, кусочки мельче',
      about: 'Курица, тушённая в помидорах с зеленью',
      ing: [['Куриные бёдра', '1 кг'], ['Помидоры', '600 г'], ['Лук репчатый', '2 шт'], ['Зелень', '1 пучок']],
      steps: ['Курицу подрумянить без масла.', 'Добавить лук и помидоры, тушить 35 минут.', 'Посыпать зеленью перед подачей.'] },
    { id: 'ex-pizza-lavash', cat: 'main', name: 'Пицца на лаваше', acc: 'пиццу на лаваше', col: ['kids-cook', 'quick-new'], min: 20, serv: 4, cost: 350, dima: 'adapt', dimaNote: 'без колбасы, с курицей',
      about: 'Тонкая пицца за 15 минут, начинку дети собирают сами',
      ing: [['Лаваш', '2 листа'], ['Сыр моцарелла', '200 г'], ['Помидоры', '2 шт'], ['Куриное филе', '200 г'], ['Томатная паста', '2 ст. л.']],
      steps: ['Лаваш смазать томатной пастой.', 'Разложить начинку, посыпать сыром.', 'Запекать 8–10 минут до расплавленного сыра.'] },
    { id: 'ex-blinny-tort', cat: 'dessert', name: 'Блинный торт', acc: 'блинный торт', col: ['sweet', 'weekend'], min: 120, serv: 8, cost: 410, dima: 'adapt', dimaNote: 'сладкое не чаще 2–3 раз в неделю',
      about: 'Двадцать блинов и сметанный крем: на день рождения',
      ing: [['Молоко', '1 л'], ['Мука пшеничная', '300 г'], ['Яйца', '4 шт'], ['Сметана', '600 г'], ['Сахар', '150 г']],
      steps: ['Испечь тонкие блины.', 'Сметану взбить с сахаром.', 'Промазать каждый блин, убрать в холодильник на 2 часа.'] },
    { id: 'ex-boul', cat: 'main', name: 'Боул с курицей и рисом', acc: 'боул с курицей', col: ['cafe'], min: 35, serv: 4, cost: 460, dima: 'ok', dimaNote: 'соус отдельно',
      about: 'Рис, курица, овощи и соус в одной миске',
      ing: [['Рис длиннозёрный', '300 г'], ['Куриное филе', '500 г'], ['Огурцы', '2 шт'], ['Морковь', '1 шт'], ['Кукуруза консервированная', '1 банка']],
      steps: ['Отварить рис.', 'Курицу запечь или обжарить кусочками.', 'Разложить рис, курицу и овощи по мискам.'] },
    { id: 'ex-tortilya', cat: 'breakfast', name: 'Испанская тортилья', acc: 'тортилью', col: ['quick-new', 'world'], min: 35, serv: 4, cost: 260, dima: 'ok', dimaNote: '',
      about: 'Толстый омлет с картошкой, режем как пирог',
      ing: [['Картофель', '600 г'], ['Яйца', '6 шт'], ['Лук репчатый', '1 шт']],
      steps: ['Картофель тонко нарезать и потушить с луком до мягкости.', 'Залить взбитыми яйцами.', 'Готовить под крышкой, перевернуть на тарелку.'] },
  ];

  // Proposals between members: «сделай вот это», on top of the menu or instead of a dish.
  const offers = [
    { id: 'o1', from: 'son', to: 'papa', idea: 'ex-pankeyki', day: 1, meal: 'Полдник', how: 'over' },
    { id: 'o2', from: 'mama', to: 'son', idea: 'ex-pizza-lavash', day: 5, meal: 'Ужин', how: 'instead' },
    { id: 'o3', from: 'papa', to: 'all', idea: 'ex-khachapuri', day: 6, meal: 'Завтрак', how: 'over' },
  ];

  const settings = {
    mealTimes: ['8:00', '13:00', '16:30', '19:00'],
    soupDays: 'на 2–3 дня',
    portions: '4 порции',
    roles: { papa: 'Родитель · владелец семьи', mama: 'Родитель', son: 'Ребёнок · свой вход', dima: 'Ребёнок · без входа, ведут родители' },
  };

  return { people, today, days, weekLabel, weekDays, notEat, proposal,
    shop, wishes, needs, goals, requests, payments, month, spend, spendBy, collections, ideas, offers, settings };
})();

// Formatting helpers shared by variants.
window.FA_FMT = {
  rub: (n) => n.toLocaleString('ru-RU') + ' ₽',
  num: (n) => n.toLocaleString('ru-RU'),
};
