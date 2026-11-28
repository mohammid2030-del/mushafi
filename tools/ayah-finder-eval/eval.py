"""Ayah Finder test: can a recitation speech model + the matcher find the verse from a short clip?

Clips are cut from the app's own verse-by-verse recitations (and two reciters the app does not
ship), clean and with mosque-like noise and echo. Writes report.md and results.json.
"""
import json, os, random, subprocess, sys, time, urllib.request
import numpy as np
from matcher import Quran

HERE = os.path.dirname(os.path.abspath(__file__))
Q = Quran(os.path.join(HERE, '../../android/assets/quran.js'))
SR = 16000
N = int(os.environ.get('CLIPS', '90'))
CACHE = '/tmp/ayah-audio'
os.makedirs(CACHE, exist_ok=True)

RECITERS = {  # in the app
    'العفاسي': 'https://verses.quran.com/Alafasy/mp3/{s:03d}{a:03d}.mp3',
    'الحصري': 'https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/{s:03d}{a:03d}.mp3',
    'عبدالباسط': 'https://verses.quran.com/AbdulBaset/Murattal/mp3/{s:03d}{a:03d}.mp3',
    'السديس': 'https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps/{s:03d}{a:03d}.mp3',
}
OTHER = {  # not in the app
    'ماهر المعيقلي': 'https://everyayah.com/data/MaherAlMuaiqly128kbps/{s:03d}{a:03d}.mp3',
    'المنشاوي': 'https://everyayah.com/data/Minshawy_Murattal_128kbps/{s:03d}{a:03d}.mp3',
}
ALL = {**RECITERS, **OTHER}
keys = list(Q.verse_text)


def audio(url):
    path = os.path.join(CACHE, url.replace('/', '_').replace(':', ''))
    if not os.path.exists(path):
        for _ in range(3):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mushafi-test'})
                open(path, 'wb').write(urllib.request.urlopen(req, timeout=30).read())
                break
            except Exception as e:
                err = e
        else:
            raise err
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def next_key(k):
    i = keys.index(k)
    return keys[i + 1] if i + 1 < len(keys) else None


def make_clip(rng, url_t, seconds):
    """Pick a verse, start somewhere inside it, run on into the next verse if short."""
    while True:
        k = rng.choice(keys)
        s, a = map(int, k.split(':'))
        try:
            x = audio(url_t.format(s=s, a=a))
        except Exception:
            continue
        if len(x) < SR * 1.5:
            continue
        start = int(rng.uniform(0, max(0, len(x) - SR * 1.0)) * 0.7)
        seg, truth, kk = x[start:], [k], k
        while len(seg) < seconds * SR:
            kk = next_key(kk)
            if not kk:
                break
            s2, a2 = map(int, kk.split(':'))
            try:
                seg = np.concatenate([seg, audio(url_t.format(s=s2, a=a2))])
            except Exception:
                break
            truth.append(kk)
        seg = seg[:int(seconds * SR)]
        if len(seg) < seconds * SR * 0.9:
            continue
        return seg, truth


def mosque(x, rng, snr_db=8):
    """Echo of a big room plus crowd-like noise."""
    t = np.arange(int(SR * 0.6)) / SR
    ir = rng.standard_normal(len(t)) * np.exp(-t / 0.18)
    ir[0] = 1.0
    wet = np.convolve(x, ir)[:len(x)]
    wet /= (np.abs(wet).max() + 1e-6) / (np.abs(x).max() + 1e-6)
    noise = np.cumsum(rng.standard_normal(len(x))) ; noise -= np.convolve(noise, np.ones(400) / 400, 'same')
    noise += rng.standard_normal(len(x)) * 0.3
    p = np.mean(wet ** 2)
    noise *= np.sqrt(p / (10 ** (snr_db / 10)) / (np.mean(noise ** 2) + 1e-9))
    return (0.6 * x + 0.6 * wet + noise).astype(np.float32)


def main():
    import torch
    from transformers import pipeline
    torch.set_num_threads(2)  # roughly a phone's share of cores
    rng = random.Random(7)
    nrng = np.random.default_rng(7)
    names = list(ALL)
    clips = []
    for i in range(N):
        rec = names[i % len(names)]
        secs = 8 if i % 3 else 5
        seg, truth = make_clip(rng, ALL[rec], secs)
        clips.append({'reciter': rec, 'in_app': rec in RECITERS, 'secs': secs, 'truth': truth,
                      'clean': seg, 'noisy': mosque(seg, nrng)})
    print('clips ready', len(clips), flush=True)
    models = os.environ.get('MODELS', 'tarteel-ai/whisper-tiny-ar-quran,tarteel-ai/whisper-base-ar-quran').split(',')
    results = {}
    for m in models:
        asr = pipeline('automatic-speech-recognition', model=m, device='cpu')
        # these fine-tunes ship an old generation config; take the matching OpenAI one
        from transformers import GenerationConfig
        base = 'openai/whisper-' + next(x for x in ('tiny', 'base', 'small', 'medium') if x in m)
        asr.model.generation_config = GenerationConfig.from_pretrained(base)
        rows = []
        for c in clips:
            for cond in ('clean', 'noisy'):
                t0 = time.time()
                text = asr({'raw': c[cond], 'sampling_rate': SR},
                           generate_kwargs={'language': 'ar', 'task': 'transcribe'})['text']
                t_asr = time.time() - t0
                t0 = time.time()
                found = Q.find(text)
                t_match = time.time() - t0
                truth = set(c['truth'])
                top1 = bool(found) and bool(set(found[0][1]) & truth)
                top3 = any(set(f[1]) & truth for f in found)
                rows.append({'reciter': c['reciter'], 'in_app': c['in_app'], 'secs': c['secs'], 'cond': cond,
                             'truth': c['truth'], 'heard': text, 'found': found, 'top1': top1, 'top3': top3,
                             'asr_s': round(t_asr, 2), 'match_s': round(t_match, 3)})
            print(m.split('/')[-1], len(rows), flush=True)
        size = 0
        try:
            from huggingface_hub import snapshot_download
            d = snapshot_download(m, allow_patterns=['*.safetensors', '*.bin'])
            size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(d) for f in fs if f.endswith(('.safetensors', '.bin'))) / 1e6
        except Exception:
            pass
        results[m] = {'rows': rows, 'size_mb': round(size)}
    json.dump(results, open(os.path.join(HERE, 'results.json'), 'w'), ensure_ascii=False, indent=1)
    report(results)


def pct(rows, key='top1'):
    return f"{100 * sum(r[key] for r in rows) / max(1, len(rows)):.0f}%" if rows else '-'


def report(results):
    out = ['# Ayah Finder test', '']
    for m, res in results.items():
        rows = res['rows']
        out += [f"## {m}  (file {res['size_mb']} MB)", '',
                '| condition | first answer right | in top 3 | avg seconds to hear |', '|---|---|---|---|']
        for label, f in [('all', lambda r: True), ('clean', lambda r: r['cond'] == 'clean'),
                         ('mosque noise', lambda r: r['cond'] == 'noisy'), ('8 s clips', lambda r: r['secs'] == 8),
                         ('5 s clips', lambda r: r['secs'] == 5), ('reciters in the app', lambda r: r['in_app']),
                         ('reciters not in the app', lambda r: not r['in_app'])]:
            sub = [r for r in rows if f(r)]
            avg = sum(r['asr_s'] for r in sub) / max(1, len(sub))
            out.append(f"| {label} | {pct(sub)} | {pct(sub, 'top3')} | {avg:.2f} |")
        out += ['', '| reciter | clean | noise |', '|---|---|---|']
        for rec in ALL:
            out.append(f"| {rec} | {pct([r for r in rows if r['reciter'] == rec and r['cond'] == 'clean'])} | {pct([r for r in rows if r['reciter'] == rec and r['cond'] == 'noisy'])} |")
        miss = [r for r in rows if not r['top1']][:12]
        out += ['', 'Misses (truth → heard → first answer):', '']
        for r in miss:
            out.append(f"- {r['cond']} {r['secs']}s {r['reciter']}: {','.join(r['truth'])} → «{r['heard']}» → {r['found'][0][1] if r['found'] else '-'}")
        out.append('')
    text = '\n'.join(out)
    open(os.path.join(HERE, 'report.md'), 'w').write(text)
    print(text)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        open(os.environ['GITHUB_STEP_SUMMARY'], 'a').write(text)


if __name__ == '__main__':
    main()
