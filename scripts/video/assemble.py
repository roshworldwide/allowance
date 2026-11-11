#!/usr/bin/env python3
"""Edits the demo video: voice-over (../video/vo/<voice>) + filmed scenes (../video/clips) + rendered title cards
→ ../video/out/allowance-demo.mp4 (1920×1080, 30 fps, H.264, captions burned in, loudness −14 LUFS).

  python3 scripts/video/assemble.py --voice ash [--repo <allowance dir>] [--video <video dir>] [--preview s01,s02]

Needs: python3 + Pillow, ffmpeg/ffprobe with libass. Every visual is cut to the length of its voice-over line, so
picture and voice stay in sync whatever the voice's pace.
"""
import argparse, hashlib, json, math, os, shutil, subprocess, sys, wave
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FPS = 30
W, H = 1920, 1080
INK = (0, 0, 0)
TEXT = (245, 245, 247)
MUTED = (134, 134, 139)
DIM = (72, 72, 76)
ACCENT = (41, 151, 255)
ALLOW = (48, 209, 88)
STEPUP = (255, 214, 10)
BLOCK = (255, 69, 58)
REFUND = (100, 210, 255)
SURFACE = (22, 22, 23)
LINE = (44, 44, 46)

ap = argparse.ArgumentParser()
ap.add_argument('--voice', required=True)
ap.add_argument('--repo', default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ap.add_argument('--video', default=None)
ap.add_argument('--work', default='/tmp/allowance-video')
ap.add_argument('--preview', default='')
ap.add_argument('--no-captions', action='store_true')
ap.add_argument('--no-mux', action='store_true', help='only render (and cache) the sections')
args = ap.parse_args()
REPO = args.repo
VIDEO = args.video or os.path.join(os.path.dirname(REPO), 'video')
WORK = args.work
os.makedirs(WORK, exist_ok=True)
OUT = os.path.join(VIDEO, 'out')
os.makedirs(OUT, exist_ok=True)

FONT_DIR = os.path.join(REPO, 'node_modules/geist/dist/fonts/geist-sans')
MONO_DIR = os.path.join(REPO, 'node_modules/geist/dist/fonts/geist-mono')
_fonts = {}
def font(weight, size, mono=False):
    k = (weight, size, mono)
    if k not in _fonts:
        name = f"GeistMono-{weight}.ttf" if mono else f"Geist-{weight}.ttf"
        _fonts[k] = ImageFont.truetype(os.path.join(MONO_DIR if mono else FONT_DIR, name), size)
    return _fonts[k]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(' '.join(cmd)[:400] + '\n' + r.stderr[-2000:])
        raise SystemExit(1)
    return r.stdout

# --------------------------------------------------------------------------------------------- voice-over
script = json.load(open(os.path.join(REPO, 'scripts/video/script.json')))
vo_dir = os.path.join(VIDEO, 'vo', args.voice)
def wav_dur(p):
    with wave.open(p) as w:
        return w.getnframes() / w.getframerate()

TRIM = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,'
        'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse')

def find_audio(stem):
    for ext in ('wav', 'mp3', 'm4a'):
        p = os.path.join(vo_dir, f'{stem}.{ext}')
        if os.path.exists(p):
            return p
    return None

def split_section(sid, n):
    """A whole-section recording (e.g. ElevenLabs s06.mp3 with a break between lines) → n line WAVs,
    cut at the n−1 longest pauses."""
    src = find_audio(sid)
    full = os.path.join(WORK, f'vo-{args.voice}-{sid}-full.wav')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ar', '48000', '-ac', '1', full])
    total = wav_dur(full)
    gaps = []
    for noise, d in (('-40dB', 0.5), ('-35dB', 0.35), ('-30dB', 0.25)):
        out = subprocess.run(['ffmpeg', '-hide_banner', '-i', full, '-af', f'silencedetect=noise={noise}:d={d}', '-f', 'null', '-'],
                             capture_output=True, text=True).stderr
        st = [float(x.split('silence_start: ')[1].split()[0]) for x in out.splitlines() if 'silence_start: ' in x]
        en = [float(x.split('silence_end: ')[1].split()[0]) for x in out.splitlines() if 'silence_end: ' in x]
        gaps = [(a, b) for a, b in zip(st, en) if a > 0.15 and b < total - 0.15]  # ignore lead-in/out
        if len(gaps) >= n - 1:
            break
    if len(gaps) < n - 1:
        raise SystemExit(f'{os.path.basename(src)}: found {len(gaps)} pauses but needs {n - 1} to split {n} lines. '
                         f'Re-export it with the <break time="1.2s" /> tags, or send one file per line ({sid}-01.mp3 …).')
    cuts = sorted(sorted(gaps, key=lambda g: g[1] - g[0], reverse=True)[: n - 1])
    bounds = [0.0] + [(a + b) / 2 for a, b in cuts] + [total]
    parts = []
    for k in range(n):
        dst = os.path.join(WORK, f'vo-{args.voice}-{sid}-{k + 1:02d}.wav')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', full, '-af',
             f'atrim={bounds[k]:.3f}:{bounds[k + 1]:.3f},asetpts=PTS-STARTPTS,{TRIM}', '-ar', '48000', '-ac', '1', dst])
        parts.append(dst)
    print(f'  split {os.path.basename(src)} into {n} lines: ' + ', '.join(f'{wav_dur(p):.1f}s' for p in parts))
    return parts

_split_cache = {}
def line_audio(sid, i):
    """The voice line as a clean 48 kHz mono WAV, with leading/trailing silence trimmed so the script's own
    pauses set the rhythm. Accepts one file per line (s06-04.wav/.mp3, any TTS) or one file per section (s06.mp3)."""
    stem = next(s_ for s_ in script['sections'] if s_['id'] == sid)['lines'][i].get('audio') or f'{sid}-{i + 1:02d}'
    src = find_audio(stem)
    if not src:
        if find_audio(sid):
            if sid not in _split_cache:
                n = len(next(s for s in script['sections'] if s['id'] == sid)['lines'])
                _split_cache[sid] = split_section(sid, n)
            return _split_cache[sid][i]
        raise SystemExit(f'missing voice line {sid}-{i + 1:02d} (or section file {sid}.mp3) in {vo_dir}')
    dst = os.path.join(WORK, f'vo-{args.voice}-{stem}.wav')
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', TRIM, '-ar', '48000', '-ac', '1', dst])
    return dst

LEAD = 0.5  # black before the first word
lines = []  # global timeline of every voice line
t = LEAD
for s in script['sections']:
    for i, l in enumerate(s['lines']):
        f = line_audio(s['id'], i)
        d = wav_dur(f)
        lines.append({'section': s['id'], 'i': i, 'file': f, 'start': t, 'dur': d, 'pause': l['pause'], 'slot': d + l['pause'],
                      'caption': l['caption'], 'beat': l.get('beat')})
        t += d + l['pause']
TOTAL = t + 0.3
print(f"voice-over: {len(lines)} lines, {TOTAL:.1f} s total")
if TOTAL > 178:
    print('WARNING: longer than 2:58 — tighten pauses in script.json')

def sec_lines(sid):
    return [l for l in lines if l['section'] == sid]

# --------------------------------------------------------------------------------------------- clips
def load_clip(name):
    d = os.path.join(VIDEO, 'clips', name)
    p = os.path.join(d, 'timeline.json')
    if not os.path.exists(p):
        return None
    tl = json.load(open(p))
    if not tl['frames']:
        return None
    tl['dir'] = d
    tl['m'] = {m['label']: m['t'] - tl['t0'] for m in tl['marks']}
    # constant-frame-rate source video, once per clip
    src = os.path.join(WORK, f'src-{name}.mp4')
    if not os.path.exists(src):
        lst = os.path.join(WORK, f'src-{name}.txt')
        fr = tl['frames']
        with open(lst, 'w') as fh:
            # hold black/first frame from t0 to the first frame
            for k, f in enumerate(fr):
                nxt = fr[k + 1]['t'] if k + 1 < len(fr) else tl['tEnd']
                start = tl['t0'] if k == 0 else f['t']
                fh.write(f"file '{os.path.join(d, f['f'])}'\nduration {max(nxt - start, 1 / FPS):.4f}\n")
            fh.write(f"file '{os.path.join(d, fr[-1]['f'])}'\n")
        run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
             '-vf', f'scale={W}:{H}:flags=lanczos,fps={FPS},format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', src])
    tl['src'] = src
    tl['len'] = tl['tEnd'] - tl['t0']
    return tl

MASTERS = os.path.join(VIDEO, 'clips', 'masters.json')

def load_masters():
    """Whole-tab recordings (getDisplayMedia) + named windows with marks, from video/clips/masters.json.
    Each clip becomes a constant-frame-rate 1920×1080 source: the browser's own edge overlay is cropped away
    (`fit`, or a per-clip `crop`), a static mouse pointer can be removed (`delogo`), and the result is letterboxed."""
    spec = json.load(open(MASTERS))
    out = {}
    for name, c in spec['clips'].items():
        tk = spec['takes'][c['take']]
        a, b = c['from'], c['to']
        vf = []
        if tk.get('delogo') and not c.get('crop'):
            x, y, w, h = tk['delogo']
            vf.append(f'delogo=x={x}:y={y}:w={w}:h={h}')
        x, y, w, h = c.get('crop') or tk['fit']
        vf += [f'crop={w}:{h}:{x}:{y}', f'scale={W}:{H}:force_original_aspect_ratio=decrease:flags=lanczos',
               f'pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black', f'fps={FPS}', 'format=yuv420p']
        key = hashlib.sha1(json.dumps([tk, c], sort_keys=True).encode()).hexdigest()[:8]
        src = os.path.join(WORK, f'src-{name}-{key}.mp4')
        if not os.path.exists(src):
            run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{a:.3f}', '-t', f'{b - a:.3f}', '-i', os.path.join(VIDEO, 'clips', tk['file']),
                 '-vf', ','.join(vf), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', src])
        out[name] = {'src': src, 'len': b - a, 'm': {k: v - a for k, v in c['marks'].items()}}
    return out

MASTER_MODE = os.path.exists(MASTERS)
CLIPS = load_masters() if MASTER_MODE else {n: load_clip(n) for n in ['landing', 'errand', 'replay', 'lab', 'control']}
for n, c in CLIPS.items():
    if c:
        print(f"clip {n}: {c['len']:.1f}s marks={','.join(c['m'].keys())}")
    else:
        print(f"clip {n}: missing")

seg_index = [0]
def seg_path():
    seg_index[0] += 1
    return os.path.join(WORK, f'seg-{seg_index[0]:03d}.mp4')

ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', str(FPS)]

# Frame budget: segments are whole frames, so carry the rounding over within a section instead of letting
# every cut round up (which drifted the picture ~0.2 s behind the voice by the end).
_acc = {'t': 0.0, 'n': 0}
def reset_frames():
    _acc['t'], _acc['n'] = 0.0, 0
def nframes(dur):
    _acc['t'] += dur
    n = max(1, int(round(_acc['t'] * FPS)) - _acc['n'])
    _acc['n'] += n
    return n

def cut(clip, a, b, dur, max_speed=3.0, crop=None, min_speed=1.0):
    """A segment of exactly `dur` s from clip window [a, b]: sped up if long; if short, slowed down to
    `min_speed` at most, then the last frame is held."""
    a = max(0.0, a)
    b = min(clip['len'], max(b, a + 0.2))
    span = b - a
    speed = span / dur
    vf = []
    if speed > 1.0:
        speed = min(speed, max_speed)
        span = min(span, dur * speed)
        vf.append(f'setpts=(PTS-STARTPTS)/{speed:.4f}')
    elif speed < 1.0 and min_speed < 1.0:
        vf.append(f'setpts=(PTS-STARTPTS)/{max(speed, min_speed):.4f}')
    else:
        vf.append('setpts=PTS-STARTPTS')
    if crop:
        x, y, w, h = crop
        vf.append(f'crop={w}:{h}:{x}:{y},scale={W}:{H}:flags=lanczos')
    vf.append(f'fps={FPS},tpad=stop_mode=clone:stop_duration={dur + 1:.3f}')
    vf.append(f'trim=end_frame={nframes(dur)},setpts=PTS-STARTPTS')
    out = seg_path()
    run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{a:.3f}', '-t', f'{span + 0.05:.3f}', '-i', clip['src'], '-vf', ','.join(vf), '-an'] + ENC + [out])
    return out

# --------------------------------------------------------------------------------------------- cards
def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3

def alpha_in(t, start, d=0.45):
    return ease((t - start) / d)

def draw_text(img, xy, text, f, fill, a=1.0, anchor='la'):
    if a <= 0:
        return
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(xy, text, font=f, fill=fill + (int(255 * a),), anchor=anchor)
    img.alpha_composite(layer)

def rrect(img, box, r, fill, a=1.0, outline=None):
    if a <= 0:
        return
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, r, fill=fill + (int(255 * a),), outline=(outline + (int(255 * a),)) if outline else None, width=2)
    img.alpha_composite(layer)

def mark_logo(img, cx, cy, r, a=1.0):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((cx - r * 1.2, cy - r * 1.2, cx + r * 1.2, cy + r * 1.2), outline=(200, 200, 205, int(140 * a)), width=max(2, int(r * 0.06)))
    for k in range(12):
        ang = k / 12 * 2 * math.pi - math.pi / 2
        x, y = cx + math.cos(ang) * r, cy + math.sin(ang) * r
        col = ALLOW if k % 4 != 3 else BLOCK
        rr = r * 0.1
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=col + (int(255 * a),))
    d.rounded_rectangle((cx - r * 0.12, cy - r * 0.62, cx + r * 0.12, cy + r * 0.62), r * 0.12, fill=(235, 235, 240, int(255 * a)))
    img.alpha_composite(layer)

def center_text(img, y, text, f, fill, a=1.0):
    draw_text(img, (W // 2, y), text, f, fill, a, anchor='mm')

def render_card(fn, dur, local_lines):
    """fn(img, t, L) draws frame at time t (s from section start); L = [(start, dur)] of the section's lines."""
    out = seg_path()
    n = nframes(dur)
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-'] + ENC + [out], stdin=subprocess.PIPE)
    for k in range(n):
        img = Image.new('RGBA', (W, H), INK + (255,))
        fn(img, k / FPS, local_lines)
        p.stdin.write(img.convert('RGB').tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit('card render failed')
    return out

def L_of(sid):
    ls = sec_lines(sid)
    s0 = ls[0]['start']
    return [(l['start'] - s0, l['dur']) for l in ls]

# --------------------------------------------------------------------------------------------- Ken Burns on a still
_stills = {}
def still(clip, t):
    p = os.path.join(WORK, f"still-{os.path.basename(clip['src'])[:-4]}-{t:.2f}.png")
    if p not in _stills:
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{t:.3f}', '-i', clip['src'], '-frames:v', '1', p])
        _stills[p] = Image.open(p).convert('RGB')
    return _stills[p]

def box(cx, cy, w):
    """A 16:9 view of width w centred on (cx, cy), kept inside the frame."""
    h = w * 9 / 16
    x0 = min(max(cx - w / 2, 0), W - w)
    y0 = min(max(cy - h / 2, 0), H - h)
    return (x0, y0, x0 + w, y0 + h)

def kb(clip, t, dur, b0, b1, move=1.0):
    """A slow, eased camera move across one frame of the footage (b0 → b1, boxes from box())."""
    im = still(clip, t)
    def fn(img, tt, L):
        k = min(1.0, tt / max(dur * move, 1e-6))
        k = 0.5 - 0.5 * math.cos(math.pi * k)
        bx = tuple(p + (q - p) * k for p, q in zip(b0, b1))
        img.paste(im.resize((W, H), Image.BICUBIC, box=bx))
    return render_card(fn, dur, [])

def card_coldopen(img, t, L):
    draw_text(img, (110, 90), 'ATTACK LAB  ·  UNGUARDED AGENT  ·  SIMULATED MONEY', font('Medium', 22, True), MUTED, alpha_in(t, 0.0))
    # the user's request, typed
    req = 'Find me a single monitor arm, up to $140.'
    typed = req[: int(max(0, (t - 0.25)) / 1.5 * len(req))]
    a = alpha_in(t, 0.1)
    bw = int(font('Medium', 40).getlength(req)) + 88
    rrect(img, (W - 110 - bw, 300, W - 110, 400), 34, (10, 132, 255), a)
    draw_text(img, (W - 110 - bw + 44, 350), typed, font('Medium', 40), (255, 255, 255), a, anchor='lm')
    # the agent's reply (its real final message in run A06-01)
    t2 = L[1][0]
    a2 = alpha_in(t, t2)
    rw = int(font('SemiBold', 42).getlength('Nothing waiting for approval.')) + 88
    rrect(img, (110, 470, 110 + rw, 640), 34, SURFACE, a2, outline=LINE)
    draw_text(img, (154, 520), 'Bought successfully.', font('SemiBold', 42), TEXT, a2, anchor='lm')
    hl = alpha_in(t, L[3][0], 0.6)
    col = tuple(int(TEXT[i] + (BLOCK[i] - TEXT[i]) * hl) for i in range(3))
    draw_text(img, (154, 590), 'Nothing waiting for approval.', font('SemiBold', 42), col, a2, anchor='lm')
    t3 = L[2][0]
    draw_text(img, (110, 730), 'It bought three separate parts — because a product page told it to.', font('Regular', 34), MUTED, alpha_in(t, t3))
    draw_text(img, (110, 790), 'Northwind monitor arm — part A, part B, part C  ·  $135.00 total  ·  approvals asked: 0', font('Regular', 26, True), DIM, alpha_in(t, t3 + 0.4))

def card_problem(img, t, L):
    beats = [
        (L[0][0], 'Agents can pay now.', None),
        (L[1][0], 'Today, you give them your wallet.', None),
        (L[2][0], 'All of it.', None),
        (L[3][0], 'Every limit lives in a prompt.', 'A prompt can be talked out of anything.'),
    ] if len(L) == 4 else [
        (L[0][0], 'Today, you give them your wallet.', None),
        (L[1][0], 'Every limit lives in a prompt.', 'A prompt can be talked out of anything.'),
    ]
    for k, (st, text, sub) in enumerate(beats):
        end = beats[k + 1][0] if k + 1 < len(beats) else 1e9
        a = min(alpha_in(t, st, 0.35), 1 - alpha_in(t, end - 0.2, 0.25))
        if a <= 0:
            continue
        size = 120 if k == 2 else 84
        center_text(img, H // 2 - (30 if sub else 0), text, font('SemiBold', size), TEXT, a)
        if sub:
            center_text(img, H // 2 + 80, sub, font('Medium', 52), MUTED, min(a, alpha_in(t, st + 1.6, 0.4)))

def card_inputs(img, t, L):
    draw_text(img, (W // 2, 150), 'What the guard reads', font('SemiBold', 30), MUTED, alpha_in(t, 0), anchor='mm')
    a1 = alpha_in(t, L[1][0])
    # left: untrusted
    rrect(img, (170, 250, 900, 720), 30, SURFACE, a1, outline=LINE)
    draw_text(img, (220, 300), 'UNTRUSTED', font('Medium', 22, True), BLOCK, a1)
    for k, s in enumerate(['Product pages', 'Reviews', 'Seller notes', 'Listing text']):
        draw_text(img, (220, 380 + k * 70), s, font('Medium', 44), DIM, a1)
    draw_text(img, (220, 660), 'never reaches the guard', font('Regular', 26), MUTED, a1)
    # right: the only inputs
    a2 = alpha_in(t, L[2][0])
    rrect(img, (1020, 250, 1750, 720), 30, SURFACE, a2, outline=LINE)
    draw_text(img, (1070, 300), 'THE ONLY INPUTS', font('Medium', 22, True), ALLOW, a2)
    for k, s in enumerate(['Your task', 'Your allowance', 'A trusted catalog', 'PayPal']):
        draw_text(img, (1070, 380 + k * 70), s, font('SemiBold', 44), TEXT, min(a2, alpha_in(t, L[2][0] + 0.45 * k)))
    a3 = alpha_in(t, L[3][0])
    center_text(img, 850, '12 deterministic rules  ·  p95 0.86 ms', font('SemiBold', 54), TEXT, a3)
    # the lamps
    for k in range(12):
        x = W // 2 - 11 * 26 + k * 52
        on = alpha_in(t, L[3][0] + 0.06 * k, 0.2)
        rrect(img, (x - 11, 925, x + 11, 947), 11, ALLOW, a3 * on)

def card_tiles(img, t, L, st):
    names = ['Vault', 'Orders v2', 'Payer approval', 'Refunds', 'Webhooks', 'Transaction Search']
    subs = ['saved-wallet consent', 'pay without the person', 'ask first, in PayPal', 'one-tap undo', 'signed events', "PayPal's own record"]
    center_text(img, 230, 'Built only from PayPal primitives', font('SemiBold', 40), MUTED, alpha_in(t, st))
    for k, (n, s) in enumerate(zip(names, subs)):
        col, row = k % 3, k // 3
        x0 = 210 + col * 510
        y0 = 340 + row * 250
        a = alpha_in(t, st + 0.35 * k, 0.35)
        rrect(img, (x0, y0, x0 + 480, y0 + 200), 28, SURFACE, a, outline=LINE)
        draw_text(img, (x0 + 40, y0 + 80), n, font('SemiBold', 42), TEXT, a, anchor='lm')
        draw_text(img, (x0 + 40, y0 + 140), s, font('Regular', 28), MUTED, a, anchor='lm')

def card_code(img, t, L, st):
    a = alpha_in(t, st)
    rrect(img, (140, 300, 1780, 760), 30, (13, 13, 14), a, outline=LINE)
    lines_ = [
        [("import ", (255, 122, 178)), ("{ wrap } ", TEXT), ("from ", (255, 122, 178)), ("'@/lib/guard'", (252, 199, 116)), (";", TEXT)],
        [],
        [("// any agent's money tools — our vault checkout plus the PayPal Agent Toolkit", MUTED)],
        [("const ", (255, 122, 178)), ("tools ", TEXT), ("= ", TEXT), ("wrap", ACCENT), ("([allowanceCheckout, ...paypalToolkit.getTools()], session);", TEXT)],
        [],
        [("// every money-moving call → ALLOW / STEP_UP / BLOCK, with a rule trace", MUTED)],
    ]
    f = font('Regular', 27, True)
    for k, segs in enumerate(lines_):
        x = 200
        y = 380 + k * 62
        la = min(a, alpha_in(t, st + 0.15 * k, 0.3))
        for txt, col in segs:
            draw_text(img, (x, y), txt, f, col, la)
            x += f.getlength(txt)

def card_close(img, t, L):
    a1 = alpha_in(t, L[0][0], 0.5)
    a2 = alpha_in(t, L[1][0], 0.5)
    fade = 1 - alpha_in(t, L[2][0] - 0.1, 0.45)
    center_text(img, H // 2 - 60, 'The AI shops.', font('SemiBold', 110), TEXT, a1 * fade)
    center_text(img, H // 2 + 80, 'It never decides.', font('SemiBold', 110), MUTED, a2 * fade)
    a3 = alpha_in(t, L[2][0] + 0.2, 0.6)
    mark_logo(img, W // 2, 330, 70, a3)
    center_text(img, 500, 'ALLOWANCE', font('SemiBold', 64), TEXT, a3)
    center_text(img, 590, 'Give your AI agent an allowance, not your wallet.', font('Medium', 44), MUTED, a3)
    a4 = alpha_in(t, L[2][0] + 1.2, 0.6)
    center_text(img, 720, 'allowance-8i38.onrender.com', font('Regular', 34, True), ACCENT, a4)
    center_text(img, 775, 'github.com/roshworldwide/allowance', font('Regular', 30, True), MUTED, a4)
    center_text(img, 870, 'Roshan Raj  ·  Built with PayPal, OpenAI and AG Studio  ·  PayPal sandbox', font('Regular', 28), DIM, a4)

def card_block_fallback(img, t, L, st):
    draw_text(img, (110, 90), 'ATTACK LAB  ·  RUN A06-01  ·  WITH ALLOWANCE  ·  SIMULATED MONEY', font('Medium', 22, True), MUTED, alpha_in(t, st))
    a = alpha_in(t, st + 0.2)
    rrect(img, (360, 330, 1560, 760), 34, SURFACE, a, outline=LINE)
    draw_text(img, (430, 420), 'Northwind single monitor arm', font('SemiBold', 52), TEXT, a, anchor='lm')
    draw_text(img, (1490, 420), '$135.00', font('SemiBold', 52), TEXT, a, anchor='rm')
    draw_text(img, (430, 500), 'max $60 per purchase', font('Regular', 34), MUTED, a, anchor='lm')
    ab = alpha_in(t, st + 1.2, 0.3)
    rrect(img, (430, 580, 1100, 660), 40, (60, 14, 12), ab, outline=BLOCK)
    draw_text(img, (470, 620), '●  BLOCK  ·  R05 PER_PURCHASE_CAP', font('SemiBold', 34, True), BLOCK, ab, anchor='lm')

# --------------------------------------------------------------------------------------------- sections
def sec_dur(sid):
    ls = sec_lines(sid)
    return sum(l['slot'] for l in ls)

def clip_or_none(name):
    return CLIPS.get(name)

def build_master(s):
    """The edit for the two whole-tab recordings (masters.json). Coordinates are in the 1920×1080 source frame."""
    sid = s['id']
    ls = sec_lines(sid)
    D = sec_dur(sid)
    sl = [l['slot'] for l in ls]
    C = CLIPS
    if sid == 's03':
        st = C['landing']['m']['loaded'] + 0.15
        return [cut(C['landing'], st, st + D, D)]
    if sid == 's04':  # the allowance: created live, then a slow camera over its limits and the PayPal wallet
        e = C['errand']; m = e['m']; t = m['still']
        b_card, b_cap, b_ask, b_wal = box(560, 560, 1100), box(548, 650, 720), box(548, 690, 620), box(548, 735, 580)
        return [cut(e, m['create'] - 0.2, m['live'] + 0.9, sl[0]),
                kb(e, t, sl[1], b_card, b_cap),
                kb(e, t, sl[2], b_cap, b_ask),
                kb(e, t, sl[3], b_ask, b_wal),
                kb(e, t, sl[4], b_wal, box(960, 540, W), move=0.8)]
    if sid == 's05':
        e = C['errand']; m = e['m']; lv = C['live']
        return [cut(e, m['type'] - 0.2, m['contract-click'] + 0.2, sl[0]),
                cut(e, m['contract'] - 0.3, m['contract'] + 2.8, sl[1]),
                cut(e, m['confirmed'] - 1.1, m['confirmed'] + 0.6, sl[2]),
                cut(lv, lv['m']['send'] - 0.85, lv['m']['send'] + 1.9, sl[3])]
    if sid == 's06':  # replay (allow, step-up → approved), then the live run's real BLOCK
        r = C['replay']; m = r['m']; lv = C['live']; lm = lv['m']
        z = (96, 54, 1728, 972)
        return [cut(r, m['lane'], m['allow'] - 0.5, sl[0], min_speed=0.6),
                cut(r, m['allow'] - 0.5, m['stepup'] - 0.1, sl[1], min_speed=0.5),
                cut(r, m['stepup'] - 0.1, m['approved'] + 1.0, sl[2]),
                cut(lv, lm['block'] - 2.8, lm['block'] - 0.01, sl[3], min_speed=0.5, crop=z),
                # hold on the red "Blocked · $135.00 · limit $60.00" panel, before the page scrolls on
                cut(lv, lm['block'] - 0.01, lm['block'] + 0.75, sl[4], crop=(160, 90, 1600, 900))]
    if sid == 's08':  # live undo → a real PayPal refund
        lv = C['live']; lm = lv['m']
        return [cut(lv, lm['undo-click'] - 0.9, lm['refunded'] + 1.5, D, min_speed=0.85, crop=(720, 120, 1200, 675))]
    if sid == 's09':
        lab = C['lab']; m = lab['m']
        b_all, b_mid, b_red, b_green = box(960, 540, W), box(960, 500, 1500), box(640, 440, 800), box(1262, 440, 800)
        return [cut(lab, m['start'], m['top'], sl[0]),
                kb(lab, m['top'], sl[1], b_all, b_mid),
                kb(lab, m['top'], sl[2], b_mid, b_red),
                kb(lab, m['top'], sl[3], b_red, b_green, move=0.45),
                kb(lab, m['bottom'], sl[4], box(540, 530, 960), box(540, 520, 720))]
    if sid == 's10':
        c = C['control']; m = c['m']; an = C['answer']; am = an['m']
        a0 = am['answer']
        return [cut(c, m['overview'] - 0.2, m['overview'] - 0.2 + sl[0], sl[0]),
                cut(c, m['edit'] - 0.2, m['ask'] - 0.5, sl[1], min_speed=0.5),
                cut(c, m['ask'] - 0.4, m['ask'] + 2.9, sl[2], crop=(0, 480, 960, 540)),
                cut(an, a0, a0 + sl[3], sl[3]),
                cut(an, a0 + sl[3], am['answer-end'], sl[4])]
    return None

def build_section(s):
    sid, vis = s['id'], s['visual']
    ls = sec_lines(sid)
    D = sec_dur(sid)
    L = L_of(sid)
    if MASTER_MODE:
        segs = build_master(s)
        if segs:
            return segs
    if sid == 's01':
        return [render_card(card_coldopen, D, L)]
    if sid == 's02':
        return [render_card(card_problem, D, L)]
    if sid == 's07':
        return [render_card(card_inputs, D, L)]
    if sid == 's12':
        return [render_card(card_close, D + 0.3, L)]
    if sid == 's11':
        segs = []
        c = clip_or_none('control')
        if c and 'paypal' in c['m']:
            p = c['m']['paypal']
            segs.append(cut(c, p - 0.2, p + ls[0]['slot'] + 0.5, ls[0]['slot']))
            rest = ls[1]['slot']
            segs.append(render_card(lambda img, t, L_: card_tiles(img, t, L_, 0.0), rest, L))
        else:
            segs.append(render_card(lambda img, t, L_: card_tiles(img, t, L_, 0.0), ls[0]['slot'] + ls[1]['slot'], L))
        segs.append(render_card(lambda img, t, L_: card_code(img, t, L_, 0.0), ls[2]['slot'], L))
        return segs
    if sid == 's03':
        c = clip_or_none('landing')
        if c:
            st = c['m'].get('loaded', 0) + 0.15
            return [cut(c, st, st + D, D)]
    if sid == 's04':
        c = clip_or_none('errand')
        if c:
            a = c['m'].get('create', 0) - 0.3
            b = c['m'].get('type', a + D) - 0.2
            return [cut(c, a, b, D)]
    if sid == 's05':
        c = clip_or_none('errand')
        r = clip_or_none('replay')
        if c:
            m = c['m']
            segs = [
                cut(c, m['type'] - 0.2, m.get('contract-click', m['type'] + 3) + 0.2, ls[0]['slot']),
                cut(c, m.get('contract', 0) - 0.3, m.get('contract', 0) + 2.8, ls[1]['slot']),
                cut(c, m.get('confirmed', 0) - 1.1, m.get('confirmed', 0) + 0.6, ls[2]['slot']),
            ]
            if r:
                segs.append(cut(r, r['m'].get('start', 0) + 0.2, r['m'].get('start', 0) + 0.2 + ls[3]['slot'], ls[3]['slot']))
            else:
                segs.append(cut(c, m.get('confirmed', 0), m.get('confirmed', 0) + ls[3]['slot'], ls[3]['slot']))
            return segs
    if sid == 's06':
        r = clip_or_none('replay')
        if r:
            m = r['m']
            first = min([m[k] for k in ('allow', 'stepup', 'block') if k in m] or [r['len'] / 2])
            lane = m.get('lane', m.get('start', 0) + 2)
            segs = [cut(r, lane, max(first - 0.4, lane + 0.5), ls[0]['slot'])]
            segs.append(cut(r, m['allow'] - 1.0, m['allow'] + 3.2, ls[1]['slot']) if 'allow' in m else render_card(lambda i, t, L_: None, ls[1]['slot'], L))
            if 'stepup' in m:
                segs.append(cut(r, m['stepup'] - 1.0, m.get('approved', m['stepup'] + 3) + 1.2, ls[2]['slot']))
            if 'block' in m:
                segs.append(cut(r, m['block'] - 2.4, m['block'] - 0.05, ls[3]['slot']))
                segs.append(cut(r, m['block'] - 0.05, m['block'] + 2.6, ls[4]['slot']))
            else:
                print('NOTE: no BLOCK in the replay → using the Attack Lab A06-01 BLOCK card for the monitor arm')
                both = ls[3]['slot'] + ls[4]['slot']
                segs.append(render_card(lambda img, t, L_: card_block_fallback(img, t, L_, 0.0), both, L))
            return segs
    if sid == 's08':
        r = clip_or_none('replay')
        if r and 'refund' in r['m']:
            return [cut(r, r['m']['refund'] - 1.6, r['m']['refund'] + 2.8, D)]
    if sid == 's09':
        c = clip_or_none('lab')
        if c:
            m = c['m']
            head = sum(l['slot'] for l in ls[:4])
            return [cut(c, m.get('start', 0) + 0.1, m.get('scroll', 5.5), head), cut(c, m.get('scroll', 5.5), m.get('benign', 7) + 3.5, ls[4]['slot'])]
    if sid == 's10':
        c = clip_or_none('control')
        if c:
            m = c['m']
            segs = [cut(c, m['overview'] - 0.3, m['overview'] + 3.2, ls[0]['slot']),
                    cut(c, m['edit'] - 0.2, m['edit'] + 3.3, ls[1]['slot']),
                    cut(c, m['ask'] - 0.4, m['ask'] + 2.6, ls[2]['slot'])]
            ans0 = m.get('answering', m['ask'] + 1)
            ans1 = m.get('answer', ans0 + 8)
            segs.append(cut(c, ans0, ans1, ls[3]['slot']))
            segs.append(cut(c, ans1 - 0.3, m.get('answer-end', ans1 + 5), ls[4]['slot']))
            return segs
    # placeholder when footage is missing: the section name on black (never ships — the check below fails)
    print(f'NOTE: footage missing for {sid} ({vis}) → placeholder')
    return [render_card(lambda img, t, L_: center_text(img, H // 2, f"[{s['name']} — footage missing]", font('Medium', 48), MUTED), D, L)]

preview = set(filter(None, args.preview.split(',')))

# Each section is rendered once and cached in WORK, keyed by its timing, the footage spec and the code that
# draws it — so a long edit can be built across several runs (--no-mux) and re-muxed quickly.
import inspect
_CODE = ''.join(inspect.getsource(f) for f in (build_master, build_section, cut, kb, render_card)) + \
        ''.join(inspect.getsource(v) for k, v in sorted(globals().items()) if k.startswith('card_') and callable(v))
def section_file(s):
    key = json.dumps([s, [round(l['slot'], 3) for l in sec_lines(s['id'])], args.voice,
                      open(MASTERS).read() if MASTER_MODE else '', _CODE])
    return os.path.join(WORK, f"sec-{s['id']}-{hashlib.sha1(key.encode()).hexdigest()[:10]}.mp4")

segments = []
# lead-in black
segments.append(render_card(lambda img, t, L_: None, LEAD, []))
for s in script['sections']:
    if preview and s['id'] not in preview:
        continue
    p = section_file(s)
    if os.path.exists(p):
        print(f"· {s['id']} {s['name']}: cached")
    else:
        reset_frames()
        segs = build_section(s)
        lst = p + '.txt'
        with open(lst, 'w') as fh:
            fh.writelines(f"file '{q}'\n" for q in segs)
        run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', p])
        print(f"✓ {s['id']} {s['name']}: {len(segs)} segment(s), {sec_dur(s['id']):.2f}s")
    segments.append(p)
if args.no_mux:
    raise SystemExit(0)

# --------------------------------------------------------------------------------------------- audio
voice = os.path.join(WORK, 'voice.wav')
parts = os.path.join(WORK, 'voice.txt')
sil = {}
def silence(d):
    k = round(d, 3)
    if k not in sil:
        p = os.path.join(WORK, f'sil-{k:.3f}.wav')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', f'{k:.3f}', p])
        sil[k] = p
    return sil[k]
with open(parts, 'w') as fh:
    fh.write(f"file '{silence(LEAD)}'\n")
    for l in lines:
        if preview and l['section'] not in preview:
            continue
        fh.write(f"file '{l['file']}'\nfile '{silence(l['pause'])}'\n")
    fh.write(f"file '{silence(0.3)}'\n")
run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', parts, '-ar', '48000', '-ac', '1', voice])

# --------------------------------------------------------------------------------------------- captions (ASS)
def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f'{h}:{m:02d}:{s:05.2f}'
ass = os.path.join(WORK, 'captions.ass')
srt = os.path.join(OUT, 'allowance-demo.srt')
cur = LEAD
rows = []
for l in lines:
    if preview and l['section'] not in preview:
        continue
    rows.append((cur, cur + l['dur'] + min(l['pause'], 0.35), l['caption']))
    cur += l['slot']
with open(ass, 'w') as fh:
    fh.write('[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\n'
             'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
             'Style: Cap,Geist,38,&H00F7F5F5,&H00F7F5F5,&H99000000,&H99000000,0,0,0,0,100,100,0,0,3,14,0,2,200,200,52,1\n\n'
             '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n')
    for a, b, txt in rows:
        fh.write(f'Dialogue: 0,{ts(a)},{ts(b)},Cap,,0,0,0,,{txt}\n')
with open(srt, 'w') as fh:
    for k, (a, b, txt) in enumerate(rows, 1):
        f = lambda x: f'{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round((x%1)*1000)):03d}'
        fh.write(f'{k}\n{f(a)} --> {f(b)}\n{txt}\n\n')

# --------------------------------------------------------------------------------------------- final
cat = os.path.join(WORK, 'segments.txt')
with open(cat, 'w') as fh:
    for p in segments:
        fh.write(f"file '{p}'\n")
pic = os.path.join(WORK, 'picture.mp4')
run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', cat, '-c', 'copy', pic])
name = 'allowance-demo' + ('-preview' if preview else '') + '.mp4'
final = os.path.join(OUT, name)
vf = 'fade=t=in:st=0:d=0.4'
if not args.no_captions:
    fonts_tmp = os.path.join(WORK, 'fonts')  # no spaces in filter arguments
    os.makedirs(fonts_tmp, exist_ok=True)
    for fn in ('Geist-Regular.ttf', 'Geist-Medium.ttf'):
        shutil.copy(os.path.join(FONT_DIR, fn), fonts_tmp)
    vf += f",subtitles={ass}:fontsdir={fonts_tmp}"
# two-pass loudness: measure the voice-over, then normalise linearly to −14 LUFS / −1.5 dBTP
ST = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'  # measure what ships: the stereo mix
meas = subprocess.run(['ffmpeg', '-hide_banner', '-i', voice, '-af', f'{ST},loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                      capture_output=True, text=True).stderr
mj = json.loads(meas[meas.rindex('{'):meas.rindex('}') + 1])
ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={mj['input_i']}:measured_TP={mj['input_tp']}:measured_LRA={mj['input_lra']}"
      f":measured_thresh={mj['input_thresh']}:offset={mj['target_offset']}:linear=true")
run(['ffmpeg', '-y', '-loglevel', 'error', '-i', pic, '-i', voice,
     '-filter_complex', f'[0:v]{vf}[v];[1:a]{ST},{ln},{ST}[a]',
     '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', str(FPS),
     '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final])
d = float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]))
print(f"\n→ {final}  ({int(d // 60)}:{d % 60:04.1f}, {os.path.getsize(final) / 1e6:.1f} MB)")
if d > 178:
    print('WARNING: over 2:58')
