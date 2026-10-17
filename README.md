# OnPanel

**Commercial dive timer, pre-dive checklist, gas calculator and log.** Built by a supervisor, for supervisors.

Tracks a saturation bell run and each diver's in-water, bell and break times, with countdowns and alarms.

**Open the app:** https://peteself1972.github.io/dive-times/

Install on Android: open the link in Chrome, then ⋮ menu → **Add to Home screen** (or **Install app**).

- Tap a tile to stamp the time; hold a tile (or tap ›) for full details and corrections.
- Works offline once opened. All times are stored on the phone only.
- Backup aid only. Dive control timers and the official dive log take priority.

## Dive plan (branch `dive-plan`)

- **Dive plan** card on the main screen: gas limits, bailout, reclaim, OBG and bell O2 minimums, Dräger tubes, checks, depth sketch and an A4 **dive information card**: view it on screen (Info card on the main screen) or share it as a PDF.
- Runs on a **rules profile** loaded on the phone (Rules › Load profile file) or built in the app. No company's rules are included in this repository.
- Bell depth fills the Depth box; diver detail shows the bailout figures.
- Gas shows **minimum pressures only** (COBRA, OBG banks, bell O2). No gauge pressures are entered.


## Third-party

- `pdfjs/`: [pdf.js](https://github.com/mozilla/pdf.js) 4.10.38 by Mozilla, Apache 2.0 licence (see `pdfjs/LICENSE`). Used only to show the dive information card on screen.
