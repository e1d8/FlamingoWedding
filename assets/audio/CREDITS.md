# Quiet lagoon and original musical soundscape

The still-water texture and both musical passages were authored specifically for
this invitation with offline Web Audio. Only pre-rendered files play at runtime.
There is no synthesis workload during the visit.

| Files | Origin |
| --- | --- |
| `lagoon.m4a` (42 s), `water-1.m4a` … `water-3.m4a` | Original sound design: isolated soft laps and small surface bubbles. These files contain no field-recording background, flowing river or continuous wind. |
| `ascent.m4a` (12 s) | Original opening: very soft piano-like additive tones, slow suspended harmony and long stereo reverberation. |
| `sky.m4a` (96 s) | Original companion score: spacious Dmaj9 / Bm11 / Gmaj9 / Dmaj9-A harmony, sparse notes, no percussion. Opening and loop share their harmony. |
| `flamingo-1.m4a` … `flamingo-3.m4a` | Excerpts from [Flamingos](https://freesound.org/people/Breviceps/sounds/535778/) by **Breviceps**, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Real flamingo vocalizations recorded with a mobile phone. |
| `wing.m4a` | [Wing Flap 1.wav](https://freesound.org/people/_stubb/sounds/389634/) by **_stubb**, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Coat foley for wing motion. |

The music is an original composition, with a contemplative puzzle-game mood.
No existing game soundtrack is sampled. Source licenses checked on 2026-11-10.

The flamingo excerpts use the public HQ preview at 0.12–1.55 s, 3.35–5.35 s and
8.4–9.9 s. They are filtered at 300–3300 Hz, gently gated and faded, then normalized
with a peak limit. Playback retains their natural pitch within ±1.5%.
The wider water, generic bird and countryside-wind recordings from the earlier
iteration are removed from the project and are not requested by the player.

Final files: stereo AAC, 32 kHz / 96 kbps, about 1.67 MB combined. Buffers overlap
at runtime to conceal codec padding. The score uses a 4.5-second crossfade.

## Optional authoring

`tools/compose-ambience.browser.js` contains the deterministic original sound
and music arrangement. Over local HTTP, its `renderWater(name)` and
`renderMusic(name)` functions return AudioBuffers, and `wavBytes(buffer)` exports
PCM WAV. Render `lagoon`, `water-1`, `water-2`, `water-3`, `ascent` and `sky` into a
folder. For example, in a local browser console, export one name at a time:

```js
const composer = await import('/tools/compose-ambience.browser.js');
const name = 'sky';
const buffer = await (['ascent', 'sky'].includes(name)
  ? composer.renderMusic(name) : composer.renderWater(name));
const url = URL.createObjectURL(new Blob([composer.wavBytes(buffer)], {type: 'audio/wav'}));
const link = document.createElement('a');
link.href = url;
link.download = `${name}.wav`;
link.click();
setTimeout(() => URL.revokeObjectURL(url), 10000);
```

Then encode and prepare the two CC0 sources using Python's standard library and
macOS `afconvert`:

```sh
python3 tools/prepare-audio.py --renders /path/to/rendered-wavs
```

This authoring step requires a network connection. Publishing the existing files
requires neither conversion tools nor external audio services.
