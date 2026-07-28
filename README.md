# Fretline

Fretline is a backend-free React prototype for testing whether a browser can
deliver accurate five-fret rhythm gameplay. It uses the Web Audio output clock
for song position, translates input timestamps into that clock, and reports
per-strum timing errors.

[Play the current build](https://jpyrz-fretline.netlify.app).

See [ROADMAP.md](./ROADMAP.md) for the V1 playable-slice scope, milestones, and
definition of done.

## Run it

```bash
npm install
npm run dev
```

Open the local URL, use the generated Timing Lab chart, and play with:

- Frets: `A`, `S`, `D`, `F`, `G`
- Strum: `Space`, `Enter`, `ArrowUp`, or `ArrowDown`
- Pause/resume: `P` or `Escape`

The saved note-speed control changes only the visual travel time. Higher
values spread dense patterns farther apart without changing audio, scoring,
or the hit window.

You can also map a Gamepad API controller, including strum bars exposed as an
axis.

Choose **Add free sample** to play the bundled beginner chart for
**Techno Chiptale** by Centurion_of_war. The 90 BPM music is CC0 and the folder
under `public/songs/techno-chiptale` is also directly compatible with Clone
Hero.

## Clone Hero folders

Choose **Add song folder** and select a folder containing:

- `notes.chart` (or another `.chart` file)
- One or more supported audio files such as `song.ogg`, `guitar.ogg`, MP3, or WAV

The importer understands five-fret `[ExpertSingle]`, `[HardSingle]`,
`[MediumSingle]`, and `[EasySingle]` tracks, chart resolution, BPM changes,
legacy chart offset, chords, open notes, and sustains. This prototype currently
supports natural and forced HOPOs, pull-offs, and tap notes. Star-power rules
are not implemented yet. Sustains award beat-based points and are marked
broken when the required fret combination is released early.

Imported songs are copied into an on-device library using IndexedDB, so the
selected song and chart are available after a reload. Nothing is uploaded.
Removing a library entry deletes Fretline's browser copy without changing the
original folder. Calibration and controller mappings are also saved locally.

## Validate

```bash
npm run check
```
