# JOH Room Storyboard

Offline interior-design storyboard for the Jeddah Opera House FF&E / finishing
programme. A installable, fully offline mobile web app (PWA) built on top of
the original `joh-rooms-1` room reference.

## What's in it

- **988 rooms**, searchable by room number, name, level or type.
- **Tap-to-locate plans** — every level plan shows every room as a pin; tap a
  pin to jump straight to that room's storyboard (Plan tab).
- **Room storyboard** per room: plan crop with location marker, finishing
  schedule (wall / floor & skirting / ceiling / openings & doors / acoustic /
  fire), material mockup samples with real product photos and codes, FF&E
  list, a delivery clearance sign-off checklist (persisted on-device), and
  pre-finishing coordination checks.
- **Material & FF&E library** (396 coded items) pulled from the six approved
  IFC schedules — Plumbing Fixtures, Loose Furniture, Bespoke Furniture,
  Bespoke Furniture Materials & Finishes, Interior Finishes, and the Lyric /
  Mid-Scale Theatre material schedule — each with its real photo, full spec,
  supplier/contact, and the list of rooms it's used in (best-effort matched
  from the schedule's location text — verify against the IFC drawings before
  ordering).
- **Reference documents** open **offline**, in the browser's own PDF viewer:
  the bundled schedule PDFs (`/docs`) and the full level drawings (`/plans`).
- Works fully offline once loaded once (service worker precache, ~29 MB).
  "Add to Home Screen" on a phone to install it as an app.

## Data pipeline (how it was built)

- `data/rooms.json` — merged from the original repo's room/position/finishing
  library plus newly extracted material cross-references.
- `data/materials.json` — parsed programmatically from the six schedule PDFs
  in `02 Reports` (pdfplumber table + image-cell extraction), one record per
  material/FF&E code, each with its cropped product photo.
- `data/meta.json` — levels, plan pixel dimensions, drawing references,
  the delivery clearance checklist, and per-document general notes.
- Room ↔ material links are a **best-effort keyword match** against each
  schedule row's free-text "Location" column (zone, venue, room-type
  keywords). Treat these as a helpful starting point, not a substitute for
  checking the IFC interior elevation / finish plan drawings.

## Updating

- To refresh room/finishing data: edit `data/rooms.json` (or regenerate from
  source — see the extraction notes above) and re-deploy.
- To refresh material photos/specs: re-run extraction against the latest
  revision of the six schedule PDFs, then replace `data/materials.json` and
  the `materials/` image folder.
- After any data change, bump `CACHE` in `sw.js` so installed devices pick up
  the update.

## Publishing

This is a static site — push the contents of this folder to the `joh-rooms-1`
GitHub repo (replacing the existing files) and GitHub Pages will serve the
update automatically at the existing URL.
