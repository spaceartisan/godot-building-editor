# CLI authoring transactions (format 1)

Transactions edit an existing building blueprint; `node cli.mjs new --out NEW.json` creates a blank one-floor starting blueprint (floor ID `floor_1`). The web editor remains available for drawing and visual inspection. Supported edits cover building settings (name, default story dimensions, wall thickness, automatic-roof type, ceiling thickness, export profile), shared wall types and doorway shapes, walls (including their wall type and inward side), omni lights, openings, independent manual roofs, rectangular/polygon regions, markers, Floor Footprints, manual floors and ceilings, group moves, floor creation/insertion/duplication/reordering/removal, existing floor labels/dimension overrides/automatic-surface switches/boundary mode, door/window mesh settings, porch/deck creation/update/removal and stair creation/update/removal: every editing capability of the web editor. Materials stay empty by design.

## Inspect, review, save

Run these from the extracted editor directory. Every output path must be new:

```bash
node cli.mjs inspect examples/roof_attachment.building.json --entities --json
node cli.mjs edit examples/roof_attachment.building.json --ops examples/transactions/porch-entry.edit.json --dry-run --json
node cli.mjs edit examples/roof_attachment.building.json --ops examples/transactions/porch-entry.edit.json --out ./exports/porch-entry.building.json --warnings-as-errors
node cli.mjs export ./exports/porch-entry.building.json --out ./exports/porch-entry-scenes --warnings-as-errors
node cli.mjs godot-check --assets ./exports/porch-entry-scenes --require-collision --godot /absolute/path/to/godot
```

Load `exports/porch-entry.building.json` using the web editor's Load action to continue editing. The demo widens the existing house from 12 to 13 m, keeps its connected corners, adjusts the host roof, adds an interior partition/door, east window and porch entrance, labels the entry hall and lowers/shortens the attached canopy. The label region does not change geometry. It exports a building TSCN and two door dependencies with empty material slots and separate exterior/interior lighting shells.

`inspect --entities` lists normalized IDs and fields. Use those exact floor/object IDs in operations; floor numbers and display labels are not selectors. Missing legacy IDs are deterministic when inspecting and editing the same source. Inputs without stable IDs can first be saved as a normalized copy using an empty operations array.

## Transaction structure

```json
{
  "version": 1,
  "operations": [
    {
      "op": "roof.update",
      "id": "roofSections_8",
      "value": {"pitch": 25, "edgeModes": {"maxZ": "flush"}}
    }
  ]
}
```

Only `version`, optional `expectedSourceSha256`, and `operations` are accepted at the top level. The transaction format version is independent of the building schema (9, or 10 for shared doorway outlines). Up to 1,000 ordered operations are accepted. An empty list explicitly produces only a normalized-copy diff. Unknown operation names/fields and incorrect value types are errors; executable scripts, arbitrary property paths and automatic ID renaming are not supported.

The optional `expectedSourceSha256` is a 64-character lowercase SHA-256 of the exact input bytes. Copy `sourceSha256` from a reviewed dry run into that field to prevent application to a different revision, including whitespace changes. It is optional for reusable recipes such as the demo. A save checks that the source bytes have not changed while it prepared the edit. The output is deterministic pretty-printed JSON with a trailing newline; `resultSha256` is identical for dry-run and save with the same source and transaction.

## Operations

All operations except `building.update` require `op` and `id`; `building.update` has no ID or floor and accepts only `value`. `wallType.*` and `openingShape.*` are building-level and reject `floorId`. Walls, railings, openings, regions, stairs and platforms also require `floorId`. Floor operations use the floor's own `id` and reject `floorId`; manual roofs also reject `floorId`. Add requires a new ID; update/remove require an existing ID in that collection. Existing object IDs are retained. Array order is retained except for explicit additions/removals.

| Operation | Additional fields | Behavior |
| --- | --- | --- |
| `building.update` | `value` with `name`, `exportProfile`, `wallHeight`, `wallThickness`, `floorThickness`, `gridSize`, `roof`, `ceiling`, `doorMesh` and/or `windowMesh` | Updates building-level settings. `doorMesh` merges `enabled`, `frameWidth` (≥ 0.03 m), `frameDepth` (≥ 0.03), `panelThickness` (≥ 0.02) and `detailDepth` (≥ 0.005); `windowMesh` merges `enabled`, `frameWidth` (≥ 0.02), `frameDepth` (≥ 0.02) and `glassThickness` (≥ 0.005), matching the web settings. `roof` merges `type` (`gable`, `hip`, `flat`, `none`), `pitch` (5–70°) and `overhang` (0–100 m); `ceiling` sets `thickness` (0.02–100 m). Default wall height 0.2–1,000 m, wall thickness 0.02–100 m, slab thickness 0.001–100 m and grid 0.001–1,000 m match the web settings. Default dimension changes resolve through automatic floor elevations and appear in `structuralChanges`. Changing `wallThickness` also updates wall-type stations whose thickness equals the old value (the web setting does the same); other stations keep their metres. |
| `floor.update` | `value` with `label`, `elevation`, `wallHeight`, `floorThickness`, `autoFloor`, `autoCeiling` and/or `boundaryMode` | Updates an existing floor. Numeric overrides accept `null` to restore automatic/default behavior. Switches require booleans; `boundaryMode` is `closed` (default, removes the field) or `intentional_open`. |
| `floor.add-top` | `aboveFloorId`; optional `value` with floor dimensions/label, `autoFloor`, `autoCeiling`, `boundaryMode` | Adds a blank top floor using the new `id`. The named anchor must be the current top floor. |
| `floor.remove-top` | Optional booleans `removeContents`, `removeAffectedStairs` | Removes the named current top floor with explicit content and incoming-stair guards. At least one floor must remain. |
| `floor.insert` | `aboveFloorId` or `belowFloorId`; optional `value` (as `floor.add-top`) and `removeAffectedStairs` | Adds a blank floor above or below any floor, as the web **Add above**/**Add below** do (a floor below the lowest becomes a basement). The new floor takes the operation `id`. Stairs whose connection would change need `removeAffectedStairs:true`. |
| `floor.duplicate` | `sourceFloorId`; optional `value`, `removeAffectedStairs` | Copies a floor above itself, as the web **Duplicate** does (stairs and floor roofs are not copied). Copied walls, openings, lights, markers, regions, footprints, platforms and railings get IDs `<new floor id>-<original id>`, so recipes are reproducible. Copying a copy replaces the source floor's prefix rather than stacking it (`l5-x` from `l4-x`, not `l5-l4-x`) unless that would make two IDs equal. |
| `floor.move` | `direction` (`up`, `down`); optional `removeAffectedStairs` | Swaps the floor with its neighbour, as the web **Move up/down** do, preserving level gaps. |
| `floor.remove` | Optional booleans `removeContents`, `removeAffectedStairs` | Removes any floor (not only the top), with the same guards as `floor.remove-top`. |
| `platform.update` | `value` with `label`, `minX`, `maxX`, `minZ`, `maxZ`, `height`, `kind` and/or `covered` | Updates an existing platform. Kind changes set the default coverage unless explicitly overridden. IDs and ownership remain fixed. |
| `platform.add` | `value` with `minX`, `maxX`, `minZ`, `maxZ`; optional `label`, `height`, `kind`, `covered` | Creates a platform with the specified new ID. Defaults: porch, height offset 0, covered, constructor label. Decks default to uncovered. |
| `platform.remove` | No value | Removes only the selected platform. Automatic coverage/supports regenerate; independent pieces remain authored objects. |
| `stair.update` | `value` with `label`, `x`, `z`, `width`, `run`, `direction`, `style`, `steps` and/or `blockBelow` | Updates the existing stair within its owning floor. Requires an adjacent upper floor. IDs and ownership cannot change. |
| `stair.add` | `value` with `x`, `z`, `width`, `run`, `direction`; optional label/style/steps/blockBelow | Adds a flight with the specified new ID. Requires an adjacent upper floor. Defaults: ramp, 12 steps retained, blocked underside, constructor label. |
| `stair.remove` | No value | Removes only the existing selected flight. Can remove an imported orphan. |
| `wall.add` | `value` with `a`, `b`; optional `label`, `role`, `height`, `wallTypeId`, `inwardSide` or `inwardToward` | Adds a wall. Defaults: interior role, full-story height (`null`), empty label, Standard profile. Overlapping collinear segments are rejected. |
| `wall.update` | `value` containing `label`, `role`, `height`, `wallTypeId`, `inwardSide` and/or `inwardToward` | Changes properties while retaining endpoints and ID. Height may be `null` or a number from 0.1 m through the story height. `wallTypeId` names an existing wall type; `null` returns the wall to Standard. `inwardSide` is `auto` (removes the field), `left` or `right` of A → B in plan. Alternatively, `inwardToward: {x, z}` is any plan point on the side the profile's positive (inward) offset should face; it is stored as `left`/`right` and rejected if it lies on the wall line. The profile, junction and opening rules are checked on the final building. |
| `wallType.add` | `value` with `label` and `stations` | Adds a shared wall profile, as in the web **Wall types** dialog. Stations are 2–16 `{height, offset, thickness}` levels: height is a fraction 0–1 that must start at 0, end at 1 and increase; offset (±10 m, positive = inward) and thickness (0.01–10 m) are metres. Heights are fractions so one type fits walls of different heights. End levels at offset 0 with the building thickness avoid the floor/top-edge review warning; stations at the building thickness follow later wall-thickness changes. |
| `wallType.update` | `value` with `label` and/or `stations` | Replaces the given fields; every wall using the type changes with it. |
| `wallType.remove` | None | Removes the type and returns its walls to Standard (the web **Delete** behavior). |
| `openingShape.add` | `value` with `label` and `points` | Adds a doorway outline, as in the web **Doorway shapes** dialog: 3–32 normalized `{x, y}` corners in 0–1 that reach all four bounds and include a flat bottom edge at y = 0. Doors reference it with `shapeId`. Sets schema version 10. |
| `openingShape.update` | `value` with `label` and/or `points` | Replaces the given fields; every door using the shape changes with it. |
| `openingShape.remove` | None | Removes the shape and makes its doors rectangular; removing the last shape returns the document to schema 9 (the web **Delete** behavior). |
| `wall.move-endpoint` | `end` (`a`/`b`), `point` (`x`, `z`), optional boolean `connected` | Shares the editor's move proposal. Connected endpoints move by default. `connected:false` explicitly detaches the selected endpoint. Unsafe junction breaks, new crossings and openings that need resizing reject the move. Permitted opening-position adjustments appear in the diff. |
| `wall.crenellate` | `value` with `crenelWidth` (0.2–1,000 m), `merlonWidth` (0.2–1,000 m), `depth` (0.1–100 m); optional `idPrefix` | Adds evenly spaced top-open crenels to an existing wall as ordinary `empty` window openings (sill = wall height − depth, height = depth), centred along the wall with merlons of at least `merlonWidth` at both ends. IDs are `<idPrefix or wallId-crenel>-1…N`; existing IDs or overlapping openings reject the edit. The openings remain individually editable. The web wall panel's **Add crenels** uses the same shared layout. |
| `wall.split` | `newId` and exactly one of `at: {x, z}` (a plan point on the wall, up to half the wall thickness off its centreline) or `distance` (metres from end A) | Splits the wall in two, as the web wall panel's **Split wall** does. The original keeps its ID and end A; the new piece (`newId`) runs to end B and copies every other property. Walls ending at the split point stay attached. Openings move to the piece that contains them and keep their position; an opening across the split point, a piece shorter than 0.15 m or an ID already used on the floor rejects the edit. Use it to close an exterior outline where another exterior wall ends partway along a wall (a T): an outline only closes at shared endpoints. |
| `stair.guard` | Optional `value` with `idPrefix` (default `<stair id>-guard`), `height` (≥ 0.4 m, default 1), `style` (`two_rail`, `picket`, `cross_brace`) and `label` | Adds railings on the floor above around the opening the stair cuts, as the web stair panel's **Guard opening above** does: on the opening footprint (0.06 m outside the flight's sides and entry end), one per open side, named `<prefix>-north/south/east/west`. The landing end stays open; sides already closed by a parallel wall within half a wall thickness + 0.25 m, or by a railing, are skipped, so guarding again adds nothing. Rejected when the floor above has `autoFloor:false` (no opening is cut). |
| `railing.add` | `value` with `a`, `b`; optional `label`, `height` (0.4 m to the story height), `style` (`two_rail`, `picket`, `cross_brace`) | Adds a railing with mesh and collision. Defaults: `Railing`, 1 m, `two_rail`. Segments must exceed 0.15 m. Railings block routes in `--reachability`. |
| `railing.update` | `value` with `label`, `a`, `b`, `height` and/or `style` | Updates an existing railing, including its endpoints. |
| `railing.remove` | None | Removes only that railing. |
| `light.add` | `value` with `position: {x, y, z}` (y is the height above the floor); optional `label`, `color: {r, g, b, a?}` (0–1), `energy` (≥ 0), `range` (≥ 0.1 m), `shadows` | Adds an omni light, as the web **Light** tool places. Defaults match the web tool: label `Light N`, warm colour, energy 2.35, range 8 m, shadows on. Exported as an `OmniLight3D` in the floor's light group. |
| `light.update` | `value` with any `light.add` field | Updates an existing light. A new `color` replaces the whole colour; `a` defaults to 1. |
| `light.remove` | None | Removes only that light. |
| `marker.add` | `value` with `position: {x, y, z}` (y above the floor); optional `label`, `details` | Adds a named reference point, as the web **Marker** tool does. Defaults: label `Marker N`, empty notes. Shared rules: one-line name of 1–120 characters, notes up to 2,000 characters. Exported as `Marker3D`; notes stay in the JSON. |
| `marker.update` / `marker.remove` | `value` with any `marker.add` field / none | Edits or removes that marker. |
| `slab.add` | `value` with `minX`, `maxX`, `minZ`, `maxZ`; optional `label` | Adds a Floor Footprint (web **Floor Footprint** tool), which overrides the automatic slab outline on its floor. Default label `Floor Footprint N`. At least 0.1 m on both axes. |
| `slab.update` / `slab.remove` | `value` with bounds and/or `label` / none | Edits or removes that footprint. |
| `manualFloor.add`, `manualCeiling.add` | `value` with `minX`, `maxX`, `minZ`, `maxZ`, `topY` (absolute); optional `label`, `thickness` | Adds an independent building-level slab, as the web **Manual Floor**/**Manual Ceiling** tools do; no `floorId`. Thickness extends down from `topY`. Defaults: `Manual Floor`/`Manual Ceiling`, the building floor/ceiling thickness. |
| `manualFloor.update`, `manualCeiling.update` / `.remove` | `value` with any add field / none | Edits or removes that surface. |
| `group.move` | `floorId`, `items: [{type, id}]`, `delta: {x, z}`; optional `connected` (default true) | Moves a selection on one floor, as the web **Move selection**/**Move by distance** do, with the same guards: openings slide along their host walls, connected wall endpoints follow unless `connected:false`, and moves that break joints or cross walls are rejected. Types: `wall`, `opening`, `light`, `marker`, `stair`, `railing`, `region`, `slab`, `platform`, `manualFloor`, `manualCeiling`, `roofSection`. |
| `wall.remove` | None | Removes only that wall. Any retained opening referencing it blocks the final transaction. |
| `opening.add` | `value` with `type`, `wallId`, `t` or `at`, `width`, `height` | Adds a door/window. `t` is fractional position along its host wall (0–1). Alternatively `at: {x, z}` gives the opening centre as a world point; it is projected onto the host wall centreline (points up to half the wall thickness away, i.e. on a wall face, are accepted), stored as `t` rounded to 1e-9, and rejected if it projects beyond either wall end. Window defaults: 0.9 m sill, plain style. Door default: room style. |
| `opening.update` | `value` with supported fields below | Updates an existing opening without changing ID/type. Can explicitly reassign `wallId` within the same story. |
| `opening.remove` | None | Removes only that opening. |
| `roof.add` | `value` with `minX`, `maxX`, `minZ`, `maxZ`; optionally any `roof.update` field | Creates an independent manual roof. Supplied fields replace the shared model constructor defaults: gable, X axis, base Y 2.8 m, pitch 35°, overhang 0.35 m, both gable ends. Heights are absolute, not inferred from a floor. |
| `roof.update` | `value` with supported fields below | Updates the existing manual roof; never modifies another host automatically. |
| `roof.remove` | None | Removes only the roof. Children must be explicitly detached, removed or rehosted in the same transaction. |
| `region.add` | `value` with rectangle bounds or `polygon: [{x,z}, ...]` | Creates a rectangular or polygon region; defaults to room purpose and label-only effect. |
| `region.update` | `value` with `label`, rectangle bounds or `polygon`, `kind` and/or `effect` | Updates region geometry/metadata; polygon replacement derives new bounds. Bounds-only edits of a polygon are rejected. |
| `region.remove` | None | Removes only the region. |

Supported opening update fields: `label`, `wallId`, `t` or `at`, `width`, `height`, plus `sill`/`windowStyle` for windows or `doorStyle`/`shapeId` for doors. `shapeId` references a saved `openingShapes` definition; `null` resets the opening to Rectangle. Window styles: `plain`, `double_hung`, `four_pane`, `empty`. Door styles: `exterior`, `room`, `closet`, `empty`. Empty styles intentionally create an unfilled opening. Fields for the other opening type are rejected. Width/height must be positive; the final opening must fit its actual host without overlap or silent resizing.

Supported roof fields: `label`, bounds or `polygon`, `type` (`gable`, `shed`, `flat`, `hip`), `direction` (`x`, `z`), `baseY`, `pitch` (5–70°), `overhang` (0–100 m), `gableEnds` (`both`, `min`, `max`, `none`), `hostRoofId`, and `edgeModes`. Set `hostRoofId:null` to explicitly detach; empty strings are invalid. `edgeModes` replaces that entire object and accepts `minX`, `maxX`, `minZ`, `maxZ` with `flush`/`overhang` values. Unspecified edges use overhang; `{}` resets all edges. Attachment chains/cycles/self references are unsupported. Attachment trims roof slabs only; gable fills remain separately authored and may generate a review warning. A `polygon` (3–256 convex corners, as `{x, z}` points) gives a flat or hip roof an outline-following footprint, for example over an angled bay. Its bounds are derived from the corners, bounds-only edits are rejected, and `polygon: null` returns the roof to its rectangle. Gable and shed roofs stay rectangular. Hip and polygon roofs neither attach to a host roof nor host one, and they take no `edgeModes`; the overhang applies to every edge. To turn an attached roof into a polygon or hip roof, clear its attachment in the same operation (`hostRoofId: null`, `edgeModes: {}`); the web panel clears them for you and says so. The web roof panel sets the same footprint with **Footprint** (the outline of a polygon region on any floor) and offers **Hip** as a type.

Region kinds: `room`, `bay`, `wing`, `garage`, `porch`, `courtyard`. Effects: `label`, `solid`, `void`. Purpose is descriptive. Solid defines automatic footprint coverage unless Floor Footprints exist; void cuts automatic surfaces on its story. Neither effect changes manual roofs/floors/ceilings, platforms, stairs or walls. Roof/region rectangles must be at least 0.1 m on both axes. Polygon regions need 3–256 distinct noncrossing corners, at least 0.01 m² area and 0.1 m extent on both axes. Bounds are derived when a transaction supplies polygon vertices; ordinary building JSON carries matching bounds. Plan coordinates must be finite and within ±1,000,000 m. Wall role is `exterior` or `interior`; add/move segments must exceed 0.15 m. Numeric strings are rejected.

## Transaction and output guarantees

### Top-floor creation and removal (0.33)

`floor.add-top` needs an explicit new `id` and `aboveFloorId` naming the current top floor. It appends a blank floor; it does not duplicate walls or infer a footprint. Optional `value` accepts `label`, `elevation`, `wallHeight`, `floorThickness`, `autoFloor`, `autoCeiling` and `boundaryMode`. Defaults match the web Add above operation: label `New floor N`, automatic elevation/default dimensions, both automatic surfaces enabled. The value object may be omitted or empty. Numeric `null` means default/automatic; switches require booleans. Other limits match floor updates below. Subsequent operations can author walls, regions, openings, platforms and incoming stairs before final validation. Existing floors, shared types and independent surfaces keep their IDs and metadata.

`floor.remove-top` must name the current top floor. At least one floor must remain. A populated floor requires `removeContents:true` to remove its walls, openings, lights, markers, stairs, regions, slabs, platforms, railings and floor-owned roof sections. Stairs on the immediately preceding floor require a separate `removeAffectedStairs:true`, because their upper-floor connection would disappear. Alternatively, remove those objects with explicit supported operations first. Omitted or false flags reject the edit when the corresponding contents exist. No automatic rehosting or ownership transfer occurs. An imported orphan on the old top may acquire the newly added adjacent upper floor.

`floorStackChanges` records processed stack operations in order, with `operationIndex`, `action`, `floorId`, `aboveFloorId`, `removedEntities` (`kind`, `id`, `label`) and `removedIncomingStairs` (`floorId`, `floorLabel`, `id`, `label`). For a removal, `aboveFloorId` identifies the surviving floor immediately below it. This is an operation inventory; adding then removing a floor still appears here even when the final document is unchanged. Failed transactions may report operations processed on their private candidate, but never save that candidate.

Final `structuralChanges.floors` and `floorCoverageChanges` match floors by ID, with `before:null` for an added floor and `after:null` for a removed one. `structuralChanges.stairs` uses a null flight for an unconnected state; detailed `stairChanges` and `platformChanges` retain their existing nullable membership convention, including removed floor contents. These derived reports reflect net changes. Effective level/membership changes warn when building-wide manual roofs/floors/ceilings remain at authored absolute heights. Review and accept that warning in ordinary mode; strict mode rejects it. Automatic geometry regenerates from the final plan. Independent pieces are never silently moved or deleted.

The paired recipes add a third story with five walls, an empty passage, a named region and an incoming staircase, then explicitly remove it:

```bash
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/add-third-floor.edit.json --dry-run --json
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/add-third-floor.edit.json --out ../third-floor.building.json --warnings-as-errors
node cli.mjs preview examples/stair_ramp_north.building.json --compare ../third-floor.building.json --out ../floor-stack.png
node cli.mjs export ../third-floor.building.json --out ../third-floor-assets --warnings-as-errors
node cli.mjs edit ../third-floor.building.json --ops examples/transactions/remove-third-floor.edit.json --out ../restored.building.json --warnings-as-errors
```

The preview needs the optional canvas backend. Source plans remain untouched and destinations must be new. The restored blueprint exports byte-identically to the original. Basement and middle insertion, duplication, reordering and removal of any floor use `floor.insert`, `floor.duplicate`, `floor.move` and `floor.remove` (see the operation table). There is no generic `floor.add` command.

### Floor updates (0.16)

`label` must be nonempty text, up to 1,024 characters. Elevation accepts finite numbers from −1,000,000 to 1,000,000 m, wall height 0.2–1,000 m, and slab thickness 0.001–100 m, matching the shared structural validator. Numeric strings are rejected. `null` deletes a numeric override; omitted fields retain their existing values. IDs, floor order and other floor properties cannot be changed by this operation.

Automatic elevation uses the preceding floor elevation + preceding wall height + this floor's slab thickness; the first automatic floor starts at zero. Explicit elevations are absolute, including negative values, and must increase in floor order. Changing a lower floor can affect later automatic floors and adjacent stair rise. Stored stair definitions and their IDs stay unchanged. Explicit upper elevations stop automatic propagation; mismatched spacing still produces shared gap/overlap warnings.

Floor changes are evaluated on the final transaction, allowing a later operation to repair an intermediate invalid spacing or resize an opening explicitly. Unlike the web dimension control's automatic opening constraints, CLI floor updates reject implicit opening resizing. Lowering a story below an existing custom-height wall requires an explicit wall update. Independent roofs and manual floor/ceiling pieces retain their authored absolute heights; final effective dimension changes add an alignment-review warning if such surfaces exist. Strict mode blocks saving until that warning is accepted by using ordinary mode; it is advisory, not a measured assertion that alignment is wrong. Label-only changes, equivalent resolved overrides and reverted dimension changes do not add that warning.

`inspect --entities` lists floor `overrides`; `null` means automatic/default. `inspection.floors` reports the resolved dimensions. Edit results add `structuralChanges` alongside the authored `changes`: `floors` gives before/after elevation, wall height, slab thickness and wall top; `stairs` gives before/after bottom Y, top Y and rise for affected connecting flights; `independentSurfaces` identifies the absolute-height pieces to review. These are derived candidate reports, not additional saved fields. They remain available after final validation failure; no rejected candidate is published. Terminal dimensions are rounded to four decimal places; JSON keeps the numerical values.

The supplied two-story recipe is reproducible with new output paths:

```bash
node cli.mjs edit examples/twostory.building.json --ops examples/transactions/twostory-levels.edit.json --dry-run --json
node cli.mjs edit examples/twostory.building.json --ops examples/transactions/twostory-levels.edit.json --out ../twostory-levels.building.json --warnings-as-errors
node cli.mjs preview examples/twostory.building.json --compare ../twostory-levels.building.json --view floor --floor 1 --out ../floor-levels.png
```

The image command needs the optional canvas backend. The included `qa/previews/cli_floor_levels.png` is a software review with a shared camera. The recipe changes the first floor to −0.5 m elevation with 4.4 m walls and a 0.22 m slab; the upper floor uses automatic elevation, 3.6 m walls and a 0.24 m slab. All existing wall/opening/stair definitions remain intact. It adds no catalog blueprint or pre-generated TSCN.

### Platform creation and removal (0.20)

`platform.add` requires a new `id`, an existing `floorId`, and all four rectangle bounds. Optional fields use the same limits as platform updates below. Defaults come from the shared constructor: `kind:"porch"`, `height:0`, `covered:true`, label `Porch`. A deck defaults to `covered:false` and label `Deck`. Explicit coverage and labels win. The new platform is appended; existing IDs, order and metadata remain intact. Inverted or sub-0.1 m rectangles are rejected rather than silently sorted. IDs must remain unique across the owning floor's object collections; there is no implicit floor creation or ownership transfer.

`platform.remove` accepts no value object. It removes exactly the selected platform; the exporter regenerates automatic floor cutouts, automatic roof participation and generated supports using the remaining platforms. A surviving overlapping platform keeps its cutout and coverage. Removing all platforms restores the original automatic slab where no other cut or override remains. Independent manual floors, ceilings, roofs and railings retain their own geometry and collision. Coverage is still subject to the building's automatic-roof setting, higher floors and independent roof overrides.

`platformChanges` is membership-aware: the absent side is null, and a net-zero add/remove transaction produces no platform difference. Combined additions and floor edits report the new platform's final absolute height. `floorCoverageChanges` keeps its final-state meaning. On geometric or membership changes, `independentReview` lists railings on the owning floor and building-wide manual surfaces/roofs, if any. This is deliberately a conservative context inventory: it does not infer ownership, test alignment or claim each listed piece intersects the platform. Label-only edits produce no such review. The review itself is informational and does not block strict mode.

Shared validation warns when two platforms have more than 0.001 m overlap on both plan axes and height offsets within 0.001 m. This catches potential duplicate slab rendering; it is not a full overlap-volume or accessibility test. Touching edges and clearly different heights do not trigger that warning. Ordinary mode preserves the authoring choice; `--warnings-as-errors` rejects final warnings. A later removal/update in the same transaction can repair the overlap before publication.

The web drawing tool uses the same platform proposal guard before committing a new platform. Rejected drawings leave document and undo history intact. Existing draw/delete/undo/redo behavior is exercised by the CLI regression suite through the actual web handlers.

The west-deck example adds an uncovered 2 × 4 m platform against the west wall of the roof-attachment fixture. The second recipe removes it:

```bash
node cli.mjs edit examples/roof_attachment.building.json --ops examples/transactions/add-west-deck.edit.json --out ../west-deck.building.json --warnings-as-errors
node cli.mjs edit ../west-deck.building.json --ops examples/transactions/remove-west-deck.edit.json --out ../west-deck-removed.building.json --warnings-as-errors
node cli.mjs preview examples/roof_attachment.building.json --compare ../west-deck.building.json --view floor --floor 1 --yaw -0.8 --pitch -0.75 --out ../west-deck.png
```

The included `qa/previews/cli_west_deck.png` is a software-rendered comparison, not a browser or Godot capture. The original front porch and two manual roof objects remain intact. The independent review therefore includes both manual roofs; no attachment to the new deck is implied.

### Platform updates (0.19)

`platform.update` accepts a nonempty `label` of at most 1,024 characters, rectangle bounds within ±1,000,000 m, `height` within ±10,000 m, `kind` (`porch` or `deck`) and boolean `covered`. Width and depth must each remain at least 0.1 m. The height is an offset from the owning floor's resolved elevation; slab thickness comes from that floor. Null, numeric strings, unknown fields and ID/ownership changes are rejected. Each rectangle edit must be valid; set both endpoints in one operation when moving beyond the old bounds.

Supplying `kind` sets `covered:true` for a porch or `false` for a deck, matching the web Type control. An explicit `covered` in that same operation takes precedence, regardless of JSON key order. A later coverage-only operation is also supported. Omitting both fields preserves their existing values, including covered decks and uncovered porches.

Platform footprints replace overlapping automatic floor slab coverage even when raised or lowered. Moving a platform restores its old cutout and cuts its new footprint. Stair cutouts and manual-floor overrides are applied before measuring the additional area removed by all platforms as a union; overlapping cuts are not counted twice. If the automatic floor is disabled, its reported area and platform cutout area are zero. Platform slabs still exist independently.

`platformChanges` reports before/after authored properties, dimensions and absolute top/bottom heights. `floorCoverageChanges` reports final changes to each floor's enabled state, elevation, automatic slab rectangles/area and `platformCutoutArea`. It can also report floor or stair edits that change those surfaces. Equal-area moves still report changed rectangle locations; reverted edits produce no net difference. `inspect` exposes these values as `inspection.floors[].platforms` and `.floorCoverage`; `inspect --entities` includes the stored platform fields.

Coverage reports exclude platform slabs and manual slabs from their area totals and do not certify walkability. `covered` controls automatic roof participation and generated supports; it does not move, resize or remove an independently authored roof. Independently authored railings, manual floors/ceilings and other objects retain their geometry and may need separate alignment edits. Existing roof-to-wall and roof-to-roof trimming still applies.

The web platform property form uses the same proposal guard. Invalid bounds or out-of-range height values restore the form without deleting the platform or recording an undo step. Existing type/coverage controls and undo/redo remain available.

The example widens the existing uncovered east platform from 2 to 3 m and makes it a deck without changing its height:

```bash
node cli.mjs edit examples/roof_junctions.building.json --ops examples/transactions/east-deck.edit.json --dry-run --json
node cli.mjs edit examples/roof_junctions.building.json --ops examples/transactions/east-deck.edit.json --out ../east-deck.building.json --warnings-as-errors
node cli.mjs preview examples/roof_junctions.building.json --compare ../east-deck.building.json --view floor --floor 1 --yaw 0.8 --pitch -0.75 --out ../east-deck.png
```

The included `qa/previews/cli_east_deck.png` is a software-rendered CLI comparison, not a browser or Godot capture. No existing catalog blueprint or TSCN is rewritten.

### Stair updates (0.17)

`stair.update` accepts a nonempty `label` up to 1,024 characters, center `x`/`z` within ±1,000,000 m, `width` from 0.5–10,000 m, `run` from 1–10,000 m, `direction` (`north`, `south`, `east`, `west`), `style` (`ramp`, `steps`), integer `steps` from 2–512, and boolean `blockBelow`. North ascends toward −Z, south +Z, east +X, west −X. Omitted fields retain their values; null and numeric strings are rejected. Step count is retained while using ramp style so a later style change restores that authored count.

The stair must exist in the named `floorId` and that floor must have an adjacent upper floor. It cannot be transferred, renamed by ID, created or removed by this operation. Rise always comes from the two connected floors. Updates use the shared preview/export model and its smooth `WalkableRamp` collision for both visual styles. `blockBelow:false` removes the separate visible/collidable underside fill; it retains the walkable ramp collision.

Final shared validation warns about slopes over 45°, incomplete full-width landing support and walls intersecting the stair footprint. Ordinary mode can save these warnings; `--warnings-as-errors` blocks saving. A later operation can repair an intermediate warning. These checks are advisory geometry checks, not building-code or character-clearance certification. Independent manual surfaces keep their own geometry and may need separately authored changes.

`inspect --entities` exposes stored stair fields. `inspection.floors[].stairs` adds adjacent-floor IDs, resolved bottom/top/rise, slope, step rise/tread depth (null for ramps), plan footprint and the model's opening footprint (0.06 m side/entry margin, flush at the top landing). Those opening bounds are a nominal cutting footprint; actual surfaces may be clipped by the floor boundary or other cuts. Orphan stairs in imported plans have null upper-floor/rise/slope values in the report rather than an invented connection.

Transaction `stairChanges` lists before/after stair reviews for final effective property or level changes, including combined `floor.update` operations. It is separate from authored JSON diffs and the existing floor-only `structuralChanges` report. A reverted stair edit produces no stair review difference. Reports describe candidates; failed edits never publish a building.

```bash
node cli.mjs inspect examples/stair_ramp_north.building.json --entities --json
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/stair-refresh.edit.json --dry-run --json
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/stair-refresh.edit.json --out ../stair-refresh.building.json --warnings-as-errors
node cli.mjs preview examples/stair_ramp_north.building.json --compare ../stair-refresh.building.json --view floor --floor 1 --out ../stair-refresh.png
```

The included `qa/previews/cli_stair_refresh.png` is a software review of this recipe. The optional engine suite separately tests 16 edited fixtures with changed floor heights, an enabled lower ceiling, all four directions, both styles and both blocker states. Its 488 rays sample stair/landing heights, opening relocation, underside blocking and story seams. The results do not establish general headroom or full character traversal.

### Stair creation and removal (0.18)

Creation uses the same numeric/style limits as updates, with required center X/Z, width, run and ascent direction. The caller supplies the new ID and owning `floorId`. No upper floor is created automatically. Optional fields default through the shared stair constructor: ramp style, 12 retained steps, blocked underside, and `Ramp` or `Staircase` label according to style. Duplicate IDs within the owning floor's collections are rejected. IDs are scoped by floor, as in existing transactions.

Removal requires only `op`, `floorId` and `id`; it rejects a value object. It removes no other object and can repair an imported orphan without an upper floor. Automatic upper slabs regenerate their opening union from the remaining flights. Thus removing one of two overlapping stairs retains the surviving opening; removing the last restores the affected automatic slab, including its underside serving as the lower room's ceiling. Independent manual floors/ceilings, void regions, platform cuts and other overrides keep their existing semantics; this operation does not fill an intentional separate cutout or trim manual surfaces.

Shared warnings flag positive-area stair-footprint overlap and sampled upper landing points entering another flight's nominal opening. The latter applies where an automatic upper floor is enabled and is an alignment review, not a full support calculation after manual overrides. Existing slope/landing/wall warnings still apply. Use strict mode to block final warnings, or ordinary mode after reviewing an intentional arrangement.

`stairChanges` uses `before:null` for additions and `after:null` for removals; retained edits keep both values. Add-then-remove produces no net stair change. Authored array membership changes appear in `changes` as per-ID `add`/`remove` entries. Existing floor-rise-only reports omit newly added/removed flights rather than inventing a previous/next rise. All effects describe the final candidate; rejected transactions publish nothing.

```bash
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/add-second-stair.edit.json --out ../two-stairs.building.json --warnings-as-errors
node cli.mjs edit ../two-stairs.building.json --ops examples/transactions/remove-second-stair.edit.json --out ../restored-stair.building.json --warnings-as-errors
node cli.mjs preview examples/stair_ramp_north.building.json --compare ../two-stairs.building.json --view floor --floor 1 --out ../two-stairs.png
```

The creation recipe adds a south-facing open 16-step flight at X=3, Z=0, width 1.2 m and run 4.8 m. The removal recipe reverses it. The included software preview is `qa/previews/cli_second_stair.png`. The optional lifecycle engine suite uses eight stages, 16 CLI calls and 208 physics rays, sampling both slab faces and overlapping-hole restoration. Those tests do not establish general character clearance.

### Publication details

Shape/type checks run before editing. Operations run in order on a private normalized clone. Local constraints (such as moving a connected endpoint safely) must pass at that step; shared reference and geometry validation evaluates the completed document. For example, a host may be removed before its child is explicitly detached in a later operation. Opening references can be resolved by subsequent additions. Order endpoint moves carefully when a proposed intermediate move would cross a wall or break a T-junction.

There is no implicit cascade, host relocation or opening resize. Harmless floating-point roundoff from shared constraints is stabilized before saving and appears in the exact result diff. Unlike the web editor's host-delete action, CLI host deletion requires explicit child operations so the transaction describes every intended change. Existing custom metadata survives on retained objects. The input document must be valid enough for ordinary import; this command is not a repair mechanism for malformed source JSON.

Failure returns `ok:false`, diagnostics and `building:null` from the shared module. CLI responses omit the internal building object. `operations` records the steps processed before failure; those steps were not committed. A failed partial operation may have no final diff. No candidate blueprint is saved on failure. With `--warnings-as-errors`, warnings in the final candidate also block saving.

`normalizationChanges` describes original source → shared import/default normalization; `changes` describes normalized source → final candidate. Entries use JSON Pointer paths and `op`, `before` and/or `after`. They are report data, not a JSON Patch API. Object fields use individual differences. In arrays of uniquely ID'd objects (walls, openings, floors, roofs, regions, stairs and similar), each added or removed object is its own entry: `path` names the array, `op` is `add` or `remove`, and `id` and `index` give the object's ID and its position in the resulting (add) or original (remove) array. Retained objects are compared field by field at their resulting index. Arrays without unique IDs, or whose retained IDs change order, are still reported as one array `replace`, so removals never mislabel the IDs of subsequent elements. The terminal shows edit differences and normalization count; `--verbose` also shows each normalization difference. `--json` always includes both lists in full.

Choose exactly one of `--dry-run` or `--out`. Dry-run writes nothing. Save serializes the complete validated result to an owned sibling temporary directory, then publishes with an exclusive hard link so existing paths cannot be overwritten and a partially written file is not exposed. It requires a destination filesystem that supports hard links; unsupported filesystems fail with I/O exit code 3. This path is tested on Linux only. Parent directories may be created on a write attempt, and no crash-recovery/in-place/force mode is provided.

## Checks and limits

```bash
node cli.mjs test --suite transactions --verbose
GODOT_BIN=/absolute/path/to/godot node cli.mjs test --suite engine-assets --verbose
```

The transaction suite covers dry-run/save equality, source/recipe preservation, failure rollback, identity/reference preservation, constrained openings, connected endpoint diffs, explicit deletions, fingerprints, legacy migration, metadata, web handler loading and exact exporter parity. The optional engine suite additionally authors the demo, exports it, and checks the building and door in Godot. Asset checking verifies resources and roof collision agreement, not full character headroom or movement. The web handler adapter is not a real browser layout test.
