# v0.29 — split shaped-host junctions

Standard partitions now fit the shared endpoint of two matching collinear shaped host sections. Both partition ends can use this topology. Each authored section remains independently editable; no wall IDs, opening references or plan endpoints are rewritten.

The matcher compares world-space offsets, thickness schedules and heights across all profile stations. Reversed drawing directions and different wall-type IDs are accepted when they describe the same physical surface. Mismatched profiles, offsets, thickness, heights, non-collinear hosts, additional branches and nearby openings remain blocked with guidance. Host outer corners keep their existing clearance requirements.

The partition uses the same fitted-end and solid-union path as v0.28. The host sections meet on their authored seam, and the union removes their buried end faces. Exterior and interior lighting meshes remain separate per story. Materials stay unassigned, and exports remain building TSCNs with relative door dependencies.

## Evidence

- 384 mesh rays across split/unsplit variants, eight profile heights, rotations and reversed wall directions.
- Surface areas match per lighting shell between split and unsplit fixtures, including separately reversed host halves and equivalent profiles with different station lists or inward directions.
- Invalid fixtures cover mismatched offsets, thickness, height, non-collinear hosts, extra branches and openings near either side of the split.
- The Godot wall-profile suite passes 18 scenes and 302 rays, including seam-interior rays that must not hit a buried cap.
- Web handlers draw a Standard partition between two split hosts and undo it; shared-profile edits and undo retain their existing coverage.
- All 30 prior plans and 60 prior TSCN files match v0.28 byte-for-byte. The shared web/CLI catalog adds `split_host_junctions` with an open passage.

[3D preview](previews/split_host_junctions.png) and [plan canvas](previews/split_host_plan.png) show the actual example. These are software/canvas renders, not Godot screenshots or proof of browser layout. Engine checks use Godot 4.5.1 Compatibility on Linux; Godot 4.7 remains unverified here. The archive includes the final full release report outside the source folder.

Angled T joins, shaped-to-shaped branches and multiple branches at one host seam remain future work. Matching split hosts need equal full heights, even when the Standard partition is shorter. This release supports already-authored sections; it adds no automatic wall-splitting command.
