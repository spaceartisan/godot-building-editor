# Building Studio: agent entry point

Read [LLM_GUIDE.md](LLM_GUIDE.md) before authoring buildings or changing this tool. The CLI is a working authoring tool, used for a shipped game's buildings on Windows and Linux: author buildings with it (a script that writes a recipe, then `new --ops`, `validate`, `export`; LLM_GUIDE §3) rather than writing your own geometry generator. It maps the existing capabilities, tested command workflow, geometry constraints and verification evidence. Use [CLI.md](CLI.md) for flags and [TRANSACTIONS.md](TRANSACTIONS.md) for exact operation fields.

## Current maintenance direction

Focus on cleanup of the web builder and Linux CLI: reproducible bugs, usability, consistent output, maintainability and accurate documentation. Architectural expansion in [ROADMAP.md](ROADMAP.md) is deferred unless the user explicitly requests it. Check the current implementation before treating a historical audit item as unfinished.

## Working contracts

- Before delivering an AI-authored building, follow [AUTHORING_REVIEW.md](AUTHORING_REVIEW.md). Review each occupied level, actual floor coverage, access routes and the architectural brief; zero validation warnings are not evidence of completion.

- Preserve the editable building JSON and authored IDs/references. Use supported CLI transactions, inspect their dry runs, and save to new paths.
- Export building `.tscn` assets and relative door scenes. Keep the web editor as the visual authoring interface.
- Preserve exterior OutsideFaces/InsideFaces/EdgeFaces, interior SideAFaces/SideBFaces/EdgeFaces, and per-story separation for lighting.
- Keep materials empty by default. Preserve geometry/collision parity, stair and multi-story seam behavior, supplied examples and intentional openings.
- Keep the barn's large ground-floor entrance and closed upper gable.
- Scope: the tool makes the building shell (walls, floors, ceilings, roofs, stairs, elevators, platforms, railings, openings and door and elevator scenes, collision, light and marker placement; exported lights are placeholders). Materials, navigation/navmesh, door and elevator scripts and animation, gameplay nodes, lighting setup, furniture and props, terrain and performance settings are left to Godot or the game; see the README's **Scope** section. Do not add them to the tool, and do not treat their absence as a reason to bypass it.
- Reuse shared model, validation and exporter code. Avoid divergent web/CLI geometry rules.
- Every capability must be available in both the web editor and the CLI, backed by the same shared code. Features that need a local process (such as Godot rendering) reach the web editor through `server.mjs`. Add web-handler and CLI tests for both routes.
- Choose verification appropriate to the change. Report actual engine versions and skipped/unavailable checks. DOM-handler tests do not establish browser layout; software previews do not establish Godot rendering or physics.
- Do not overwrite user outputs, regenerate supplied fixtures casually, or modify generated scenes to hide an exporter defect.

This guidance applies to the extracted editor directory. The user's current request determines what work is authorized; these instructions do not authorize unrelated changes or publication.
