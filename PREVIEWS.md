# Preview inspection: web and CLI

The web editor and CLI share the software 3D renderer, review geometry and measured guides. These views help review building edits; they do not verify walkability, collision coverage, lighting budgets or final Godot materials.

## Web controls (0.13)

In 0.14, attachment guide records also include host-effectiveness measurements. The web status counts links needing review and its details list measured contributions. Single-roof CLI legends show the status. See [ROOF_DIAGNOSTICS.md](ROOF_DIAGNOSTICS.md); an effective cut does not prove a sealed junction or valid gable fills.

Open **3D PREVIEW**. **View** chooses Whole building, Active floor cutaway, or Roofs and gables. **Guides** chooses None, Floor footprint, or Roof attachments. Both guide modes work with every view; their scope is the same as the CLI modes described below.

- The **Floor** selector appears for cutaways and footprint guides. It changes the editor's active floor through the same handler as the Floors panel, cancelling unfinished drawing and clearing object selection. This does not modify the blueprint. Single-story plans disable the selector.
- **Manual roof** appears for attachment guides. All constrained roofs is the default: roofs with a host link or flush edge. A specific manual roof can be inspected even without constraints. Deleting that roof resets the selector; deleting its host updates the guide relationship. Undo restores building geometry and links, while viewer settings remain separate from authoring history.
- **Frame view** and double-click fit the visible objects and guide endpoints. Changing view uses a suitable pitch; orbit, pan and zoom work as before. A canvas resize refits at the current yaw/pitch. Ordinary edits retain the camera unless the active floor changes; use Frame view after substantially moving geometry.
- Floor cutaways keep full-building geometry context before hiding other stories, roofs, gables and ceilings. Roof-only views include gable fills. Cutaway/roof views omit light gizmos. Whole-building view retains them. Geometry is cached between camera movements and refreshed on edits, floor changes, undo or loading.
- The status line labels empty geometry and missing attachments. Legends identify structural coverage, authored boundaries, host clipping envelopes and flush-edge traces. Guides are drawn through surfaces, with that scope always visible. Expand **View details and controls** for fallback reasons, automatic floor/ceiling flags and named roof relationships. Structural area precedes stair/platform cutouts; it is not walkable area.
- These settings are temporary viewer state. Saving a blueprint and exporting a scene remain unchanged. Two-document comparisons are still CLI-only.

Dependency-free web-handler tests cover the full current example catalog and its floor cutaways, shared-scene equality, linked floor selectors, roof/floor deletion and undo, guide visibility, empty states and the supplied plans' exact export parity. The optional `preview-render` suite also tests the actual interactive renderer with a canvas/event adapter: shared pixels, orbit/pan/zoom/cancel, hidden/show resize, and DPR 2 fitting. This adapter does not execute browser CSS/layout. Chromium is unavailable in the current environment; responsive browser visual approval remains pending.

`qa/previews/web_roof_guides_canvas.png` and `web_courtyard_guides_canvas.png` are inspected canvas outputs from that interactive renderer. They exclude the surrounding HTML controls and are not browser screenshots. The supplied browser script includes the new controls at 1440, 768 and 390 pixel widths for execution when Chromium is installed.

## Views

```bash
node cli.mjs preview examples/farmhouse.building.json --out ./exports/house.png
node cli.mjs preview examples/twostory.building.json --view floor --floor 2 --out ./exports/upper.png
node cli.mjs preview examples/roof_attachment.building.json --view roofs --out ./exports/roofs.png
```

| View | Visible geometry |
| --- | --- |
| `building` (default) | Complete building preview, including all stories and independent surfaces. `--floor` selects active-story shading. |
| `floor` | Selected story's walls, openings, floor, platforms, railings and its outgoing stair flight. Other stories, all roofs/gables and all ceilings are hidden. Independent manual floors are included only when their top height matches the selected story elevation within the existing slab tolerance. |
| `roofs` | All automatic and manual roof slabs, ridge pieces and gable fills. Original roof-to-wall and roof-to-roof trimming remains applied even though blocking walls/hosts may be hidden or occluded. |

Floor selection is 1-based. Incoming stairs belong to the lower story and are hidden in an upper-floor cutaway, but their openings in the upper slab remain. Outgoing stairs may extend above the selected story because no new slicing plane is introduced. Off-level independent manual floors remain visible in building mode only. The matching tolerance for manual floor top heights is the greater of 0.05 m or 60% of the selected story's slab thickness. Manual ceilings are always hidden in floor mode. No inferred ownership is written into a blueprint.

The complete source building is used when calculating geometry, then preview objects are filtered. This preserves stair holes, floor elevations, manual overrides, neighboring-story blockers and roof attachments. Filtering never rewrites or exports a cutaway building. A view without geometry is labeled explicitly.

## Before and after

```bash
node cli.mjs edit examples/roof_attachment.building.json --ops examples/transactions/porch-entry.edit.json --out ./exports/porch-entry.building.json
node cli.mjs preview examples/roof_attachment.building.json --compare ./exports/porch-entry.building.json --view floor --out ./exports/porch-comparison.png
```

The positional file is **Before** and `--compare` is **After**. Each panel uses the same camera target, yaw, pitch, distance and projection. The camera fits the union of the visible objects' world-space vertices, so moving/widening/tall independent pieces are included without resizing each version separately. Automatic fitting reserves 12% margins. Explicit `--distance` disables the fit distance and can crop or place geometry behind the camera; the target remains the shared bounds center.

Default yaw is 0.6 radians. Pitch is −0.5 for building/roof views and −1.1 for floor cutaways. Override with `--yaw`, `--pitch` and `--distance`. Floor comparisons use the same ordinal floor number in each document; they do not match stories by name or ID. The selected floor must exist in both inputs. Use the reported floor IDs/labels/elevations to verify you are comparing the intended stories, especially if floors were reordered or inserted.

Images contain 1100×760 viewports plus labels: **1100×852** for a single view or **2200×852** for comparison. Static images omit interactive mouse instructions and light gizmos. Roof-only mode includes gable fills, so a gable may still obscure underside details; choose another yaw/pitch to inspect it.

## Output and optional dependency

The canvas backend is optional. Install `@napi-rs/canvas` locally or set `CANVAS_MODULE` to its installed location. The CLI does not download dependencies. All output paths must be new. Invalid input on either side, invalid camera/floor options, and an existing destination prevent image creation. No blueprint is rewritten.

`--json` returns ordinary input diagnostics plus `preview`: view mode, output dimensions, input paths, shared camera/bounds, and each panel's floor ID/label/elevation and visible/hidden object counts. Counts are software preview objects, not exported Godot mesh counts or triangle/collision statistics. Empty views report `empty:true`. The human report gives view dimensions and visible/hidden counts.

```bash
node cli.mjs test --suite preview
CANVAS_MODULE=/installed/path/to/canvas node cli.mjs test --suite preview-render
```

The dependency-free geometry suite checks the full current example catalog and its story cutaways, exact filtering with complete context, roof clipping retention, nonmutation, floor/manual-surface scope, finite framing and shared bounds. The optional rendering suite checks pixel equality for identical inputs, repeatable PNG bytes on the same backend, dimensions, empty views, invalid comparisons and destination protection. Pixel output may vary across canvas/font/backend versions. Full browser layout tests remain separate.

Bundled views in `qa/previews/`: `review_porch_building.png`, `review_porch_floor.png`, `review_porch_roofs.png`, and `review_twostory_upper.png`. The first three compare the supplied transaction demo against its unchanged source example. The upper-floor image shows the supplied two-story house with the lower story hidden.

Plan drawings, collision overlays, automatic roof-to-wall blocker overlays, arbitrary section planes, pixel-difference heatmaps and selectable shell-only views remain future work. Preview wall trim/shading remains illustrative; final material and physics inspection belongs in Godot.

## Measured overlays (0.12)

```bash
node cli.mjs preview examples/courtyard_regions.building.json --view floor --overlay footprint --out ./exports/coverage.png
node cli.mjs preview examples/roof_attachment.building.json --view roofs --overlay attachments --roof roofSections_8 --out ./exports/attachment-guides.png
```

`--overlay` accepts `none` (default), `footprint`, or `attachments`. Both overlays work with every preview view and `--compare`. Guides are drawn **through surfaces**, without depth occlusion, and labeled accordingly. They are review annotations, not rendered building pieces or collision shapes. Auto-framing includes guide vertices from both compared versions, so an overlay can expand the camera bounds beyond the isolated geometry. Explicit distance can still crop.

**Footprint** uses the selected `--floor` in each document. Cyan lines trace structural coverage from the same `structuralFloorRectangles` used by the editor/exporter; shared internal cell edges are canceled so courtyard and outer boundaries remain. Dashed amber outlines show authored Floor Footprints and solid regions; dashed pink outlines show authored void regions. Label-only regions are omitted. All guides lie at the selected floor's world elevation. Existing walls remain visible according to the chosen preview mode; they are not added as a separate authored-boundary guide.

The report includes the exact shared coverage rectangles, summed area, source, fallback reason, floor ID/elevation, auto-floor/ceiling flags and authored rectangle IDs/bounds. Source precedence is Floor Footprints, then solid regions, then supported wall outlines, then rectangular fallback. Voids subtract from that coverage. Overridden solid-region guides remain visible as authored intent even when a Floor Footprint takes precedence. Explicit rectangular fallback is reported as such, including for diagonal outlines. Coverage remains available when automatic floor generation is disabled; check the reported flags.

Structural area is **before stair/platform slab cutouts**, ceiling exposure, roof overhangs, independent surfaces and other exported details. It is not the area of actual walkable mesh, a room-ownership result or a collision guarantee. Manual floor/ceiling pieces and platforms remain independently authored. For the bundled courtyard-region example, coverage is 152 m²; its authored outer solid is 168 m² and its void is 16 m². The L-shaped wall-outline example reports 84 m².

**Attachments** considers all manual roofs that have a host link or a flush edge. Optional `--roof ID` selects one manual roof, whether or not it has such a constraint. The selector chooses the roof being trimmed; it does not isolate its visible roof mesh. Use `inspect FILE --entities` for IDs. A specified ID must exist in each compared input. Omit the selector when comparing added/deleted roofs.

Cyan wireframes are the finite host-envelope faces returned by `roofAttachmentBlockers`, including host pitch/axis, slab thickness, overhang and host flush cuts. Dashed amber outlines are the selected child's authored footprint at its base height. Pink lines identify child flush edges at that height; they represent the horizontal trace of a vertical clipping boundary, not its full plane or collision geometry. Large internal half-space surrogate boxes used for flush clipping are deliberately not drawn or included in camera bounds. The roof's own actual envelope remains unchanged.

Per-roof JSON reports identify child/host IDs and labels, host type, envelope face count, flush edges and whether its separately authored gable fills need review. A relationship/envelope display does not assert that clipping removed material or that a junction is closed. Automatic roof-to-wall blockers, wall volumes, reciprocal roof unions and gable-fill cuts are not shown by this overlay. Empty relationship sets are labeled explicitly.

Overlay PNGs are **1100×932** or **2200×932** with a legend below each panel. Long diagnostic text is shortened with an ellipsis in the PNG; JSON retains full messages. Without an overlay, the previous dimensions and rendering are retained. The CLI human report adds coverage/relationship details; `preview.panels[].overlay` contains full overlay metadata. Line/face counts describe guides and clipping-envelope faces, not exported mesh or collision statistics.

`test --suite preview` now includes analytic courtyard/L-perimeter checks, all 41 floor coverages, internal-edge cancellation, source/fallback/override rules, exact host-envelope vertices on gable/shed/flat hosts on both axes, flush edges, guide bounds and camera-near-plane clipping. Optional `preview-render` checks add overlay PNG/pixel equality and invalid overlay/roof selector failures.

Bundled overlay images: `qa/previews/overlay_courtyard.png`, `overlay_l_outline.png`, `overlay_roof_attachment.png`, and `overlay_roof_comparison.png`. The comparison uses the CLI porch-entry recipe. Guides do not alter the examples, exported assets or separate lighting shells.
