"""Make the small copies of the base recipes' photos the app shows.

Reads content/images.json (from fetch_images.py), downloads each photo, fits it into 640×480 and saves a
JPEG of about 50 KB to content/.images/<recipe id>.jpg. That folder is not committed: the photos belong
to their sites. It is uploaded to the private bucket (family/base/), which only signed-in members read:
  npx supabase storage cp -r content/.images ss:///family/base --experimental --linked
Usage: python -X utf8 -I content/tools/build_images.py <project root>
"""
import io, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
BOX = (640, 480)


def small(job):
    rid, url, out = job
    try:
        data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30).read()
        im = Image.open(io.BytesIO(data)).convert('RGB')
        # Cover the 4:3 frame the cards use: crop the middle, then scale down.
        w, h = im.size
        target = BOX[0] / BOX[1]
        if w / h > target:
            nw = int(h * target); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = int(w / target); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        im.thumbnail(BOX, Image.LANCZOS)
        path = os.path.join(out, f'{rid}.jpg')
        im.save(path, 'JPEG', quality=74, optimize=True, progressive=True)
        return rid, os.path.getsize(path), None
    except Exception as e:  # noqa: BLE001 — report and go on
        return rid, 0, f'{type(e).__name__}: {e}'


def main(root):
    images = json.load(io.open(os.path.join(root, 'content', 'images.json'), encoding='utf-8'))
    out = os.path.join(root, 'content', '.images')
    os.makedirs(out, exist_ok=True)
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(small, [(rid, url, out) for rid, url in images.items()]))
    ok = [r for r in results if not r[2]]
    for rid, _, err in results:
        if err:
            print(f'{rid}: {err}')
    total = sum(size for _, size, _ in ok)
    print(f'{len(ok)} photos, {total // 1024} KB in all, {total // max(1, len(ok)) // 1024} KB each on average -> {out}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
