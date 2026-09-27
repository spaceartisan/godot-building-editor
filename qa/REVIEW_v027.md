# v0.27 — concave shaped roof fitting

Roofs can now meet profiled exterior walls on L/U outlines, courtyard loops and disconnected rooms. Fixed rectangular and polygon void edges preserve the authored cutouts. This extends the shared clipping path used by the web preview, exported roof/gable meshes and collision.

## What changed

The earlier fitter required one convex room. Other footprints fell back to plan-based cuts, which could leave a gap beside a recessed wall or roof geometry inside a flared wall. The new fitter assembles the exposed footprint loops and sweeps their interior through each wall-profile height band. It divides each sweep into closed convex cells while preserving the empty spans of recesses and holes. Boundary crossings are checked throughout each band, not only at profile stations.

Courtyard wall edges follow their wall profiles; authored void edges stay at their JSON coordinates. Footprint edges must follow full-height exterior walls or explicit void boundaries. Matching thickness schedules, consistent collinear profiles and non-collapsing boundaries remain requirements. The fitter stops at 128 boundary segments or 512 cells and reports nearby roof/wall guidance. Unsupported cases retain the earlier footprint cuts.

The export contract remains building `.tscn` plus relative door scenes. Wall lighting shells stay separated per story, and material slots stay empty. No new JSON fields are needed. The web Examples picker and CLI catalog both include **Concave shaped roof junctions**.

## Focused evidence

- `concave-roof-tests.mjs`: 123,552 independent point-in-polygon comparisons across 24 shape/profile/rotation cases; exact canopy cut positions, closed convex plane containment, story elevation offsets, a fixed edge cutout, crossing guards and lighting-shell checks.
- `profile-roof-engine-tests.mjs`: 18 scenes / 51 Godot physics rays, covering the earlier convex cases plus concave recesses, courtyard walls, disconnected rooms, fixed rectangle/diamond voids and clipped courtyard gables.
- The diamond fixture is explicitly checked for its 8 m² polygon area, so a rectangular fallback cannot silently stand in for that test.
- All 28 prior building JSON files and 58 prior TSCN files match the v0.26 archive byte-for-byte. The new example adds one blueprint and one scene.
- [Close-up comparison](previews/concave_roof_detail.png), [whole-building comparison](previews/concave_roof_before_after.png), and [new example](previews/concave_roof_joins.png) render actual old/new software geometry with matching cameras. They are not Godot screenshots.

The final archive contains the full seven-gate `release-report.json` beside the editor folder. Validation here uses Linux, Node 24.19.0 and Godot 4.5.1 Compatibility; Godot 4.7 and browser layout remain unverified in this environment. Existing DOM tests exercise the web handlers, and optional canvas tests exercise rendering.

## Remaining work

Automatic concave hipped roofs with continuous valleys are still separate work. Clipping does not grow a roof footprint that never reaches its wall. Wall-to-floor/ceiling transitions for displaced profile endpoints and differing thickness at adjoining corners also remain limited. The contact diagnostic samples generated vertices and is not proof of continuous contact at every point of an arbitrary junction.
