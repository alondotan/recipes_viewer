#!/usr/bin/env python3
"""Print the raw recipe text behind a URL, without any summarization.

Facebook/Instagram: the post caption from the page's meta tags.
Other sites: schema.org Recipe JSON-LD if present, otherwise the page's visible text.
Usage: fetch_recipe_text.py URL
"""
import html, json, re, subprocess, sys

BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
FB_BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'


def get(url, ua):
    r = subprocess.run(['curl', '-sL', '--max-time', '30', '-A', ua, url], capture_output=True)
    return r.stdout.decode('utf-8', 'replace')


def meta(s, key):
    for pat in (rf'<meta[^>]+(?:property|name)="{key}"[^>]+content="([^"]*)"',
                rf'<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="{key}"'):
        m = re.search(pat, s)
        if m:
            return html.unescape(m.group(1))
    return None


def social(url):
    s = get(url, FB_BOT if 'facebook.com' in url else BROWSER)
    texts = [t for t in (meta(s, 'og:title'), meta(s, 'og:description'), meta(s, 'description')) if t]
    if not texts:
        return f'[no caption found; page length {len(s)}]'
    t = max(texts, key=len)
    # Facebook prefixes "N views · N reactions | "; Instagram prefixes "N likes, N comments - user on date: "
    t = re.sub(r'^.{0,80}?\|\s*', '', t, count=1) if 'facebook.com' in url else t
    return t.strip()


def find_recipes(node):
    if isinstance(node, dict):
        types = node.get('@type')
        types = types if isinstance(types, list) else [types]
        if 'Recipe' in types:
            yield node
        for v in node.values():
            yield from find_recipes(v)
    elif isinstance(node, list):
        for v in node:
            yield from find_recipes(v)


GOOGLEBOT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'
BLOCKED = re.compile(r'Radware Block Page|Just a moment\.\.\.|Attention Required|cf-browser-verification', re.I)


def site(url):
    s = get(url, BROWSER)
    if BLOCKED.search(s[:5000]):  # bot walls often let search crawlers through
        s = get(url, GOOGLEBOT)
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', s, re.S):
        try:
            data = json.loads(block.strip())
        except Exception:
            continue
        for rec in find_recipes(data):
            keep = {k: rec.get(k) for k in ('name', 'author', 'description', 'recipeYield', 'prepTime', 'cookTime',
                                           'totalTime', 'recipeIngredient', 'recipeInstructions', 'recipeCategory') if rec.get(k)}
            return 'JSON-LD Recipe:\n' + json.dumps(keep, ensure_ascii=False, indent=1)
    body = re.sub(r'<(script|style|noscript|svg|header|footer|nav)[^>]*>.*?</\1>', ' ', s, flags=re.S | re.I)
    m = re.search(r'<article[^>]*>(.*?)</article>', body, re.S | re.I)
    body = m.group(1) if m else body
    body = re.sub(r'<br\s*/?>|</(p|li|h\d|div|tr)>', '\n', body, flags=re.I)
    text = html.unescape(re.sub(r'<[^>]+>', ' ', body))
    lines = [re.sub(r'[ \t ]+', ' ', l).strip() for l in text.split('\n')]
    text = '\n'.join(l for l in lines if l)
    title = meta(s, 'og:title') or ''
    return f'PAGE TEXT (title: {title}):\n{text[:15000]}'


if __name__ == '__main__':
    u = sys.argv[1]
    print(social(u) if re.search(r'facebook\.com|instagram\.com', u) else site(u))
