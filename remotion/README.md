# Cyclops launch reels — Remotion

Free, programmatic launch videos for Cyclops, built in React/TypeScript and
rendered to MP4 with [Remotion](https://remotion.dev) — no per-second AI credits.
This is the proof-of-concept build of **V2 "Watch It Count"** (script in
`../docs/launch-videos/iterations/round-03.md`, §V2).

Why Remotion for these reels: four of the five winning scripts (V2, V4, V6, V7)
are motion-graphics / UI driven, which renders crisper here than with AI video
(exact text, deterministic timing, free re-renders) and can reuse the real
product theme and components.

## Run

```bash
cd remotion
npm install
npm run studio        # interactive preview at localhost:3000
npm run render:v2     # -> out/watch-it-count.mp4 (1080x1920, 15s, 30fps, h264)
```

## What's here

- `src/WatchItCount.tsx` — the composition: pinned counter → question-card grid →
  collapse into one amber "memory" file ("Answer once.") → three ATS forms filling
  sequentially with "awaiting your review" chips → the single Submit click
  ("The 1 is your click.") → eye-blink end card ("Never say anything twice.").
- `src/theme.ts` — the live "GB+" tokens lifted from `src/app/globals.css`
  (warm linen `#f4f1ea`, cream cards, **amber** agent accent `#c05f10`). Note:
  the live product accent is amber, not the claret the early scripts referenced.
- `src/fonts.ts` — on-brand system fallbacks (monospace numerics, serif display).
  To ship pixel-exact, drop the real Geist Mono / Hanken Grotesk / Newsreader
  `.woff2` files into `src/fonts/` and load with `@remotion/fonts` (no network at
  render time — the sandbox's TLS proxy blocks Google Fonts' CDN).

## Audio

`scripts/make-track.py` synthesizes a 15s, 120 BPM upbeat bed (pure stdlib, no
numpy) to `public/track.wav`; the visual edit is cut to that BPM (beat = 15
frames). Regenerate with `python3 scripts/make-track.py`. Remotion muxes it via
`<Audio src={staticFile("track.wav")} />`. Swap in a licensed track any time.

## Style

This cut emulates the kinetic motion-graphics reference: beat-synced bounce
(`beatBump`), cards storming in from offscreen with springy overshoot and 3D
scatter, a swoosh wipe between scenes, a confetti burst on the memory-save and
the final click, gradient progress bars, drifting amber background blobs.

## Not included (deliberately)

- **Live-action inserts.** None needed for V2. V1/V5 need real human shots —
  phone-shoot them or use the limited AI-video credits for just those plates.
