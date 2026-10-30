# Using Building Studio effectively as an LLM

Applies to executable version **1.5.0**, building schemas through **10**, transaction format **1**, and check-report format **1**. Start with `node cli.mjs --version` and `node cli.mjs --help` in the installed package; use its implementation and current guides over remembered behavior from older releases.

## 1. Establish the task and source

Distinguish editing a user's building from maintaining the editor itself. For a building edit, identify the actual `.building.json`, desired result, dimensions and intentional openings. For tool cleanup, reproduce the behavior in current code and preserve existing capabilities. The current development direction is cleanup of the web tool and CLI; expansion entries in the roadmap are deferred.

Keep the original blueprint. TSCNs are generated assets and cannot be reimported as an editable building. Saved check reports are diagnostic snapshots, not blueprint backups. Supplied screenshots can explain intent but do not supply missing dimensions, IDs or exact geometry.

Use `examples --json` to find a suitable starting plan, its actual path, purpose and expected warnings. Use [QUICKSTART.md](QUICKSTART.md) for the source-to-recipe table: removal recipes require the result of their matching addition. Do not blindly apply an example recipe to another plan with different IDs.

For a new design, start from `node cli.mjs new --out NEW.json --name NAME` (floor ID `floor_1`) or from a copy of the closest existing example. Use `building.update` for building settings. There is no arbitrary-property patch command or TSCN import. If the requested design needs fields outside supported transactions, use the web controls or a carefully scoped JSON edit based on the shared model and validator; preserve unrelated fields and validate the candidate before export.

Know the scope before planning. The tool makes the building shell; materials, navmesh, door scripts and animation, gameplay nodes, lighting setup, furniture, terrain and performance settings are done in Godot or by the game ([README: Scope](README.md#scope-what-the-tool-makes-and-what-stays-in-godot)). A user asking for a "game-ready building" still gets a shell from this tool plus a note of what Godot-side work remains; list that work in the handoff instead of building a substitute generator.

## 2. Discover capabilities instead of inventing commands

| Need | Supported route | Limits to remember |
| --- | --- | --- |
| Discover plans | `examples --json`, `examples --check --json` | Checks expectations; does not regenerate examples |
| Diagnose a blueprint | `validate FILE --json`; optional `--out NEW.json`; `--reachability` adds route warnings | Reports errors/warnings; normalization is in memory |
| Discover editable IDs | `inspect FILE --entities --json` | Lists normalized floor IDs and supported entity inventories; inspect JSON for fields not included |
| Repeatable building edit | `edit FILE --ops RECIPE --dry-run` then `--out NEW.json` | Version-1 operations only; exact fields in TRANSACTIONS.md |
| Walls/openings/regions/manual roofs | Add, update, remove transactions; wall endpoint moves; `wall.split` (closes an exterior outline where another wall meets it partway along) | Wall property updates do not move endpoints; manual roofs are building-level objects |
| Building settings | `building.update` (name, default dimensions, wall thickness, automatic roof, ceiling, profile, `doorMesh`, `windowMesh`) | Materials stay empty by design |
| Floors | `floor.update`, `floor.add-top`/`remove-top`, `floor.insert` (above/below any floor, basements), `floor.duplicate`, `floor.move`, `floor.remove` | Duplicates omit stairs; copied IDs are `<new floor id>-<original id>` |
| Stairs/platforms | Add, update, remove transactions; `stair.guard` rails a flight's opening on the floor above | Stairs connect adjacent floors; independent pieces do not automatically follow platform edits |
| Elevators | `elevator.add`/`update`/`remove` (building-level, `bottomFloorId`–`topFloorId`); web **Elevator** tool (click to place; select to drag), Selection fields and **Elevators** panel; `group.move` | Static assembly only: shaft, movable car with its own doors, sliding landing doors, stop markers and anchors for the game's controls. `skipFloorIds` makes an express lift (no landing on those floors). Walls and railings may touch the shaft but not cross it; porches, manual floors/ceilings and roofs stay out of its height; plan a clear landing in front of the door on every served floor. Moving the car is the game's script. |
| Wall/door shapes | Web dialogs; `wallType.add/update/remove`, `openingShape.add/update/remove`, `wall.add/update` `wallTypeId`/`inwardSide`/`inwardToward`, opening `shapeId` | Doorway shapes are door-only and must reach the floor |
| Parapets and guards | `wall.crenellate` (crenels as empty windows), `railing.add/update/remove` | Wall thickness remains building-wide |
| Lights | `light.add/update/remove` (omni lights, web light tool defaults) | Exported as `OmniLight3D` per floor; placeholders for where lights go, to be replaced or tuned in Godot |
| Markers, Floor Footprints, manual floors/ceilings | `marker.*`, `slab.*` (Floor Footprints), `manualFloor.*`/`manualCeiling.*` (building-level, absolute `topY`) | Manual surfaces keep absolute heights when floors change |
| Move a selection | `group.move` (`items`, `delta`, `connected`) | Same guards as the web Move selection |
| Inspect appearance | Web 3D preview; CLI `preview` with floor/roof views, comparisons and overlays | Optional canvas dependency for PNGs; no CLI plan/collision-overlay mode |
| Generate Godot assets | `export FILE --out NEW_DIR`, `package FILE --out NEW.zip`; optional `--game-layer FILE` ([GAME_LAYER.md](GAME_LAYER.md)) | Retain relative door dependencies; materials empty unless a game layer assigns them |
| Assets for Unreal and other engines | `export FILE --format glb --out NEW_DIR` (web **Export .glb**; [GLTF.md](GLTF.md)) | One `.glb` per building from the same scenes: materials named after surfaces, Unreal `UBX_`/`UCX_` collision, metadata as extras; no game layer |
| Verify exported assets | `godot-check --assets DIR --godot PATH`; add `--render --out NEW_DIR` for Godot screenshots | Resource checks, not character traversal certification; rendering needs a display or xvfb-run |

Transactions support `building.update`, `floor.update/add-top/remove-top`, `wall.add/update/move-endpoint/crenellate/split/remove`, `room.add` (a rectangle of four walls, like the web Room tool), `stair.guard`, `floor.insert/duplicate/move/remove`, `group.move`, and `railing`, `light`, `marker`, `opening`, `roof`, `region`, `slab`, `stair`, `platform`, `manualFloor`, `manualCeiling`, `wallType`, `openingShape` add/update/remove. A recipe's top-level `points` names coordinates once for reuse in `a`/`b`/`at`/`point`/`polygon` (see TRANSACTIONS.md). Do not extrapolate new operation names from this pattern. Read the operation table for supported `value` fields and removal flags.

Core CLI and web serving need Node 20+ and no npm install. Linux is the tested platform. `CANVAS_MODULE` can name an installed canvas module; `GODOT_BIN` or `--godot` supplies an existing Godot executable. Browser tests additionally need Playwright and its Chromium binary. Do not infer availability from the module alone.

## 3. A complete, repeatable workflow

For new buildings or substantial layout changes, first read [AUTHORING_REVIEW.md](AUTHORING_REVIEW.md). Reserve circulation before detailing, inspect each occupied level and actual surface coverage, and record failed/unverified requirements. Inspect rendered views before delivery. A successful CLI command or zero default validation warnings cannot establish that a building is complete or accessible; run `validate --reachability` for route evidence and read its remaining limits. The supplied castle case study demonstrates this failure and a focused floor-coverage repair.

Run from the extracted `building-editor` directory. The block uses a newly created output directory and the shipped stair recipe, so its IDs are known to match. Check every exit status and `ok` result before continuing. These commands were exercised when this guide was introduced.

```bash
node cli.mjs --version
node cli.mjs --help
node cli.mjs examples --check --json
node cli.mjs inspect examples/stair_ramp_north.building.json --entities --json
build_run_dir="$(mktemp -d)"
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/stair-refresh.edit.json --dry-run --warnings-as-errors --json
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/stair-refresh.edit.json --out "$build_run_dir/edited.building.json" --warnings-as-errors --json
node cli.mjs validate "$build_run_dir/edited.building.json" --out "$build_run_dir/checks.json" --warnings-as-errors --json
node cli.mjs inspect "$build_run_dir/edited.building.json" --entities --json
node cli.mjs export "$build_run_dir/edited.building.json" --out "$build_run_dir/assets" --warnings-as-errors --json
node cli.mjs package "$build_run_dir/edited.building.json" --out "$build_run_dir/assets.zip" --include-json --warnings-as-errors --json
```

Optional inspection commands, after dependencies are confirmed:

```bash
node cli.mjs preview examples/stair_ramp_north.building.json --compare "$build_run_dir/edited.building.json" --view floor --floor 1 --out "$build_run_dir/comparison.png" --json
node cli.mjs godot-check --assets "$build_run_dir/assets" --godot /absolute/path/to/godot --require-collision --json
```

Replace the Godot placeholder with an actual executable. Load `edited.building.json` in the web builder to review and continue visually. Share the edited JSON and asset ZIP, plus relevant diagnostics/previews. Preserve the original plan and do not delete a previous export merely to reuse its path.

For a custom transaction:

1. Inspect the exact source and read the needed operation definitions.
2. Use existing scoped IDs, not labels or array indices. Supply explicit new IDs for additions.
3. Write the recipe, dry-run it, and inspect `changes`, `normalizationChanges`, warnings and derived structural reports.
4. For revision-sensitive edits, copy dry-run `sourceSha256` into `expectedSourceSha256`. This protects exact source bytes, including whitespace.
5. Save to a new path and compare its `resultSha256` with the reviewed dry-run hash when source and operations are unchanged.
6. Revalidate, inspect, export and perform the relevant visual/engine checks.

An empty version-1 operations list can save an explicit normalized copy. A failed transaction publishes no candidate. `operations` in a failed report describes attempted steps, not committed edits. Local move constraints must pass at the step where they occur; final reference and geometry validation evaluates the completed transaction. There is no implicit cascade: removing a wall needs explicit handling of its openings, and deleting a roof host needs explicit child detach/remove/rehost operations.

### New buildings: generate the recipe with a script

For anything beyond a few walls, write a short script that generates the recipe, then build it in one step. This is the expected route for real buildings, not a workaround: recipes stay plain, reviewable data, and the script holds the loops and arithmetic. GET PROBED's ~15 buildings were made this way (with Python); any language works. This Node script needs no dependencies:

```js
// make-recipe.mjs: writes shop.edit.json for `node cli.mjs new --ops`.
import fs from 'node:fs';
const ops=[];
const wall=(id,a,b,role='interior')=>ops.push({op:'wall.add',floorId:'floor_1',id,value:{a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role}});
const door=(id,wallId,at,width,doorStyle='room',extra={})=>ops.push({op:'opening.add',floorId:'floor_1',id,value:{type:'door',wallId,at:{x:at[0],z:at[1]},width,height:2.1,doorStyle,...extra}});
const room=(id,label,minX,maxX,minZ,maxZ)=>ops.push({op:'region.add',floorId:'floor_1',id,value:{minX,maxX,minZ,maxZ,label}});
ops.push({op:'room.add',floorId:'floor_1',id:'shell',value:{minX:-8,maxX:8,minZ:-5,maxZ:5}});
wall('back',[3,-5],[3,5]);
door('entry','shell-north',[-3,-5],1.8,'exterior',{leaves:2});
door('kitchen','back',[3,0],0.9);
for(let i=0;i<3;i++)ops.push({op:'opening.add',floorId:'floor_1',id:`win${i}`,value:{type:'window',wallId:'shell-south',at:{x:-6+i*4,z:5},width:1.2,height:1.1,sill:1}});
room('dining','Dining',-8,3,-5,5);room('kitchen_area','Kitchen',3,8,-5,5);
ops.push({op:'building.update',value:{slabsByRoom:true,roof:{type:'hip',pitch:30}}});
fs.writeFileSync('shop.edit.json',JSON.stringify({version:1,operations:ops},null,1));
```

```bash
node make-recipe.mjs
node cli.mjs new --ops shop.edit.json --out shop.building.json --warnings-as-errors   # add --replace to re-run
node cli.mjs validate shop.building.json --reachability
node cli.mjs export shop.building.json --out shop-scenes
```

Tips from real builds:

- `room.add` makes a closed rectangle of four walls (`<id>-north/-east/-south/-west`, north is −Z). Interior walls can end anywhere along another wall (a T).
- An exterior outline closes only at shared endpoints. Where an exterior wall ends partway along another exterior wall, `wall.split` that wall at the meeting point. After a split, the original keeps end A and the new piece (`newId`) takes the rest, so place later openings on the right piece.
- Place openings with `at: {x, z}` (a world point on the wall) instead of computing `t`.
- A recipe's top-level `points` names coordinates once (see TRANSACTIONS.md) if you are not using a script.
- `new --ops` and `edit` never overwrite an existing file unless `--replace` is given (and never an input).
- Labels become node and file names (`Door_001_Front_entrance`, `FloorSlab_Kitchen`), so meaningful labels give readable scenes.

## 4. Read machine output correctly

Use subprocess argument arrays rather than shell interpolation when automating filenames. Quote paths in shell examples. Input/output paths are caller-relative, while bundled catalog/test resources are installation-relative. Place flags before `--` when passing filenames beginning with a dash. Shells expand globs; an unmatched literal glob is a missing input.

Error formatting also respects `--`: a literal filename `--json` after it is never an output option. Supply `--json` before the separator to obtain machine-readable diagnostics, including usage failures.

Blueprint and transaction JSON may start with one UTF-8 BOM. Parsing removes that marker from its text copy only; source hashes and `--include-json` still describe the original bytes. Do not strip the source file before computing `expectedSourceSha256`.

`--json` emits one response object; inspect the process exit code and `ok`. Do not parse human text to recover IDs. Codes are 0 success, 1 validation/test failure, 2 usage, 3 I/O/dependency failure; release cancellation uses 130/143. Fix usage errors by reading help, and dependency errors by checking the configured executable/module rather than retrying identical commands.

Destinations must be new. Unknown/repeated flags are errors. There is no `--force`, `--strict`, `--output`, generic JSON Patch API or automatic dependency download. `--warnings-as-errors` is the supported strict policy; warnings retain their severity. Review intentional warnings instead of changing a design just to obtain a green result. If saving reviewed warnings is appropriate, explicitly use ordinary mode and disclose them.

`validate --out` deliberately saves diagnostics for invalid or missing inputs while retaining failure exit codes. Its saved file uses the portable check-report envelope; stdout retains the CLI command-response envelope. See [CHECK_REPORTS.md](CHECK_REPORTS.md). Targets are scoped navigation references and can be missing/ambiguous; they are not automatic repair instructions.

Authored diffs use JSON Pointer paths but are reports, not executable patches. Added/removed objects in ID'd arrays are per-ID `add`/`remove` entries whose `path` names the array (with `id` and `index`); arrays without unique IDs or with reordered IDs still appear as one `replace`. `null` overrides mean automatic/default only for fields documented that way. `before:null`/`after:null` in derived reports mean addition/removal or unavailable state as documented; never interpret them as zero elevation or zero rise. Manual surfaces listed in alignment review are context, not proof of a collision.

### Exported node and file names

Games hook into exported scenes by node name, so these names are a contract. Every `MeshInstance3D` also carries `metadata/building_part`: `exterior_wall`, `interior_wall`, `window`, `floor`, `ceiling`, `roof`, `ridge`, `gable`, `platform`, `post`, `beam`, `step`, `railing`, `stair`, `stair_blocker`, `door_frame`, `door_leaf`, `door_housing`, `elevator_shaft`, `elevator_car` or `elevator_door`. Style by part (game-layer rules take `part`) rather than by names that contain labels. Wall sides stay surfaces (`OutsideFaces`, `InsideFaces`, `EdgeFaces`, …). `NNN` is a 1-based counter per floor, in recipe order. `<Label>` is the authored label with every character except `A–Z a–z 0–9 _ - space` removed, trimmed, and each run of whitespace turned into `_` ("Globo-Dyne Office" → `Globo-Dyne_Office`, "Café" → `Caf`). Prefer the metadata below to rebuilding names: it carries the authored IDs and exact labels.

| What | Name |
| --- | --- |
| Scene root | `<Building_Name>`; file `<building_name>.tscn`. Set `building.update` `sceneName` (letters, digits, `_`, `-`) to fix both, so renaming the building does not move the file or the door and elevator scenes (`doors/<sceneName>_…`) |
| Per story | `Floor_01`, `Floor_02`, … each with `Geometry`, `Collision` (StaticBody3D) and `Openings` (Marker3D per opening); `Lights`, `Markers` when present. `Floor_NN` follows the stack order, so inserting a floor renumbers the ones above; match floors by `metadata/building_floor_id` (and `building_floor_label`) instead. `Floor_NN` carries `metadata/building_regions`: each region's `id`, `label`, `kind`, `effect` and bounds (plus corners for polygon regions), which is the way to find the room under a point. |
| Opening markers | `Floor_NN/Openings/Door_NNN_<Label>`, `Window_NNN_<Label>`: **one** counter over every opening on the floor (doors, empty passages and windows together), with `metadata/building_opening_id` and `building_opening_label`. A door in an exterior wall also has `metadata/outward_normal` and a `Threshold` child Marker3D at the door's foot on the wall's outer face (standard wall thickness), its −Z axis pointing outward: place terrain steps or ramps there |
| Exterior walls | `Floor_NN/Geometry/Walls/ExteriorWalls/OutsideFaces`, `InsideFaces`, `EdgeFaces` |
| Interior walls | `Floor_NN/Geometry/Walls/InteriorWalls/SideAFaces`, `SideBFaces`, `EdgeFaces` |
| Floor and ceiling | `Floor_NN/Geometry/FloorSlab` (surfaces `TopFaces`/`BottomFaces`/`EdgeFaces`) and `Ceiling` (`RoomFaces`/`RoofSideFaces`/`EdgeFaces`); with `slabsByRoom`, `FloorSlab_<Room>` and `Ceiling_<Room>` per labelled room, and wall faces `InsideFaces_<Room>`, `SideAFaces_<Room>`, `SideBFaces_<Room>`, each with `metadata/building_room` (the exact label) and `building_region_id`; a second room whose name comes out the same gets `_2`, `_3`. Only meshes split: floor and ceiling collision stay one body per story. |
| Automatic roof | `Floor_NN/Geometry/Roof/Roof_NNN_North`, `_South`, `RidgeCap_NNN` (hip: `_Hip_NN`, mansard top `_Top`). Untrimmed gable/shed/flat slabs and ridge caps are plain boxes with no surface name: colour them with a whole-node game-layer rule. |
| Manual roofs | Root `ManualRoofs/ManualRoof_NNN_<Type>…` |
| Windows | `Floor_NN/Geometry/Windows/Window_NNN_<Label>` (surfaces `Frame`/`Glass`, metadata `building_opening_id`/`building_opening_label`; windows have their own counter), collision `Floor_NN/Collision/Window_NNN_<Label>_Collision` |
| Doors | `Floor_NN/Geometry/Doors/Door_NNN_<Label>`, instancing `doors/<building>_fNN_door_NNN_<label>.tscn`. The counter covers only doors that export a scene (empty passages are skipped), so it differs from the opening markers' counter; match doors by `metadata/building_opening_id` (the recipe's opening ID) and `building_opening_label` on the instance. |
| Door scenes | Root `Door` (metadata `door_width`, `door_height`, `door_leaves`, `door_style`), `Frame`, `Hinge` (`DoorMesh`, `AnimatableBody3D/CollisionShape3D`); double leaves (`leaves: 2` or closet) add `Hinge2`; roll-up doors use `Curtain` and `Housing`; GET PROBED profile adds `InteractionArea`. Leaf bodies have `sync_to_physics` off, so rotating `Hinge` carries the collision: a game can keep the leaf solid while it swings, or disable it while moving and open as Get Probed does. |
| Elevators | Root `Elevators/Elevator_NNN_<Label>`, instancing `elevators/<building>_elevator_NNN_<label>.tscn`: `Shaft` (surfaces `ShaftOutside`/`ShaftInside`/`ShaftEdges`) + `ShaftBody` (static); `Car` (AnimatableBody3D with `CarMesh` surfaces `CarFloor`/`CarWalls`/`CarCeiling`; move it on Y) with `CarDoorLeft`/`CarDoorRight` (riding leaves, `sync_to_physics` off) and a `CarPanel` marker; `Stops/Stop_NN` (Marker3D at each stop, metadata `building_floor_id`; skipped floors have none); `Landings/Landing_NN/DoorLeft`, `DoorRight` (AnimatableBody3D leaves overlapping the jambs) with `CallButton` (right of the doors, seen from the landing) and `Indicator` (above them) markers. To open, slide each leaf outward on X by `leaf_travel` (metadata on each `Landing_NN` and on `Car`). Root metadata: `building_elevator_id`, `shaft_size`, `door_width`, `door_height`. No script: moving the car and doors is the game's (game layer `scripts.elevator`). |
| Platforms, railings, stairs | `Floor_NN/Geometry/Platforms/Porch_NNN_<Label>` (`_Post_NNN`, `_Beam_NNN`, `_Step_NN`; a lean-to porch roof is `_Roof`, a plain box like the untrimmed roof slabs), `Railings/Railing_NNN_<Label>`, `Stairs/…` |

**Export profile.** `generic` (the default) uses the groups `building_lights` and `sight_transparent` and door collision layer/mask 1. `get_probed` adds GET PROBED's groups (`paranormal_lights`, `scare_sight_transparent`), door layer 4/mask 2 and the door `InteractionArea`. `node cli.mjs new` writes `exportProfile: "generic"`; `--profile` on `export`/`package` overrides the blueprint. Since 1.5.0 a blueprint without the field exports as `generic` (before, `get_probed`).

**Mesh data.** Baked `ArrayMesh` surfaces are non-indexed, flat-shaded triangles with normals, tangents (Godot's octahedral encoding, matching `SurfaceTool.generate_tangents()`) and UV1 in metres. Resource IDs contain only letters, digits and underscores.

**After export.** Materials are empty and doors carry no script by design: the game owns them. Assign materials by surface name, set render layers, attach door scripts and add per-door child scenes in one step with a [game layer](GAME_LAYER.md) file (`--game-layer`). Gameplay nodes such as room `Area3D`s, navigation or shelter zones remain the game's own post-processing.

## 5. Geometry conventions and common pitfalls

- Plan coordinates use X/Z in metres; Y is elevation. North is −Z, south +Z, east +X, west −X. Preview camera angles use radians; roof pitch uses degrees. CLI `--floor` is a 1-based display index; transaction `floorId` is an ID.
- Floor overrides and automatic stacking determine stair rise. A stair belongs to its lower floor and connects to the adjacent upper floor. Manual roof `baseY` and manual floor/ceiling heights are absolute; platform `height` is relative to its floor. Recheck independent pieces after level edits.
- Openings reference a host wall within their floor. `t` is a fractional position along wall A→B; instead of `t`, `at: {x, z}` places the opening centre at a world point on the wall (no need to compute fractions). Opening fit, overlap and junction clearance still apply. Empty door/window styles are intentional unfilled openings. Garage and loading-dock bays: `doorStyle: "rollup"` (optional `openFraction` 0–1). Wide doors: set `leaves: 2` on an exterior or room door for two hinged leaves (`Hinge`, `Hinge2`) rather than placing two adjacent doors.
- Automatic surfaces can follow closed polygon wall loops and authored coverage. Floor Footprints take precedence over solid regions; label regions add metadata, void regions cut automatic surfaces. Region effects do not rewrite independent roofs/slabs, platforms, stairs or walls.
- All voids are subtracted after solid coverage is combined. A solid keep inside a courtyard void loses its automatic floors too; changing region order or adding a Floor Footprint cannot override the void. Shape the cutout around the keep or use an intentional independent surface, and separately plan courtyard ground and vertical access.
- Exterior outlines close only at shared endpoints. A wall that ends partway along an exterior wall (a bridge or wing meeting a tower) leaves the outline open, and the automatic floor falls back to the bounding rectangle; split the host there with `wall.split` (the open-ends warning names each such junction). Exterior corners sharper than about 29° are bevelled 4 half-thicknesses from the junction instead of ending in a long point. Smooth curves of a shaped wall type can use short sections: each end only needs room for its own fitting (the profile's reach × tan(turn/2) at a plain join to another shaped wall, the full reach elsewhere).
- Open walks, tower tops and roof terraces: with any automatic roof type other than `none`, every floor area not covered by a higher floor gets an automatic roof at its wall top, and an enabled automatic ceiling hangs under the whole story (open only at stair openings and under upper floors with `autoFloor:false`). For open decks use `building.update` with `roof:{type:"none"}`. Then floor coverage outside the floor's closed exterior wall outline (a terrace or roof deck from Floor Footprints or solid regions) with nothing above it is open sky and gets no automatic ceiling unless an independent roof, ceiling or floor covers it; rooms inside the outline keep theirs. Floors whose exposed area lies inside a closed wall outline (wall walks, tower tops) still need `autoCeiling:false` (`floor.update`/`floor.add-top`) to stay open; then make sure every enclosed room is covered by the next floor's slab or an independent roof (`roof.add` accepts all roof fields). Uncovered deck platforms also avoid roofs but do not receive stair openings. Manual roofs can follow an angled outline: give a flat or hip `roof.add` a `polygon` instead of bounds (convex for hip; a flat roof may be concave, such as an L). Parapets can be one wall with `wall.crenellate`; thin guards are `railing.add`, and `stair.guard` places them around a stair opening.
- Automatic elevation includes the new floor's slab: a 4.0 m ground story with 0.18 m slabs puts the next floor at 4.18 m, and its wall top at 4.18 m + wall height. Independent roof `baseY` is absolute, so read resolved values from the dry run's `structuralChanges` or `inspect` before placing roofs on a story.
- Terrain at y = 0: a ground-floor slab top at exactly 0 z-fights with game terrain at 0. Set the ground floor's elevation slightly above it (`floor.update` `{elevation: 0.04}`, or the web floor panel's **Elevation**); every automatic floor above follows. Moving the building instance up in Godot works too.
- Porch, deck or veranda: `platform.add` against an exterior wall with `height` (deck top above the floor), `kind:"porch"` and `covered:true` (posts and beams; by default the building roof extends over it, one large roof over house and porch). For a porch roof of its own, add `roofStyle:"lean-to"`: a shed roof from the wall below the main eave, sloping away from the building, with the posts cut to it. Its pitch is chosen for 2.2 m headroom at the posts (5–15°) unless you set `roofPitch` (3–45°, `null` restores automatic); validation warns below 2 m, so a deep porch on low walls gets a shallow roof. Add `steps:{edge,at,width}` for steps down to the floor, and `railing.add` with `elevation` equal to the deck height so railings stand on the deck (validation warns when they don't). Web: the Porch/Deck tool, the platform panel's **Porch roof** and **Steps** and the railing panel's **Elevation above floor**.
- Elevators: `elevator.add` with the shaft centre `x`, `z`, `bottomFloorId` and `topFloorId` (web: the **Elevator** tool). Reserve the shaft and a clear landing in front of its doors on every floor it stops at, as you would stair runs: walls and railings may touch the shaft but not cross it, and porches, stairs, manual floors/ceilings and roofs must stay out of it. The validator names whatever crosses it. `skipFloorIds` makes an express lift. Door width is at most shaft width/2 − 0.35 m (0.95 m in the default 2.6 m shaft). `validate --reachability` counts lifts as routes between their stops; `godot-check --assets` probes each lift in Godot. A navmesh cannot ride a lift: the game links landings itself.
- Different floor or wall finishes per room, or many lights in a large building (Compatibility renderer limits lights per mesh): `building.update` `{slabsByRoom: true}` (web: **Split floors, ceilings and walls by room**) exports each labelled room region's floor, ceiling and room-facing wall faces as their own meshes; map materials per room with the game layer's `nodeMaterials`.
- Ceiling height: the automatic ceiling hangs inside its story, so its underside is at the floor's elevation + `wallHeight` − the building's `ceiling.thickness` (a 3.42 m story with 0.1 m gives 3.32 m clear). Read resolved elevations from `inspect`.
- Usable attic under a gable: add a top story over the same footprint with short knee walls (`floor.add-top` with `wallHeight` about 1–1.5) and `autoCeiling:false`, so the attic opens up to the roof; the automatic gable spans the whole footprint above it and the story below keeps its ceiling, now under the attic floor. Keep attic partitions low (wall `height`) or near the ridge so they stay under the roof slopes, and check a render. This keeps the attic in the same building, under its route check, instead of a second overlapping building.
- Flat roof with a parapet (tall exterior walls, lower interior ceiling): make the occupied story the interior height (`floor.update` `wallHeight`, e.g. 3.42), set `building.update` `roof:{type:"none"}`, then `floor.add-top` a story with the parapet height (e.g. `wallHeight:1`, `autoCeiling:false`) and repeat only the exterior wall outline on it. That story's automatic floor slab is the flat roof, its walls are the parapet, and the room below keeps its automatic ceiling at the interior height, with interior walls reaching it. No manual ceiling or shortened interior walls are needed. Manual roofs can still cover other parts.
- Mansard / truncated hip (steep slopes around a flat top): a hip roof with `flatTopHeight` (manual `roof.add`, or the automatic roof via `building.update`). Web: **Flat top height** in the roof panel and the automatic roof settings.
- Sloped roof slabs are at least 0.12 m thick and grow with the wall thickness and pitch (thickness ≥ wallThickness × sin(pitch) + 1 cm; hip roofs by the same rule in plan), so the outer top edge of a thick eave wall stays inside the roof. A 0.3 m wall under a 38° gable gets a 0.195 m slab.
- Automatic Hip roofs support convex footprints; continuous concave valleys remain unsupported. Independent manual slabs use rectangular footprints; manual roofs take a rectangle or a polygon (flat or hip, as above). Do not confuse clipping an existing roof with generating a new valley or dormer.
- Roof `hostRoofId` is a one-way trim relationship. Host chains/cycles are unsupported. The child may receive no additional cut or be removed entirely; read the attachment diagnostics. Gable fills are separate from attachment slab trimming. Use [ROOF_DIAGNOSTICS.md](ROOF_DIAGNOSTICS.md) and attachment overlays.
- Wall-profile stations use normalized height 0–1 (a fraction of each wall's height, so one type fits walls of different heights), metre offsets and metre horizontal thickness. Stations at the building wall thickness follow it when that setting changes. Positive offset means inward; negative means outward. `inwardSide` selects auto/left/right relative to wall A→B; in transactions, prefer `inwardToward: {x, z}` (a point on the inward side). `inspect --entities` reports each shaped wall's resolved inward direction (`profileInward`), and the web editor shows an inward arrow. Shared type edits affect every referencing wall.
- Profile endpoints displaced from the standard slab boundary can need separate surface fitting. Supported Standard-to-shaped branches require clearance and at least a 30° smaller angle. Shaped-to-shaped branches and multiple branches at an attachment are not supported.
- Shared doorway outlines use normalized front-view points, 3–32 noncrossing corners and a flat bottom. Custom single panels/frames need a straight constant-thickness wall segment over their height; empty passages can cross profile bends. Shaped paired doors/windows and bent frames remain unsupported.
- Separate shell meshes and per-story organization are deliberate light-budget controls. Preserve their boundaries, surface names, IDs and collision correspondence. Empty material slots are expected. The generic profile is reusable; preserve an existing GET PROBED profile unless the user requests conversion.

Keep the supplied barn's large ground-level entrance and closed upper gable. The root `farmhouse_example.building.json` intentionally has a stair/wall warning and differs from the supplied `examples/farmhouse.building.json`. Use catalog expectations to identify deliberate fixtures.

### Wall thickness

- `wallThickness` is **one building-wide setting** (`building.update`); there is no separate exterior/interior thickness. Changing it moves every Standard wall, and is the warning-free way to make all walls thicker.
- Walls that differ use a **wall type**: `wallType.add` with `stations` of `{height, offset, thickness}` (height is a 0–1 fraction, offset positive inward), then `wall.add`/`wall.update` with `wallTypeId` (or `room.add` with `wallTypeId`). Plain Standard walls have no per-wall thickness.
- **Thicker exterior shell** (e.g. 0.30 m brick on 0.18 m interiors): a type with `thickness: 0.3` and `offset: -0.06` at heights 0 and 1 keeps the inside face where a Standard wall's would be and grows the wall outward. Expect one review warning per typed wall ("profile changes the floor/top edge"), so strict `--warnings-as-errors` runs fail. Floors and ceilings are unaffected; a gable roof's end fill uses the building thickness and shows a ledge on the thicker wall, so prefer hip or flat roofs, or set the building `wallThickness` instead.
- **A facade on one side only:** the same type on just those walls. Roof fitting needs matching thickness at exterior corners, so a typed wall meeting a Standard wall at a corner adds a "roof fitting needs matching wall thickness" warning there.
- Typed (shaped) walls cannot end midway along another wall, so interior partitions that form T-junctions should stay Standard.

## 6. Efficient web use and review

Start the local web builder with `node server.mjs` (add `GODOT_BIN=/path/to/godot` to enable **Render in Godot**, which uses the same renderer and views as `godot-check --render`). An unset `PORT` uses 5173; a supplied value must be decimal digits representing 0–65535. Empty, whitespace, fractional and out-of-range values exit 2. For automation, use `PORT=0` and parse the actual URL from stdout. An occupied port exits 3 with a recovery message; choose a different port instead of retrying the same one. The server binds to loopback only.

Placement numeric controls reject blank, nonfinite and out-of-range entries, restoring the last accepted preference. Stair counts must be integers from 2 through 512. These preferences affect subsequent placements without adding undo entries or rewriting existing objects. Negative absolute slab/roof elevations and relative platform offsets remain valid within their documented bounds. CLI preview numeric options must contain a number; empty strings are usage errors, while an explicit zero yaw is valid.

Use selection filters when objects overlap; Shift/box selection and exact group offsets support moving multiple objects. Floor stack operations and shared wall/door shape editors expose functions beyond current transaction coverage. Shared shape editing affects all references; copy a shape first when only one opening should change.

Every CLI capability has a web equivalent: **Include route check** (reachability warnings plus a red plan overlay of unreachable areas), **Render in Godot**, the wall panel's **Add crenels** (same layout as `wall.crenellate`) and **Split wall** (`wall.split`), and the stair panel's **Guard opening above** (`stair.guard`). Use **Checks → Show…** to inspect affected objects. This switches to Plan, selects/frames the target or opens floor controls, and cancels pending drawing. The report download does not cancel pending drawing. Save JSON after editing; exported scenes do not preserve an editable web session. Undo covers authored edits, while inspection actions do not add undo entries.

Current selection already tests nearby openings and walls before filled areas. Stair selection already ranks hits by run-centerline distance with stable ID tie-breaking. Old audit recommendations about first-hit stair selection or areas winning over walls must be reproduced before scheduling another fix.

Wait for a JSON/example load to finish before editing that imported building. Starting another load, committing an edit, creating a new/preset building or using Undo/Redo supersedes an outstanding load. Superseded results and errors are ignored; to load them later, choose the file/example again. A failed current load leaves the existing building and history intact.

Save JSON reports a download request or a synchronous failure without changing the blueprint/history. A request is not proof the browser saved a file; confirm the browser download result before claiming delivery. Shared download cleanup releases temporary object URLs even when a DOM download call fails.

## 7. Verification by claim

| Evidence | What it supports | What it does not establish |
| --- | --- | --- |
| `validate` / saved checks | Existing schema/authoring rules and warnings | Full geometric correctness or playability |
| `inspect` | Derived dimensions, coverage, resource counts, shell paths | Watertightness, useful collision everywhere |
| `validate --reachability [--from "x,z[,floorId]"]` | Floor areas and stairs connected to open ground, or to interior start points, through doors, passages, stairs and elevators, with walker clearance and shaped-wall profiles | Headroom, stair comfort, door swing, physics traversal |
| CLI software PNG | Shared preview geometry and camera framing (approximation) | Godot lighting or browser layout |
| `godot-check --assets --render` | How the exported scene renders in Godot with default materials and a neutral sun/sky | Game lighting, materials or post-processing; physics |
| DOM editor suites | Actual handler behavior, history, modeled focus intent | Real CSS, responsive sizing, browser focus behavior |
| Playwright browser suite | The executed live interactions and viewport checks | Engine physics |
| `godot-check --assets` | Supported scene loading/resources and configured checks; for exported elevators, physics probes of the car at every stop and the landing and car doors | Character traversal; its only physics rays are the elevator probes |
| Bundled Godot/engine suites | Their specific generated scenes and authored probes | Arbitrary building or character clearance |
| `release-check` | Reported gates on an isolated source snapshot | Skipped dependencies or untested target engines/platforms |

For ordinary building authoring, validate and inspect the candidate, then review the export as appropriate. For tool cleanup, run the relevant suite (`editor`, `cli`, `transactions`, `geometry`, etc.) and the established release gate before claiming a release. Do not repeatedly run broad tests for a documentation-only edit: check the documented workflow, links and unchanged runtime bytes instead.

`release-check --canvas required --engine required --godot PATH --out ../NEW.json --json` requires both optional backends. The report path must be outside the installation. Read `complete`, every gate status and dependency version; exit 0 with skipped optional checks is not complete coverage. Avoid writing reports or screenshots into the source snapshot during the run.

The shipped runtime baseline was tested on Linux/Node 24.19.0/Godot 4.5.1 Compatibility. Godot 4.7, other OS/runtime combinations and live Chromium layout were not verified there. Check the current environment before repeating that limitation as fact. State what actually ran and attach relevant genuine captures for visual changes.

## 8. Source map for cleanup work

| Area | Files to inspect |
| --- | --- |
| CLI parsing, publication and output | `cli.mjs`, `asset-check.mjs` |
| Authored model/import defaults | `src/model.js`, `src/document.js` |
| Transactions and shared edit guards | `src/transactions.js`, `src/authoring.js`, `src/wall-edit.js`, `src/floor-stack.js`, `src/group-edit.js` |
| Validation, inspection, reports | `src/validation.js`, `src/diagnostics.js`, `src/diagnostic-targets.js`, `src/check-report.js` |
| Web controls, picking and history | `src/main.js`, `src/selection.js`, `src/history.js`, `index.html`, `src/style.css` |
| Shapes and junctions | `src/wall-types.js`, `src/wall-profile-geometry.js`, `src/profile-junctions.js`, `src/opening-shapes.js` |
| Roofs/footprints | `src/roof-geometry.js`, `src/roof-diagnostics.js`, `src/roof-wall-diagnostics.js`, `src/polygon-areas.js`, `src/regions.js` |
| Scene/preview generation | `src/exporter.js`, `src/preview-web.js`, `src/preview-review.js`, `src/preview-overlays.js` |
| Elevators (rules, layout shared by export, preview, routes and web) | `src/elevators.js`, `qa/validate-scenes.gd` (`godot-check --assets` probe), `qa/validate-elevators.gd` |
| Tests and packaging evidence | `test-suites.mjs`, `release-check.mjs`, `qa/editor-harness.mjs`, `qa/recipe-workflows.mjs`, `browser-tests.mjs` |

Change shared logic at its source and exercise affected web/CLI consumers. Existing user changes must be preserved. The example generator rewrites JSON, scenes and dependencies; use it only when regeneration is intended and review its diff. Generated assets should demonstrate an exporter change, not contain hand repairs that the next export loses.

## 9. Handoff checklist

State the source/revision used, exact requested change, output paths and what was tested. List intentional warnings and unavailable checks, and the Godot-side work that remains for the user (materials, navmesh and lift navigation links, door and elevator scripts, gameplay nodes and anything else from the README's Scope table). If wall thickness or room layout changed, tell the user to re-run their game's prop and spawn placement checks: validation does not see furniture. Deliver the editable JSON for building edits and retain relative door files with the main scene. For tool maintenance, provide the updated package and a concise change summary. Report whether examples/scene bytes changed; do not claim a previous release report's fingerprint covers modified documentation or code.

Useful references: [QUICKSTART.md](QUICKSTART.md), [CLI.md](CLI.md), [TRANSACTIONS.md](TRANSACTIONS.md), [PREVIEWS.md](PREVIEWS.md), [CHECK_REPORTS.md](CHECK_REPORTS.md), [ROOF_DIAGNOSTICS.md](ROOF_DIAGNOSTICS.md), [RELEASE_CHECKS.md](RELEASE_CHECKS.md), [ROADMAP.md](ROADMAP.md).
