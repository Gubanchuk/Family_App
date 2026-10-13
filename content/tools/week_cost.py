"""Estimate the grocery cost of each week template for the family.

Family portions: two adults and the 11-year-old eat a full portion, the toddler half: 3.5.
A dish costs qty × price × 3.5 / servings. A soup is one pot per batch: the whole recipe once.
Pantry items (oil, sugar, flour for dusting, spices) are counted separately; items without a price are listed.
Usage: python -X utf8 -I content/tools/week_cost.py <project root>
"""
import io, json, os, sys
from collections import defaultdict

FAMILY = 3.5


def load(root):
    c = lambda *p: os.path.join(root, 'content', *p)
    vocab = {v['item']: v for v in json.load(io.open(c('ingredients.json'), encoding='utf-8'))}
    prices = {p['item']: p['pricePerUnit'] for p in json.load(io.open(c('prices.json'), encoding='utf-8'))['prices']}
    recipes = {}
    for fn in sorted(os.listdir(c('recipes'))):
        if fn.endswith('.json'):
            for r in json.load(io.open(c('recipes', fn), encoding='utf-8'))['recipes']:
                recipes[r['id']] = r
    weeks = json.load(io.open(c('weeks.json'), encoding='utf-8'))
    return vocab, prices, recipes, weeks


def cost_week(w, vocab, prices, recipes):
    acc = {'food': 0.0, 'pantry': 0.0, 'by': defaultdict(float)}
    unpriced = defaultdict(float)

    def add(items, factor, where):
        for i in items:
            q = i.get('qty')
            if q is None:
                continue
            v = vocab.get(i['item'], {})
            p = prices.get(i['item'])
            if p is None:
                if not v.get('pantry'):
                    unpriced[i['item']] += q * factor
                continue
            money = q * factor * p
            if v.get('pantry'):
                acc['pantry'] += money
            else:
                acc['food'] += money
                acc['by'][where] += money

    prev_soup = None
    for d in w['days']:
        lunch, dinner = d.get('lunch') or {}, d.get('dinner') or {}
        soup = lunch.get('soup')
        if soup and soup != prev_soup:
            add(recipes[soup]['ingredients'], 1.0, recipes[soup]['name'])
        prev_soup = soup
        snack = d.get('snack')
        if isinstance(snack, dict):
            add(snack.get('items', []), FAMILY, 'Простые полдники')
            snack = None
        for rid in (d.get('breakfast'), snack, lunch.get('salad'), dinner.get('main'), dinner.get('side'), dinner.get('salad')):
            if rid:
                r = recipes[rid]
                add(r['ingredients'], FAMILY / r['servings'], r['name'])
    total = acc['food'] + acc['pantry']
    return {
        'total': round(total), 'food': round(acc['food']), 'pantry': round(acc['pantry']),
        'perDay': round(total / 7), 'perMonth': round(total * 30.4 / 7),
        'top': [[n, round(v)] for n, v in sorted(acc['by'].items(), key=lambda x: -x[1])[:5]],
        'unpriced': {k: round(v) for k, v in sorted(unpriced.items(), key=lambda x: -x[1])},
    }


if __name__ == '__main__':
    vocab, prices, recipes, weeks = load(sys.argv[1])
    rub = lambda n: f'{round(n):,}'.replace(',', ' ')
    for w in weeks:
        r = cost_week(w, vocab, prices, recipes)
        print(f"\n== {w['name']}: ≈ {rub(round(r['total'] / 100) * 100)} ₽ за неделю")
        print(f"   продукты {rub(r['food'])} ₽; кладовка: масло, сахар, мука на обвалку — {rub(r['pantry'])} ₽")
        print(f"   в день ≈ {rub(r['perDay'])} ₽; в месяц ≈ {rub(r['perMonth'] / 1000)} тыс. ₽")
        print('   дороже всего: ' + '; '.join(f'{n} {rub(v)} ₽' for n, v in r['top']))
        if r['unpriced']:
            print('   без цены: ' + ', '.join(f'{k} {v} {vocab.get(k, {}).get("unit", "г")}' for k, v in r['unpriced'].items()))
