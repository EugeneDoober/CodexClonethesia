# Lumina Piano

An independent, open-source falling-note piano game inspired by Synthesia. Play with your computer keyboard, mouse, or touch, and load your own MIDI arrangements. React, TypeScript, Vite, and Web Audio; no backend or API keys required.

## Run locally

Requires Node.js 22+ and npm. The cloud environment was validated with Node.js 24.

```sh
npm ci
npm run dev
```

Vite prints the development address. For a production bundle, run `npm run build`; `npm run preview` serves the resulting `dist/` folder. Any static host can serve `dist/`.

## Play

- **Learn:** notes pause at the strike line until you play the correct keys. Enter chords together or one note at a time. Holding a key does not automatically play repeated notes.
- **Perform:** the song keeps moving. Notes count as hits within 220 ms of their onset; skipped notes count as misses. Accuracy measures the proportion of scored song notes you hit.
- **Listen:** hear both hands played automatically.
- **Guided keys:** letter bindings adapt to eight-second phrases. Follow the letters on the notes or open **How to play** to see current bindings.
- **Piano keys:** `A W S E D F T G Y H U J K O L P ;` form a chromatic keyboard starting at C4. `[` / `]` shift an octave; the octave buttons work too.
- **Space:** play/pause. **Left/Right arrows:** seek five seconds. **Escape:** close help or focus view.
- Select either hand to practice it while the other plays automatically. Change tempo from 25% to 150%. Seek to a position and click **A** or **B** to mark loop boundaries, then switch on **Loop section**. Each lap starts a new score.
- Click or tap piano keys to play them. Learn mode accepts sequential chord entry, which helps with laptop keyboards that limit simultaneous keys.

Switching songs, seeking, or changing modes/hands starts a fresh score. Backgrounding the tab pauses playback. Click Play to resume. Audio requires a user gesture and a browser with Web Audio support. The sound is a local piano-like synthesizer, so no sample downloads are needed.

## Songs and the Runaway arrangement

**Runaway** by Kanye West is the default built-in song, loaded from the user-supplied `src/assets/Runaway_Piano_Transcribed.mid`. Its 1,934 notes, 120 BPM tempo, and approximately 5:38 duration are preserved by the same MIDI parser used for imports. Both hand tracks are explicitly labeled **approximate** in the uploaded file. This app faithfully plays the supplied MIDI; its match to the requested video has not been independently verified. There is no sustain-pedal data in this file.

The [video reference](https://www.youtube.com/watch?v=Skzm9zUos00) and [original note-letter guide](https://latouchemusicale.com/en/runaway-piano-notes-letters/) remain linked in the Runaway card. Neither website could be inspected because the cloud runtime's network proxy denied access. The uploaded MIDI now provides the playable arrangement directly, so no website access is needed to play it.

**First Light** and **Paper Planes** are original practice studies included under the MIT license. All three built-in songs are available after a refresh. The supplied Runaway MIDI is third-party music and is not covered by the project's MIT license; see `src/assets/README.md`.

Import a standard `.mid` or `.midi` file using **Import MIDI**, drag and drop, or the song library. Pitches, durations, chords, and tempo changes are preserved. Hand assignments are inferred from track names/registers and may differ from an arranger's notation. Percussion is excluded; other pitched tracks are played as piano. MIDI sustain-pedal/controller automation is not interpreted. Files must use standard type 0/1 PPQ timing, contain no more than 50,000 notes, and be at most 10 MiB. Audio/YouTube links cannot be automatically converted to reliable MIDI by this app.

Additional imported music stays in memory in the current browser tab; reimport it after refreshing. There are no uploads, accounts, analytics, or external runtime requests. Extremely wide pitch ranges produce smaller on-screen keys; guided letters still address the selected chord. If a chord has more unique pitches than available guided keys, click the remaining piano keys.

## Validate

```sh
npm test
npm run build
npm run test:e2e
```

Unit tests cover MIDI tempo maps, chords, malformed inputs, percussion filtering, learning gates, performance timing, repeated notes, seeking, and loops. Browser tests cover the real input/transport flow and MIDI uploads. The Playwright config starts Vite automatically and uses `CHROMIUM_PATH` if supplied, otherwise `/usr/bin/chromium` when present, or Playwright's managed Chromium. On other machines install it with `npx playwright install chromium`.

## Code map

- `src/core/engine.ts`: deterministic practice transport and scoring.
- `src/core/midi.ts`: MIDI validation and import using `@tonejs/midi`.
- `src/core/songs.ts`: bundled Runaway MIDI and the built-in library.
- `src/core/demos.ts`: original compositions.
- `src/core/audio.ts`: local Web Audio synthesis.
- `src/components/PianoRoll.tsx`: falling notes and pointer piano.
- `src/App.tsx`: keyboard input, library, transport, and controls.

Licensed under MIT. Lumina is independent and is not affiliated with Synthesia. The software license covers the code and original studies; the supplied Runaway MIDI and other imported music retain their own rights and are not licensed under the project’s MIT license.
