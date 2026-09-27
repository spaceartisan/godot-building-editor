#!/usr/bin/env bash
# Rebuilds the Kestrel from a blank building into a NEW work directory.
# Usage (from the editor root): authoring/kestrel/build.sh WORK_DIR [GODOT_BIN]
set -euo pipefail
work=${1:?usage: build.sh WORK_DIR [GODOT_BIN]}; godot=${2:-}
[ -e "$work" ] && { echo "$work already exists; choose a new directory" >&2; exit 2; }
k=authoring/kestrel
mkdir -p "$work"
node $k/generate-transactions.mjs
node cli.mjs new --out "$work/0-new.building.json" --name Kestrel
node cli.mjs edit "$work/0-new.building.json" --ops $k/tx-1-structure.edit.json --out "$work/1-structure.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/1-structure.building.json" --ops $k/tx-2-openings.edit.json --out "$work/2-openings.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/2-openings.building.json" --ops $k/tx-3-circulation.edit.json --out "$work/3-circulation.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/3-circulation.building.json" --ops $k/tx-4-lighting.edit.json --out "$work/kestrel.building.json" --warnings-as-errors --quiet
node cli.mjs validate "$work/kestrel.building.json" --warnings-as-errors --reachability --out "$work/checks.json"
node cli.mjs export "$work/kestrel.building.json" --out "$work/assets" --warnings-as-errors --quiet
if [ -n "$godot" ]; then
  node cli.mjs godot-check --assets "$work/assets" --godot "$godot" --require-collision
  node authoring/ravenhold/probe/run-reachability.mjs "$work/assets" "$godot" "$work/navmesh-reachability.json" $k/probe-targets.json
fi
