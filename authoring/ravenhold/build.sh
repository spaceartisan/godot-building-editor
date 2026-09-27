#!/usr/bin/env bash
# Rebuilds Ravenhold Castle from a blank building using only supported CLI
# commands and transactions (no hand-written JSON edits). Run from the editor root:
#   authoring/ravenhold/build.sh NEW_WORK_DIR [GODOT_BIN]
# Needs Node 20+. The Godot asset check, renders and navmesh probe need a
# Godot 4.5+ executable; renders also need DISPLAY or xvfb-run.
set -euo pipefail
out="${1:?usage: build.sh NEW_WORK_DIR [GODOT_BIN]}"
godot="${2:-${GODOT_BIN:-}}"
here="authoring/ravenhold"
[ -e "$out" ] && { echo "destination exists: $out" >&2; exit 2; }
mkdir -p "$out"

run() { echo "+ $*" >&2; "$@"; }
edit() { # SOURCE RECIPE OUT: strict dry run for review, then strict save
  run node cli.mjs edit "$1" --ops "$2" --dry-run --warnings-as-errors --json > "$3.dry-run.json"
  run node cli.mjs edit "$1" --ops "$2" --out "$3" --warnings-as-errors --json > "$3.save.json"
}

run node "$here/generate-transactions.mjs"
run node cli.mjs new --out "$out/00-blank.building.json" --name "Ravenhold Castle" --json > "$out/00-blank.json"
edit "$out/00-blank.building.json" "$here/tx-1-structure.edit.json" "$out/01-structure.building.json"
edit "$out/01-structure.building.json" "$here/tx-2-openings.edit.json" "$out/02-openings.building.json"
edit "$out/02-openings.building.json" "$here/tx-3-circulation.edit.json" "$out/03-circulation.building.json"
edit "$out/03-circulation.building.json" "$here/tx-4-roofs.edit.json" "$out/04-roofs.building.json"
final="$out/04-roofs.building.json"
run node cli.mjs validate "$final" --out "$out/checks.json" --warnings-as-errors --json > /dev/null
# Route evidence: warnings are reviewed, so this runs in ordinary mode.
run node cli.mjs validate "$final" --reachability --out "$out/reachability-checks.json" --json > "$out/reachability.json"
run node cli.mjs export "$final" --out "$out/assets" --warnings-as-errors --json > "$out/export.json"
run node cli.mjs package "$final" --out "$out/ravenhold_castle.zip" --include-json --warnings-as-errors --json > "$out/package.json"

if [ -n "$godot" ]; then
  if command -v xvfb-run >/dev/null || [ -n "${DISPLAY:-}" ]; then
    run node cli.mjs godot-check --assets "$out/assets" --godot "$godot" --require-collision --render --out "$out/godot-renders" --json > "$out/godot-check.json"
  else
    echo "Godot renders skipped: no DISPLAY or xvfb-run" >&2
    run node cli.mjs godot-check --assets "$out/assets" --godot "$godot" --require-collision --json > "$out/godot-check.json"
  fi
  run node "$here/probe/run-reachability.mjs" "$out/assets" "$godot" "$out/navmesh-reachability.json"
else
  echo "Godot checks skipped: pass GODOT_BIN" >&2
fi
echo "done: $final" >&2
