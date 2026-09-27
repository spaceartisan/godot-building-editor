// Generates the Kestrel-class starship interior recipes.
// Run from the editor root: node authoring/kestrel/generate-transactions.mjs
// Writes tx-*.edit.json next to this script.
// Plan units are metres. The bow points to +X; port is -Z, starboard +Z.
//
// Steps (see build.sh): new -> tx-1-structure -> tx-2-openings -> tx-3-circulation.
// Wall types and doorway shapes are created with wallType.add/openingShape.add
// and assigned in wall.add (wallTypeId, inwardToward).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const D1 = 'floor_1', D2 = 'deck_2';
const T = 0.25; // building wall thickness
const P = (x, z) => ({ x, z });
const save = (name, data) => { writeFileSync(join(here, name), JSON.stringify(data, null, 2) + '\n'); };
const tx = (name, operations) => { save(name, { version: 1, operations }); console.log(`${name}: ${operations.length} operations`); };

// ------------------------------------------------------------------ profiles
// Hull: a flared outer skin that bulges 0.35 m outboard just above the deck and
// tucks back in to the plan line under the ceiling (tumblehome). End stations
// stay on the plan line at the building thickness so floors, ceilings and
// story joins keep using the plan footprint.
const st = (height, offset, thickness = T) => ({ height, offset, thickness });
const wallTypes = [
  { id: 'hull', label: 'Tumblehome hull', stations: [st(0, 0), st(0.18, -0.35), st(0.55, -0.35), st(1, 0)] },
  // Corridor: hexagonal cross-section, widest at shoulder height. Offset is
  // limited to 0.2 m so the corridor can meet its Standard end stubs in line.
  { id: 'corridor', label: 'Hex corridor', stations: [st(0, 0), st(0.4, -0.2), st(0.62, -0.2), st(1, 0)] },
];
const openingShapes = [
  { id: 'hatch', label: 'Octagon hatch', points: [
    { x: 0.22, y: 0 }, { x: 0.78, y: 0 }, { x: 1, y: 0.16 }, { x: 1, y: 0.84 }, { x: 0.78, y: 1 },
    { x: 0.22, y: 1 }, { x: 0, y: 0.84 }, { x: 0, y: 0.16 }] },
  { id: 'airlock', label: 'Airlock outline', points: [
    { x: 0.16, y: 0 }, { x: 0.84, y: 0 }, { x: 1, y: 0.2 }, { x: 1, y: 0.8 }, { x: 0.88, y: 1 },
    { x: 0.12, y: 1 }, { x: 0, y: 0.8 }, { x: 0, y: 0.2 }] },
  { id: 'blast', label: 'Blast door', points: [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.8 }, { x: 0.85, y: 1 }, { x: 0.15, y: 1 }, { x: 0, y: 0.8 }] },
];

// ------------------------------------------------------------------ walls
const walls = [];
// inwardToward: a plan point on the side the profile's positive offset faces.
function wall(floorId, id, a, b, role, label, profile = null, inwardToward = null) {
  if (walls.some(w => w.id === id)) throw new Error(`duplicate wall ${id}`);
  walls.push({ floorId, id, a: P(...a), b: P(...b), role, label, ...(profile ? { wallTypeId: profile } : {}), ...(inwardToward ? { inwardToward: P(...inwardToward) } : {}) });
}
function loop(floorId, key, pts, label, profiles) {
  pts.forEach((p, i) => wall(floorId, `${key}${i + 1}`, p, pts[(i + 1) % pts.length], 'exterior', `${label} ${i + 1}`, profiles[i]));
}
// A corridor wall: a hex-profile run with a short Standard stub at each end,
// because a shaped wall may not end midway along a bulkhead (FINDINGS K4).
// The profile's inward side faces the corridor centreline (z = 0).
function corridor(floorId, key, z, x0, x1, label) {
  const stub = 0.6;
  wall(floorId, `${key}_stub_aft`, [x0, z], [x0 + stub, z], 'interior', `${label} aft stub`);
  wall(floorId, `${key}`, [x0 + stub, z], [x1 - stub, z], 'interior', label, 'corridor', [(x0 + x1) / 2, 0]);
  wall(floorId, `${key}_stub_fwd`, [x1 - stub, z], [x1, z], 'interior', `${label} forward stub`);
}

// Deck 1: engineering and cargo. Hull loop (all shaped) with a pointed bow.
loop(D1, 'd1_hull', [[-18, -7], [12, -7], [20, -2], [20, 2], [12, 7], [-18, 7]], 'Deck 1 hull',
  ['hull', 'hull', 'hull', 'hull', 'hull', 'hull']);
wall(D1, 'd1_cargo_bulkhead', [-6, -7], [-6, 7], 'interior', 'Cargo bulkhead');
wall(D1, 'd1_bow_bulkhead', [10, -7], [10, 7], 'interior', 'Sensor bay bulkhead');
corridor(D1, 'd1_corr_port', -1.25, -6, 10, 'Deck 1 corridor port');
corridor(D1, 'd1_corr_stbd', 1.25, -6, 10, 'Deck 1 corridor starboard');
wall(D1, 'd1_eng_reactor', [3, -7], [3, -1.25], 'interior', 'Engineering / reactor');
wall(D1, 'd1_store_airlock', [1, 1.25], [1, 7], 'interior', 'Storage / airlock');
wall(D1, 'd1_airlock_life', [5, 1.25], [5, 7], 'interior', 'Airlock / life support');

// Deck 2: crew. Shaped hull aft and along the sides; Standard bow canopy walls
// (framed bridge windows need a straight profile) and a Standard aft wall for
// the lounge's observation window.
loop(D2, 'd2_hull', [[-14, -5.5], [10, -5.5], [16, -1.5], [16, 1.5], [10, 5.5], [-14, 5.5]], 'Deck 2 hull',
  ['hull', null, null, null, 'hull', null]);
wall(D2, 'd2_lounge_bulkhead', [-6, -5.5], [-6, 5.5], 'interior', 'Lounge bulkhead');
wall(D2, 'd2_bridge_bulkhead', [9, -5.5], [9, 5.5], 'interior', 'Bridge bulkhead');
corridor(D2, 'd2_corr_port', -1.25, -6, 9, 'Deck 2 corridor port');
corridor(D2, 'd2_corr_stbd', 1.25, -6, 9, 'Deck 2 corridor starboard');
wall(D2, 'd2_q1_q2', [-1.5, -5.5], [-1.5, -1.25], 'interior', 'Quarters 1 / 2');
wall(D2, 'd2_q2_q3', [3.75, -5.5], [3.75, -1.25], 'interior', 'Quarters 2 / 3');
wall(D2, 'd2_mess_med', [2, 1.25], [2, 5.5], 'interior', 'Mess / med bay');

// ------------------------------------------------------------------ regions
const regions = [
  [D1, 'r_cargo', 'Cargo bay', -18, -6, -7, 7],
  [D1, 'r_engineering', 'Engineering', -6, 3, -7, -1.25],
  [D1, 'r_reactor', 'Reactor room', 3, 10, -7, -1.25],
  [D1, 'r_d1_corridor', 'Deck 1 corridor', -6, 10, -1.25, 1.25],
  [D1, 'r_storage', 'Storage', -6, 1, 1.25, 7],
  [D1, 'r_airlock', 'Airlock', 1, 5, 1.25, 7],
  [D1, 'r_life', 'Life support', 5, 10, 1.25, 7],
  [D1, 'r_sensor', 'Sensor bay', 10, 20, -7, 7],
  [D2, 'r_lounge', 'Observation lounge', -14, -6, -5.5, 5.5],
  [D2, 'r_d2_corridor', 'Deck 2 corridor', -6, 9, -1.25, 1.25],
  [D2, 'r_q1', 'Crew quarters 1', -6, -1.5, -5.5, -1.25],
  [D2, 'r_q2', 'Crew quarters 2', -1.5, 3.75, -5.5, -1.25],
  [D2, 'r_q3', 'Captain\'s quarters', 3.75, 9, -5.5, -1.25],
  [D2, 'r_mess', 'Mess', -6, 2, 1.25, 5.5],
  [D2, 'r_med', 'Med bay', 2, 9, 1.25, 5.5],
  [D2, 'r_bridge', 'Bridge', 9, 16, -5.5, 5.5],
];

tx('tx-1-structure.edit.json', [
  { op: 'building.update', value: { name: 'Kestrel-class courier', wallThickness: T, wallHeight: 3, floorThickness: 0.18, roof: { type: 'flat', overhang: 0 } } },
  { op: 'floor.update', id: D1, value: { label: 'Deck 1: engineering and cargo', wallHeight: 3.2 } },
  { op: 'floor.add-top', id: D2, aboveFloorId: D1, value: { label: 'Deck 2: crew' } },
  ...wallTypes.map(({ id, label, stations }) => ({ op: 'wallType.add', id, value: { label, stations } })),
  ...openingShapes.map(({ id, label, points }) => ({ op: 'openingShape.add', id, value: { label, points } })),
  ...walls.map(({ floorId, id, ...value }) => ({ op: 'wall.add', floorId, id, value })),
  ...regions.map(([floorId, id, label, minX, maxX, minZ, maxZ]) => ({ op: 'region.add', floorId, id, value: { label, minX, maxX, minZ, maxZ } })),
]);

// ------------------------------------------------------------------ openings
const openings = [];
const door = (floorId, id, wallId, at, label, width, height, shapeId, doorStyle = 'empty') =>
  openings.push({ op: 'opening.add', floorId, id, value: { type: 'door', wallId, at: P(...at), label, width, height, doorStyle, ...(shapeId ? { shapeId } : {}) } });
const window_ = (floorId, id, wallId, at, label, width, height, sill, windowStyle = 'plain') =>
  openings.push({ op: 'opening.add', floorId, id, value: { type: 'window', wallId, at: P(...at), label, width, height, sill, windowStyle } });

// Deck 1
door(D1, 'o_cargo_ramp', 'd1_hull6', [-18, 0], 'Aft cargo ramp', 4.4, 2.9, 'blast');
door(D1, 'o_airlock_outer', 'd1_hull5', [3, 7], 'Outer airlock hatch', 1.6, 2.4, 'airlock');
door(D1, 'o_cargo_corridor', 'd1_cargo_bulkhead', [-6, 0], 'Cargo bay blast door', 2, 2.6, 'blast');
door(D1, 'o_cargo_engineering', 'd1_cargo_bulkhead', [-6, -4.25], 'Cargo / engineering hatch', 1.2, 2.2, 'hatch', 'room');
door(D1, 'o_cargo_storage', 'd1_cargo_bulkhead', [-6, 4.25], 'Cargo / storage hatch', 1.2, 2.2, 'hatch', 'room');
door(D1, 'o_engineering', 'd1_corr_port', [-0.5, -1.25], 'Engineering hatch', 1.2, 2.2, 'hatch');
door(D1, 'o_reactor', 'd1_corr_port', [6.5, -1.25], 'Reactor hatch', 1.2, 2.2, 'hatch');
door(D1, 'o_storage', 'd1_corr_stbd', [-2.5, 1.25], 'Storage hatch', 1.2, 2.2, 'hatch');
door(D1, 'o_airlock_inner', 'd1_corr_stbd', [3, 1.25], 'Inner airlock hatch', 1.6, 2.4, 'airlock');
door(D1, 'o_life', 'd1_corr_stbd', [7.5, 1.25], 'Life support hatch', 1.2, 2.2, 'hatch');
door(D1, 'o_sensor', 'd1_bow_bulkhead', [10, 0], 'Sensor bay hatch', 1.4, 2.3, 'hatch', 'room');
// Deck 2
door(D2, 'o_lounge_corridor', 'd2_lounge_bulkhead', [-6, 0], 'Lounge blast door', 2, 2.5, 'blast');
door(D2, 'o_lounge_mess', 'd2_lounge_bulkhead', [-6, 3.4], 'Lounge / mess arch', 2.4, 2.4, 'airlock');
door(D2, 'o_q1', 'd2_corr_port', [-3.75, -1.25], 'Quarters 1 hatch', 1.1, 2.2, 'hatch');
door(D2, 'o_q2', 'd2_corr_port', [1.125, -1.25], 'Quarters 2 hatch', 1.1, 2.2, 'hatch');
door(D2, 'o_q3', 'd2_corr_port', [6.4, -1.25], 'Captain\'s quarters hatch', 1.1, 2.2, 'hatch');
door(D2, 'o_mess', 'd2_corr_stbd', [-1.5, 1.25], 'Mess hatch', 1.6, 2.3, 'airlock');
door(D2, 'o_med', 'd2_corr_stbd', [5.5, 1.25], 'Med bay hatch', 1.4, 2.3, 'hatch');
door(D2, 'o_bridge', 'd2_bridge_bulkhead', [9, 0], 'Bridge hatch', 1.4, 2.3, 'hatch', 'room');
window_(D2, 'w_lounge_aft', 'd2_hull6', [-14, 0], 'Observation window', 6, 1.4, 0.8);
window_(D2, 'w_bridge_port', 'd2_hull2', [13, -3.5], 'Bridge port canopy', 4, 1.2, 1.0);
window_(D2, 'w_bridge_bow', 'd2_hull3', [16, 0], 'Bridge bow canopy', 2.4, 1.2, 1.0);
window_(D2, 'w_bridge_stbd', 'd2_hull4', [13, 3.5], 'Bridge starboard canopy', 4, 1.2, 1.0);
// Portholes: framed windows on the flared hull are allowed where the profile is
// straight across the window's height. The hull band runs 18%-55% of the story:
// 0.576-1.76 m on Deck 1 (3.2 m) and 0.54-1.65 m on Deck 2 (3.0 m).
const portholes = [
  [D1, 'd1_hull1', -12, -7, 'Cargo bay port'], [D1, 'd1_hull1', -1.5, -7, 'Engineering'], [D1, 'd1_hull1', 6.5, -7, 'Reactor room'],
  [D1, 'd1_hull5', -12, 7, 'Cargo bay starboard'], [D1, 'd1_hull5', -2.5, 7, 'Storage'], [D1, 'd1_hull5', 7.5, 7, 'Life support'],
  [D2, 'd2_hull1', -10, -5.5, 'Lounge port'], [D2, 'd2_hull1', -3.75, -5.5, 'Quarters 1'], [D2, 'd2_hull1', 1.1, -5.5, 'Quarters 2'], [D2, 'd2_hull1', 6.4, -5.5, 'Captain\'s quarters'],
  [D2, 'd2_hull5', -10, 5.5, 'Lounge starboard'], [D2, 'd2_hull5', -2, 5.5, 'Mess'], [D2, 'd2_hull5', 5.5, 5.5, 'Med bay'],
];
portholes.forEach(([floorId, wallId, x, z, label], i) => window_(floorId, `w_port_${String(i + 1).padStart(2, '0')}`, wallId, [x, z], `${label} porthole`,
  1.2, floorId === D1 ? 1.0 : 0.95, floorId === D1 ? 0.7 : 0.65));
tx('tx-2-openings.edit.json', openings);

// ------------------------------------------------------------------ circulation
// One flight climbs east along the cargo bay's port side and lands in the lounge.
// Rise = 3.2 m wall + 0.18 m slab = 3.38 m over 20 risers of 0.169 m.
const stair = { x: -11, z: -4.2, width: 1.4, run: 5 };
const hole = { minX: stair.x - stair.run / 2, maxX: stair.x + stair.run / 2, minZ: stair.z - stair.width / 2, maxZ: stair.z + stair.width / 2 };
tx('tx-3-circulation.edit.json', [
  { op: 'stair.add', floorId: D1, id: 'st_main', value: { label: 'Main companionway', ...stair, direction: 'east', style: 'steps', steps: 20 } },
  { op: 'railing.add', floorId: D2, id: 'rail_stair_inboard', value: { label: 'Companionway rail inboard', a: P(hole.minX, hole.maxZ), b: P(hole.maxX, hole.maxZ), style: 'two_rail' } },
  { op: 'railing.add', floorId: D2, id: 'rail_stair_aft', value: { label: 'Companionway rail aft', a: P(hole.minX, hole.minZ), b: P(hole.minX, hole.maxZ), style: 'two_rail' } },
]);

// ------------------------------------------------------------------ lighting
// Cool ceiling lights: one per room (more along the corridors and in the cargo
// bay), 0.35 m under the ceiling, no shadows. Range covers the room.
const ceiling = { [D1]: 3.2 - 0.35, [D2]: 3.0 - 0.35 };
const lights = [];
for (const [floorId, id, label, minX, maxX, minZ, maxZ] of regions) {
  const lx = maxX - minX, lz = maxZ - minZ, count = Math.max(1, Math.round(Math.max(lx, lz) / 7));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count, x = lx >= lz ? minX + lx * t : (minX + maxX) / 2, z = lx >= lz ? (minZ + maxZ) / 2 : minZ + lz * t;
    lights.push({ op: 'light.add', floorId, id: `light_${id.slice(2)}${count > 1 ? `_${i + 1}` : ''}`, value: {
      label: `${label} light${count > 1 ? ` ${i + 1}` : ''}`, position: { x, y: ceiling[floorId], z },
      color: { r: 0.82, g: 0.9, b: 1 }, energy: 1.1, range: Math.round(Math.max(4, Math.hypot(Math.min(lx, 7), lz) * 0.8) * 10) / 10, shadows: false } });
  }
}
tx('tx-4-lighting.edit.json', lights);
