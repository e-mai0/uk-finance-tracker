#!/usr/bin/env python3
"""Synthesize a 15s, 120 BPM upbeat electronic bed for the Cyclops reel.
Pure stdlib (no numpy). Writes remotion/public/track.wav (mono 16-bit 44.1k).
The visual edit is cut to this BPM: beat = 0.5s = 15 frames @ 30fps."""
import math, wave, struct, os
from array import array

SR = 44100
DUR = 15.0
N = int(SR * DUR)
buf = array("d", [0.0] * N)
BEAT = 0.5  # 120 BPM

def add(start_t, length_t, fn, gain=1.0):
    s = int(start_t * SR)
    L = int(length_t * SR)
    for i in range(L):
        idx = s + i
        if 0 <= idx < N:
            buf[idx] += gain * fn(i / SR)

def noise(seed=[0]):
    # cheap deterministic-ish noise via LCG
    seed[0] = (seed[0] * 1103515245 + 12345) & 0x7FFFFFFF
    return (seed[0] / 0x3FFFFFFF) - 1.0

def kick(t):
    f = 50 + 95 * math.exp(-t * 32)
    return math.sin(2 * math.pi * f * t) * math.exp(-t * 7.5)

def snare(t):
    return (noise() * 0.7 + math.sin(2 * math.pi * 190 * t) * 0.5) * math.exp(-t * 17)

def hat(t):
    return noise() * math.exp(-t * 65)

def crash(t):
    return noise() * math.exp(-t * 2.6)

def pluckbass(t, f):
    saw = 2 * (t * f - math.floor(0.5 + t * f))
    return (0.7 * math.sin(2 * math.pi * f * t) + 0.3 * saw) * math.exp(-t * 4.5)

def lead(t, f):
    sq = 1.0 if math.sin(2 * math.pi * f * t) >= 0 else -1.0
    return (0.55 * math.sin(2 * math.pi * f * t) + 0.45 * sq) * math.exp(-t * 8.5)

def riser(t, length):
    f = 200 + 900 * (t / length)
    return (noise() * 0.6 + math.sin(2 * math.pi * f * t) * 0.4) * (t / length) ** 2

# --- note frequencies -------------------------------------------------------
A2, F2, C3, G2 = 110.00, 87.31, 130.81, 98.00
# bright pentatonic motif (C E G A C) up an octave for the lead hook
LEAD = [523.25, 659.25, 783.99, 880.00, 1046.50]
bar_root = [A2, F2, C3, G2, A2, F2, C3, G2]

# --- drums ------------------------------------------------------------------
for b in range(30):                       # kick every beat
    g = 1.0 if (b % 4 == 0) else 0.85
    add(b * BEAT, 0.28, kick, gain=0.95 * g)
for b in range(2, 30):                     # backbeat clap on 2 & 4
    if b % 2 == 1:
        add(b * BEAT, 0.2, snare, gain=0.5)
for e in range(120):                       # hi-hat eighths with accents
    t = e * (BEAT / 2)
    if t >= DUR:
        break
    add(t, 0.06, hat, gain=0.28 if e % 2 else 0.18)

# --- bass + lead per bar (1 bar = 4 beats = 2s) -----------------------------
for bar in range(8):
    t0 = bar * 4 * BEAT
    if t0 >= DUR:
        break
    root = bar_root[bar]
    for beat in range(4):                  # bass on each beat
        bt = t0 + beat * BEAT
        if bt < DUR:
            add(bt, 0.45, lambda t, f=root: pluckbass(t, f), gain=0.55)
    # lead hook is quiet in bar 0, joins from bar 1, drops out during riser bar 5
    if 1 <= bar and bar != 5:
        for e in range(8):                 # eighth-note arp
            lt = t0 + e * (BEAT / 2)
            note = LEAD[(bar + e) % len(LEAD)]
            if lt < DUR:
                add(lt, 0.28, lambda t, f=note: lead(t, f), gain=0.32)

# --- accents: crashes on bar downbeats 1,3,5,7 ------------------------------
for bar in (0, 2, 4, 6):
    add(bar * 4 * BEAT, 1.4, crash, gain=0.33)

# --- riser into the drop at 12.0s (the "1 is your click" hit) ---------------
add(10.0, 2.0, lambda t: riser(t, 2.0), gain=0.4)
add(12.0, 1.6, crash, gain=0.5)            # drop crash
add(12.0, 0.3, kick, gain=1.1)             # drop kick
add(12.0, 0.5, lambda t: math.sin(2 * math.pi * 55 * t) * math.exp(-t * 3), gain=0.6)  # sub

# --- final sustained chord on the end card (~14.4s) -------------------------
for f in (261.63, 329.63, 392.00):         # C major
    add(14.4, 0.6, lambda t, ff=f: math.sin(2 * math.pi * ff * t) * math.exp(-t * 1.2), gain=0.22)
add(14.4, 1.2, crash, gain=0.3)

# --- normalize + soft clip --------------------------------------------------
peak = max(1e-6, max(abs(x) for x in buf))
norm = 0.92 / peak
out = array("h", [0] * N)
for i in range(N):
    x = math.tanh(buf[i] * norm * 1.1)     # glue with gentle saturation
    out[i] = max(-32767, min(32767, int(x * 32767)))

path = os.path.join(os.path.dirname(__file__), "..", "public", "track.wav")
os.makedirs(os.path.dirname(path), exist_ok=True)
with wave.open(path, "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(out.tobytes())
print("wrote", os.path.abspath(path), round(os.path.getsize(path) / 1024), "KB")
