#!/usr/bin/env bash
# Rebuilds Ravenhold Castle from the catalog courtyard example using the
# documented CLI workflow. Run from the editor root:
#   authoring/ravenhold/build.sh NEW_WORK_DIR [GODOT_BIN]
# Needs Node 20+. Previews need CANVAS_MODULE (or a local @napi-rs/canvas);
# the asset and reachability checks need a Godot 4.5+ executable.
set -euo pipefail
out="${1:?usage: build.sh NEW_WORK_DIR [GODOT_BIN]}"
godot="${2:-${GODOT_BIN:-}}"
here="authoring/ravenhold"
[ -e "$out" ] && { echo "destination exists: $out" >&2; exit 2; }
mkdir -p "$out"

run() { echo "+ $*" >&2; "$@"; }
edit() { # SOURCE RECIPE OUT: reviewed dry run, then strict save
  run node cli.mjs edit "$1" --ops "$2" --dry-run --warnings-as-errors --json > "$3.dry-run.json"
  run node cli.mjs edit "$1" --ops "$2" --out "$3" --warnings-as-errors --json > "$3.save.json"
}

run node "$here/generate-transactions.mjs"
run node "$here/prepare-base.mjs" examples/courtyard_regions.building.json "$out/00-base.building.json"
# tx-1 leaves the Floor 2 open-parapet warning until boundaryMode is set, so
# it is dry-run and saved in ordinary mode; the warning is reviewed and
# resolved by the scoped JSON edit that follows.
run node cli.mjs edit "$out/00-base.building.json" --ops "$here/tx-1-levels.edit.json" --dry-run --json > "$out/01-levels.building.json.dry-run.json"
run node cli.mjs edit "$out/00-base.building.json" --ops "$here/tx-1-levels.edit.json" --out "$out/01-levels.building.json" --json > "$out/01-levels.building.json.save.json"
run node "$here/mark-open-boundary.mjs" "$out/01-levels.building.json" "$out/02-open.building.json" f2_ramparts
edit "$out/02-open.building.json" "$here/tx-2-openings.edit.json" "$out/03-openings.building.json"
edit "$out/03-openings.building.json" "$here/tx-3-stairs.edit.json" "$out/04-stairs.building.json"
edit "$out/04-stairs.building.json" "$here/tx-4-roofs.edit.json" "$out/05-roofs.building.json"
edit "$out/05-roofs.building.json" "$here/tx-5-circulation.edit.json" "$out/06-circulation.building.json"
final="$out/06-circulation.building.json"
run node cli.mjs validate "$final" --out "$out/checks.json" --warnings-as-errors --json > /dev/null
run node cli.mjs export "$final" --out "$out/assets" --warnings-as-errors --json > "$out/export.json"
run node cli.mjs package "$final" --out "$out/ravenhold_castle.zip" --include-json --warnings-as-errors --json > "$out/package.json"

if node cli.mjs preview "$final" --out "$out/preview-exterior-se.png" --yaw 0.6 --quiet 2>/dev/null; then
  run node cli.mjs preview "$final" --yaw 3.7 --out "$out/preview-exterior-nw.png" --quiet
  for floor in 1 2 3 4; do
    run node cli.mjs preview "$final" --view floor --floor "$floor" --yaw 0 --pitch -1.5 --out "$out/preview-plan-$floor.png" --quiet
  done
else
  echo "previews skipped: canvas backend unavailable (set CANVAS_MODULE)" >&2
fi

if [ -n "$godot" ]; then
  run node cli.mjs godot-check --assets "$out/assets" --godot "$godot" --require-collision --json > "$out/godot-check.json"
  run node "$here/probe/run-reachability.mjs" "$out/assets" "$godot" "$out/reachability.json"
else
  echo "Godot checks skipped: pass GODOT_BIN" >&2
fi
echo "done: $final" >&2
