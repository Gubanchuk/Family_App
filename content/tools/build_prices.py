"""Build content/prices.json: a price per gram, ml or piece for every grocery item.

Sources, in order:
  1. Magnit Extra, Krasnodar — magnit.ru search results collected in magnit_krasnodar_<date>.txt
     (columns: item|matching products|min|p25|median|cheapest). The search itself runs in a browser
     with the filters from magnit_search_spec.json.
  2. Rosstat average prices for Krasnodar, then for Russia (rosstat_2026-09.json, mapping rosstat_map.json).

Usage: python -X utf8 -I content/tools/build_prices.py <project root>
"""
import io, json, os, sys

root = sys.argv[1]
tools = os.path.join(root, 'content', 'tools')
vocab = {v['item']: v for v in json.load(io.open(os.path.join(root, 'content', 'ingredients.json'), encoding='utf-8'))}
rosstat = json.load(io.open(os.path.join(tools, 'rosstat_2026-09.json'), encoding='utf-8'))
rmap = json.load(io.open(os.path.join(tools, 'rosstat_map.json'), encoding='utf-8'))
MAGNIT_FILE = 'magnit_krasnodar_2026-10-13.txt'

# Store matches that are a different product than the recipe needs; Rosstat is closer for these.
REJECT = {
    'помидоры': 'в поиске нашлись только солёные и маринованные томаты',
    'имбирь': 'нашёлся только имбирь в сахарной глазури',
    'молоко': 'нашлось только ультрапастеризованное молоко дороже обычного',
    'кефир': 'нашлась одна маленькая упаковка 290 г',
    'свинина': 'нашлась только деликатесная свинина в специях',
    'сыр плавленый': 'нижняя четверть цен — сырный «плавленый продукт», а не плавленый сыр',
}

magnit, searched = {}, set()
for line in io.open(os.path.join(tools, MAGNIT_FILE), encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    item, n, mn, p25, med, cheapest = line.rstrip('\n').split('|')
    searched.add(item)
    if not int(n):
        continue
    n = int(n)
    # Four and more matches: the lower quartile is the everyday product, the median drifts to premium brands.
    value = float(p25) if n >= 4 else float(med)
    magnit[item] = {'perKgOrPiece': value, 'matches': n, 'example': cheapest}

out, missing, rejected = [], [], []
for item, v in sorted(vocab.items()):
    # Water comes from the tap. Spices are priced too: on a shop trip they are added by hand.
    if item == 'вода':
        continue
    per = 1 if v['unit'] == 'шт' else 1000
    row = rmap.get(item, [None])[0]
    def rs(table):
        if not row or row not in table:
            return None
        if row.endswith('10 шт.'):
            return table[row] / 10
        # A per-kg row for a counted product: price of one piece by its weight.
        if v['unit'] == 'шт':
            return table[row] / 1000 * v['pieceWeight'] if v.get('pieceWeight') else None
        return table[row] / 1000
    rk, rr = rs(rosstat['krasnodar']), rs(rosstat['russia'])
    m = magnit.get(item)
    if m and item in REJECT:
        rejected.append(f'{item}: {REJECT[item]}')
        m = None
    if m:
        final, src, note = m['perKgOrPiece'] / per, 'Магнит, Краснодар', f"{m['matches']} подходящих товаров, например «{m['example']}»"
    elif rk:
        final, src, note = rk, 'Росстат, Краснодар', REJECT.get(item, 'в Магните не нашлось подходящего товара' if item in searched else 'в Магните не искали')
    elif rr:
        final, src, note = rr, 'Росстат, РФ', 'нет ни в Магните, ни в краснодарской выборке Росстата'
    else:
        missing.append(item)
        continue
    out.append({'item': item, 'unit': v['unit'], 'pricePerUnit': round(final, 4), 'source': src, 'note': note,
                'rosstatKrasnodar': round(rk, 4) if rk else None})

doc = {
    'collected': '2026-10-13',
    'how': 'Цена за грамм, миллилитр или штуку. Магнит Экстра, Краснодар: поиск на magnit.ru, цена за кг или л по подходящим товарам; при 4 и более товарах — нижняя четверть (ходовой недорогой товар), иначе медиана. Нет в Магните или нашлось не то — средняя цена Росстата по Краснодару за сентябрь 2026, нет и там — по РФ. Цены с акциями, как на сайте в день сбора.',
    'sources': {'magnit': 'https://magnit.ru, Магнит Экстра, Краснодар, ул. им. Дзержинского, 42',
                'rosstat': 'https://rosstat.gov.ru/storage/mediabank/sred_potreb_cen_09-2026.xlsx'},
    'rejectedStoreMatches': rejected,
    'prices': out,
    'withoutPrice': missing,
}
io.open(os.path.join(root, 'content', 'prices.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
by = {}
for o in out:
    by[o['source']] = by.get(o['source'], 0) + 1
print('priced', len(out), by)
print('without price:', ', '.join(missing))
