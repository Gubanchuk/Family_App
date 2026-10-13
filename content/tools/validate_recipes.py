"""Validate content/recipes/*.json against content/SCHEMA.md and summarize."""
import io, json, os, re, sys
from collections import Counter, defaultdict

root = sys.argv[1]
vocab = {x['item']: x for x in json.load(io.open(os.path.join(root, 'content', 'ingredients.json'), encoding='utf-8'))}
SIDES = {'side-grechka', 'side-ris', 'side-pyure', 'side-kartofel-otvarnoy', 'side-kartofel-zapechenny', 'side-makarony',
         'side-bulgur', 'side-perlovka', 'side-kapusta-tushenaya', 'side-ovoshchnoe-ragu', 'side-ovoshchi-zapechenye', 'side-brokkoli'}
CATS = {'breakfast', 'soup', 'main', 'side', 'salad', 'snack', 'dessert', 'drink'}
MEALS = {'breakfast', 'lunch', 'snack', 'dinner'}
PROT = {'poultry', 'red-meat', 'fish', 'egg', 'cottage', 'dairy', 'legume', 'none'}
TAGS = {'быстро', 'будни', 'выходные', 'на 2–3 дня', 'постное', 'бюджетное', 'праздничное', 'духовка', 'мультиварка', 'без плиты', 'детское'}
SEASONS = {'winter', 'spring', 'summer', 'autumn'}
COLS = {'weekend', 'world', 'cafe', 'quick-new', 'sweet', 'kids-cook'}
PREFIX = {'br-', 'sn-', 'dr-', 'ds-', 'sp-', 'sl-', 'mn-', 'side-', 'ex-'}
UNITS = {'г', 'мл', 'шт'}
# Liver only: «запечённый» and «печёные яблоки» are fine.
BANNED = re.compile(r'гриб|шампин|\bпечен[ьи]\b|печёнк|печенк|печёночн', re.I)

issues = defaultdict(list)
recipes = []
new_ing = {}
files = sorted(f for f in os.listdir(os.path.join(root, 'content', 'recipes')) if f.endswith('.json'))
for fn in files:
    try:
        data = json.load(io.open(os.path.join(root, 'content', 'recipes', fn), encoding='utf-8'))
    except Exception as e:
        issues[fn].append(f'JSON: {e}')
        continue
    for n in data.get('newIngredients', []):
        if n['item'] in vocab:
            continue
        prev = new_ing.get(n['item'])
        if prev and (prev['dept'], prev['group'], prev['unit']) != (n.get('dept'), n.get('group'), n.get('unit')):
            issues['newIngredients'].append(f"conflict {n['item']}: {prev['_file']} vs {fn}")
        new_ing.setdefault(n['item'], dict(n, _file=fn))
    for r in data.get('recipes', []):
        r['_file'] = fn
        recipes.append(r)

known = set(vocab) | set(new_ing)
ids = Counter(r.get('id') for r in recipes)
names = Counter(re.sub(r'\W+', ' ', r.get('name', '').lower()).strip() for r in recipes)
for r in recipes:
    rid = r.get('id', '?')
    def bad(msg):
        issues[r['_file']].append(f'{rid}: {msg}')
    if ids[rid] > 1: bad('duplicate id')
    if not any(rid.startswith(p) for p in PREFIX): bad('id prefix')
    for k in ('name', 'about', 'category', 'meals', 'time', 'servings', 'keepsDays', 'protein', 'tags', 'season', 'ingredients', 'steps', 'dima'):
        if k not in r: bad(f'missing {k}')
    if r.get('category') not in CATS: bad(f"category {r.get('category')}")
    if not set(r.get('meals', [])) <= MEALS: bad(f"meals {r.get('meals')}")
    t = r.get('time') or {}
    if not (isinstance(t.get('active'), int) and isinstance(t.get('total'), int) and 0 < t['active'] <= t['total']): bad(f'time {t}')
    if r.get('protein') not in PROT: bad(f"protein {r.get('protein')}")
    if not set(r.get('tags', [])) <= TAGS: bad(f"tags {set(r.get('tags', [])) - TAGS}")
    s = r.get('season')
    if not (s == 'any' or (isinstance(s, list) and set(s) <= SEASONS)): bad(f'season {s}')
    if r.get('category') == 'main' and not set(r.get('sides', [])) <= SIDES: bad(f"sides {set(r.get('sides', [])) - SIDES}")
    if rid.startswith('ex-'):
        if not r.get('collections') or not set(r['collections']) <= COLS: bad(f"collections {r.get('collections')}")
    if len(r.get('about', '')) > 90: bad(f"about too long ({len(r['about'])})")
    if not 2 <= len(r.get('steps', [])) <= 10: bad(f"steps {len(r.get('steps', []))}")
    d = r.get('dima') or {}
    if d.get('level') not in ('ok', 'adapt', 'skip'): bad(f'dima {d}')
    if d.get('level') in ('adapt', 'skip') and not d.get('note'): bad('dima note empty')
    if BANNED.search(r.get('name', '') + ' ' + ' '.join(i.get('item', '') for i in r.get('ingredients', []))): bad('banned ingredient (грибы/печень)')
    for i in r.get('ingredients', []):
        if i.get('item') not in known: bad(f"unknown item {i.get('item')}")
        if i.get('qty') is None and not i.get('toTaste'): bad(f"qty null without toTaste: {i.get('item')}")
        if i.get('qty') is not None and not isinstance(i.get('qty'), (int, float)): bad(f"qty type {i.get('item')}")

no_source = [r['id'] for r in recipes if not r.get('source') and r.get('category') not in ('side', 'drink')]
dup_names = [n for n, c in names.items() if c > 1]

print('files:', files)
print('recipes:', len(recipes))
print('by category:', dict(Counter(r.get('category') for r in recipes)))
print('by file:', dict(Counter(r['_file'] for r in recipes)))
print('protein (mains):', dict(Counter(r.get('protein') for r in recipes if r.get('category') == 'main')))
print('dima:', dict(Counter((r.get('dima') or {}).get('level') for r in recipes)))
print('with source:', sum(1 for r in recipes if r.get('source')), '| missing (excl. sides/drinks):', len(no_source), no_source[:30])
print('duplicate names:', dup_names)
print('new ingredients:', len(new_ing))
for item, n in sorted(new_ing.items()):
    print('  +', item, n.get('unit'), n.get('dept'), n.get('group'), n['_file'])
print('ISSUES:')
for k, v in issues.items():
    print(' ', k, len(v))
    for x in v[:40]:
        print('    -', x)
