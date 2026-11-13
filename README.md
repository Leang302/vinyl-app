# VINYL

An interactive 3D listening room built with React 19, TypeScript, Vite, React Three Fiber, Three.js, drei, postprocessing, Tailwind CSS, Radix/shadcn-style UI primitives, Motion, Zustand, and IndexedDB.

## Run locally

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite (normally http://127.0.0.1:5173). Use HTTP rather than opening index.html directly; the YouTube API needs an origin. `npm test` runs the unit suite. `npm run build` checks TypeScript and writes the production site to `dist`. `npm run preview` serves that build.

## Listen

Click **Play** to hear the original VINYL Sessions. Select a collection or drag its record onto the turntable. Orbit by dragging the scene and zoom with the wheel/pinch. The hardware start button, speed selector, volume knob, and draggable tonearm work. The settings button changes record color, custom label artwork, rendering quality, and rotation speed.

Use **Add music** to save a YouTube video/playlist link or import local files. Files remain on this device in IndexedDB, including across refreshes; browser storage quotas apply. Collections, favorites, recent tracks, and preferences persist. The player starts only after interaction and does not autoplay after refresh.

**YouTube:** one official, visible IFrame player, minimum 200×200 viewport. Native controls, branding, and advertisements remain unobstructed. VINYL uses official playlist navigation and metadata. Unvisited playlist entries have numbered titles until the official player supplies their metadata; no API key or unofficial metadata service is used. Playback availability depends on YouTube, the owner’s embed permissions, browser policy, and network. A missing/removed video produces an error with recovery through the next button or another collection. No YouTube audio is downloaded or processed. Sequential 3-second fade out / switch / 3-second fade in defaults; this is not gapless or an overlapping crossfade. Settings permit 1–10 seconds and smooth/linear easing. Live/unknown durations skip automatic end fading; buffering and pauses suspend fade progression. Master volume is independent from the envelope.

**Local:** two HTML audio decks routed through one Web Audio graph provide true overlapping equal-power crossfades. The transition duration controls overlap. Both decks pass through bass, mid, and treble filters, a stereo panner, master gain, and a measured analyser. The optional crackle is synthesized locally. Disabling transitions or manually seeking cancels the overlap. Files use browser-supported codecs; there is no server conversion. Imported files are not uploaded.

**Future boundary:** vocal/instrument separation is explicitly a future capability, separate from the EQ graph. There is no claim that EQ isolates vocal stems.

**Accessibility/performance:** Radix dialogs/sliders/switches/tabs support keyboard use, visible focus, labeled controls, responsive layout, and reduced-motion preferences. Adaptive rendering reduces resolution and shadows on devices with four or fewer logical CPUs. High adds subtle vignette; low uses fewer effects. WebGL failures show a fallback while playback remains available. Background ornamental motion respects reduced motion. Space toggles play; Alt + arrow skips when focus is outside a control.

## Structure

- `src/audio/PlaybackController.ts`: shared transport and source lifecycle, queue, repeat/shuffle.
- `src/audio/YouTubePlayerAdapter.ts`: official player events and managed polling.
- `src/audio/TransitionManager.ts`: timer-free sequential envelope.
- `src/audio/LocalAudioAdapter.ts`: dual-deck mixer, EQ, analysis, crossfade, cancellation.
- `src/scene/TurntableScene.tsx`: original procedural geometry, textures, lighting, animations, physical interactions, adaptive camera.
- `src/state/store.ts`, `src/lib/persistence.ts`: Zustand and IndexedDB.
- `src/components`: collection, import, controls, capability-aware settings, accessible primitives.
- `tests`: parser, transition, mocked YouTube events and cleanup, persistence.
- `docs/experience-map.md`: scope, journeys, research, and acceptance map.

All six 48-second ambient compositions and three illustrated covers are original works generated for this project. They are included for immediate functional playback, not as representations of commercial recordings. Scene materials and geometry are generated in code and require no external model assets.
