# 1.4.0 code audit

This audit covered the server, the CLI's output handling, the transactions, the exporter and geometry, the route check, web editor HTML, check reports, tests and docs. Each finding was reproduced before it was fixed, and each fix has a regression test that fails on the old code.

| # | Finding | Fix | Test |
| --- | --- | --- | --- |
| A1 | A floor label containing a backslash passed validation but exported a `.tscn` that Godot 4.5.1 could not parse (`Parse Error … tscn:48`). | `tscnText` escapes `\`, `"`, newlines and tabs in quoted scene strings. Labels without them are byte-identical, so no example scene changed. | `scene-text-engine-tests.mjs`: five hostile labels round-trip exactly through Godot |
| A2 | Check reports didn't record that the route check ran, or from which start points. A clear report was identical with and without the check. | `results[].routeCheck` and `verification.routeCheck`, from both the CLI and the web download | `check-report-tests.mjs`: CLI and web give identical route-check sections |
| A3 | The server's one-render-at-a-time slot was claimed after reading the request body. Two concurrent renders both started Godot (two `200`s). | The slot is claimed before the body is read and released in `finally`. | `server-render-guard-tests.mjs`: a stand-in Godot, and a second request during a slow upload gets `409` |
| A4 | A light `color` that isn't an object gave a raw `TypeError` from normalisation; a non-object `position` crashed the same way. | Normalisation leaves both alone, and validation reports them clearly. | `light-transaction-tests.mjs` |
| A5 | `npm run test:browser` failed on an ambiguous `.advanced-options` selector. Repairing it exposed a real wall-tool bug: repeating the first click could make a T-junction instead of closing the loop when grid snapping moved the start beyond the 10 px radius. A phone-width click in the test also landed off-screen. | The selector is now specific. `snapPlanPoint` closes the loop at the start's grid point. The test uses an element click, which scrolls into view. | `browser-tests.mjs` passes; `authoring-tests.mjs` covers the loop-closing rule |
| A6 | The test runner killed any file after 180 s, but the infrastructure test needs 86–94 s idle and timed out under load. | 10 minutes per file, and timeouts are reported plainly. | Suites |
| A7 | LLM_GUIDE said lights had no transactions. | Corrected; the remaining parity gaps are listed. | — |
| A8 | The version still read 1.3.0. | 1.4.0 in package.json, the CLI, the web header and the docs. | — |
| — | Dead code: `rectBounds`, the legacy single-mesh interior path (`buildInteriorMeshData` and its helpers), and unused imports. | Removed. | Example regeneration unchanged |

These were checked and found fine:

- **Web editor HTML:** no injection risk; everything written as HTML is numbers or fixed text.
- **Server:** loopback-only, needs the editor header, refuses path traversal, has a 64 MiB body limit.
- **CLI outputs:** staged and atomic, and existing destinations are refused.
- **Fuzzing:** 1,700 malformed transactions gave no crashes and nothing improperly accepted. 3,000 corrupted documents surfaced only A4 to users.
- **Syntax:** `node --check` passes on every file.
- **Performance:** Ravenhold exports in 0.6 s and validates with the route check in 0.27 s.

Open, as a separate project: CLI operations for markers, manual floors and ceilings, Floor Footprints, floor insertion, duplication and reordering, group move, and door/window mesh settings. Until then, these break the web/CLI parity rule.
