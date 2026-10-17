"""Find a photo for each base recipe on its source page and check that it opens on its own.

The photo is the image of the page's schema.org Recipe, else its share picture (og:image) — the picture a
messenger shows in a link preview. The app shows it by its address with the source named under the
recipe; nothing is copied. An image counts only if it answers 200 with an image type and no Referer.
Writes content/images.json: {recipe id: image url}. Recipes without a source or a working image are left out.
Usage: python -X utf8 -I content/tools/fetch_images.py <project root>
"""
import io, json, os, re, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from html import unescape

UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'


def get(url, head_only=False):
    # Addresses with Cyrillic letters (some image paths) go out percent-encoded.
    url = urllib.parse.quote(url, safe=':/?&=%#+,;@!$~*()')
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,image/*;q=0.9,*/*;q=0.8'}, method='GET')
    with urllib.request.urlopen(req, timeout=20) as r:
        body = b'' if head_only else r.read(3_000_000)
        return r.status, r.headers.get('Content-Type', ''), body, r.geturl()


def _recipes(node):
    if isinstance(node, list):
        for x in node:
            yield from _recipes(x)
    elif isinstance(node, dict):
        types = node.get('@type')
        if 'Recipe' in (types if isinstance(types, list) else [types]):
            yield node
        for k in ('@graph', 'mainEntity'):
            yield from _recipes(node.get(k))


def _first_url(img):
    if isinstance(img, list):
        img = img[0] if img else None
    if isinstance(img, dict):
        img = img.get('url') or img.get('contentUrl')
    return img if isinstance(img, str) else None


# The recipe's own photo first: share cards (og:image) often carry a banner with text over the dish.
def image_of(html, base):
    for block in re.findall(r'<script[^>]*application/ld\+json[^>]*>([\s\S]*?)</script>', html, re.I):
        try:
            for r in _recipes(json.loads(block.strip())):
                u = _first_url(r.get('image'))
                if u:
                    return urllib.request.urljoin(base, u)
        except ValueError:
            continue
    at = re.search(r'''itemtype=["'][^"']*schema\.org/Recipe''', html, re.I)
    if at:
        m = re.search(r'''<(?:img|meta|link)[^>]*itemprop=["']image["'][^>]*>''', html[at.start():], re.I)
        if m:
            src = re.search(r'''(?:src|content|href)=["']([^"']+)''', m.group(0), re.I)
            if src:
                return urllib.request.urljoin(base, unescape(src.group(1)))
    for pat in (r'''<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)''',
                r'''<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']'''):
        m = re.search(pat, html, re.I)
        if m:
            return urllib.request.urljoin(base, unescape(m.group(1)).strip())
    return None


def find(recipe):
    url = (recipe.get('source') or {}).get('url')
    if not url:
        return recipe['id'], None, 'no source'
    try:
        status, ctype, body, final = get(url)
        charset = (re.search(r'charset=([\w-]+)', ctype) or re.search(rb'charset=["\']?([\w-]+)', body[:3000]) or [None, 'utf-8'])[1]
        charset = charset.decode() if isinstance(charset, bytes) else charset
        img = image_of(body.decode(charset, 'replace'), final)
        # A site's stand-in picture («no_img.jpg») is no photo of the dish.
        if not img or not img.startswith('https://') or re.search(r'no_?img|noimage|placeholder', img, re.I):
            return recipe['id'], None, 'no image on page'
        s, t, _, _ = get(img, head_only=True)
        if s != 200 or not t.startswith('image/'):
            return recipe['id'], None, f'image answers {s} {t}'
        return recipe['id'], urllib.parse.quote(img, safe=':/?&=%#+,;@!$~*()'), 'ok'
    except Exception as e:  # noqa: BLE001 — one failed site must not stop the rest
        return recipe['id'], None, f'error {type(e).__name__}: {e}'


def main(root):
    recipes = []
    for fn in sorted(os.listdir(os.path.join(root, 'content', 'recipes'))):
        if fn.endswith('.json'):
            recipes += json.load(io.open(os.path.join(root, 'content', 'recipes', fn), encoding='utf-8'))['recipes']
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(find, recipes))
    found = {rid: img for rid, img, _ in results if img}
    for rid, img, why in results:
        if not img:
            print(f'{rid}: {why}')
    out = os.path.join(root, 'content', 'images.json')
    io.open(out, 'w', encoding='utf-8').write(json.dumps(dict(sorted(found.items())), ensure_ascii=False, indent=2) + '\n')
    print(f'{len(found)} of {len(recipes)} recipes have a photo -> {out}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
