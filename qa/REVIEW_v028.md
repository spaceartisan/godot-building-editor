# v0.28 — fitted Standard partitions

A Standard partition may now terminate midway along a continuous shaped wall at a right angle. Either or both ends can attach. Each end follows the host center plane through its profile height stations, then the existing solid-union boundary removes buried faces. This fills a flared-host gap and trims a recessed-host protrusion while keeping the partition's flat sides and Standard thickness.

The authored walls remain separate editable objects with stable IDs. The exporter retains exterior outside/inside/edge and interior Side A/Side B/edge meshes per story. Collision follows the same union boundary. Empty material slots, roof fitting and `.tscn`-only building export remain intact.

## Evidence

- 192 direct mesh rays across eight heights, two rotations and reversed endpoints/order verify both fitted ends and unchanged Standard sides. Additional vertical rays check that profile bands do not leave internal horizontal faces. Triangle winding and finite geometry are checked.
- The Godot wall-profile suite now covers 13 scenes and 174 rays, including all prior cases plus joined partitions, rotated/reversed variants, shorter partitions, shaped interior hosts, varying thickness and the example's open passage. Both lighting-shell groups are checked.
- Web handler tests draw a Standard partition between shaped hosts, undo the drawing, edit a shared profile and undo that edit. These use the DOM adapter, not a live browser layout test.
- Clearance tests reject oblique joins, short hosts, shaped branches, nearby corners/openings and collapsed partitions.
- All 29 prior JSON plans and 59 prior TSCNs match v0.27 byte-for-byte. The new `fitted_partitions` example is shared by the web picker and CLI catalog.

[Whole example](previews/fitted_partitions.png) and [junction comparison](previews/fitted_partition_detail.png) show actual software-rendered geometry. The detail isolates one partition. The previous renderer is shown for comparison even though its validator blocked that connection; this is not a previously supported v0.27 export. Godot collision is checked separately.

The archive's final `release-report.json` records the complete release gates. Local engine checks use Godot 4.5.1 Compatibility and Node 24.19.0 on Linux. Godot 4.7 and live browser layout remain unverified here.

## Limits

The shaped host must be at least as tall as the Standard wall. Joins need clearance from host corners, openings and frames; Standard-wall openings need clearance from fitted ends too. One continuous host per end is supported. A split host creates a different endpoint topology and remains blocked, as do angled T joins, shaped branches and additional branches sharing the attachment point. Existing unbranched endpoint corners retain their miter path. The fitter does not modify plan endpoints or create new transition walls.
