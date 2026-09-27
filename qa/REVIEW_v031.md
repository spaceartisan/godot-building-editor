# v0.31 — custom doorway outlines

Front-view outline editor with named reusable shapes, percentage coordinates, drawing, corner dragging, numeric editing, insertion/removal, bounds fitting, and rectangle/clipped/arched presets. Supports simple concave polygons with a flat floor-level edge. Shared type changes and deletion are undoable; cancelling the dialog does not touch the document.

The authored outline cuts wall solids through their full thickness, then the existing union removes internal faces. Separate exterior/interior lighting shells and per-story organization are preserved. Empty custom openings can cross wall profile bends. Framed panels require constant wall offset/thickness over the opening height, just like existing fitted door/window frames.

Custom panels are plain polygon extrusions. Frames use a guarded inward offset and leave the bottom edge at floor level. Invalid/crossing outlines and collapsing frame insets are rejected. Convex panel collision pieces follow the shape; the frame uses separate stationary triangle collision. The Panel pivot moves mesh and collision together. Engine tests caught and fixed parent-pivot movement leaving an AnimatableBody collider behind: these custom child bodies have sync_to_physics disabled. No gameplay or movement script is supplied. Legacy Hinge scenes remain unchanged.

## Evidence

- CPU: 4,874 mesh probes for clipped, arched and concave outlines, Standard/shaped walls, rotations/reversals, frame threshold clearance, panel coverage and mesh winding.
- Godot 4.5.1 Compatibility: 14 new scenes and 1,262 rays, including clear cutouts, retained corner solids, closed panels, stationary frames and translated panel colliders.
- Web: actual handlers exercise shared edits, new outline drawing, pointer cancellation, dialog shortcut isolation, cancel/delete/undo/redo and rejected frame settings.
- CLI transactions assign and remove a saved shape reference; JSON round trips preserve shapes.
- Previous 32 plans and 62 TSCNs match v0.30 byte-for-byte. New example: custom_doorways (one panel, two passages).
- Final seven-gate results are in the archive-root release-report.json.

[Outline canvas](previews/doorway_shape_editor.png), [passage/panel detail](previews/custom_doorway_detail.png), and [example](previews/custom_doorways.png) use the actual editor canvas and shared software renderer. The detail view isolates the example's front wall for visibility. They are not live browser or Godot screenshots. Chromium is unavailable here; browser CSS/layout and Godot 4.7 are unverified.

## Limits

3–32 corners, 64 shared types, one simple outline with no nested holes, flat floor-level edge. Curves are faceted polygon segments. Custom closet pairs and windows are unsupported. Very narrow/reentrant shapes may need a smaller frame or an empty opening. Custom Panel pivots require game-specific movement scripts; they do not automatically follow Get Probed's Hinge script contract. Materials stay empty by default; export remains TSCN assets, not a full game project.
