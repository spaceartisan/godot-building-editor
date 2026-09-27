# Manual roof attachment diagnostics

Building Studio 0.14 measures what an explicit host link adds to a child's clipping. This is an inspection check; it never moves roofs, changes a host link, joins roofs reciprocally or edits gable fills.

## Where results appear

- **Web editor:** the validation panel shows warnings. Under 3D PREVIEW → Roof attachments, the status line counts attachments needing review; View details and controls lists named relationships, status and measured contribution.
- **CLI validate/export/package/edit:** prepared documents receive the same warnings. They stay editable/exportable by default. `--warnings-as-errors` enforces the existing strict policy and prevents publication. A transaction that fixes an ineffective attachment is checked on its final state, so the old input warning does not block that repair.
- **CLI inspect:** human output includes an attachment summary. JSON reports `inspection.roofs.attachments`, with one record per explicit host link.
- **CLI preview:** attachment-guide summaries include a measurement in each linked relationship's `attachment` field. A single-roof image legend includes its status. Unlinked roofs with flush edges still have guides but no host-effectiveness record.

## What is measured

The diagnostic calls the same `roofBoxParts`, `roofInteriorBlockers`, `roofAttachmentBlockers` and `trimRoofBox` functions used by scene export. For each child slab or ridge cap it compares:

1. Remaining volume after story-interior blockers and the child's flush-edge cuts.
2. Remaining volume after those blockers **plus** the actual finite host envelope.

Their difference is the host's incremental contribution. A cut made by a wall or flush edge is never credited to the host. Host pitch, axis, overhang and its own flush edges are reflected in the shared envelope.

Volumes use closed-face signed integration around each part's center, reducing large-coordinate cancellation. Per-part reporting tolerance is `max(1e-8 m³, original box volume × 1e-7)`; the underlying clipping code also has its own geometric tolerance. A status is effective when at least one part loses more than its reporting tolerance. Aggregate tolerance is the sum of per-part tolerances. Nonfinite, negative or increasing volumes beyond tolerance produce an unverified result.

**Part volumes are summed, not unioned.** Ridge/slab overlaps can be counted more than once. These figures measure clipping contributions, not material quantities or the physical union volume of a roof.

## Status meanings

| Status | Meaning and next action |
| --- | --- |
| `effective` | At least one part loses additional volume above tolerance. No effectiveness warning; still inspect the junction and any gable fills. |
| `no-additional-cut` | The link changes no remaining part volume above tolerance. Check the host, footprint and height; separation, tangency or a redundant cut may be intentional. |
| `already-removed` | Story-interior/flush blockers already leave no part volume above tolerance. Review those cuts before changing the host. |
| `fully-removed` | The host removes all remaining slab/ridge volume within tolerance. Review whether removing the entire child roof is intended. |
| `no-roof-parts` | The child generates no slabs/ridges; check footprint dimensions. The current shared generator skips sections at or below 5 cm along either footprint dimension. |
| `no-host-envelope` | The host generates no clipping envelope; check the host footprint dimensions. |
| `unverified` | Fields/reference state is unsuitable for measurement, or volume consistency failed. Resolve validation issues and inspect the roof; this is not a zero-overlap finding. |

All statuses except `effective` produce warnings. Warning records include `code` (`roof-attachment-` plus the status), `path`, `roofId`, `hostRoofId`, and `message`. They do not silently detach or repair roofs.

Measurement records include IDs/names, `status`, `message`, `scope`, `gableReview`, `parts`, and aggregate `baselineVolume`, `remainingVolume`, `removedVolume`, `tolerance`. Each part includes its export name and those four numerical fields. Values unavailable because of invalid state or absent parts are `null`; an unverified result may retain already checked part records, but its aggregate values stay `null`.

## Boundaries of the check

- An effective host does not prove a sealed/watertight junction, lack of mesh overlap, collision coverage or character clearance.
- Gable fill geometry is independent. The existing gable-review warning remains, regardless of whether slab clipping is effective.
- The host stays intact. No reciprocal valleys, dormer openings or automatic roof unions are inferred.
- Automatic roof-to-wall clipping and child flush cuts provide baseline context; this pass does not diagnose their individual effectiveness.
- Geometry warnings run after normalization in ordinary CLI preparation, final transaction validation and the web validation panel. The low-level `validateBuilding` API retains raw structural checks by default; prepared callers can use `{roofDiagnostics:true}`. This prevents raw missing-default warnings from surviving a successful import migration. Direct low-level exporters keep their existing structural validation contract.
- Rendering, diagnostics and export share geometry; diagnostics are refreshed after edits, loading and undo, not during every orbit/pan frame. Large-document performance budgets remain future work.

## Reproducible exercise

The original `examples/roof_attachment.building.json` is effective. Its host removes approximately **2.7024 m³** from **5.4049 m³** of child slab/ridge part volume. All existing example warning expectations remain unchanged.

The included transaction deliberately raises that canopy above its host while leaving the link intact:

```bash
node cli.mjs edit examples/roof_attachment.building.json --ops examples/transactions/ineffective-attachment.edit.json --out ./exports/raised-canopy.building.json
node cli.mjs inspect ./exports/raised-canopy.building.json
node cli.mjs validate ./exports/raised-canopy.building.json --warnings-as-errors
node cli.mjs preview examples/roof_attachment.building.json --compare ./exports/raised-canopy.building.json --view roofs --overlay attachments --roof roofSections_8 --out ./exports/attachment-comparison.png
```

Use fresh output paths. Strict validation intentionally fails for this exercise; ordinary export remains allowed with the warning. The source example is unchanged. The generated comparison is bundled in `qa/previews/attachment_diagnostic_comparison.png` as a software geometry review, not a Godot or browser screenshot.

Regression coverage includes analytic partial/full/no cuts, tangency, sub-tolerance overlap, prior story/flush removal, translated coordinates, 36 host/child type-axis combinations, ridge inclusion, invalid/default states, gable-review independence, the current example catalog, web warning/guide/undo parity and nine CLI calls for strictness, repair and source preservation.
