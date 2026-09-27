# v0.32 — doorway editing refinements

This pass improves the shape editor without changing export geometry or example plans.

- Draft history records one edit per completed drag, numeric change, preset, point operation or drawing step. Undo/redo stays inside the dialog. Text fields retain native undo; canvas and button shortcuts use draft history. The document is untouched until Save.
- Save as new duplicates the draft, assigns the new ID only to the selected doorway, and retains the original shape for other users. Save shared shape still updates the original. Both use the existing full-document validation and one-step building undo.
- The canvas previews the actual frame inset and panel polygon from shapedDoorLayout. Fit feedback uses current door settings and displayed dimensions; it does not assert fit for every differently-sized instance. Empty passages can save independently of hypothetical frame-fit errors.
- Numeric edits preserve DOM input identity/focus. Drawing disables stale-outline controls. Outside-bounds clicks cannot snap to distant handles. Canceled/lost-capture drags restore the previous points.

Expanded real-handler tests cover these behaviors alongside the existing 4,874 wall/panel ray probes. The final release report includes all seven gates, including the 14-scene / 1,262-ray doorway physics suite in Godot 4.5.1. The previous 33 JSON plans and 64 TSCN assets are checked byte-for-byte against v0.31 during packaging.

[Preview and fit warning](previews/doorway_frame_preview.png) shows the actual editor canvas and feedback text, with a valid airlock on the left and a valid outline whose narrow upper arms cannot fit the frame on the right. The composition omits surrounding HTML controls; it is not a browser screenshot. Chromium/CSS layout and target Godot 4.7 remain unverified here. Export scope, separate lighting shells, empty material defaults and custom panel limitations are unchanged.
