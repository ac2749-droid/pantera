"""Build src/data/usda.json from USDA SR28 (public domain).

Source: USDA ARS Nutrient Data Laboratory, National Nutrient Database for Standard
Reference, Release 28 (ABBREV.txt + FOOD_DES.txt), via the npm package
`fda-nutrient-database`. Values are per 100 g edible portion.

Output row: [id, name, group, kcal, p, c, f, fib, sug, sat, na, k, ca, fe, vc, portions, alias, extras]
extras (trailing zeros dropped): chol, mono, poly, va, vd, ve, vk, b1, b2, b3, b6, fol, b12, cho, mag, ph, zn, cu, mn, se
portions: "grams|label;grams|label"
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'sr28')
OUT = os.path.join(HERE, '..', 'src', 'data', 'usda.json')

def rows(name):
    with open(os.path.join(SRC, name), encoding='latin-1') as fh:
        for line in fh:
            yield [x.strip('~') for x in line.rstrip('\r\n').split('^')]

# ABBREV field positions (SR28 documentation, p. 44)
F = dict(kcal=3, p=4, f=5, c=7, fib=8, sug=9, ca=10, fe=11, k=14, na=15, vc=20, sat=44,
         g1=48, d1=49, g2=50, d2=51)
# Extra nutrients, in the order of EXTRA_NK in src/foods.ts
EXTRA = [47, 45, 46, 33, 41, 40, 43, 21, 22, 23, 25, 29, 31, 30, 12, 13, 16, 17, 18, 19]
EXCLUDE_GROUPS = {'0300', '3500'}  # baby foods, American Indian/Alaska Native foods
EXCLUDE_NAME = re.compile(r'^(USDA Commodity|Infant formula|Oil, industrial|Shortening,? industrial|Fat, .*industrial)|Child formula|Toddler formula', re.I)

FRAC = {'.125': '⅛', '.25': '¼', '.33': '⅓', '.333': '⅓', '.5': '½', '.67': '⅔', '.667': '⅔', '.75': '¾'}

def portion_label(desc):
    s = re.sub(r'\s+', ' ', desc).strip()
    s = re.sub(r',?\s*\(1 NLEA serving\)', '', s, flags=re.I)
    s = re.sub(r'\s*\(yield from[^)]*\)', '', s, flags=re.I)
    s = re.sub(r',\s*$', '', s)
    m = re.match(r'^(\d*)(\.\d+)(\s.*)$', s)
    if m and m.group(2) in FRAC:
        whole = m.group(1)
        s = (whole + ' ' if whole and whole != '0' else '') + FRAC[m.group(2)] + m.group(3)
    s = s.replace(', (', ' (').replace('  ', ' ').strip()
    return s[:40]

KEEP_CAPS = {'USDA', 'KFC', 'BBQ', 'UHT', 'NFS', 'NLEA', 'DHA', 'II', 'III', 'IV', 'TCBY', 'IHOP', 'PB', 'XL', 'MCDONALD\'S'}

def fix_caps(word):
    core = re.sub(r'[^A-Za-z]', '', word)
    if len(core) >= 3 and core.isupper() and word.upper() not in KEEP_CAPS:
        # KELLOGG'S -> Kellogg's, SPAGHETTIOS -> Spaghettios
        return re.sub(r"[A-Za-z]+('[A-Za-z]+)?", lambda m: m.group(0)[0].upper() + m.group(0)[1:].lower(), word)
    return word

def clean_name(n):
    n = re.sub(r'\s*\((Includes|includes|Include)[^)]*\)', '', n)
    n = ' '.join(fix_caps(w) for w in n.split(' '))
    n = re.sub(r"McDONALD'S|Mcdonald's", "McDonald's", n)
    n = re.sub(r'\s+', ' ', n).strip().rstrip(',')
    return n

def num(v):
    try:
        x = float(v)
    except ValueError:
        return 0
    if x == 0:
        return 0
    return float(f'{x:.4g}') if x < 100 else round(x, 1)

def extras_of(r):
    xs = [num(r[i]) for i in EXTRA]
    while xs and xs[-1] == 0:
        xs.pop()
    return xs

des = {r[0]: r for r in rows('FOOD_DES.txt')}
out = []
for r in rows('ABBREV.txt'):
    ndb = r[0]
    d = des.get(ndb)
    if not d:
        continue
    group, name, common = d[1], clean_name(d[2]), d[4]
    if group in EXCLUDE_GROUPS or EXCLUDE_NAME.search(name):
        continue
    if not r[F['kcal']]:
        continue
    portions = []
    for gk, dk in (('g1', 'd1'), ('g2', 'd2')):
        g, desc = r[F[gk]], r[F[dk]]
        try:
            gv = float(g)
        except ValueError:
            continue
        if gv > 0 and desc:
            lab = portion_label(desc)
            if lab and all(lab != p[1] for p in portions):
                portions.append((round(gv, 1), lab))
    alias = ''
    if common and not re.search(r'USDA Commodity|NFSMI|Includes|Recipe No', common, re.I):
        alias = common[:80]
    out.append([
        int(ndb), name, int(group[:2]),
        num(r[F['kcal']]), num(r[F['p']]), num(r[F['c']]), num(r[F['f']]), num(r[F['fib']]),
        num(r[F['sug']]), num(r[F['sat']]), num(r[F['na']]), num(r[F['k']]), num(r[F['ca']]),
        num(r[F['fe']]), num(r[F['vc']]),
        ';'.join(f'{g:g}|{lab}' for g, lab in portions),
        alias,
        extras_of(r),
    ])

with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
print(len(out), 'foods ->', os.path.relpath(OUT), os.path.getsize(OUT) // 1024, 'KB')
