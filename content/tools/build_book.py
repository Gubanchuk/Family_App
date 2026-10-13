"""Build content/book/book-data.json for the recipe review page from content/*.json.

Usage: python -X utf8 -I content/tools/build_book.py <project root>
"""
import io, json, os, sys

root = sys.argv[1]
c = lambda *p: os.path.join(root, 'content', *p)

vocab = {x['item']: x for x in json.load(io.open(c('ingredients.json'), encoding='utf-8'))}
prices = {p['item']: p['pricePerUnit'] for p in json.load(io.open(c('prices.json'), encoding='utf-8'))['prices']}
PLURAL = {'зубчик': ('зубчик', 'зубчика', 'зубчиков'), 'луковица': ('луковица', 'луковицы', 'луковиц'), 'батон': ('батон', 'батона', 'батонов')}
SECTIONS = {
    'breakfast-snack.json': 'Завтраки, полдники, напитки',
    'soups-salads.json': 'Супы и салаты',
    'mains-poultry-fish.json': 'Птица, рыба, гарниры',
    'mains-meat-veg.json': 'Мясо, фарш, без мяса',
    'extra-weekday.json': 'Будние ужины: рыба, без мяса, целая курица',
    'extra-seasonal.json': 'Сезонное и мясо',
    'discover.json': 'Что покушать',
}


def fmt_qty(i):
    v = vocab.get(i['item'], {})
    if i.get('toTaste') or i.get('qty') is None:
        return 'по вкусу'
    q, unit = i['qty'], v.get('unit', 'г')
    if v.get('pieceWeight') and unit == 'г' and v.get('pieceName'):
        n = q / v['pieceWeight']
        k = round(n)
        if abs(n - k) < 0.15 and k >= 1:
            f = PLURAL.get(v['pieceName'], (v['pieceName'],) * 3)
            return f"{k} {f[0] if k % 10 == 1 and k % 100 != 11 else f[1] if 2 <= k % 10 <= 4 and not 12 <= k % 100 <= 14 else f[2]}"
    if unit == 'г' and q >= 1000:
        return f"{q / 1000:g} кг".replace('.', ',')
    if unit == 'мл' and q >= 1000:
        return f"{q / 1000:g} л".replace('.', ',')
    return f"{q:g} {unit}".replace('.', ',')


recipes = []
for fn, section in SECTIONS.items():
    p = c('recipes', fn)
    if not os.path.exists(p):
        continue
    for r in json.load(io.open(p, encoding='utf-8'))['recipes']:
        cost = w_all = w_priced = 0.0
        ing = []
        for i in r['ingredients']:
            v = vocab.get(i['item'], {})
            ing.append([i['item'][0].upper() + i['item'][1:], fmt_qty(i), bool(v.get('pantry')), i.get('note') or '', bool(i.get('optional'))])
            if v.get('pantry') or i.get('qty') is None:
                continue
            w = i['qty'] * ((v.get('pieceWeight') or 50) if v.get('unit') == 'шт' else 1)
            w_all += w
            if i['item'] in prices:
                cost += i['qty'] * prices[i['item']]
                w_priced += w
        covered = w_all and w_priced / w_all >= 0.85
        recipes.append({
            'id': r['id'], 'section': section, 'cat': r['category'], 'name': r['name'], 'about': r.get('about', ''),
            'meals': r['meals'], 'time': r['time'], 'serv': r['servings'], 'keeps': r.get('keepsDays'),
            'protein': r.get('protein'), 'tags': r.get('tags', []), 'season': r.get('season'), 'col': r.get('collections', []),
            'sides': r.get('sides', []), 'dima': r['dima']['level'], 'dimaNote': r['dima'].get('note', ''),
            'ing': ing, 'steps': r['steps'], 'src': r.get('source'),
            'cost': int(round(cost / 10.0) * 10) if covered and cost else None,
        })

weeks = json.load(io.open(c('weeks.json'), encoding='utf-8')) if os.path.exists(c('weeks.json')) else []
if weeks:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from week_cost import load, cost_week
    _v, _p, _r, _w = load(root)
    for w in weeks:
        w['cost'] = cost_week(w, _v, _p, _r)
out = {
    'built': '2026-10-13',
    'prices': 'Магнит Экстра в Краснодаре (поиск на magnit.ru, 13.10.2026), где товара нет — средние цены Росстата по Краснодару за сентябрь 2026',
    'recipes': recipes,
    'weeks': weeks,
}
os.makedirs(c('book'), exist_ok=True)
io.open(c('book', 'book-data.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print('recipes', len(recipes), 'weeks', len(weeks), 'with cost', sum(1 for r in recipes if r['cost']))
