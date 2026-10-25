"""Check content/shop-units.json against the product dictionary content/ingredients.json.

Every dictionary item has exactly one entry and no entry is left without an item.
  weight — only for products in grams, positive step in grams;
  pack   — positive size in the product's unit, non-empty name of one pack;
  piece  — positive whole step; a product in grams needs pieceWeight, a product in ml cannot be counted.
Usage: python -X utf8 -I content/tools/check_shop_units.py <project root>
"""
import io, json, os, sys
from collections import Counter

FIELDS = {'weight': {'sell', 'step'}, 'pack': {'sell', 'size', 'pack'}, 'piece': {'sell', 'step'}}

root = sys.argv[1]
problems = []


def no_duplicates(pairs):
    keys = Counter(k for k, _ in pairs)
    problems.extend(f'{k}: записан {n} раза' for k, n in keys.items() if n > 1)
    return dict(pairs)


def positive(x, whole=False):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and x > 0 and (not whole or x == int(x))


vocab = {v['item']: v for v in json.load(io.open(os.path.join(root, 'content', 'ingredients.json'), encoding='utf-8'))}
doc = json.load(io.open(os.path.join(root, 'content', 'shop-units.json'), encoding='utf-8'), object_pairs_hook=no_duplicates)
units = doc.get('items', {})
if not isinstance(doc.get('_doc'), str) or not doc['_doc'].strip():
    problems.append('_doc: нет описания файла')

for item in vocab:
    if item not in units:
        problems.append(f'{item}: нет в shop-units.json')
for item, u in units.items():
    v = vocab.get(item)
    if v is None:
        problems.append(f'{item}: нет в словаре')
        continue
    sell = u.get('sell')
    if sell not in FIELDS:
        problems.append(f'{item}: sell «{sell}», а нужно weight, pack или piece')
        continue
    if set(u) != FIELDS[sell]:
        problems.append(f'{item}: для {sell} нужны поля {sorted(FIELDS[sell])}, а есть {sorted(u)}')
    if sell == 'weight':
        if v['unit'] != 'г':
            problems.append(f'{item}: на вес продаётся только продукт в граммах, а единица «{v["unit"]}»')
        if not positive(u.get('step')):
            problems.append(f'{item}: шаг на вес должен быть больше нуля')
    elif sell == 'pack':
        if not positive(u.get('size')):
            problems.append(f'{item}: размер упаковки должен быть больше нуля')
        if not isinstance(u.get('pack'), str) or not u['pack'].strip():
            problems.append(f'{item}: нет названия упаковки')
    else:
        if not positive(u.get('step'), whole=True):
            problems.append(f'{item}: шаг в штуках — целое число больше нуля')
        if v['unit'] == 'мл':
            problems.append(f'{item}: продукт в мл нельзя считать штуками')
        elif v['unit'] == 'г' and not positive(v.get('pieceWeight')):
            problems.append(f'{item}: поштучно в граммах, но в словаре нет pieceWeight')

counts = Counter(u.get('sell') for u in units.values())
print(f"словарь {len(vocab)}, записей {len(units)}: на вес {counts['weight']}, упаковкой {counts['pack']}, поштучно {counts['piece']}")
if problems:
    print('\n'.join(problems))
    sys.exit(1)
print('OK')
