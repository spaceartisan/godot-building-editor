# Meridian Hotel findings

The hotel (see [README](README.md)) was the first building to use elevators, and the elevator feature was built alongside it. Each finding below was reproduced before the change, in Godot where it concerns Godot behaviour.

## Summary

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| E1 | Moving the exported `Car` node did not move the car's collision. The car's `AnimatableBody3D` was a child of a plain `Node3D` `Car`, and a synced `AnimatableBody3D` follows only its own local transform. In Godot, a ray at the second stop found nothing. The landing door leaves had the same structure. | High (the car could not carry anything) | **Fixed**: `Car` and each `DoorLeft`/`DoorRight` are the `AnimatableBody3D` nodes, with mesh and shapes as children. Without collision they export as `Node3D`. |
| E2 | The door width rule allowed doors whose leaves cannot open. A rule of "fits between the jambs" let a 2.2 m shaft have 1.1 m doors, the old defaults. A centre-opening leaf needs a pocket beside the opening, and those leaves would have slid into the shaft's side walls. | Medium (doors could not open without clipping) | **Fixed**: `doorWidth ≤ width/2 − 0.25` with a message that says why. Defaults are now a 2.4 × 2.2 m shaft with 0.9 × 2.1 m doors. Each landing exports `metadata/leaf_travel`, the slide that fully opens it. |
| E3 | Closed landing doors exactly filled the opening, so light from the lobby showed as bright seams along the jambs (Godot render from inside the car) | Low (visual) | **Fixed**: the leaves overlap each jamb by 5 cm and reach 2 cm below the landing floor |
| E4 | Elevator problems in the web editor's Checks panel had no **Show** button. The target type `elevator` was unknown to the diagnostic navigation. | Low (usability) | **Fixed**: **Show elevator** goes to the lowest served floor, centres the shaft and opens the **Elevators** panel at that lift |
| E5 | `inspect --entities` did not list elevators | Low | **Fixed** |

## Observations (no change)

- **Lifts are not navmesh links.** The Godot navmesh probe reaches every room through the stairs only. That is expected: a navmesh cannot ride a moving platform, and navigation is Godot's job (README **Scope**). The tool's route check does link the landings, so a building that relies on lifts passes it; the game must add `NavigationLink3D`s or its own lift logic. This is now stated in the README's scope table and in this README.
- **Sill gap.** From inside the car, the 0.1 m gap between the car floor and the landing doors catches a sliver of lobby light. Real lifts have this gap too, so it stays.
- **Custom render cameras are not checked.** `godot-check --render` places its automatic eye-level views clear of collision, but `--views` cameras are used exactly as given. A first camera for room 305 stood inside its bathroom wall and rendered a blank grey frame. Choose eyes inside rooms (here, next to the entry door).
- **Recipe order matters.** An opening can only reference a wall added earlier in the same recipe. The generator first added the corridor's south wall after the doors on it, and `edit` stopped with `Unknown host wall: l2-cor-s` before saving anything. The message was clear; the fix was in the generator.

## What worked first time

The full hotel (771 operations, 242 walls, 151 doors, 16 rooms per guest floor with bathrooms) passed `--warnings-as-errors` and the route check on its first complete build. No T-junction, opening-clearance or ceiling problem appeared. Partitions ending on the corridor and facade walls, bathroom corners and doors placed with `at: {x, z}` all validated as written.
