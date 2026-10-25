# OnPanel checks

`python3 tests/run.py` runs both screens in a headless browser and compares the timing logic's results with
`golden.json`:

- **Air:** 11,401 table lookups (every method, air and nitrox mixes, depths 5 to 42 m, bottom times 0 to 300 min,
  next-table rule on and off), 123 states through five stamped dives (SurDO₂ with air breaks, nitrox stops,
  no-stop, a long surface interval, and an ascent right on the slow-ascent threshold), and version A with no
  rules profile.
- **Sat:** 49 states through a bell run with three divers, breaks back in the bell, and finishing.
- The version number in `sw.js` must match the newest entry in the change list in `support.js`.

Any difference fails the check. A difference is only accepted (`--update`) once it has been explained and is intended.
Every release that touches timing gets a **Timing** entry in the change list, which the app shows on the phone.

`fixture-profile.json` holds **synthetic tables with made-up numbers. Test data only. Never use for diving.**
No company's real tables are stored in this repository.
