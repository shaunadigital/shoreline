"""Draw a top-down sketch of the island from src/island-plan.json.

Run from the repository root:  python3 tools/draw-plan.py [out.png]
"""
import json, math, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import distance_transform_edt

plan = json.load(open('src/island-plan.json'))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'island-plan.png'
K = 6                     # pixels per game unit
EXT = 88                  # half-size of the drawn area in game units
MAP = EXT * 2 * K
PANEL = 470
W, H = MAP + PANEL, MAP
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f = lambda s, b=False: ImageFont.truetype(BOLD if b else FONT, s)

def P(x, z): return ((x + EXT) * K, (z + EXT) * K)

def catmull(pts, closed=True, n=24):
    out = []
    m = len(pts)
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        p0, p1, p2, p3 = (pts[(i + j) % m] if closed else pts[max(0, min(m - 1, i + j))] for j in (-1, 0, 1, 2))
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3) for a in (0, 1)))
    if not closed: out.append(tuple(pts[-1]))
    return out

def mask(polys):
    im = Image.new('L', (MAP, MAP), 0); d = ImageDraw.Draw(im)
    for poly in polys: d.polygon([P(*p) for p in catmull(poly)], fill=255)
    return np.array(im) > 0

land = mask([plan['coast']]) & ~mask(list(plan['lagoons'].values()))
water = ~land
d_in = distance_transform_edt(land) / K      # distance to water, in game units, on land
d_out = distance_transform_edt(water) / K    # distance to land, in water

rgb = np.zeros((MAP, MAP, 3), np.float32)
def put(sel, col): rgb[sel] = np.array([int(col[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
deep, shallow = np.array([27, 102, 160], np.float32), np.array([71, 214, 206], np.float32)
t = np.clip(d_out / 14, 0, 1)[..., None]
rgb[:] = shallow * (1 - t) + deep * t
put(water & (d_out < 1.0), '#e9f8f2')              # surf line
put(land, '#f2d29b')                                # sand
grass = land & (d_in > 4.5)
noise = (np.sin(np.arange(MAP)[None, :] * 0.11) * np.cos(np.arange(MAP)[:, None] * 0.09) + 1) * 0.5
g1, g2 = np.array([124, 196, 106], np.float32), np.array([88, 168, 92], np.float32)
rgb[grass] = (g1 * (1 - noise[..., None] * 0.6) + g2 * noise[..., None] * 0.6)[grass]
mapimg = Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).filter(ImageFilter.SMOOTH)
img = Image.new('RGB', (W, H), (250, 246, 236)); img.paste(mapimg, (0, 0))
d = ImageDraw.Draw(img, 'RGBA')

# Dirt paths between zones
for path in plan['paths']:
    pts = [P(*p) for p in catmull(path, closed=False, n=12)]
    d.line(pts, fill=(226, 196, 140, 255), width=int(4.2 * K), joint='curve')
    for p in (pts[0], pts[-1]): d.ellipse([p[0] - 2.1 * K, p[1] - 2.1 * K, p[0] + 2.1 * K, p[1] + 2.1 * K], fill=(226, 196, 140, 255))

# Trees: palms near beaches, flowering trees inland; kept off zones, paths, track and water
random.seed(4)
track_pts = catmull(plan['track']['loop'], n=30)
def near_track(x, z, r): return any((x - a) ** 2 + (z - b) ** 2 < r * r for a, b in track_pts[::2])
def near_path(x, z, r): return any((x - a) ** 2 + (z - b) ** 2 < r * r for path in plan['paths'] for a, b in catmull(path, False, 8))
def in_zone(x, z, pad): return any((x - zz['at'][0]) ** 2 + (z - zz['at'][1]) ** 2 < (zz['r'] + pad) ** 2 for zz in plan['zones'])
trees = []
for _ in range(2600):
    x, z = random.uniform(-EXT, EXT), random.uniform(-EXT, EXT)
    px, pz = int((x + EXT) * K), int((z + EXT) * K)
    if not (0 <= px < MAP and 0 <= pz < MAP) or not land[pz, px] or d_in[pz, px] < 2.2: continue
    if in_zone(x, z, 1.5) or near_track(x, z, plan['track']['width'] / 2 + 3) or near_path(x, z, 3.2): continue
    if any((x - a) ** 2 + (z - b) ** 2 < 3.4 ** 2 for a, b, _ in trees): continue
    if random.random() < (0.55 if d_in[pz, px] < 9 else 0.3): trees.append((x, z, d_in[pz, px]))
for x, z, dist in trees:
    cx, cy = P(x, z)
    r = random.uniform(1.4, 2.0) * K
    if dist < 9: col = random.choice([(63, 174, 90), (76, 191, 98), (47, 154, 82)])           # palms by the beach
    else: col = random.choice([(63, 174, 90), (47, 154, 82), (63, 174, 90), (255, 122, 89), (186, 120, 220), (255, 214, 120)])  # flowering inland
    d.ellipse([cx - r + 2, cy - r + 3, cx + r + 2, cy + r + 3], fill=(20, 60, 40, 70))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (255,))

# Race track: curbs, asphalt, centre dashes, start line
tw = plan['track']['width']
loop = catmull(plan['track']['loop'], n=40) 
pts = [P(*p) for p in loop] + [P(*loop[0])]
def stamp(r, colfn):
    for i, (x, y) in enumerate(pts):
        c = colfn(i); d.ellipse([x - r, y - r, x + r, y + r], fill=c)
# curbs: alternating red and white blocks, then the asphalt on top
stamp((tw + 1.7) * K / 2, lambda i: (232, 72, 60, 255) if (i // 5) % 2 else (250, 246, 236, 255))
stamp(tw * K / 2, lambda i: (52, 58, 66, 255))
for i in range(0, len(pts) - 1, 6): d.line([pts[i], pts[i + 1]], fill=(240, 236, 220, 200), width=max(2, K // 3))
sx, sz = plan['track']['startLine']
for k in range(-3, 3):
    for j in range(2):
        x0, y0 = P(sx - tw / 2 + (k + 3) * tw / 6, sz + j * 1.2 - 1.2)
        d.rectangle([x0, y0, x0 + tw / 6 * K, y0 + 1.2 * K], fill=(255, 255, 255, 255) if (k + j) % 2 else (20, 20, 20, 255))

# Bridges (the pier model reused): planks across the lagoon
for b in plan['bridges']:
    (ax, az), (bx, bz) = b['a'], b['b']
    L = math.hypot(bx - ax, bz - az); ux, uz = (bx - ax) / L, (bz - az) / L; nx, nz = -uz, ux
    w = 3.4
    quad = [P(ax + nx * w, az + nz * w), P(bx + nx * w, bz + nz * w), P(bx - nx * w, bz - nz * w), P(ax - nx * w, az - nz * w)]
    d.polygon(quad, fill=(166, 111, 67, 255))
    for s in np.arange(0, L, 1.6):
        p1, p2 = P(ax + ux * s + nx * w, az + uz * s + nz * w), P(ax + ux * s - nx * w, az + uz * s - nz * w)
        d.line([p1, p2], fill=(130, 84, 50, 255), width=2)

# Pier and the boat's loop
px, pz = plan['markers']['pier']
d.rectangle([*P(px - 2, pz), *P(px + 2, pz + 16)], fill=(166, 111, 67, 255))
bl = plan['markers']['boatLoop']; c = P(*bl['center'])
d.ellipse([c[0] - bl['rx'] * K, c[1] - bl['rz'] * K, c[0] + bl['rx'] * K, c[1] + bl['rz'] * K], outline=(255, 255, 255, 90), width=2)

# Zone markers: white diamonds like the reference, numbered
for i, zz in enumerate(plan['zones'], 1):
    cx, cy = P(*zz['at'])
    d.ellipse([cx - zz['r'] * K, cy - zz['r'] * K, cx + zz['r'] * K, cy + zz['r'] * K], outline=zz['color'] + 'cc', width=4)
    s = 20
    d.polygon([(cx, cy - s - 5), (cx + s + 5, cy), (cx, cy + s + 5), (cx - s - 5, cy)], fill=(34, 30, 38, 255))
    d.polygon([(cx, cy - s), (cx + s, cy), (cx, cy + s), (cx - s, cy)], fill=(255, 255, 255, 255))
    d.text((cx, cy + 1), str(i), font=f(18, True), fill=(34, 30, 38), anchor='mm')
    lab = zz['label']; tb = d.textbbox((0, 0), lab, font=f(17, True))
    lw = tb[2] - tb[0]
    d.rounded_rectangle([cx - lw / 2 - 9, cy + s + 10, cx + lw / 2 + 9, cy + s + 38], 12, fill=(34, 30, 38, 215))
    d.text((cx, cy + s + 24), lab, font=f(17, True), fill=(255, 255, 255), anchor='mm')

# Small labels
def tag(x, z, text):
    cx, cy = P(x, z); tb = d.textbbox((0, 0), text, font=f(14)); lw = tb[2] - tb[0]
    d.rounded_rectangle([cx - lw / 2 - 7, cy - 11, cx + lw / 2 + 7, cy + 11], 10, fill=(255, 255, 255, 210))
    d.text((cx, cy), text, font=f(14), fill=(34, 30, 38), anchor='mm')
for b in plan['bridges']: tag((b['a'][0] + b['b'][0]) / 2 + 10, (b['a'][1] + b['b'][1]) / 2, 'Bridge')
tag(px + 9, pz + 12, 'Pier')
tag(*plan['markers']['golf'], 'Golf')
tag(-6, -80, 'Boat sails around the island')

# Scale bar and compass
x0, y0 = 30, MAP - 40
d.rectangle([x0, y0, x0 + 20 * K, y0 + 8], fill=(255, 255, 255, 230))
d.text((x0, y0 - 18), '20 units ≈ 7 car lengths ≈ 1 s at full speed', font=f(14), fill=(255, 255, 255))
d.text((MAP - 40, 40), 'N', font=f(24, True), fill=(255, 255, 255), anchor='mm')
d.polygon([(MAP - 40, 56), (MAP - 47, 76), (MAP - 33, 76)], fill=(255, 255, 255, 230))

# Side panel: legend
d.rectangle([MAP, 0, W, H], fill=(250, 246, 236, 255))
y = 34
d.text((MAP + 30, y), 'Shoreline: island plan', font=f(28, True), fill=(232, 90, 58)); y += 44
d.text((MAP + 30, y), 'Draft 1 for review. Flat, compact, built for play.', font=f(15), fill=(90, 80, 70)); y += 34
for i, zz in enumerate(plan['zones'], 1):
    d.ellipse([MAP + 30, y - 2, MAP + 56, y + 24], fill=zz['color'])
    d.text((MAP + 43, y + 11), str(i), font=f(14, True), fill=(255, 255, 255) if zz['id'] != 'beach' else (60, 40, 20), anchor='mm')
    d.text((MAP + 68, y), zz['label'], font=f(18, True), fill=(34, 30, 38)); y += 28
    for it in zz['items']:
        d.text((MAP + 72, y), '·  ' + it, font=f(14), fill=(80, 72, 64)); y += 19
    y += 8
y += 2
for col, text in [((52, 58, 66), 'Asphalt race loop with red and white curbs'), ((226, 196, 140), 'Sand paths linking the zones'), ((166, 111, 67), 'Wooden bridges and pier'), ((255, 122, 89), 'Flowering trees (orange, purple, gold)'), ((63, 174, 90), 'Palms and green trees')]:
    d.rectangle([MAP + 30, y + 2, MAP + 54, y + 18], fill=col); d.text((MAP + 66, y), text, font=f(15), fill=(60, 52, 46)); y += 24
y += 4
d.text((MAP + 30, y), 'Shells hide along every beach and lagoon shore.', font=f(14), fill=(90, 80, 70)); y += 20
d.text((MAP + 30, y), 'Grass blades and props fill in when it is built.', font=f(14), fill=(90, 80, 70))

img.save(OUT)
print('saved', OUT, img.size)
