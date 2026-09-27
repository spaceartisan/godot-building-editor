# Review an AI-authored building before delivery

Use this review for new buildings and substantial layout edits. A successful validator/export establishes only the rules it checks. It does not establish accessible rooms, complete floors, safe circulation or a convincing interpretation of a design brief. Read the actual plan and inspect rendered geometry before declaring the result finished.

## 1. Turn the brief into observable requirements

Record intended use, approximate scale, occupied levels, entrances, room/courtyard arrangement and defining architectural features. For a vague request such as “cool castle,” choose reasonable assumptions and state them. A useful default is an enterable blockout with connected occupied levels, an identifiable gatehouse, keep, towers and open courtyard. Distinguish an exterior-only prop from an enterable building; do not quietly substitute one for the other.

Choose a footprint and reserve stair runs/landings before filling every level. Existing stairs connect adjacent floors, so a four-level route needs transitions across three floor boundaries. Each separate occupied tower needs an access route; a single staircase somewhere in the plan is insufficient. Labels such as “Wall Walk” do not create walkways or access.

## 2. Check the building by level and route

Keep a short evidence table. For each item record **verified**, **failed**, **unverified**, or **intentionally omitted**, with an object/floor ID and evidence or reason. An omitted item is acceptable only when consistent with the brief. Do not turn an unverified item into a pass.

| Review item | Required evidence |
| --- | --- |
| Entrance to usable interior | Opening and door clearance, floor under the entrance, route into the intended interior |
| Each occupied upper level | Connected stair/ramp route with usable lower/upper landings, opening and headroom |
| Separate towers, wings and keep | Explicit horizontal and vertical connections; no sealed occupied volumes |
| Intended floors | Coverage at room centers, corners, door thresholds and landings, especially near voids |
| Courtyard and open decks | Correct outdoor floor/ground strategy and open sky above; no unintended ceiling |
| Walks and balconies | Useful width and continuity; intentional guarding/parapets at exposed edges |
| Architectural brief | Whole-building views show the requested silhouette and authored defining details |
| Export | Scene and relative door dependencies exist and load under the checks actually performed |

Use Plan and floor-isolated views to inspect coverage and routes. A whole-building thumbnail hides floor holes and disconnected stories. Review opposite exterior viewpoints, every distinct floor, the entrance, stairs/landings and void boundaries. Software preview is geometry evidence; it does not prove Godot lighting or character clearance. Use target-engine traversal/physics checks before claiming playability, or clearly mark traversal unverified.

## 3. Understand region precedence

Automatic structural coverage is the union of explicit Floor Footprints when present, otherwise solid regions or the inferred wall outline, **minus all void regions**. Solid regions do not override voids, and list order does not change precedence. Explicit footprints are also cut by voids. Region labels do not affect geometry.

An island building inside a courtyard therefore needs a cutout that excludes the island, or an intentional independent surface at the correct height. For a rectangular courtyard surrounding a rectangular keep, four nonoverlapping rectangular void strips are a supported way to leave the keep intact. A single polygon region cannot represent an interior hole by repeating vertices or crossing edges.

A void cuts automatic floor coverage as well as ceiling coverage. Decide separately whether the courtyard has independent ground/slab geometry or will sit on game terrain. Leaving a courtyard open to the sky does not imply its ground should be missing. Independent surfaces retain absolute heights; review alignment after story edits. Floor coverage repairs do not create access routes.

## 4. Use the existing CLI and visual review together

For the four-level negative fixture included in this release, these read-only commands reproduce its current valid-but-incomplete state. Run from the editor folder and use a new temporary output directory. The fixture is not a finished castle template.

```bash
node cli.mjs inspect qa/fixtures/castle-review-source.building.json --entities --json
node cli.mjs validate qa/fixtures/castle-review-source.building.json --json
node castle-review-tests.mjs
review_dir="$(mktemp -d)"
node cli.mjs preview qa/fixtures/castle-review-source.building.json --yaw 0.6 --out "$review_dir/exterior.png" --json
node cli.mjs preview qa/fixtures/castle-review-source.building.json --yaw 3.7 --out "$review_dir/opposite.png" --json
for floor in 1 2 3 4; do
  node cli.mjs preview qa/fixtures/castle-review-source.building.json --view floor --floor "$floor" --out "$review_dir/floor-$floor.png" --json || break
done
```

Preview commands require the documented canvas dependency. Inspect the resulting images; creating them is not visual review. For another plan, discover the actual floor count and IDs. Use supported transactions and reviewed dry runs for edits, save a separate candidate, and repeat the affected coverage/route checks. Export after review, retaining the editable JSON and relative door assets. Do not hand-edit a TSCN to hide a source-plan problem.

## 5. Castle case study: why zero warnings was insufficient

The supplied castle has four floors, 104 wall segments, two doors, zero windows and zero stairs. Its lower two floors contain a 10 × 10 m courtyard void surrounding a 6 × 6 m solid keep region. The void removes all automatic coverage inside it, including the keep. Upper levels have no authored vertical access. Continuous parapets and broad covered areas produce a basic blockout rather than detailed battlements and narrow open wall walks.

| Finding | Status | Evidence |
| --- | --- | --- |
| Schema validation | Verified | No validation errors in the supplied fixture |
| Lower keep floors | Failed | No structural coverage at the keep center on floors 1 and 2 |
| Authored vertical access | Failed | All four stair collections are empty |
| Courtyard ground | Unverified in game | Lower courtyard uses a void; no independent floor is supplied |
| Character traversal | Unverified | A software preview and resource validation cannot establish this |

The regression test preserves the original JSON under `qa/fixtures/`, outside the successful example catalog. It proves that changing region order cannot fix the keep, and that a four-strip cutout restores exactly 36 m² per lower level while retaining the courtyard void. Its repaired candidate exists only in test memory and still has no stairs. It is not a rebuilt or playable castle.

## 6. Completion language

State what was delivered and which requirements passed, failed or remain unverified. Use “exterior blockout” or “coverage repair” when that is the achieved scope. Do not describe an export as complete/playable merely because `validate`, `inspect`, `package` or an asset-load check succeeded. Empty default materials are intentional and should not be treated as a defect or silently filled. Preserve the separate lighting shells throughout authoring and repair.
