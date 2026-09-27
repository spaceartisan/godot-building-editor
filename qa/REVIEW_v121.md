# 1.2.1 import cleanup

Reproduced two bugs against the 1.2.0-docs baseline: a delayed file read overwrote a committed building-name edit, and the CLI rejected a valid UTF-8 BOM-prefixed blueprint with exit 1.

The web now uses a load generation counter. New loads, commits and Undo/Redo supersede earlier requests. Both the fetch response and parsed-body awaits are checked; stale successes, failures and finalizers cannot replace the current document, status or picker state. New/preset actions use the same commit invalidation. Failed current loads retain the current building/history. Null JSON produces a descriptive non-building error.

One shared JSON text parser accepts a single leading BOM for local web imports and CLI blueprints/transaction recipes. CLI source text/bytes remain unchanged for fingerprint checks and exact original-JSON packaging. Invalid syntax and unsupported schemas are still rejected.

The focused suite exercises overlapping local reads, file/example races, delayed response bodies, edits/New/preset/Undo/Redo during reads, stale failures, current failures, picker re-enabling, BOM loading, malformed/future documents, source-hash guards, dry-run/save hash parity and byte-identical original JSON in ZIP output. It runs actual handlers through the DOM adapter, not a live browser.

The release registry has 37 core scripts and 13 engine-asset scripts. Geometry and example assets are intentionally unchanged. Live Chromium layout and target Godot 4.7 are not claimed; engine regression checks use the available Godot executable recorded in the release report. The LLM guide documents the updated loading semantics and byte-fingerprint rules.
