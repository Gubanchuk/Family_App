"""Check content/weeks.json against content/BALANCE.md. Usage: check_weeks.py <project root>"""
import io, json, os, re, sys
from collections import Counter, defaultdict

root = sys.argv[1]
vocab = {x['item']: x for x in json.load(io.open(os.path.join(root, 'content', 'ingredients.json'), encoding='utf-8'))}
recipes = {}
rdir = os.path.join(root, 'content', 'recipes')
for fn in sorted(os.listdir(rdir)):
    if not fn.endswith('.json'):
        continue
    data = json.load(io.open(os.path.join(rdir, fn), encoding='utf-8'))
    for n in data.get('newIngredients', []):
        vocab.setdefault(n['item'], n)
    for r in data.get('recipes', []):
        recipes[r['id']] = r

weeks = json.load(io.open(os.path.join(root, 'content', 'weeks.json'), encoding='utf-8'))
# Liver only: «запечённый» and «печёные яблоки» are fine.
BANNED = re.compile(r'гриб|шампин|\bпечен[ьи]\b|печёнк|печенк|печёночн', re.I)
SWEET_SNACK = {'sn-', 'ds-'}


def portion(rid, totals, counts, problems, where, slot):
    r = recipes.get(rid)
    if not r:
        problems.append(f'{where}: нет блюда {rid}')
        return None
    for i in r['ingredients']:
        v = vocab.get(i['item'])
        if not v or i.get('qty') is None:
            continue
        per = i['qty'] / r['servings']
        g = v['group']
        if v['unit'] == 'шт':
            counts[g] += per
            per *= v.get('pieceWeight') or 0
        totals[g] += per
        slot[g] += per
    return r


MEAT_DAY_G = 40   # per person: a soup on chicken broth with meat counts, a spoon of bacon does not
DAIRY_SLOT_G = 30  # per person: porridge on milk or a glass of kefir counts, a spoon of sour cream does not


all_ok = True
for w in weeks:
    totals, counts = defaultdict(float), defaultdict(float)
    problems = []
    fish_meals = legume = sweet = 0
    meat_days = dairy_days = 0
    mains = Counter()
    if len(w['days']) != 7:
        problems.append(f"дней {len(w['days'])}, нужно 7")
    for d_i, d in enumerate(w['days']):
        day = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][d_i] if d_i < 7 else str(d_i)
        day_slots = []
        snack = d.get('snack')
        if isinstance(snack, dict):
            # A simple snack: products per person, no recipe.
            simple = defaultdict(float)
            for it in snack.get('items', []):
                v = vocab.get(it['item'])
                if not v:
                    problems.append(f'{day} полдник: нет продукта {it["item"]}')
                    continue
                per = it['qty']
                if v['unit'] == 'шт':
                    counts[v['group']] += per
                    per *= v.get('pieceWeight') or 0
                totals[v['group']] += per
                simple[v['group']] += per
                if v['group'] in ('sugar', 'sweets'):
                    sweet += 1
            day_slots.append(simple)
            snack = None
        slots = [('завтрак', d.get('breakfast')), ('полдник', snack)]
        lunch, dinner = d.get('lunch') or {}, d.get('dinner') or {}
        slots += [('суп', lunch.get('soup')), ('салат к обеду', lunch.get('salad')),
                  ('ужин', dinner.get('main')), ('гарнир', dinner.get('side')), ('салат к ужину', dinner.get('salad'))]
        for label, rid in slots:
            if not rid:
                continue
            slot = defaultdict(float)
            day_slots.append(slot)
            r = portion(rid, totals, counts, problems, f'{day} {label}', slot)
            if not r:
                continue
            text = r['name'] + ' ' + ' '.join(i['item'] for i in r['ingredients'])
            if BANNED.search(text):
                problems.append(f'{day} {label}: {r["name"]} — грибы или печень')
            if r.get('protein') == 'fish' and label in ('суп', 'ужин'):
                fish_meals += 1 if label == 'ужин' else 0
            if r.get('protein') == 'legume':
                legume += 1
            if r['category'] == 'dessert' or (rid[:3] in SWEET_SNACK and r.get('protein') in ('none',) and any(vocab.get(i['item'], {}).get('group') in ('sugar', 'sweets') for i in r['ingredients'])):
                sweet += 1
        # On a fish day fish stands in for meat, as in kindergarten menus.
        meat = sum(sl['poultry'] + sl['red-meat'] + sl['fish'] for sl in day_slots)
        if meat >= MEAT_DAY_G:
            meat_days += 1
        else:
            problems.append(f'{day}: нет мяса, птицы или рыбы ({round(meat)} г)')
        dairy_slots = sum(1 for sl in day_slots if sl['dairy'] + sl['cottage'] + sl['cheese'] >= DAIRY_SLOT_G)
        if dairy_slots >= 2:
            dairy_days += 1
        else:
            problems.append(f'{day}: молочное только в {dairy_slots} приёме пищи')
        main = recipes.get(dinner.get('main'))
        if main:
            mains[main['id']] += 1
            if d_i < 5 and not ({'будни', 'быстро'} & set(main.get('tags', []))):
                problems.append(f'{day} ужин: {main["name"]} — не будничное ({main["time"]["total"]} мин)')
            side = dinner.get('side')
            if main.get('sides') and not side:
                problems.append(f'{day} ужин: {main["name"]} без гарнира')
            if side and side not in (main.get('sides') or []):
                problems.append(f'{day} ужин: гарнир {side} не из списка блюда')
    # Soup batches count as fish meals once per batch.
    soups = [((d.get('lunch') or {}).get('soup')) for d in w['days']]
    batches = [s for i, s in enumerate(soups) if s and (i == 0 or soups[i - 1] != s)]
    fish_meals += sum(1 for s in batches if recipes.get(s, {}).get('protein') == 'fish')
    for s in set(batches):
        n = soups.count(s)
        if n > 3:
            problems.append(f'суп {s} {n} дней подряд или больше 3 дней')
    for rid, n in mains.items():
        if n > 1:
            problems.append(f'второе {recipes[rid]["name"]} {n} раза')

    veg = totals['veg'] + totals['fruit']
    rows = [
        ('Рыба, раз', fish_meals, '≥ 2', fish_meals >= 2),
        ('Рыба, г', round(totals['fish']), '≥ 400', totals['fish'] >= 400),
        ('Птица к красному мясу', round(totals['poultry'] / totals['red-meat'], 2) if totals['red-meat'] else 'нет красного мяса',
         'от 1,0 до 2,0 (ориентир 1,4)', bool(totals['red-meat']) and 1.0 <= totals['poultry'] / totals['red-meat'] <= 2.0),
        ('Дней с мясом, птицей или рыбой', meat_days, '7', meat_days == 7),
        ('Дней с молочным в двух приёмах', dairy_days, '7', dairy_days == 7),
        ('Овощи и фрукты без картофеля, г', round(veg), '≥ 2800', veg >= 2800),
        ('Яйца, шт', round(counts['egg'], 1), '≥ 3', counts['egg'] >= 3),
        ('Творог, г', round(totals['cottage']), '≥ 200', totals['cottage'] >= 200),
        ('Бобовые блюда (Дима)', legume, '≤ 3', legume <= 3),
        ('Сладкое (Дима)', sweet, '≤ 3', sweet <= 3),
    ]
    print(f"\n== {w['id']} «{w['name']}»")
    for name, val, norm, ok in rows:
        print(f"  {'OK ' if ok else 'НЕТ'} {name}: {val} (норма {norm})")
        if not ok:
            problems.append(f'{name}: {val}, норма {norm}')
    print(f"  справочно: птица {round(totals['poultry'])} г, красное мясо {round(totals['red-meat'])} г, картофель {round(totals['potato'])} г")
    for p in problems:
        print('  !', p)
    all_ok = all_ok and not problems
print('\nИТОГ:', 'все шаблоны проходят' if all_ok else 'есть нарушения')
sys.exit(0 if all_ok else 1)
