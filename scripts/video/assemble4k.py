#!/usr/bin/env python3
"""The 4K / 60 fps edit: voice-over (../video/vo/<voice>) + two whole-tab 4K recordings (../video/clips4k)
+ title cards drawn at 3840×2160 + an original score → ../video/out/allowance-demo-4k.mp4 and .srt.

  python3 scripts/video/assemble4k.py --voice lohi [--preview s03,s04] [--no-mux]

Sections are rendered once and cached in --work, so a long edit can be built across several runs.
Captions are not burned in: upload the .srt to YouTube as closed captions.
"""
import argparse, hashlib, inspect, json, math, os, subprocess, sys, wave
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import score  # noqa: E402

FPS = 60
W, H = 3840, 2160
K = 2.0                      # cards are designed on a 1920×1080 grid and drawn at 2×
INK = (0, 0, 0)
TEXT = (245, 245, 247)
MUTED = (134, 134, 139)
DIM = (82, 82, 86)
ACCENT = (41, 151, 255)
ALLOW = (48, 209, 88)
BLOCK = (255, 69, 58)
SURFACE = (22, 22, 23)
LINE = (52, 52, 56)
GRAD = [(41, 151, 255), (175, 82, 222), (255, 55, 95)]   # the landing page's "allowance," gradient

ap = argparse.ArgumentParser()
ap.add_argument('--voice', required=True)
ap.add_argument('--repo', default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ap.add_argument('--video', default=None)
ap.add_argument('--work', default='/tmp/allowance-4k')
ap.add_argument('--preview', default='')
ap.add_argument('--no-mux', action='store_true')
args = ap.parse_args()
REPO = args.repo
VIDEO = args.video or os.path.join(os.path.dirname(REPO), 'video')
WORK = args.work
OUT = os.path.join(VIDEO, 'out')
for d in (WORK, OUT):
    os.makedirs(d, exist_ok=True)
FONT_DIR = os.path.join(REPO, 'node_modules/geist/dist/fonts/geist-sans')
MONO_DIR = os.path.join(REPO, 'node_modules/geist/dist/fonts/geist-mono')

def run(cmd, inp=None):
    r = subprocess.run(cmd, capture_output=True, text=inp is None, input=inp)
    if r.returncode != 0:
        sys.stderr.write(' '.join(map(str, cmd))[:600] + '\n' + (r.stderr if isinstance(r.stderr, str) else r.stderr.decode(errors='replace'))[-2500:])
        raise SystemExit(1)
    return r.stdout

ENC = ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', str(FPS), '-g', '120', '-bf', '2']

# --------------------------------------------------------------------------------------------- voice-over timeline
script = json.load(open(os.path.join(REPO, 'scripts/video/script.json')))
vo_dir = os.path.join(VIDEO, 'vo', args.voice)
TRIM = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,'
        'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse')

def wav_dur(p):
    with wave.open(p) as w:
        return w.getnframes() / w.getframerate()

def line_audio(sid, i, line):
    stem = line.get('audio') or f'{sid}-{i + 1:02d}'
    src = next((os.path.join(vo_dir, f'{stem}.{e}') for e in ('wav', 'mp3', 'm4a') if os.path.exists(os.path.join(vo_dir, f'{stem}.{e}'))), None)
    if not src:
        raise SystemExit(f'missing voice line {stem} in {vo_dir}')
    dst = os.path.join(WORK, f'vo-{args.voice}-{stem}.wav')
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', TRIM, '-ar', '48000', '-ac', '1', dst])
    return dst

LEAD = 0.6
lines, t = [], LEAD
for s in script['sections']:
    for i, l in enumerate(s['lines']):
        f = line_audio(s['id'], i, l)
        d = wav_dur(f)
        lines.append({'section': s['id'], 'i': i, 'file': f, 'start': t, 'dur': d, 'pause': l['pause'], 'slot': d + l['pause'], 'caption': l['caption']})
        t += d + l['pause']
TOTAL = t + 0.6
print(f'voice-over: {len(lines)} lines, {TOTAL:.1f} s')

def sec_lines(sid):
    return [l for l in lines if l['section'] == sid]
def sec_start(sid):
    return sec_lines(sid)[0]['start']

# --------------------------------------------------------------------------------------------- footage
M4 = json.load(open(os.path.join(VIDEO, 'clips4k', 'masters4k.json')))
TAKES = {}
for name, tk in M4['takes'].items():
    f = os.path.join(VIDEO, 'clips4k', tk['file'])
    info = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', f]))
    cw, ch = info['streams'][0]['width'], info['streams'][0]['height']
    bh = min(ch, int(round(cw * 9 / 16 / 2)) * 2)
    TAKES[name] = {'file': f, 'w': cw, 'h': ch, 'bh': bh, 'len': float(info['format']['duration']), 'm': {k: v for k, v in tk['marks']}}
    print(f"take {name}: {cw}×{ch} → band {cw}×{bh}, {TAKES[name]['len']:.1f}s, {len(tk['marks'])} marks")

def mk(take, name):
    m = TAKES[take]['m']
    if name not in m:
        raise SystemExit(f'take {take} has no mark {name!r}; marks: {list(m)}')
    return m[name]

# --------------------------------------------------------------------------------------------- shots
# Every frame is composed here at 60 fps: crisp stills from the 4K takes with slow eased camera moves,
# real-time clips where the motion is the point, and the title cards. Dissolves blend from the previous
# shot's last frame. Each shot is cached on its own, so a long render resumes across runs.
VERSION = 4
BW = TAKES['A']['w']; BH = TAKES['A']['bh']
IW, IH = 3328, 1872                      # the floating screen
IX, IY = (W - IW) // 2, (H - IH) // 2
RAD = 44
FULLB = (0, 0, BW, BH)

def box(cx, cy, w):
    """A 16:9 camera view w px wide centred on (cx, cy) in the 4K take, kept inside the frame."""
    h = w * 9 / 16
    x0 = min(max(cx - w / 2, 0), BW - w); y0 = min(max(cy - h / 2, 0), BH - h)
    return (round(x0, 2), round(y0, 2), round(x0 + w, 2), round(y0 + h, 2))
def push(z=1.06, cx=None, cy=None):
    return box(cx if cx is not None else BW / 2, cy if cy is not None else BH / 2, BW / z)
def smooth(k):
    k = max(0.0, min(1.0, k))
    return k * k * k * (k * (6 * k - 15) + 10)       # smootherstep
def lerpbox(b0, b1, k):
    return tuple(p + (q - p) * k for p, q in zip(b0, b1))

_FLOAT = {}
def float_assets():
    if not _FLOAT:
        glow = Image.new('L', (W, H), 0)
        ImageDraw.Draw(glow).rounded_rectangle((IX - 6, IY - 6, IX + IW + 6, IY + IH + 6), RAD + 6, fill=255)
        g = np.asarray(glow.filter(ImageFilter.GaussianBlur(70)), np.float32) / 255.0
        bg = np.zeros((H, W, 3), np.float32)
        for c, v in enumerate((48, 38, 34)):            # BGR of a cool dark glow
            bg[..., c] = g * v
        screen = Image.new('L', (W, H), 0)
        ImageDraw.Draw(screen).rounded_rectangle((IX, IY, IX + IW - 1, IY + IH - 1), RAD, fill=255)
        edge = Image.new('L', (W, H), 0)
        ImageDraw.Draw(edge).rounded_rectangle((IX, IY, IX + IW - 1, IY + IH - 1), RAD, outline=255, width=3)
        inside = np.asarray(screen, np.float32) / 255.0
        e = np.asarray(edge, np.float32) / 255.0 * (34 / 255.0)
        boxm = np.zeros((H, W), bool); boxm[IY:IY + IH, IX:IX + IW] = True
        ys, xs = np.nonzero(boxm & ((inside < 0.999) | (e > 0)))
        _FLOAT.update(bg=bg.clip(0, 255).astype(np.uint8), ys=ys, xs=xs, a_out=(1.0 - inside[ys, xs])[:, None],
                      a_edge=e[ys, xs][:, None], bgpx=bg[ys, xs])
    return _FLOAT

def present(src, bx, mode):
    """Camera box bx of a 4K take frame → the output frame, edge to edge ('full') or as a floating screen ('float')."""
    x0, y0, x1, y1 = bx
    ow, oh = (W, H) if mode == 'full' else (IW, IH)
    sx, sy = ow / (x1 - x0), oh / (y1 - y0)
    M = np.array([[sx, 0, -x0 * sx], [0, sy, -y0 * sy]], np.float32)
    out = cv2.warpAffine(src, M, (ow, oh), flags=cv2.INTER_LANCZOS4 if sx < 0.999 else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    if mode == 'full':
        return out
    F = float_assets()
    fr = F['bg'].copy()
    fr[IY:IY + IH, IX:IX + IW] = out
    px = fr[F['ys'], F['xs']].astype(np.float32)
    px = px * (1 - F['a_out']) + F['bgpx'] * F['a_out']
    px = px * (1 - F['a_edge']) + 255.0 * F['a_edge']
    fr[F['ys'], F['xs']] = px.clip(0, 255).astype(np.uint8)
    return fr

_stills = {}
def still_img(take, t):
    """The frame on screen at time t (VFR-safe: rebuilt as 60 fps from 1.5 s earlier)."""
    t = min(t, TAKES[take]['len'] - 0.4)
    p = os.path.join(WORK, f'still-{take}-{t:.3f}.png')
    if p not in _stills:
        if not os.path.exists(p):
            tk = TAKES[take]
            run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{max(0, t - 1.5):.3f}', '-i', tk['file'],
                 '-vf', f"fps={FPS},select='gte(n\\,{int(round(min(1.5, t) * FPS))})',crop={tk['w']}:{tk['bh']}:0:0", '-frames:v', '1', p])
        _stills[p] = cv2.imread(p)
    return _stills[p]

class Still:
    def __init__(self, take, t, b0=FULLB, b1=None, mode='full', move=1.0):
        self.take, self.t, self.b0, self.b1, self.mode, self.move = take, t, b0, b1 or b0, mode, move
    def setup(self, dur): self.dur = dur
    def key(self): return ['still', self.take, round(self.t, 3), self.b0, self.b1, self.mode, self.move]
    def frame(self, t):
        return present(still_img(self.take, self.t), lerpbox(self.b0, self.b1, smooth(t / max(1e-6, self.dur * self.move))), self.mode)
    def last(self): return self.frame(self.dur)
    def close(self): pass

class Clip:
    """Real-time footage of [a, b] (sped up to max_speed if it must fit; the last frame holds if short)."""
    def __init__(self, take, a, b, mode='full', b0=FULLB, b1=None, max_speed=2.0):
        tk = TAKES[take]
        self.take, self.a, self.b = take, max(0.0, a), min(tk['len'] - 0.05, b)
        self.mode, self.b0, self.b1, self.max_speed = mode, b0, b1 or b0, max_speed
        self.proc = None
    def setup(self, dur):
        span = self.b - self.a
        self.dur, self.speed = dur, (min(span / dur, self.max_speed) if span > dur else 1.0)
    def key(self): return ['clip', self.take, round(self.a, 3), round(self.b, 3), self.mode, self.b0, self.b1, self.max_speed]
    def _src(self, s):
        if self.proc is None:
            tk = TAKES[self.take]
            self.t0 = max(0.0, s - 1.0)
            self.proc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-ss', f'{self.t0:.3f}', '-i', tk['file'], '-vf', f"fps={FPS},crop={tk['w']}:{tk['bh']}:0:0",
                                          '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)
            self.idx, self.cur = -1, None
        want = int(round((s - self.t0) * FPS)); fsz = BW * BH * 3
        while self.idx < want:
            buf = self.proc.stdout.read(fsz)
            if len(buf) < fsz:
                break
            self.cur = np.frombuffer(buf, np.uint8).reshape(BH, BW, 3); self.idx += 1
        return self.cur
    def frame(self, t):
        s = min(self.a + t * self.speed, self.b)
        return present(self._src(s), lerpbox(self.b0, self.b1, smooth(t / max(1e-6, self.dur))), self.mode)
    def last(self):
        s = min(self.a + self.dur * self.speed, self.b)
        return present(still_img(self.take, s), self.b1, self.mode)
    def close(self):
        if self.proc:
            self.proc.stdout.close(); self.proc.kill(); self.proc = None

# --------------------------------------------------------------------------------------------- cards (drawn at 4K, deduped)
_fonts = {}
def font(weight, size, mono=False):
    k = (weight, size, mono)
    if k not in _fonts:
        name = f'GeistMono-{weight}.ttf' if mono else f'Geist-{weight}.ttf'
        _fonts[k] = ImageFont.truetype(os.path.join(MONO_DIR if mono else FONT_DIR, name), int(round(size * K)))
    return _fonts[k]

def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3
def alpha_in(t, start, d=0.55):
    return ease((t - start) / d)

OPS = []
def _rgba_text(text, f, fill):
    key = ('t', text, id(f), fill)
    if key not in _cache:
        x0, y0, x1, y1 = f.getbbox(text)
        pad = 40
        im = Image.new('RGBA', (x1 - x0 + 2 * pad, y1 - y0 + 2 * pad), fill + (0,))
        ImageDraw.Draw(im).text((pad - x0, pad - y0), text, font=f, fill=fill + (255,))
        _cache[key] = (im, x0 - pad, y0 - pad)
    return _cache[key]
_cache = {}

def text(xy, s, f, fill, a=1.0, anchor='la', rise=14, blur=7, grad=None):
    """Text in design coordinates. Appears with a fade, a small rise and a blur that resolves (a: 0→1)."""
    if a <= 0.003 or not s:
        return
    x, y = xy[0] * K, xy[1] * K
    w = f.getlength(s)
    asc, desc = f.getmetrics()
    if anchor[0] == 'm': x -= w / 2
    elif anchor[0] == 'r': x -= w
    if anchor[1] == 'm': y -= (asc + desc) / 2 - desc / 4
    elif anchor[1] == 's': y -= asc
    y += (1 - a) * rise * K
    OPS.append(('text', s, id(f), f, fill, tuple(grad) if grad else None, round(x), round(y), round(a, 3), round((1 - a) * blur * K * 2) / 2))

def rect(box, r, fill, a=1.0, outline=None):
    if a <= 0.003:
        return
    OPS.append(('rect', tuple(round(v * K) for v in box), round(r * K), fill, outline, round(a, 3)))

def logo(cx, cy, r, a=1.0):
    if a <= 0.003:
        return
    OPS.append(('logo', round(cx * K), round(cy * K), round(r * K), round(a, 3)))

def center(y, s, f, fill, a=1.0, **kw):
    text((960, y), s, f, fill, a, anchor='mm', **kw)

def _grad_layer(im, colors):
    w, h = im.size
    xs = np.linspace(0, 1, w)[None, :, None]
    c = np.array(colors, np.float32)
    seg = np.clip(xs * (len(c) - 1), 0, len(c) - 1 - 1e-6)
    i = seg.astype(int); fr = seg - i
    col = c[i[..., 0]] * (1 - fr) + c[i[..., 0] + 1] * fr
    arr = np.array(im)
    arr[..., :3] = np.broadcast_to(col, (1, w, 3)).repeat(h, 0).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')

def composite(ops):
    img = Image.new('RGB', (W, H), INK)
    for op in ops:
        if op[0] == 'text':
            _, s, _, f, fill, grad, x, y, a, blur = op
            im, ox, oy = _rgba_text(s, f, fill)
            if grad:
                gk = ('g', s, id(f), grad)
                if gk not in _cache:
                    _cache[gk] = _grad_layer(im, grad)
                im = _cache[gk]
            if blur > 0:
                im = im.filter(ImageFilter.GaussianBlur(blur))
            if a < 1:
                al = im.getchannel('A').point(lambda v, a=a: int(v * a))
                im = im.copy(); im.putalpha(al)
            img.paste(im.convert('RGB'), (x + ox, y + oy), im.getchannel('A'))
        elif op[0] == 'rect':
            _, (x0, y0, x1, y1), r, fill, outline, a = op
            ck = ('r', x1 - x0, y1 - y0, r, fill, outline)
            if ck not in _cache:
                im = Image.new('RGBA', (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
                ImageDraw.Draw(im).rounded_rectangle((0, 0, x1 - x0, y1 - y0), r, fill=fill + (255,), outline=(outline + (255,)) if outline else None, width=int(2 * K))
                _cache[ck] = im
            im = _cache[ck]
            if a < 1:
                im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v, a=a: int(v * a)))
            img.paste(im.convert('RGB'), (x0, y0), im.getchannel('A'))
        elif op[0] == 'logo':
            _, cx, cy, r, a = op
            layer = Image.new('RGBA', (int(r * 2.8), int(r * 2.8)), (0, 0, 0, 0))
            d = ImageDraw.Draw(layer); c0 = r * 1.4
            d.ellipse((c0 - r * 1.2, c0 - r * 1.2, c0 + r * 1.2, c0 + r * 1.2), outline=(200, 200, 205, int(140 * a)), width=max(2, int(r * 0.06)))
            for k in range(12):
                ang = k / 12 * 2 * math.pi - math.pi / 2
                px, py = c0 + math.cos(ang) * r, c0 + math.sin(ang) * r
                rr = r * 0.1
                d.ellipse((px - rr, py - rr, px + rr, py + rr), fill=(ALLOW if k % 4 != 3 else BLOCK) + (int(255 * a),))
            d.rounded_rectangle((c0 - r * 0.12, c0 - r * 0.62, c0 + r * 0.12, c0 + r * 0.62), r * 0.12, fill=(235, 235, 240, int(255 * a)))
            img.paste(layer.convert('RGB'), (int(cx - c0), int(cy - c0)), layer.getchannel('A'))
    return img

class Card:
    """fn(t, L) issues draw ops for time t; identical consecutive frames are composited once."""
    def __init__(self, fn, L, name):
        self.fn, self.L, self.name = fn, L, name
        self.prev_ops, self.prev = None, None
    def setup(self, dur): self.dur = dur
    def key(self): return ['card', self.name, self.L, _CARD_CODE]
    def frame(self, t):
        OPS.clear(); self.fn(t, self.L)
        ops = [o[:3] + o[4:] if o[0] == 'text' else o for o in OPS]
        if ops != self.prev_ops:
            self.prev = np.ascontiguousarray(np.asarray(composite(list(OPS)))[:, :, ::-1]); self.prev_ops = ops
        return self.prev
    def last(self): return self.frame(max(0.0, self.dur - 1 / FPS))
    def close(self): pass

def L_of(sid):
    ls = sec_lines(sid); s0 = ls[0]['start']
    return [(l['start'] - s0, l['dur']) for l in ls]

# ---- the cards ----
def card_coldopen(t, L):
    text((110, 92), 'ATTACK LAB  ·  UNGUARDED AGENT  ·  SIMULATED MONEY', font('Medium', 22, True), MUTED, alpha_in(t, 0.0), rise=0, blur=0)
    req = 'Find me a single monitor arm, up to $140.'
    typed = req[: int(max(0, (t - 0.35)) / 1.4 * len(req))]
    a = alpha_in(t, 0.1)
    bw = font('Medium', 40).getlength(req) / K + 92
    rect((1810 - bw, 300, 1810, 402), 36, (10, 132, 255), a)
    text((1810 - bw + 46, 351), typed, font('Medium', 40), (255, 255, 255), a, anchor='lm', rise=0, blur=0)
    t2 = L[1][0]; a2 = alpha_in(t, t2)
    rw = font('SemiBold', 42).getlength('Nothing waiting for approval.') / K + 92
    rect((110, 470 + (1 - a2) * 14, 110 + rw, 642 + (1 - a2) * 14), 36, SURFACE, a2, outline=LINE)
    text((156, 522), 'Bought successfully.', font('SemiBold', 42), TEXT, a2, anchor='lm')
    hl = alpha_in(t, L[3][0], 0.7)
    col = tuple(int(TEXT[i] + (BLOCK[i] - TEXT[i]) * hl) for i in range(3))
    text((156, 592), 'Nothing waiting for approval.', font('SemiBold', 42), col, a2, anchor='lm')
    t3 = L[2][0]
    text((110, 735), 'It bought three separate parts — because a product page told it to.', font('Regular', 34), MUTED, alpha_in(t, t3))
    text((110, 795), 'Northwind monitor arm — part A, part B, part C  ·  $135.00 total  ·  approvals asked: 0', font('Regular', 26, True), DIM, alpha_in(t, t3 + 0.4), blur=0)

def card_problem(t, L):
    beats = [(L[0][0], 'Today, you give them your wallet.', None),
             (L[1][0], 'Every limit lives in a prompt.', 'And a prompt can be talked out of anything.')]
    for k, (st, s, sub) in enumerate(beats):
        end = beats[k + 1][0] if k + 1 < len(beats) else 1e9
        a = min(alpha_in(t, st, 0.6), 1 - alpha_in(t, end - 0.35, 0.3))
        if a <= 0:
            continue
        center(540 - (34 if sub else 0), s, font('SemiBold', 88), TEXT, a, rise=18, blur=10)
        if sub:
            center(540 + 84, sub, font('Medium', 50), MUTED, min(a, alpha_in(t, st + 1.9, 0.6)), rise=12, blur=8)

def card_inputs(t, L):
    center(150, 'What the guard reads', font('SemiBold', 30), MUTED, alpha_in(t, 0))
    a1 = alpha_in(t, L[1][0])
    rect((170, 250, 900, 720), 32, SURFACE, a1, outline=LINE)
    text((222, 300), 'UNTRUSTED', font('Medium', 22, True), BLOCK, a1, blur=0)
    for k, s in enumerate(['Product pages', 'Reviews', 'Seller notes', 'Listing text']):
        text((222, 380 + k * 70), s, font('Medium', 44), DIM, min(a1, alpha_in(t, L[1][0] + 0.12 * k)))
    text((222, 660), 'never reaches the guard', font('Regular', 26), MUTED, a1, blur=0)
    a2 = alpha_in(t, L[2][0])
    rect((1020, 250, 1750, 720), 32, SURFACE, a2, outline=LINE)
    text((1072, 300), 'THE ONLY INPUTS', font('Medium', 22, True), ALLOW, a2, blur=0)
    for k, s in enumerate(['Your task', 'Your allowance', 'A trusted catalog', 'PayPal']):
        text((1072, 380 + k * 70), s, font('SemiBold', 44), TEXT, min(a2, alpha_in(t, L[2][0] + 0.45 * k)))
    a3 = alpha_in(t, L[3][0])
    center(852, '12 deterministic rules  ·  p95 0.86 ms', font('SemiBold', 54), TEXT, a3)
    for k in range(12):
        x = 960 - 11 * 26 + k * 52
        on = alpha_in(t, L[3][0] + 0.07 * k, 0.25)
        rect((x - 11, 928, x + 11, 950), 11, ALLOW, a3 * on)

def card_tiles(t, L, st):
    names = ['Vault', 'Orders v2', 'Payer approval', 'Refunds', 'Webhooks', 'Transaction Search']
    subs = ['saved-wallet consent', 'pay without the person', 'ask first, in PayPal', 'one-tap undo', 'signed events', "PayPal's own record"]
    center(232, 'Built only from PayPal primitives', font('SemiBold', 40), MUTED, alpha_in(t, st))
    for k, (nm, sb) in enumerate(zip(names, subs)):
        col, row = k % 3, k // 3
        x0, y0 = 210 + col * 510, 340 + row * 250
        a = alpha_in(t, st + 0.3 * k, 0.45)
        rect((x0, y0 + (1 - a) * 12, x0 + 480, y0 + 200 + (1 - a) * 12), 30, SURFACE, a, outline=LINE)
        text((x0 + 40, y0 + 80), nm, font('SemiBold', 42), TEXT, a, anchor='lm')
        text((x0 + 40, y0 + 140), sb, font('Regular', 28), MUTED, a, anchor='lm', blur=0)

def card_code(t, L, st):
    a = alpha_in(t, st)
    rect((140, 300, 1780, 760), 32, (13, 13, 14), a, outline=LINE)
    rows = [
        [("import ", (255, 122, 178)), ("{ wrap } ", TEXT), ("from ", (255, 122, 178)), ("'@/lib/guard'", (252, 199, 116)), (";", TEXT)],
        [],
        [("// any agent's money tools — our vault checkout plus the PayPal Agent Toolkit", MUTED)],
        [("const ", (255, 122, 178)), ("tools ", TEXT), ("= ", TEXT), ("wrap", ACCENT), ("([allowanceCheckout, ...paypalToolkit.getTools()], session);", TEXT)],
        [],
        [("// every money-moving call → ALLOW / STEP_UP / BLOCK, with a rule trace", MUTED)],
    ]
    f = font('Regular', 27, True)
    for k, segs in enumerate(rows):
        x = 200; y = 380 + k * 62
        la = min(a, alpha_in(t, st + 0.15 * k, 0.35))
        for s, col in segs:
            text((x, y), s, f, col, la, rise=6, blur=0)
            x += f.getlength(s) / K

def card_close(t, L):
    a1 = alpha_in(t, L[0][0], 0.6); a2 = alpha_in(t, L[1][0], 0.6)
    fade = 1 - alpha_in(t, L[2][0] - 0.15, 0.5)
    center(480, 'The AI shops.', font('SemiBold', 116), TEXT, a1 * fade, rise=18, blur=10)
    center(620, 'It never decides.', font('SemiBold', 116), MUTED, a2 * fade, rise=18, blur=10)
    a3 = alpha_in(t, L[2][0] + 0.25, 0.8)
    logo(960, 318, 70, a3)
    center(500, 'ALLOWANCE', font('SemiBold', 66), TEXT, a3, rise=10, blur=8)
    # "Give your AI agent an allowance, not your wallet." with the landing page's gradient on "allowance,"
    f = font('Medium', 46)
    parts = [('Give your AI agent an ', MUTED, None), ('allowance,', MUTED, GRAD), (' not your wallet.', MUTED, None)]
    total_w = sum(f.getlength(p[0]) for p in parts) / K
    x = 960 - total_w / 2
    for s, col, g in parts:
        text((x, 590), s, f, col if not g else (255, 255, 255), a3, anchor='lm', rise=10, blur=8, grad=g)
        x += f.getlength(s) / K
    a4 = alpha_in(t, L[2][0] + 1.3, 0.7)
    center(722, 'allowance-8i38.onrender.com', font('Regular', 34, True), ACCENT, a4, blur=0)
    center(778, 'github.com/roshworldwide/allowance', font('Regular', 30, True), MUTED, a4, blur=0)
    center(872, 'Roshan Raj  ·  Built with PayPal, OpenAI and AG Studio  ·  PayPal sandbox', font('Regular', 28), DIM, a4, blur=0)

_CARD_CODE = hashlib.sha1(''.join(inspect.getsource(v) for k, v in sorted(globals().items()) if (k.startswith('card_') or k in ('composite', 'text', '_card')) and callable(v)).encode()).hexdigest()

# --------------------------------------------------------------------------------------------- rendering shots
_acc = {'t': 0.0, 'n': 0}
def reset_frames():
    _acc['t'], _acc['n'] = 0.0, 0
def nframes(dur):
    """Whole frames, with the rounding carried across a section so picture and voice never drift."""
    _acc['t'] += dur
    n = max(1, int(round(_acc['t'] * FPS)) - _acc['n'])
    _acc['n'] += n
    return n

CUR = {'sid': '', 'k': 0, 'prev': None}
def shot(sh, dur, xin=0.0, fade_in=0.0, fade_out=0.0):
    """Render one shot (cached). xin: dissolve in from the previous shot's last frame."""
    CUR['k'] += 1
    n = nframes(dur)
    sh.setup(n / FPS)
    prev = CUR['prev'] if xin else None
    key = [VERSION, sh.key(), n, xin, prev.key() if prev else None, fade_in, fade_out]
    h = hashlib.sha1(json.dumps(key, sort_keys=True, default=str).encode()).hexdigest()[:12]
    out = os.path.join(WORK, f"shot-{CUR['sid']}-{CUR['k']:02d}-{h}.mp4")
    if not os.path.exists(out):
        last = prev.last() if prev else None
        tmp = out + '.part.mp4'
        p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-'] + ENC + [tmp], stdin=subprocess.PIPE)
        T = n / FPS
        for i in range(n):
            t = i / FPS
            f = sh.frame(t)
            if xin and t < xin:
                k = smooth(t / xin)
                f = cv2.addWeighted(f, k, last, 1 - k, 0) if last is not None else cv2.convertScaleAbs(f, alpha=k)
            if fade_in and t < fade_in:
                f = cv2.convertScaleAbs(f, alpha=smooth(t / fade_in))
            if fade_out and t > T - fade_out:
                f = cv2.convertScaleAbs(f, alpha=smooth((T - t) / fade_out))
            p.stdin.write(np.ascontiguousarray(f).tobytes())
        p.stdin.close()
        if p.wait() != 0:
            raise SystemExit('shot encode failed')
        sh.close()
        os.replace(tmp, out)
        print(f"   shot {CUR['sid']}#{CUR['k']} ({type(sh).__name__}, {T:.2f}s) rendered", flush=True)
    CUR['prev'] = sh
    return out

# --------------------------------------------------------------------------------------------- the edit
def build(sid):
    ls = sec_lines(sid); sl = [l['slot'] for l in ls]; D = sum(sl); L = L_of(sid)
    A = lambda n: mk('A', n)
    B = lambda n: mk('B', n)
    X = 0.45   # dissolve
    if sid == 's01':
        return [shot(Card(card_coldopen, L, 'coldopen'), D, fade_out=0.35)]
    if sid == 's02':
        return [shot(Card(card_problem, L, 'problem'), D, fade_out=0.45)]
    if sid == 's03':   # the reveal: the landing page, edge to edge, real time
        st = A('landing') + 0.15
        return [shot(Clip('A', st, st + D, 'full', FULLB, push(1.04)), D, fade_in=0.7)]
    if sid == 's04':   # the allowance: the card, then one continuous camera down its limits (crisp in-browser zoom, held)
        pan = lambda b0, b1, d: shot(Still('B', B('cu-panel') + 2.0, b0, b1), d)
        p0, p1, p2, p3 = push(1.0), box(1780, 760, 2900), box(1650, 1020, 2700), box(1560, 1290, 2650)
        return [shot(Still('B', B('cu-card') + 1.6, push(1.0), push(1.06)), sl[0], xin=X),
                shot(Still('B', B('cu-panel') + 2.0, p0, p1), sl[1], xin=0.4),
                pan(p1, p2, sl[2]),
                pan(p2, p3, sl[3]),
                shot(Still('B', B('wide') + 0.9, push(1.08), push(1.0)), sl[4], xin=X)]
    if sid == 's05':
        return [shot(Clip('B', B('type') - 0.1, B('contract-click') + 0.1, 'float', FULLB, push(1.04, 2300, 900)), sl[0], xin=0.35),
                shot(Still('B', B('contract') + 1.9, push(1.04, 2300, 900), box(2300, 1150, 3000), 'float'), sl[1], xin=0.35),
                shot(Clip('B', B('contract') + 2.5, B('confirmed') + 0.45, 'float', box(2300, 1150, 3000), box(2200, 1150, 3200)), sl[2], xin=0.25),
                shot(Still('B', B('lane') + 8.0, push(1.0), push(1.06), 'float'), sl[3], xin=X)]
    if sid == 's06':   # replay: allowed → asks → approved; then the live run's real BLOCK, in real time
        ra, rs, rp = A('r-allow'), A('r-stepup'), A('r-approved')
        blk = next(v for k, v in TAKES['B']['m'].items() if k.startswith('v-block'))
        lane = box(1920, 1255, 3050)
        c2 = 2.2
        return [shot(Clip('A', ra - sl[0], ra, 'float'), sl[0], xin=X),
                shot(Clip('A', ra, ra + c2, 'float'), c2),
                shot(Still('B', B('cu-allow') + 0.9, push(1.0), box(2330, 1000, 3000)), sl[1] - c2, xin=X),
                shot(Clip('A', rs - 0.3, rp + 1.0, 'float'), sl[2], xin=X),
                shot(Clip('B', blk - sl[3], blk, 'full', lane, lane), sl[3], xin=X),
                shot(Clip('B', blk, blk + 1.5, 'full', lane, box(1920, 1330, 2900)), sl[4], fade_out=0.4)]
    if sid == 's07':
        return [shot(Card(card_inputs, L, 'inputs'), D, fade_out=0.4)]
    if sid == 's08':   # one tap: a real PayPal refund
        return [shot(Clip('B', B('undo-click') - 0.9, B('refunded') + 2.2, 'full', push(1.0), push(1.06)), D, fade_in=0.5, fade_out=0.35)]
    if sid == 's09':
        h1 = 3.2
        return [shot(Still('A', A('lab') + 2.0, push(1.0), push(1.03)), sl[0], fade_in=0.6),
                shot(Still('A', A('lab') + 2.0, push(1.03), push(1.07)), h1),
                shot(Still('A', A('lab-table') + 1.0, push(1.0), push(1.05)), sl[1] - h1, xin=0.6),
                shot(Still('A', A('cu-red') + 1.8, push(1.0), push(1.08)), sl[2], xin=X),
                shot(Still('A', A('cu-green') + 1.8, push(1.02), push(1.09)), sl[3]),
                shot(Still('A', A('cu-false') + 1.6, push(1.0), push(1.07)), sl[4], xin=0.3, fade_out=0.4)]
    if sid == 's10':
        out = [shot(Still('A', A('cr') + 2.2, push(1.0), push(1.05), 'float'), sl[0], fade_in=0.6)]
        h1 = sl[1] * 0.42
        out += [shot(Still('A', A('cu-ring') + 1.6, push(1.0), push(1.07)), h1, xin=X),
                shot(Still('A', A('cu-stream') + 1.6, push(1.0), push(1.07)), sl[1] - h1, xin=X)]
        k = 2
        if len(ls) == 6:   # "This one re-checks every hash in the audit log, right in your browser."
            out.append(shot(Still('A', A('cu-seal') + 2.6, push(1.0), push(1.08)), sl[2], xin=X)); k = 3
        chat_q, chat_top, chat_end = box(960, 1600, 1920), box(960, 740, 1920), box(960, 1440, 1920)
        out += [shot(Clip('A', A('ask') - 0.6, A('thinking'), 'full', chat_q, box(960, 1560, 1800)), sl[k], xin=X),
                shot(Still('A', A('answer') + 1.5, chat_top, box(960, 860, 1920)), sl[k + 1], xin=X),
                shot(Still('A', A('answer-scrolled') + 2.4, chat_end, box(900, 1400, 1800)), sl[k + 2], xin=X, fade_out=0.4)]
        return out
    if sid == 's11':
        return [shot(Still('A', A('cr-paypal') + 2.6, push(1.0), push(1.05), 'float'), sl[0], fade_in=0.6),
                shot(Card(lambda t, L_: card_tiles(t, L_, 0.0), L, 'tiles'), sl[1], xin=X),
                shot(Card(lambda t, L_: card_code(t, L_, 0.0), L, 'code'), sl[2], xin=X, fade_out=0.4)]
    if sid == 's12':
        return [shot(Card(card_close, L, 'close'), D + 0.6, fade_out=1.2)]
    raise SystemExit(f'no edit for {sid}')

# --------------------------------------------------------------------------------------------- render (cached per section)
_CODE = ''.join(inspect.getsource(f) for f in (build, shot, present, float_assets, Still, Clip, Card))
def section_file(s):
    key = json.dumps([VERSION, s, [round(l['slot'], 3) for l in sec_lines(s['id'])], args.voice, M4, _CODE, _CARD_CODE], sort_keys=True, default=str)
    return os.path.join(WORK, f"sec-{s['id']}-{hashlib.sha1(key.encode()).hexdigest()[:10]}.mp4")

preview = set(filter(None, args.preview.split(',')))
parts = []
lead = os.path.join(WORK, f'lead-{LEAD}.mp4')
if not os.path.exists(lead):
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'color=c=black:s={W}x{H}:r={FPS}', '-frames:v', str(int(round(LEAD * FPS)))] + ENC + [lead])
parts.append(lead)
for s in script['sections']:
    if preview and s['id'] not in preview:
        continue
    p = section_file(s)
    if os.path.exists(p):
        print(f"· {s['id']} {s['name']}: cached", flush=True)
    else:
        reset_frames(); CUR.update(sid=s['id'], k=0, prev=None)
        segs = build(s['id'])
        with open(p + '.txt', 'w') as fh:
            fh.writelines(f"file '{q}'\n" for q in segs)
        run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', p + '.txt', '-c', 'copy', p])
        print(f"✓ {s['id']} {s['name']}: {len(segs)} shot(s), {sum(l['slot'] for l in sec_lines(s['id'])):.2f}s", flush=True)
    parts.append(p)
if args.no_mux:
    raise SystemExit(0)

# --------------------------------------------------------------------------------------------- sound: voice + original score
sel = [l for l in lines if not preview or l['section'] in preview]
sil = {}
def silence(d):
    k = round(d, 3)
    if k not in sil:
        p = os.path.join(WORK, f'sil-{k:.3f}.wav')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', f'{k:.3f}', p])
        sil[k] = p
    return sil[k]
voice = os.path.join(WORK, 'voice.wav')
with open(voice + '.txt', 'w') as fh:
    fh.write(f"file '{silence(LEAD)}'\n")
    for l in sel:
        fh.write(f"file '{l['file']}'\nfile '{silence(l['pause'])}'\n")
    fh.write(f"file '{silence(0.6)}'\n")
run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', voice + '.txt', '-ar', '48000', '-ac', '1', voice])
vdur = wav_dur(voice)
music = os.path.join(WORK, 'score.wav')
if preview:
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', f'{vdur:.3f}', music])
else:
    blk_line = next(l for l in lines if l['section'] == 's06' and l['caption'].startswith('Blocked'))
    score({'lift': sec_start('s03'), 'block': blk_line['start'], 'onemore': sec_start('s10'), 'close': sec_start('s12')}, vdur, music)
ST = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
mix = os.path.join(WORK, 'mix.wav')
run(['ffmpeg', '-y', '-loglevel', 'error', '-i', voice, '-i', music, '-filter_complex',
     f'[0:a]{ST},asplit=2[v][sc];[1:a]{ST},volume=-11dB[m];[m][sc]sidechaincompress=threshold=0.025:ratio=5:attack=40:release=700[md];'
     f'[v][md]amix=inputs=2:normalize=0:duration=first[a]', '-map', '[a]', '-ar', '48000', mix])
meas = subprocess.run(['ffmpeg', '-hide_banner', '-i', mix, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
mj = json.loads(meas[meas.rindex('{'):meas.rindex('}') + 1])
ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={mj['input_i']}:measured_TP={mj['input_tp']}:measured_LRA={mj['input_lra']}"
      f":measured_thresh={mj['input_thresh']}:offset={mj['target_offset']}:linear=true")

# --------------------------------------------------------------------------------------------- captions (.srt, not burned in)
srt = os.path.join(OUT, 'allowance-demo-4k.srt')
fmt = lambda x: f'{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{int(x % 60):02d},{int(round((x % 1) * 1000)):03d}'
with open(srt, 'w') as fh:
    cur = LEAD
    for k, l in enumerate(sel, 1):
        fh.write(f"{k}\n{fmt(cur)} --> {fmt(cur + l['dur'] + min(l['pause'], 0.35))}\n{l['caption']}\n\n")
        cur += l['slot']

# --------------------------------------------------------------------------------------------- final
pic = os.path.join(WORK, 'picture.mp4')
with open(pic + '.txt', 'w') as fh:
    fh.writelines(f"file '{q}'\n" for q in parts)
run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', pic + '.txt', '-c', 'copy', pic])
final = os.path.join(OUT, 'allowance-demo-4k' + ('-preview' if preview else '') + '.mp4')
run(['ffmpeg', '-y', '-loglevel', 'error', '-i', pic, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
     '-af', f'{ln},{ST}', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', final])
d = float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]))
print(f'\n→ {final}  ({int(d // 60)}:{d % 60:04.1f}, {os.path.getsize(final) / 1e6:.0f} MB)')
if d > 179:
    print('WARNING: over 2:59')
