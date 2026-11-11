#!/usr/bin/env python3
"""Speak the demo-video script in Roshan's own voice, cloned LOCALLY from his recording (no cloud, no API key).

Run it through the wrapper, which builds the Python environment the first time:
    bash scripts/video/clone-local.sh --try        # opening + closing lines only, to listen first
    bash scripts/video/clone-local.sh              # all lines
    bash scripts/video/clone-local.sh --only s06-04,s09-03 --seed 7   # redo a few lines

Model: Chatterbox by Resemble AI (MIT licence), zero-shot voice cloning. Every output carries Resemble's
inaudible watermark marking it as AI-generated. Output: ../video/vo/final_pick/<section>-<nn>.wav + manifest.json,
which scripts/video/assemble.py reads with --voice final_pick.

"Same voice as the sample": the reference is cleaned (pauses shortened, level evened) so the model's
10-second timbre window is full speech, and every generated line is scored against the sample with the
model's own speaker encoder. Lines that sound less like you, or run too long/short, are re-generated
with a new seed and the closest take is kept.
"""
import argparse, json, os, shutil, subprocess, sys, time

ap = argparse.ArgumentParser()
ap.add_argument('--try', dest='try_', action='store_true', help='only the opening and closing lines')
ap.add_argument('--only', default='', help='comma list like s06-04,s09-03')
ap.add_argument('--sample', default=None, help='your recording (default ../video/vo/samples/final_pick.mp3)')
ap.add_argument('--device', default='auto', choices=['auto', 'mps', 'cpu'])
ap.add_argument('--exaggeration', type=float, default=0.45, help='0.25 calmer … 0.7 more animated')
ap.add_argument('--cfg', type=float, default=0.4, help='lower = slower, more deliberate pacing')
ap.add_argument('--temperature', type=float, default=0.7)
ap.add_argument('--seed', type=int, default=42)
ap.add_argument('--takes', type=int, default=3, help='max takes per line when a take sounds off')
ap.add_argument('--min-sim', type=float, default=0.80, help='speaker similarity a take must reach (0–1)')
ap.add_argument('--force', action='store_true', help='re-generate lines that already exist')
args = ap.parse_args()

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VO = os.path.join(os.path.dirname(REPO), 'video', 'vo')
OUT = os.path.join(VO, 'final_pick')
os.makedirs(OUT, exist_ok=True)
sample = os.path.abspath(args.sample or os.path.join(VO, 'samples', 'final_pick.mp3'))
if not os.path.exists(sample):
    sys.exit(f'Sample not found: {sample}')

import numpy as np
import librosa
import torch
import torchaudio as ta
from chatterbox.tts import ChatterboxTTS

# ---------------------------------------------------------------- reference: dense, even, clean
ref = os.path.join(VO, 'samples', 'final_pick_ref.wav')
if shutil.which('ffmpeg'):
    af = ('highpass=f=60,'
          'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05:'
          'stop_periods=-1:stop_duration=0.3:stop_threshold=-40dB:stop_silence=0.18,'
          'loudnorm=I=-20:TP=-2:LRA=11')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', sample, '-af', af, '-ar', '24000', '-ac', '1', ref], check=True)
else:  # no ffmpeg: trim the edges and drop long pauses with librosa
    y, sr = librosa.load(sample, sr=24000, mono=True)
    parts = librosa.effects.split(y, top_db=35)
    gap = np.zeros(int(0.18 * sr), dtype=y.dtype)
    y = np.concatenate([np.concatenate([y[a:b], gap]) for a, b in parts])
    y = 0.1 * y / (np.sqrt(np.mean(y ** 2)) + 1e-9)
    ta.save(ref, torch.from_numpy(np.clip(y, -1, 1)).unsqueeze(0), sr)
ref_len = librosa.get_duration(path=ref)
print(f'reference: {os.path.basename(sample)} → {ref_len:.1f} s of speech (pauses shortened)')

# ---------------------------------------------------------------- model
def load(device):
    t = time.time()
    m = ChatterboxTTS.from_pretrained(device=device)
    print(f'model ready on {device} ({time.time() - t:.0f} s; the first run downloads it once)')
    return m

device = args.device
if device == 'auto':
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
model = load(device)
model.prepare_conditionals(ref, exaggeration=args.exaggeration)

ref16 = librosa.load(ref, sr=16000)[0]
ref_emb = model.ve.embeds_from_wavs([ref16], sample_rate=16000).mean(axis=0)

def similarity(wav, sr):
    w16 = librosa.resample(wav, orig_sr=sr, target_sr=16000)
    e = model.ve.embeds_from_wavs([w16], sample_rate=16000).mean(axis=0)
    return float(np.dot(e, ref_emb) / (np.linalg.norm(e) * np.linalg.norm(ref_emb) + 1e-9))

def synth(text, seed):
    global model, device
    torch.manual_seed(seed)
    try:
        wav = model.generate(text, exaggeration=args.exaggeration, cfg_weight=args.cfg, temperature=args.temperature)
    except Exception as e:  # MPS can be flaky with some ops: fall back to CPU once and carry on
        if device != 'mps':
            raise
        print(f'  (MPS failed: {str(e)[:120]} → switching to CPU)')
        device = 'cpu'
        model = load('cpu')
        model.prepare_conditionals(ref, exaggeration=args.exaggeration)
        torch.manual_seed(seed)
        wav = model.generate(text, exaggeration=args.exaggeration, cfg_weight=args.cfg, temperature=args.temperature)
    return wav  # torch tensor [1, n] at model.sr

# ---------------------------------------------------------------- lines
script = json.load(open(os.path.join(REPO, 'scripts', 'video', 'script.json')))
lines = [(s['id'], i, l) for s in script['sections'] for i, l in enumerate(s['lines'])]
only = set(filter(None, args.only.split(',')))
todo = [x for x in lines if (not args.try_ or x[0] in ('s01', 's12')) and (not only or f'{x[0]}-{x[1] + 1:02d}' in only)]

manifest_path = os.path.join(OUT, 'manifest.json')
report = json.load(open(manifest_path)).get('report', {}) if os.path.exists(manifest_path) else {}
t_all = time.time()
for n, (sid, i, l) in enumerate(todo, 1):
    name = f'{sid}-{i + 1:02d}'
    path = os.path.join(OUT, name + '.wav')
    if os.path.exists(path) and not args.force and not only:
        print(f'· {name} kept')
        continue
    words = len(l['tts'].split())
    expected = max(0.9, words / 2.5)  # ~150 wpm, calm
    best = None
    for k in range(args.takes):
        seed = args.seed + 1000 * k + n
        wav = synth(l['tts'], seed)
        a = wav.squeeze(0).numpy()
        dur = len(a) / model.sr
        sim = similarity(a, model.sr)
        ratio = dur / expected
        ok_len = 0.45 <= ratio <= 2.1
        score = sim - (0 if ok_len else 0.5) - 0.05 * abs(np.log(max(ratio, 1e-3)))
        if best is None or score > best[0]:
            best = (score, wav, dur, sim, seed)
        if ok_len and sim >= args.min_sim:
            break
        print(f'  {name} take {k + 1}: {dur:.1f}s (expected ~{expected:.1f}s), similarity {sim:.2f} → retrying')
    _, wav, dur, sim, seed = best
    ta.save(path, wav, model.sr)
    old = os.path.join(OUT, name + '.mp3')
    if os.path.exists(old):
        os.remove(old)
    report[name] = {'similarity': round(sim, 3), 'seconds': round(dur, 2), 'seed': seed}
    eta = (time.time() - t_all) / n * (len(todo) - n)
    flag = '' if sim >= args.min_sim else '  ← least like you; try --only ' + name + ' --seed 7'
    print(f'✓ {name}  {dur:4.1f}s  similarity {sim:.2f}  "{l["caption"][:50]}"  (~{eta / 60:.0f} min left){flag}')

json.dump({'voice': 'final_pick', 'provider': 'chatterbox (local)', 'device': device,
           'settings': {'exaggeration': args.exaggeration, 'cfg': args.cfg, 'temperature': args.temperature},
           'report': report,
           'lines': [{'section': sid, 'index': i, 'file': f'{sid}-{i + 1:02d}.wav', 'caption': l['caption'], 'pause': l['pause'], 'beat': l.get('beat')}
                     for sid, i, l in lines]},
          open(manifest_path, 'w'), indent=2)
sims = [v['similarity'] for v in report.values()]
if sims:
    print(f'\nAverage similarity to your sample: {sum(sims) / len(sims):.2f} (1.00 = identical voice print)')
if args.try_:
    print(f'Listen to {OUT}/s01-*.wav and s12-*.wav. Happy? Run: bash scripts/video/clone-local.sh')
else:
    print(f'Done → {OUT}. Tell Claude "voice done".')
