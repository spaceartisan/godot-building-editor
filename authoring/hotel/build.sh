#!/usr/bin/env bash
# Rebuilds the Meridian Hotel from a blank building into a NEW work directory.
# Usage (from the editor root): authoring/hotel/build.sh WORK_DIR [GODOT_BIN]
set -euo pipefail
work=${1:?usage: build.sh WORK_DIR [GODOT_BIN]}; godot=${2:-}
[ -e "$work" ] && { echo "$work already exists; choose a new directory" >&2; exit 2; }
h=authoring/hotel
mkdir -p "$work"
node $h/generate-transactions.mjs
node cli.mjs new --out "$work/0-new.building.json" --name "Meridian Hotel"
node cli.mjs edit "$work/0-new.building.json" --ops $h/tx-1-ground.edit.json --out "$work/1-ground.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/1-ground.building.json" --ops $h/tx-2-guest-low.edit.json --out "$work/2-guest-low.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/2-guest-low.building.json" --ops $h/tx-3-guest-high.edit.json --out "$work/3-guest-high.building.json" --warnings-as-errors --quiet
node cli.mjs edit "$work/3-guest-high.building.json" --ops $h/tx-4-circulation.edit.json --out "$work/meridian_hotel.building.json" --warnings-as-errors --quiet
node cli.mjs validate "$work/meridian_hotel.building.json" --warnings-as-errors --reachability --from "0,9" --out "$work/checks.json"
node cli.mjs export "$work/meridian_hotel.building.json" --out "$work/assets" --warnings-as-errors --quiet
if [ -n "$godot" ]; then
  node cli.mjs godot-check --assets "$work/assets" --godot "$godot" --require-collision
fi
