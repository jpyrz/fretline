# Fretline V1 Playable Slice

## Product goal

Fretline V1 is a backend-free, single-player five-fret rhythm game slice. A
player should be able to open a compatible Clone Hero song folder, choose a
guitar-family chart, configure timing and controls, play the entire song with
fair and predictable rules, and understand the result.

The V1 promise is **one complete local song session that feels trustworthy**.
It is not yet a full Clone Hero replacement.

## V1 player journey

1. Open Fretline and confirm or adjust calibration.
2. Map a guitar controller or use the keyboard.
3. Load a local song folder.
4. Choose an available difficulty and guitar-family instrument.
5. Start after a clear countdown.
6. Play standard notes, chords, opens, sustains, HOPOs, pull-offs, taps, and
   forced notes.
7. Pause, resume, restart, or quit without losing synchronization.
8. Finish the song and receive a useful, internally consistent results screen.

## Current foundation

- [x] Web Audio clock drives authoritative song time.
- [x] Input and visual calibration.
- [x] Keyboard and configurable Gamepad API controls.
- [x] Local `.chart` folder import and bundled legal sample.
- [x] Persistent on-device song library with selection and removal controls.
- [x] Multiple difficulty/instrument track selection.
- [x] Chords, open notes, sustains, staggered sustains, HOPOs, pull-offs, taps,
      and forced-note parsing/gameplay.
- [x] Sustain scoring and early-release detection.
- [x] Countdown, pause/resume, restart, and full-song completion.
- [x] Score, streak, timing telemetry, and a results summary.
- [x] Adjustable visual note speed.
- [x] Layered highway visuals with distinct gems, receptors, sustains, and hit
      feedback.
- [x] Offline-capable application shell with no backend.

## Milestone 1 — Gameplay correctness

This is the next milestone. The rules were implemented, but V1 should not call
them finished until they can be replayed deterministically and verified.

- [ ] Separate chart/input/scoring decisions from browser event handling into a
      deterministic gameplay simulation.
- [ ] Add timestamped input-replay fixtures for strums, fret presses, releases,
      misses, overstrums, and pause boundaries.
- [ ] Preserve individual lane lengths for disjoint chord sustains instead of
      collapsing a chord to its longest tail.
- [ ] Verify extended-sustain behavior when later notes join or leave the held
      fret shape.
- [ ] Verify natural HOPO thresholds, forced inversions, tap behavior, anchoring,
      and chain-breaking behavior against representative charts.
- [ ] Define and test one scoring contract for note points, chord points,
      sustain points, multipliers, and maximum possible score.
- [ ] Add compact in-game indicators for the current multiplier and a broken
      HOPO chain where useful.

### Exit criteria

- A synthetic mechanics chart can be replayed from a recorded input sequence
  and produces the same note states, score, streak, and sustain results every
  time.
- Rule tests cover every supported note type and important overlap.
- Animation-frame rate does not change scoring outcomes.

## Milestone 2 — Song setup and compatibility

- [ ] Parse `song.ini` for title, artist, charter, album, year, preview time,
      loading text, and song-level settings.
- [ ] Display local album artwork when present.
- [ ] Improve folder validation with specific missing/unsupported-file messages.
- [ ] Show every available track using friendly difficulty and instrument names.
- [ ] Add per-stem mixer controls when a song provides separate guitar, bass,
      drum, vocal, and backing tracks.
- [ ] Add a compatibility report for chart features Fretline does not support.
- [x] Persist imported song files locally with IndexedDB and clear library and
      removal controls.

### Exit criteria

- A player can understand what was loaded, select the intended chart, and see
  actionable errors without inspecting files manually.
- Imported audio is never uploaded.

## Milestone 3 — Complete session UX

- [ ] Add master volume and mute controls.
- [ ] Show the live score multiplier clearly.
- [ ] Show elapsed/remaining song time without distracting from the highway.
- [ ] Add a short controller-disconnect warning that does not stop audio.
- [ ] Distinguish note misses, overstrums, broken sustains, and successful hits
      with restrained visual feedback.
- [ ] Make results calculations reusable and unit tested.
- [ ] Let the player return to song setup, retry, or change chart directly from
      results.

### Exit criteria

- Every normal session state has a clear next action.
- A disconnected controller or audio-decode problem fails gracefully.

## Milestone 4 — Desktop highway and comfort pass

The current desktop perspective/readability concern is deliberately pinned
here. Mobile-sized rendering is currently more cohesive; desktop scaling needs
a focused pass using dense charts rather than isolated visual tweaks.

- [ ] Test at 1280×720, 1440×900, 1920×1080, and ultrawide layouts.
- [ ] Decouple highway width, highway length, gem size, and note speed.
- [ ] Tune perspective so near-player lane expansion does not feel distorted.
- [ ] Add a reduced-motion/comfort option for players sensitive to highway
      motion.
- [ ] Test dense sixteenth-note, chord, open-note, and staggered-sustain patterns.
- [ ] Revisit beat-line motion, strike-zone contrast, and peripheral HUD weight.
- [ ] Keep the active gameplay region visually dominant over telemetry.

### Exit criteria

- Dense patterns remain distinguishable through the strike line at supported
  desktop sizes.
- Note speed and comfort settings do not affect scoring.
- No required gameplay information is hidden at the mobile setup breakpoints.

## Milestone 5 — V1 validation and release

- [ ] Add end-to-end coverage for setup → play → pause → results.
- [ ] Run long/dense chart performance tests and record frame-time regressions.
- [ ] Test current Chrome, Edge, Firefox, and Safari where Web Audio and Gamepad
      behavior differ.
- [ ] Test at least one keyboard, XInput guitar, and axis-based strum controller.
- [ ] Verify PWA install/offline shell behavior without caching imported files.
- [ ] Complete sample-song attribution, privacy copy, and a short compatibility
      document.
- [ ] Publish a static preview build and run a small hands-on playtest.

### V1 definition of done

- A new player can complete the full player journey without developer help.
- The same chart and timestamped inputs always produce the same gameplay result.
- The bundled sample and the agreed real-world test charts complete without
  parser, audio, or lifecycle errors.
- Calibration, controller mapping, and highway preferences survive reloads.
- User-selected song files remain local.
- Known unsupported features are explained before play.

## Explicitly outside V1

- Accounts, backend storage, analytics, and cloud song libraries.
- Online multiplayer, leaderboards, and social features.
- Drums, vocals, keys, pro instruments, and six-fret guitar.
- A chart editor or automatic chart generation.
- MIDI chart import.
- Direct `.rar`, `.zip`, or `.sng` archive import.
- Star power, whammy audio effects, practice mode, and song-speed changes.
- A fully certified touch/mobile gameplay mode.

## Immediate next work

1. Build the deterministic gameplay simulation and timestamped replay harness.
2. Change sustains from one duration per note/chord to one duration per lane.
3. Add a synthetic mechanics chart covering every supported rule.
4. Lock the scoring contract with tests before adding more presentation work.
