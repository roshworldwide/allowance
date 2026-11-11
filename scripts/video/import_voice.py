#!/usr/bin/env python3
"""Import the browser-assembled ElevenLabs voice-over (one WAV with every line + an 'alnx' index chunk).

  python3 scripts/video/import_voice.py ~/Downloads/allowance-voiceover-lohi.wav [--name lohi]

Writes ../video/vo/<name>/<section>-<nn>.wav (what assemble.py reads with --voice <name>) and
../video/vo/allowance-voiceover-<name>.mp3 — the whole voice-over with the script's own pauses.
"""
import argparse, json, os, struct, subprocess, sys, wave

ap = argparse.ArgumentParser()
ap.add_argument('wav')
ap.add_argument('--name', default='lohi')
args = ap.parse_args()
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VO = os.path.join(os.path.dirname(REPO), 'video', 'vo')
out = os.path.join(VO, args.name)
os.makedirs(out, exist_ok=True)

raw = open(args.wav, 'rb').read()
if raw[:4] != b'RIFF' or raw[8:12] != b'WAVE':
    sys.exit('not a WAV file')
pos, meta, fmt, data = 12, None, None, None
while pos + 8 <= len(raw):
    cid, size = raw[pos:pos + 4], struct.unpack('<I', raw[pos + 4:pos + 8])[0]
    body = raw[pos + 8:pos + 8 + size]
    if cid == b'fmt ':
        fmt = struct.unpack('<HHIIHH', body[:16])
    elif cid == b'alnx':
        meta = json.loads(body.rstrip(b'\x00 ').decode())
    elif cid == b'data':
        data = body
    pos += 8 + size + (size % 2)
if not (fmt and meta and data):
    sys.exit('missing fmt/alnx/data chunk — was this saved by the "Save ALLOWANCE voice-over" button?')
_, channels, sr, _, align, bits = fmt
assert channels == 1 and bits == 16, fmt

script = json.load(open(os.path.join(REPO, 'scripts', 'video', 'script.json')))
pauses = {f"{s['id']}-{i + 1:02d}": l['pause'] for s in script['sections'] for i, l in enumerate(s['lines'])}
missing = [n for n in pauses if n not in {x[0] for x in meta['lines']}]
if missing:
    sys.exit(f'the WAV lacks lines: {missing}')

for name, a, b in meta['lines']:
    with wave.open(os.path.join(out, f'{name}.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(data[a * 2:b * 2])
print(f"✓ {len(meta['lines'])} lines → {out}  ({meta.get('voice', '')})")

# The full voice-over as one MP3, paced exactly like the video (0.5 s lead, the script's pauses, silences trimmed).
work = os.path.join(out, '.tmp'); os.makedirs(work, exist_ok=True)
trim = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,'
        'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse')
lst = os.path.join(work, 'list.txt')
sil = {}
def silence(d):
    k = f'{d:.2f}'
    if k not in sil:
        p = os.path.join(work, f'sil-{k}.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'anullsrc=r={sr}:cl=mono', '-t', k, p], check=True)
        sil[k] = p
    return sil[k]
with open(lst, 'w') as fh:
    fh.write(f"file '{silence(0.5)}'\n")
    for name, _, _ in meta['lines']:
        t = os.path.join(work, f'{name}.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(out, f'{name}.wav'), '-af', trim, '-ar', str(sr), '-ac', '1', t], check=True)
        fh.write(f"file '{t}'\nfile '{silence(pauses[name])}'\n")
mp3 = os.path.join(VO, f'allowance-voiceover-{args.name}.mp3')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
                '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '192k', mp3], check=True)
d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], capture_output=True, text=True).stdout)
print(f'✓ {mp3}  ({int(d // 60)}:{d % 60:04.1f})')
