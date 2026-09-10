"""Post-process Figma exports for the phone screens (pure Python, no PIL).

Two export styles are handled:
- Transparent PNG (Figma "export frame" with transparent corners/margins):
  cropped to its opaque bounding box and used as-is.
- Opaque render on a #1E1E1E backdrop (Figma MCP screenshot): optionally
  cropped, then the backdrop in the rounded-corner arcs is turned transparent.
"""
import struct, sys, zlib

BACKDROP = 0x1E
PAPER = 0xF5

def read_png(path):
    data = open(path, 'rb').read()
    pos, idat = 8, b''
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        typ, body = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + ln]
        if typ == b'IHDR':
            w, h, _, ct = struct.unpack('>IIBB', body[:10])
            assert ct == 6, 'expected RGBA export'
        if typ == b'IDAT': idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat)
    stride, prev, i, rows = w * 4, bytearray(w * 4), 0, []
    for _ in range(h):
        f, cur = raw[i], bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
        for x in range(stride):
            a = cur[x - 4] if x >= 4 else 0; b = prev[x]; c = prev[x - 4] if x >= 4 else 0
            if f == 1: cur[x] = (cur[x] + a) & 255
            elif f == 2: cur[x] = (cur[x] + b) & 255
            elif f == 3: cur[x] = (cur[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                cur[x] = (cur[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = cur; rows.append(cur)
    return w, h, rows

def write_png(path, w, h, rows):
    def chunk(typ, body): return struct.pack('>I', len(body)) + typ + body + struct.pack('>I', zlib.crc32(typ + body) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def light(rows, x, y): return rows[y][x * 4] > 0x80

def has_alpha(rows, w, h):
    return any(rows[y][x * 4 + 3] < 255 for y in range(0, h, 5) for x in range(0, w, 5))

def crop_to_opaque(rows, w, h):
    ys = [y for y in range(h) if any(rows[y][x * 4 + 3] > 0 for x in range(0, w, 4))]
    xs = [x for x in range(w) if any(rows[y][x * 4 + 3] > 0 for y in range(0, h, 4))]
    x0, x1, y0, y1 = xs[0], xs[-1] + 1, ys[0], ys[-1] + 1
    return x1 - x0, y1 - y0, [r[x0 * 4:x1 * 4] for r in rows[y0:y1]]

def process(src, dst, crop, corners):
    w, h, rows = read_png(src)
    if has_alpha(rows, w, h):
        w, h, rows = crop_to_opaque(rows, w, h)
        write_png(dst, w, h, rows)
        print(f'{dst}: {w}x{h}, transparent export cropped to opaque bounds')
        return
    if crop:
        x0, y0, cw, ch = crop
        rows = [r[x0 * 4:(x0 + cw) * 4] for r in rows[y0:y0 + ch]]; w, h = cw, ch
    # radius from the first row: how far the backdrop reaches in from each corner
    top = [x for x in range(w) if light(rows, x, 0)]
    radii = {'tl': top[0], 'tr': w - 1 - top[-1]}
    bottom = [x for x in range(w) if light(rows, x, h - 1)]
    radii.update({'bl': bottom[0], 'br': w - 1 - bottom[-1]})
    changed = 0
    for name in corners:
        R = radii[name]
        if R < 4: continue
        cx = R if name in ('tl', 'bl') else w - 1 - R
        cy = R if name in ('tl', 'tr') else h - 1 - R
        xs = range(0, R + 2) if name in ('tl', 'bl') else range(w - R - 2, w)
        ys = range(0, R + 2) if name in ('tl', 'tr') else range(h - R - 2, h)
        for y in ys:
            row = rows[y]
            for x in xs:
                # only the outer side of the arc
                if (name in ('tl', 'bl') and x > cx) or (name in ('tr', 'br') and x < cx): continue
                if (name in ('tl', 'tr') and y > cy) or (name in ('bl', 'br') and y < cy): continue
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if d < R - 1.5: continue
                lum = row[x * 4]
                alpha = 0 if d > R + 1.5 else max(0, min(255, round((lum - BACKDROP) * 255 / (PAPER - BACKDROP))))
                row[x * 4:x * 4 + 4] = bytes((PAPER, PAPER, PAPER, alpha)); changed += 1
    write_png(dst, w, h, rows)
    print(f'{dst}: {w}x{h}, radii {radii}, {changed} corner pixels made transparent')

if __name__ == '__main__':
    process('public/screens/raw/outer.png', 'public/screens/outer.png', (0, 20, 932, 1356), ('tr', 'br'))
    process('public/screens/raw/inner.png', 'public/screens/inner.png', None, ('tl', 'tr', 'bl', 'br'))
