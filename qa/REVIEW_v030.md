# v0.30 — angled Standard partitions

Standard partitions now meet continuous or matching split shaped hosts at oblique angles. The smaller angle between wall lines must be at least 30°. Both ends can fit; wall IDs and opening references remain authored. Separate lighting shells, empty material defaults and building-only TSCN export remain unchanged.

The new cut plane follows the host's face orientation and its vertical profile offset. Simply moving a cap perpendicular to the partition would leave a wedge at an angled attachment. Existing right-angle connections keep their prior path and scene bytes.

Clearance uses a conservative envelope covering lateral movement along the host, partition width, host thickness and frame depth. Frames reaching downward toward a shorter partition are included. Validation checks both side edges for fitted-end collapse, not only the partition centerline. These checks may ask for more room than a detailed solid-intersection analysis would require.

## Evidence

- The angled CPU suite checks 492 mesh rays across 30°, 45° and 60° joins, continuous/split hosts, rotated buildings and reversed wall directions, plus winding and finite vertices.
- Regressions cover the minimum angle, nearby host/partition openings, frames above short partitions and side-edge collapse with a still-positive centerline length.
- The existing 384-ray right-angle/split-host suite remains in the release gate.
- The Godot wall suite passes 26 scenes and 591 rays, including angled connections, buried-cap clearance and a retained angled passage.
- Web handlers draw a diagonal Standard wall onto split hosts and undo it.
- All 31 prior plans and 61 prior scene files match v0.29 byte-for-byte. The catalog adds `angled_partitions` with an open passage.

[3D preview](previews/angled_partitions.png) and [authored plan](previews/angled_partition_plan.png) use the actual software/plan renderers. They are not Godot screenshots or proof of live browser layout. Local engine checks use Godot 4.5.1 Compatibility on Linux; Godot 4.7 remains unverified here. The archive includes the final seven-gate release report.

Shaped-to-shaped branches, more than one branch at a shared attachment, and joins below 30° remain unsupported. Matching split hosts still need equal physical profiles and heights. The tool does not split or rewrite authored walls automatically.
