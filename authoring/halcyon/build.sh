#!/usr/bin/env bash
# Rebuilds Halcyon from a blank building into a NEW work directory.
# Usage (from the editor root): authoring/halcyon/build.sh WORK_DIR [GODOT_BIN]
set -euo pipefail
work=${1:?usage: build.sh WORK_DIR [GODOT_BIN]}; godot=${2:-}
[ -e "$work" ] && { echo "$work already exists; choose a new directory" >&2; exit 2; }
h=authoring/halcyon
mkdir -p "$work"
node $h/generate-transactions.mjs
node cli.mjs new --out "$work/0-new.building.json" --name Halcyon
node cli.mjs edit "$work/0-new.building.json" --ops $h/tx-1-podium.edit.json --out "$work/1-podium.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/1-podium.building.json" --ops $h/tx-2-towers.edit.json --out "$work/2-towers.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/2-towers.building.json" --ops $h/tx-3-circulation.edit.json --out "$work/3-circulation.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/3-circulation.building.json" --ops $h/tx-4-finish.edit.json --out "$work/halcyon.building.json" --warnings-as-errors --quiet
node cli.mjs validate "$work/halcyon.building.json" --warnings-as-errors --reachability --from "0,24" --out "$work/checks.json"
node cli.mjs export "$work/halcyon.building.json" --out "$work/assets" --warnings-as-errors --quiet
if [ -n "$godot" ]; then
  node cli.mjs godot-check --assets "$work/assets" --godot "$godot" --require-collision
fi
