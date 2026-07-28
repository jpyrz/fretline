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
axis. Choose **Map a guitar**, then press any fret or move the strum bar while
the page is focused. Fretline waits for the browser to expose the controller
and samples its neutral axis positions before walking through each control.

On Windows, if the mapper continues waiting, run `joy.cpl` and confirm that the
receiver and guitar appear and respond there first. The browser cannot access a
controller that Windows has not enumerated.

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

## Google Drive library

Google Drive can be used as an import and sync source. In Picker, open a single
song folder and select `notes.chart` plus every audio file for that song
together. Fretline downloads the selected files completely, validates them with
the normal Clone Hero importer, and stores them in IndexedDB before play.
Gameplay never streams charts or audio from Drive, so network conditions cannot
change timing. Synced songs remain available offline unless the browser clears
its site storage.

To enable the Drive buttons for a deployment:

1. Create a Google Cloud project and enable the Google Drive API and Google
   Picker API.
2. Configure the OAuth consent screen and create a Web application OAuth
   client. Add the local and deployed site origins as authorized JavaScript
   origins.
3. Create a browser API key restricted to those origins and APIs.
4. Copy `.env.example` to `.env.local` for development, or add the same three
   values as Netlify environment variables:
   `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, and
   `VITE_GOOGLE_APP_ID`. The app ID is the numeric Google Cloud project number.

Fretline requests the narrow `drive.file` scope and never stores the short-lived
Google access token. This scope grants access to files selected explicitly in
Picker, not automatically to every file inside a selected folder. Fretline
therefore saves the selected chart/audio file IDs for later refreshes. A user
may be asked to reconnect when syncing again; song content stays in the same
on-device library as regular folder imports.

## Validate

```bash
npm run check
```
