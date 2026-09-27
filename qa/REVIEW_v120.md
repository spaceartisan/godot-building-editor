# v1.2 — shareable check reports

Adds a browser-safe report formatter, a web download action and optional CLI `validate --out`. Both preserve validator metadata and use the existing scoped-target resolver. Reports explicitly record validation stage, preparation, policy, issue counts and unverified engine/clearance scope. The report is a snapshot and excludes full authoring data; save the building separately.

Focused tests cover actual web/CLI issue parity, unchanged exported scenes and input bytes, warning strictness without severity relabeling, mixed invalid/unreadable inputs, protected output paths and directory aliases, fresh web snapshots, unchanged selection/history/pending drawing and download failure feedback. Existing CLI output is preserved without `--out`; the saved report has its own versioned format. A write failure does not masquerade as a successful report.

The release registry now contains 36 core scripts and 13 engine-asset scripts. Existing geometry/engine gates remain regression checks; this pass adds no new collision claim. Final packaging compares all 33 plans and 64 scene assets with v1.1, verifies archive hashes/permissions and runs the report suite after extraction.

Live browser layout/focus and Godot 4.7 remain unavailable and unverified. Browser tests include the new JSON download action for use when Chromium is installed. Local engine checks use Godot 4.5.1 Compatibility. No new geometry screenshot is claimed because this pass changes diagnostics only.
