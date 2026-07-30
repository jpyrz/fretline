# Project Instructions

## Product

- Product: Fretline, a backend-free five-fret rhythm timing and calibration prototype.
- Primary user loop: choose the generated timing chart or import a local Clone Hero song folder, map controls, play, inspect hit timing, and apply a correction.
- Launch model: local/static web application.
- Mobile-first target: 360–430 px setup screens; gameplay is optimized for larger landscape displays.

## Stack

- Client: React, Vite, TypeScript, React Router.
- Styling: SCSS Modules with shared tokens in `src/index.css`.
- Backend: none. Gameplay, imported files, settings, and controller mappings stay in the browser.
- Hosting: Netlify, deployed from the connected GitHub repository.
- PWA: yes. Cache the application shell and repository-owned static assets only; never cache user-selected audio or chart files.

## Commands

- Install: `npm install`
- Develop: `npm run dev`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Unit tests: `npm run test`
- Component tests: not configured
- End-to-end tests: not configured
- Production build: `npm run build`
- Full validation: `npm run check`

## Timing and Data Rules

- Treat the Web Audio output timeline as the gameplay clock.
- Never derive authoritative song position by accumulating animation-frame deltas.
- Keep per-frame gameplay state outside React renders.
- Apply chart tempo changes before converting ticks to seconds.
- Imported song files must remain on the device. Persist them only in the
  browser's IndexedDB library and never upload them outside a user-authorized
  read-only Google Drive download.
- Store small preferences, mappings, selected IDs, and Drive folder references
  in local storage. Store song audio, previews, and artwork in IndexedDB.

## Architecture

- Organize product code by feature, with component implementations, styles,
  and tests colocated in the same feature or component folder.
- Route components coordinate feature modules; they should not own storage,
  network, rendering, and presentation responsibilities at the same time.
- Keep the gameplay engine and Canvas renderer independent from React.
- Preserve a single public renderer facade and a single authoritative gameplay
  coordinator while splitting their internal responsibilities into focused
  modules.

## Delivery

- Preserve unrelated user changes in a dirty worktree.
- Implement setup layouts mobile-first and verify gameplay on desktop.
- Run lint, type checking, unit tests, and a production build before handoff.
- Do not add a backend, accounts, analytics, or remote song storage without explicit approval.
