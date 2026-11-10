"""Encode the offline-authored water/music and prepare isolated CC0 flamingo calls.

First render tools/compose-ambience.browser.js to WAV over local HTTP. Then run:
  python3 tools/prepare-audio.py --renders /path/to/rendered-wavs
Only final M4A files are needed for publishing. Uses macOS afconvert and stdlib.
"""
import argparse
import array
import math
from pathlib import Path
import subprocess
import tempfile
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'flamingos': 'https://cdn.freesound.org/previews/535/535778_9159316-hq.mp3',
    'wing': 'https://cdn.freesound.org/previews/389/389634_6068748-hq.mp3',
}
CALLS = [('flamingo-1', .12, 1.55), ('flamingo-2', 3.35, 5.35), ('flamingo-3', 8.4, 9.9)]


def read_wav(path):
    with wave.open(str(path), 'rb') as source:
        assert source.getframerate() == 32000 and source.getnchannels() == 2
        assert source.getsampwidth() == 2
        return array.array('f', (n / 32768 for n in array.array('h', source.readframes(source.getnframes()))))


def encode(samples, path, cache, rms_target, peak_limit, fade=.12):
    rms = math.sqrt(sum(x * x for x in samples) / len(samples))
    gain = min(rms_target / max(rms, 1e-6), peak_limit / max(max(abs(x) for x in samples), 1e-6))
    frames, fade_frames = len(samples) // 2, fade * 32000
    pcm = array.array('h')
    for i, sample in enumerate(samples):
        edge = min(1., (i // 2) / fade_frames, (frames - 1 - i // 2) / fade_frames)
        envelope = math.sin(edge * math.pi / 2) ** 2
        pcm.append(round(sample * gain * envelope * 32767))
    wav = cache / f'{path.stem}-prepared.wav'
    with wave.open(str(wav), 'wb') as destination:
        destination.setnchannels(2)
        destination.setsampwidth(2)
        destination.setframerate(32000)
        destination.writeframes(pcm.tobytes())
    subprocess.run(['afconvert', str(wav), str(path), '-f', 'm4af', '-d', 'aac', '-b', '96000', '-q', '127'], check=True)
    print(f'{path.name}: {frames / 32000:.2f}s, {path.stat().st_size} bytes')


def clean_call(samples):
    # Keep the dominant short call, suppress low background and the phone's hiss.
    hp = math.exp(-2 * math.pi * 300 / 32000)
    lp = math.exp(-2 * math.pi * 3300 / 32000)
    previous, high, low = [0., 0.], [0., 0.], [0., 0.]
    clean = array.array('f')
    for i, sample in enumerate(samples):
        channel = i % 2
        high[channel] = hp * (high[channel] + sample - previous[channel])
        previous[channel] = sample
        low[channel] = low[channel] * lp + high[channel] * (1 - lp)
        clean.append(low[channel])
    peak = max(abs(x) for x in clean)
    envelope = 0.
    for frame in range(len(clean) // 2):
        level = max(abs(clean[frame * 2]), abs(clean[frame * 2 + 1]))
        envelope = envelope * .994 + level * .006
        gate = min(1., envelope / max(peak * .08, 1e-6)) ** 2
        clean[frame * 2] *= gate
        clean[frame * 2 + 1] *= gate
    return clean


def prepare(renders):
    output = ROOT / 'assets/audio'
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='sarapau-audio-') as directory:
        cache = Path(directory)
        for name in ['lagoon', 'water-1', 'water-2', 'water-3', 'ascent', 'sky']:
            water = name.startswith('water') or name == 'lagoon'
            rms, peak = (.022, .18) if name == 'lagoon' else (.055, .28) if water else (.06, .34)
            encode(read_wav(renders / f'{name}.wav'), output / f'{name}.m4a', cache, rms, peak, .2)
        decoded = {}
        for name, url in SOURCES.items():
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=40) as response:
                (cache / f'{name}.mp3').write_bytes(response.read())
            subprocess.run(['afconvert', str(cache / f'{name}.mp3'), str(cache / f'{name}.wav'), '-f', 'WAVE', '-d', 'LEI16@32000', '-c', '2'], check=True)
            decoded[name] = read_wav(cache / f'{name}.wav')
        for name, start, end in CALLS:
            excerpt = decoded['flamingos'][round(start * 32000) * 2:round(end * 32000) * 2]
            encode(clean_call(excerpt), output / f'{name}.m4a', cache, .07, .38)
        encode(decoded['wing'], output / 'wing.m4a', cache, .09, .32, .04)
        # Retire the earlier broad field recordings, including their incidental noise.
        for name in ['breeze', 'bird-1', 'bird-2', 'bird-3', 'bird-4', 'reeds-1', 'reeds-2']:
            (output / f'{name}.m4a').unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--renders', type=Path, required=True)
    prepare(parser.parse_args().renders)
