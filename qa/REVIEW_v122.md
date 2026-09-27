# 1.2.2 cleanup

The CLI's fallback output mode previously scanned all raw arguments, so `test -- --json` emitted JSON although `--json` was a positional filename. Fallback detection now stops at the end-of-options marker, like the parser. Existing exit codes and genuine pre-separator flags are retained. CLI tests cover successful reads of a literal `--json` file, unknown-command/option failures, and explicit JSON output before the separator.

The web Save JSON handler previously let download errors escape without status feedback. It now reports a requested handoff or synchronous failure. It does not claim the browser completed its save dialog. The exported JSON content, blueprint and undo history remain unchanged.

Text and Godot ZIP downloads previously duplicated object-URL handling and only scheduled revocation after a successful DOM call. They now share a private blob-download helper with cleanup in a finally block, retaining the original 500/1000 ms handoff delays. Tests cover URL creation failures, element creation failures, click failures, successful JSON/report/ZIP handoffs and exactly one cleanup per created URL.

No new commands, authoring features or geometry rules were added. The release gate uses the existing 37 core and 13 engine-asset scripts. Prior plans/scenes are compared byte-for-byte during packaging. Live browser and target Godot 4.7 coverage remain separate from local handler/4.5.1 checks. The LLM guide explains separator handling and the limits of download status evidence.
