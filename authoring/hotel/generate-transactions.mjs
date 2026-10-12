// Generates the Meridian Hotel recipes: a five-storey hotel whose main new
// feature is a pair of passenger elevators. Ground floor: lobby, restaurant,
// lounge, kitchen, office, restrooms. Floors 2-5: a double-loaded corridor with
// 16 guest rooms (each with a bathroom), a lift lobby and a linen room. Two
// fire-stair cores run the full height. Run from the editor root:
//   node authoring/hotel/generate-transactions.mjs
// Writes tx-*.edit.json next to this script. Plan units are metres; north is -Z.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const P = (x, z) => ({ x: +x.toFixed(6), z: +z.toFixed(6) });
const tx = (name, operations) => { if (operations.length > 1000) throw new Error(`${name}: ${operations.length} > 1000`); writeFileSync(join(here, name), JSON.stringify({ version: 1, operations }, null, 2) + '\n'); console.log(`${name}: ${operations.length} operations`); };

// ------------------------------------------------------------------ layout
// Footprint 40 x 16 m. Corridor band z -1..1; north band z -8..-1; south band z 1..8.
const X0 = -20, X1 = 20, Z0 = -8, Z1 = 8, CN = -1, CS = 1;
const FLOORS = ['floor_1', 'l2', 'l3', 'l4', 'l5'];
const GROUND_H = 3.6, GUEST_H = 3.0, SLAB = 0.25;
// Stair cores at both ends of the north band; lift bay in the middle.
const CORES = { w: { x0: -20, x1: -15, lanes: [-18.75, -16.25], door: -17.5 }, e: { x0: 15, x1: 20, lanes: [18.75, 16.25], door: 17.5 } };
const BAY = { x0: -3.75, x1: 3.75 }, LIFT_Z = -2.2, LIFT = 2.6, LIFT_DEPTH = 2.4, LINEN_Z = -3.4;
const LIFTS = [{ id: 'lift_a', label: 'Lift A', x: -1.3 }, { id: 'lift_b', label: 'Lift B', x: 1.3 }];
const PASSAGE_DOOR = 3.175;

let ops = [];
const wall = (floorId, id, a, b, role = 'interior', label = '') => ops.push({ op: 'wall.add', floorId, id, value: { a: P(...a), b: P(...b), role, label } });
const region = (floorId, id, label, [minX, maxX, minZ, maxZ], extra = {}) => ops.push({ op: 'region.add', floorId, id, value: { label, minX, maxX, minZ, maxZ, ...extra } });
const door = (floorId, id, wallId, at, label, width = 0.9, height = 2.1, extra = {}) => ops.push({ op: 'opening.add', floorId, id, value: { type: 'door', wallId, at: P(...at), label, width, height, doorStyle: 'room', ...extra } });
const win = (floorId, id, wallId, at, label, width = 1.6, height = 1.5, sill = 0.9) => ops.push({ op: 'opening.add', floorId, id, value: { type: 'window', wallId, at: P(...at), label, width, height, sill, windowStyle: 'plain' } });
const light = (floorId, id, x, z, label, y = 2.4) => ops.push({ op: 'light.add', floorId, id, value: { label, position: { x, y, z } } });

// Shared by every floor: outline, cores, corridor walls, lift bay and linen room.
function frame(f, ground) {
  wall(f, `${f}-ext-n`, [X0, Z0], [X1, Z0], 'exterior', 'North facade');
  wall(f, `${f}-ext-e`, [X1, Z0], [X1, Z1], 'exterior', 'East facade');
  wall(f, `${f}-ext-s`, [X1, Z1], [X0, Z1], 'exterior', 'South facade');
  wall(f, `${f}-ext-w`, [X0, Z1], [X0, Z0], 'exterior', 'West facade');
  // North corridor wall: west part (cores and rooms) and east part; the ice
  // alcove and the lift shafts sit between them.
  wall(f, `${f}-cor-nw`, [X0, CN], [BAY.x0, CN], 'interior', 'Corridor north west');
  wall(f, `${f}-cor-ne`, [LIFT, CN], [X1, CN], 'interior', 'Corridor north east');
  for (const [side, c] of Object.entries(CORES)) {
    const inner = side === 'w' ? c.x1 : c.x0;
    wall(f, `${f}-core-${side}`, [inner, Z0], [inner, CN], 'interior', `${side === 'w' ? 'West' : 'East'} stair core`);
    door(f, `${f}-d-core-${side}`, side === 'w' ? `${f}-cor-nw` : `${f}-cor-ne`, [c.door, CN], `${side === 'w' ? 'West' : 'East'} stair door`, 1.0, 2.1);
    region(f, `${f}-r-core-${side}`, `${side === 'w' ? 'West' : 'East'} stair`, [Math.min(c.x0, c.x1), Math.max(c.x0, c.x1), Z0, CN]);
    if (ground) door(f, `${f}-d-exit-${side}`, `${f}-ext-n`, [c.lanes[1], Z0], `${side === 'w' ? 'West' : 'East'} fire exit`, 1.0, 2.1, { doorStyle: 'exterior' });
  }
  // Lift bay: west and east bay walls, the linen room behind the shafts and a
  // service passage beside lift B.
  wall(f, `${f}-bay-w`, [BAY.x0, Z0], [BAY.x0, CN], 'interior', 'Lift bay west');
  wall(f, `${f}-bay-e`, [BAY.x1, Z0], [BAY.x1, CN], 'interior', 'Lift bay east');
  wall(f, `${f}-linen`, [BAY.x0, LINEN_Z], [LIFT, LINEN_Z], 'interior', ground ? 'Luggage room' : 'Linen room');
  door(f, `${f}-d-passage`, `${f}-cor-ne`, [PASSAGE_DOOR, CN], ground ? 'Luggage door' : 'Linen door', 0.9, 2.1);
  region(f, `${f}-r-linen`, ground ? 'Luggage room' : 'Linen room', [BAY.x0, BAY.x1, Z0, LINEN_Z]);
  region(f, `${f}-r-lifts`, 'Lift lobby', [BAY.x0, BAY.x1, LINEN_Z, CS], { kind: 'bay' });
  light(f, `${f}-lt-lifts`, 0, 0, 'Lift lobby');
  light(f, `${f}-lt-linen`, 0, -5.7, ground ? 'Luggage room' : 'Linen room');
  for (const side of ['w', 'e']) light(f, `${f}-lt-core-${side}`, CORES[side].lanes[1], -1.6, `${side === 'w' ? 'West' : 'East'} stair`);
}

// ================================================================== tx-1 ground floor
ops = [];
ops.push({ op: 'building.update', value: { name: 'Meridian Hotel', wallThickness: 0.2, wallHeight: GUEST_H, floorThickness: SLAB, roof: { type: 'flat' }, slabsByRoom: true } });
ops.push({ op: 'floor.update', id: 'floor_1', value: { label: 'Ground floor', wallHeight: GROUND_H } });
{
  const f = 'floor_1';
  frame(f, true);
  // North band: kitchen (west), restrooms and office (east).
  wall(f, `${f}-rest-office`, [7.5, Z0], [7.5, CN], 'interior', 'Restrooms/office');
  door(f, `${f}-d-kitchen`, `${f}-cor-nw`, [-10, CN], 'Kitchen door', 1.2, 2.1, { leaves: 2 });
  door(f, `${f}-d-rest`, `${f}-cor-ne`, [5.6, CN], 'Restrooms door');
  door(f, `${f}-d-office`, `${f}-cor-ne`, [11.25, CN], 'Office door');
  region(f, `${f}-r-kitchen`, 'Kitchen', [-15, BAY.x0, Z0, CN]);
  region(f, `${f}-r-rest`, 'Restrooms', [BAY.x1, 7.5, Z0, CN]);
  region(f, `${f}-r-office`, 'Back office', [7.5, 15, Z0, CN]);
  for (const x of [-12.5, -6.5]) win(f, `${f}-w-kitchen-${x}`, `${f}-ext-n`, [x, Z0], 'Kitchen window', 1.6, 1.2, 1.2);
  win(f, `${f}-w-office`, `${f}-ext-n`, [11.25, Z0], 'Office window');
  // South band: restaurant, lobby and lounge separated by wide openings.
  wall(f, `${f}-rest-lobby`, [-8, CN], [-8, Z1], 'interior', 'Restaurant/lobby');
  wall(f, `${f}-lobby-lounge`, [8, CN], [8, Z1], 'interior', 'Lobby/lounge');
  door(f, `${f}-d-restaurant`, `${f}-rest-lobby`, [-8, 3.5], 'Restaurant entrance', 3.0, 2.6, { doorStyle: 'empty' });
  door(f, `${f}-d-lounge`, `${f}-lobby-lounge`, [8, 3.5], 'Lounge entrance', 3.0, 2.6, { doorStyle: 'empty' });
  door(f, `${f}-d-entrance`, `${f}-ext-s`, [0, Z1], 'Main entrance', 2.0, 2.5, { doorStyle: 'exterior', leaves: 2 });
  for (const x of [-17, -13.5, -10.5, -4.5, 4.5, 10.5, 13.5, 17]) win(f, `${f}-w-s${x}`, `${f}-ext-s`, [x, Z1], x < -8 ? 'Restaurant window' : x > 8 ? 'Lounge window' : 'Lobby window', 1.8, 2.0, 0.5);
  region(f, `${f}-r-restaurant`, 'Restaurant', [X0, -8, CN, Z1]);
  region(f, `${f}-r-lobby`, 'Lobby', [-8, 8, CS, Z1]);
  region(f, `${f}-r-lounge`, 'Lounge', [8, X1, CN, Z1]);
  ops.push({ op: 'marker.add', floorId: f, id: `${f}-mk-reception`, value: { label: 'Reception', details: 'Front desk position (furniture is the game\'s)', position: { x: 0, y: 0, z: 5 } } });
  ops.push({ op: 'marker.add', floorId: f, id: `${f}-mk-arrival`, value: { label: 'Arrival', details: 'Outside the main entrance', position: { x: 0, y: 0, z: 10 } } });
  for (const [x, z, l] of [[-14, 3.5, 'Restaurant'], [-14, -4.5, 'Kitchen'], [-4, 4.5, 'Lobby west'], [4, 4.5, 'Lobby east'], [14, 3.5, 'Lounge'], [5.6, -4.5, 'Restrooms'], [11.25, -4.5, 'Back office']]) light(f, `${f}-lt-${l.toLowerCase().replace(/ /g, '-')}`, x, z, l, 3.0);
}
tx('tx-1-ground.edit.json', ops);

// ================================================================== tx-2/3 guest floors
// 16 rooms per floor: 3 + 3 in the north band beside the lift bay, 10 in the
// south band. Each has an entry door, a bathroom by the corridor and a window.
function guestFloor(f, level) {
  frame(f, false);
  wall(f, `${f}-cor-s`, [X0, CS], [X1, CS], 'interior', 'Corridor south');
  const rooms = [];
  const north = [[-15, -11.25], [-11.25, -7.5], [-7.5, BAY.x0], [BAY.x1, 7.5], [7.5, 11.25], [11.25, 15]];
  const south = Array.from({ length: 10 }, (_, i) => [X0 + 4 * i, X0 + 4 * (i + 1)]);
  north.forEach(([a, b]) => rooms.push({ a, b, side: 'n' }));
  south.forEach(([a, b]) => rooms.push({ a, b, side: 's' }));
  // Numbered west to east along the corridor: odd numbers south, even north.
  for (const side of ['s', 'n']) rooms.filter(r => r.side === side).forEach((r, i) => { r.number = side === 's' ? 2 * i + 1 : 2 * i + 2; });
  rooms.sort((p, q) => p.number - q.number);
  rooms.forEach(r => {
    const n = `${level}${String(r.number).padStart(2, '0')}`, id = `${f}-rm${n}`, s = r.side === 's';
    const zc = s ? CS : CN, zf = s ? Z1 : Z0, dz = s ? 1 : -1, corridor = s ? `${f}-cor-s` : r.a < 0 ? `${f}-cor-nw` : `${f}-cor-ne`;
    // Partition on the room's east side, except where a core, bay or facade closes it.
    const closed = [15, BAY.x0, X1].includes(r.b);
    if (!closed) wall(f, `${id}-part`, [r.b, zc], [r.b, zf], 'interior', `Room ${n} partition`);
    // Bathroom 2.0 x 2.2 m in the corridor-side west corner.
    const bx = r.a + 2.0, bz = zc + dz * 2.2;
    wall(f, `${id}-bath-a`, [r.a, bz], [bx, bz], 'interior', `Bath ${n}`);
    wall(f, `${id}-bath-b`, [bx, zc], [bx, bz], 'interior', `Bath ${n} side`);
    door(f, `${id}-d`, corridor, [r.a + (r.b - r.a + 2.0) / 2, zc], `Room ${n} door`);
    door(f, `${id}-d-bath`, `${id}-bath-b`, [bx, zc + dz * 1.25], `Bath ${n} door`, 0.8, 2.0);
    win(f, `${id}-w`, s ? `${f}-ext-s` : `${f}-ext-n`, [(r.a + r.b) / 2, zf], `Room ${n} window`);
    region(f, `${id}-r`, `Room ${n}`, [r.a, r.b, Math.min(zc, zf), Math.max(zc, zf)]);
    region(f, `${id}-r-bath`, `Bath ${n}`, [r.a, bx, Math.min(zc, bz), Math.max(zc, bz)]);
    light(f, `${id}-lt`, (r.a + r.b) / 2 + 0.5, zc + dz * 4.6, `Room ${n}`);
  });
  for (const [side, x] of [['w', X0], ['e', X1]]) win(f, `${f}-w-cor-${side}`, `${f}-ext-${side}`, [x, 0], 'Corridor end window', 1.0, 1.6, 0.8);
  region(f, `${f}-r-cor-w`, 'Corridor west', [X0, BAY.x0, CN, CS], { kind: 'bay' });
  region(f, `${f}-r-cor-e`, 'Corridor east', [BAY.x1, X1, CN, CS], { kind: 'bay' });
  for (const x of [-16, -9, 9, 16]) light(f, `${f}-lt-cor${x}`, x, 0, 'Corridor');
}
ops = [];
for (const [i, f] of FLOORS.slice(1).entries()) {
  ops.push({ op: 'floor.add-top', aboveFloorId: FLOORS[i], id: f, value: { label: `Floor ${i + 2}` } });
  guestFloor(f, i + 2);
  if (i === 1) { tx('tx-2-guest-low.edit.json', ops); ops = []; }
}
tx('tx-3-guest-high.edit.json', ops);

// ================================================================== tx-4 circulation
// Fire stairs: switchback flights alternating lanes in both cores, guarded on
// the floor above. Elevators: two lifts serving every floor, opening onto the
// lobby and the guest corridors.
ops = [];
const rise = i => (i === 0 ? GROUND_H : GUEST_H) + SLAB;
for (const [side, c] of Object.entries(CORES)) {
  for (let i = 0; i < FLOORS.length - 1; i++) {
    const f = FLOORS[i], up = FLOORS[i + 1], north = i % 2 === 0, steps = Math.round(rise(i) / 0.175);
    ops.push({ op: 'stair.add', floorId: f, id: `st-${side}-${f}`, value: { label: `${side === 'w' ? 'West' : 'East'} stair ${i + 1}-${i + 2}`, x: c.lanes[i % 2], z: -4.5, width: 1.5, run: i === 0 ? 5.0 : 4.6, direction: north ? 'north' : 'south', style: 'steps', steps } });
    ops.push({ op: 'stair.guard', floorId: f, id: `st-${side}-${f}` });
  }
}
for (const l of LIFTS) ops.push({ op: 'elevator.add', id: l.id, value: { label: l.label, x: l.x, z: LIFT_Z, width: LIFT, depth: LIFT_DEPTH, doorSide: 'maxZ', doorWidth: 1.0, doorHeight: 2.2, bottomFloorId: FLOORS[0], topFloorId: FLOORS.at(-1) } });
tx('tx-4-circulation.edit.json', ops);
