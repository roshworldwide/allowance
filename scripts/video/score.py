#!/usr/bin/env python3
"""An original, quiet ambient score for the demo video (numpy only — no samples, no licences).

  score(cues, total, out_wav)   cues = {'lift': s, 'block': s, 'onemore': s, 'close': s}

Soft sine pads in D major with a slow chorus and a long synthetic reverb, a low root under the demo,
sparse glass notes, a breath of silence on "Blocked.", and a final swell that rings out under the close.
It is mixed far under the voice (and ducked against it) by the editor.
"""
import numpy as np
import wave

SR = 48000

def _note(f):
    return 440.0 * 2 ** ((f - 69) / 12)

# MIDI voicings
CH = {
    'Bm9':   [47, 54, 61, 62, 66],        # B2 F#3 C#4 D4 F#4  (cold open: unresolved)
    'Gmaj7': [43, 50, 54, 59, 61],        # G2 D3 F#3 B3 C#4
    'Dmaj9': [50, 57, 61, 64, 66],        # D3 A3 C#4 E4 F#4
    'Bm11':  [47, 54, 57, 62, 64],        # B2 F#3 A3 D4 E4
    'Asus2': [45, 52, 57, 59, 64],        # A2 E3 A3 B3 E4
    'Dadd9': [38, 50, 57, 64, 66, 69],    # D2 D3 A3 E4 F#4 A4 (final)
}

def _env(n, a, r):
    e = np.ones(n)
    ai, ri = int(a * SR), int(r * SR)
    if ai: e[:ai] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ai))
    if ri: e[-ri:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, ri))
    return e

def _pad(chord, dur, amp=1.0, seed=0):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    L = np.zeros(n); R = np.zeros(n)
    for k, m in enumerate(chord):
        f = _note(m)
        w = amp * (0.9 if k else 0.7) / len(chord)
        for side, det in ((L, -4), (R, 4)):
            ff = f * 2 ** ((det + rng.uniform(-1.5, 1.5)) / 1200)
            vib = 1 + 0.0012 * np.sin(2 * np.pi * rng.uniform(0.08, 0.17) * t + rng.uniform(0, 6.28))
            ph = 2 * np.pi * np.cumsum(ff * vib) / SR
            side += w * (np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph))
    e = _env(n, min(2.6, dur / 2.5), min(3.2, dur / 2.2))
    return L * e, R * e

def _bell(f, dur=2.8, amp=0.06):
    n = int(dur * SR); t = np.arange(n) / SR
    x = amp * np.exp(-t * 2.2) * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 4))
    x[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return x

def _lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    from scipy.signal import lfilter
    return lfilter([1 - a], [1, -a], x)

def _reverb(L, R, seconds=4.2, mix=0.42, seed=7):
    from scipy.signal import fftconvolve
    rng = np.random.default_rng(seed)
    n = int(seconds * SR); t = np.arange(n) / SR
    decay = np.exp(-t * 6.9 / seconds)
    irL = rng.standard_normal(n) * decay; irR = rng.standard_normal(n) * decay
    irL = _lowpass(irL, 5200); irR = _lowpass(irR, 5200)
    irL /= np.sqrt((irL ** 2).sum()); irR /= np.sqrt((irR ** 2).sum())
    wl = fftconvolve(L, irL)[: len(L)]; wr = fftconvolve(R, irR)[: len(R)]
    return (1 - mix) * L + mix * wl, (1 - mix) * R + mix * wr

def score(cues, total, out_wav):
    total = float(total)
    n = int((total + 0.5) * SR)
    L = np.zeros(n); R = np.zeros(n)
    def add(sig, start):
        l, r = sig if isinstance(sig, tuple) else (sig, sig)
        i = int(start * SR); j = min(n, i + len(l))
        if j > i:
            L[i:j] += l[: j - i]; R[i:j] += r[: j - i]
    lift, block, onemore, close = cues['lift'], cues['block'], cues['onemore'], cues['close']
    # 1 · cold open + problem: one unresolved chord, then a darker turn
    add(_pad(CH['Bm9'], lift * 0.55 + 3, 0.75, 1), 0.0)
    add(_pad(CH['Gmaj7'], lift * 0.45 + 3.5, 0.75, 2), lift * 0.55)
    # 2 · the product: D major cycle, 8 s per chord, from the lift until the close
    prog = ['Dmaj9', 'Bm11', 'Gmaj7', 'Asus2']
    t = lift; k = 0
    while t < close - 1:
        d = min(8.0, close - t) + 3.0
        add(_pad(CH[prog[k % 4]], d, 1.0, 10 + k), t)
        root = _note(CH[prog[k % 4]][0] - 12)
        nn = int(d * SR); tt = np.arange(nn) / SR
        add(0.10 * np.sin(2 * np.pi * root * tt) * _env(nn, 2.0, 3.0), t)
        t += 8.0; k += 1
    # glass notes, sparse, through the demo
    rng = np.random.default_rng(42)
    penta = [74, 76, 78, 81, 83, 86]
    t = lift + 2.0
    while t < close - 3:
        if not (block - 2.5 < t < block + 2.0):
            add(_bell(_note(int(rng.choice(penta))), amp=0.045), t)
        t += rng.uniform(2.6, 4.2)
    # 3 · the close: a wide resolved chord that rings out
    add(_pad(CH['Dadd9'], total - close + 2.0, 1.25, 99), close - 0.6)
    for k_, m in enumerate([81, 86, 90]):
        add(_bell(_note(m), dur=4.0, amp=0.05), close + 0.4 + 0.5 * k_)

    L = _lowpass(L, 3600); R = _lowpass(R, 3600)
    L, R = _reverb(L, R)
    # dynamics: soft open, lift, a held breath on "Blocked.", rise for "one more thing", swell + fade at the end
    tt = np.arange(n) / SR
    g = np.interp(tt,
                  [0, 1.5, lift - 0.5, lift + 1.5, block - 0.6, block - 0.1, block + 1.4, block + 3.0, onemore - 0.4, onemore + 0.3, onemore + 3.0, close - 1.0, close + 1.5, total - 2.5, total + 0.5],
                  [0, 0.55, 0.6, 0.95, 0.9, 0.18, 0.18, 0.9, 0.85, 0.45, 0.95, 0.95, 1.2, 1.0, 0.0])
    L *= g; R *= g
    peak = max(np.abs(L).max(), np.abs(R).max(), 1e-9)
    L *= 0.5 / peak; R *= 0.5 / peak
    st = np.stack([L, R], axis=1)
    pcm = (np.clip(st, -1, 1) * 32767).astype('<i2')
    with wave.open(out_wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    return out_wav

if __name__ == '__main__':
    import sys
    score({'lift': 21.0, 'block': 82.0, 'onemore': 128.0, 'close': 166.0}, 178.0, sys.argv[1] if len(sys.argv) > 1 else '/tmp/score-test.wav')
    print('ok')
