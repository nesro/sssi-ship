// Dev-only soundboard — audition and tune every procedural SFX live. Not part of the
// shipped game (served by Vite at /soundboard.html, never in the build input). Renders
// each spec from src/audio/synthVoices.ts with adjustable synth params + playback
// gain/detune, so values can be dialled in here and then baked into SFX_SPECS /
// SoundManager. The music track is licensed audio (a file), shown here only for reference.

import { renderSpec, SFX_SPECS } from '../src/audio/synthVoices';
import type { SoundSpec } from '../src/audio/synthVoices';

const ctx = new AudioContext();

interface Row { gain: number; detune: number; params: Record<string, number>; }
const state = new Map<string, Row>();
for (const spec of SFX_SPECS) {
  state.set(spec.key, { gain: spec.gain, detune: 0, params: { ...spec.params } });
}

function play(spec: SoundSpec): void {
  void ctx.resume();
  const row = state.get(spec.key)!;
  const data = renderSpec(spec, ctx.sampleRate, row.params);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.detune.value = row.detune;
  const gain = ctx.createGain();
  gain.gain.value = row.gain;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

interface SliderOpts { label: string; value: number; min: number; max: number; step: number; onInput: (v: number) => void; }

function slider(o: SliderOpts): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'slider';
  const name = document.createElement('span');
  name.className = 'sname';
  name.textContent = o.label;
  const val = document.createElement('span');
  val.className = 'sval';
  const fmt = (v: number): string => v.toFixed(o.step < 1 ? 2 : 0);
  val.textContent = fmt(o.value);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(o.min);
  input.max = String(o.max);
  input.step = String(o.step);
  input.value = String(o.value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = fmt(v);
    o.onInput(v);
  });
  wrap.append(name, input, val);
  return wrap;
}

function card(spec: SoundSpec): HTMLElement {
  const row = state.get(spec.key)!;
  const el = document.createElement('div');
  el.className = 'card';

  const head = document.createElement('div');
  head.className = 'head';
  const title = document.createElement('button');
  title.className = 'play';
  title.textContent = `▶ ${spec.key}`;
  title.addEventListener('click', () => { play(spec); });
  head.append(title);
  el.append(head);

  // Playback knobs (mirror how SoundManager plays the sound: volume + detune cents).
  el.append(slider({ label: 'gain', value: row.gain, min: 0, max: 1.5, step: 0.01, onInput: (v) => { row.gain = v; } }));
  el.append(slider({ label: 'detune¢', value: row.detune, min: -1200, max: 1200, step: 10, onInput: (v) => { row.detune = v; } }));

  // Synth character params (re-render the buffer on the next play).
  for (const [pname, meta] of Object.entries(spec.meta)) {
    const cur = row.params[pname] ?? 0;
    el.append(slider({ label: pname, value: cur, min: meta.min, max: meta.max, step: meta.step, onInput: (v) => { row.params[pname] = v; } }));
  }
  return el;
}

function exportValues(): string {
  const out: Record<string, Row> = {};
  for (const [key, row] of state) out[key] = row;
  return JSON.stringify(out, null, 2);
}

function mount(): void {
  const grid = document.getElementById('grid')!;
  for (const spec of SFX_SPECS) grid.append(card(spec));

  document.getElementById('playAll')!.addEventListener('click', () => {
    SFX_SPECS.forEach((spec, i) => { setTimeout(() => { play(spec); }, i * 450); });
  });
  const dump = document.getElementById('dump') as HTMLTextAreaElement;
  document.getElementById('export')!.addEventListener('click', () => { dump.value = exportValues(); });

  const music = document.getElementById('music') as HTMLAudioElement;
  document.getElementById('playMusic')!.addEventListener('click', () => { void music.play(); });
  document.getElementById('stopMusic')!.addEventListener('click', () => { music.pause(); music.currentTime = 0; });
}

mount();
