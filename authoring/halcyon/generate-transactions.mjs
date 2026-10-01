// Generates the Halcyon stress-test recipes: an 11-level mixed-use complex
// (2 basements, a 2-level podium mall, a roof terrace and twin towers joined
// by a sky bridge). Run from the editor root:
//   node authoring/halcyon/generate-transactions.mjs
// Writes tx-*.edit.json next to this script. Plan units are metres; north is -Z.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const P = (x, z) => ({ x: +x.toFixed(6), z: +z.toFixed(6) });
const save = (name, data) => writeFileSync(join(here, name), JSON.stringify(data, null, 2) + '\n');
const tx = (name, operations) => { if (operations.length > 1000) throw new Error(`${name}: ${operations.length} > 1000`); save(name, { version: 1, operations }); console.log(`${name}: ${operations.length} operations`); };

const L1 = 'floor_1';
const TOWER_FLOORS = ['l4', 'l5', 'l6', 'l7', 'l8', 'l9'];
const H = { b2: 3.2, b1: 3.2, [L1]: 4.5, l2: 4.0 }; // others default 3.2
const SLAB = 0.3;

// ------------------------------------------------------------------ builders
let ops = [];
const wall = (floorId, id, a, b, role = 'interior', label = '', extra = {}) =>
  ops.push({ op: 'wall.add', floorId, id, value: { a: P(...a), b: P(...b), role, label, ...extra } });
const loop = (floorId, key, pts, role, label, extra = {}) =>
  pts.forEach((p, i) => wall(floorId, `${key}${i + 1}`, p, pts[(i + 1) % pts.length], role, `${label} ${i + 1}`, extra));
const region = (floorId, id, label, b, extra = {}) =>
  ops.push({ op: 'region.add', floorId, id, value: { label, ...(Array.isArray(b[0]) ? { polygon: b.map(p => P(...p)) } : { minX: b[0], maxX: b[1], minZ: b[2], maxZ: b[3] }), ...extra } });
const door = (floorId, id, wallId, at, label, width = 1.0, height = 2.2, extra = {}) =>
  ops.push({ op: 'opening.add', floorId, id, value: { type: 'door', wallId, at: P(...at), label, width, height, doorStyle: 'room', ...extra } });
const win = (floorId, id, wallId, at, label, width = 1.6, height = 1.5, sill = 0.9, extra = {}) =>
  ops.push({ op: 'opening.add', floorId, id, value: { type: 'window', wallId, at: P(...at), label, width, height, sill, windowStyle: 'plain', ...extra } });
const remove = (kind, floorId, id) => ops.push({ op: `${kind}.remove`, floorId, id });
const ngon = (cx, cz, r, n, phase) => Array.from({ length: n }, (_, k) => { const a = phase + (2 * Math.PI * k) / n; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });

// Shared stair/core layout. Each core is 5 x 12 m; flights alternate between
// two lanes so a switchback climbs the whole stack.
const CORE = { w: { x0: -34, x1: -29, lanes: [-32.9, -31.1], doorX: -29 }, e: { x0: 29, x1: 34, lanes: [32.9, 31.1], doorX: 29 } };
function core(floorId, side) {
  const c = CORE[side];
  loop(floorId, `core_${side}_`, [[c.x0, -6], [c.x1, -6], [c.x1, 6], [c.x0, 6]], 'interior', `${side === 'w' ? 'West' : 'East'} core`);
  const doorWall = side === 'w' ? `core_${side}_2` : `core_${side}_4`;
  door(floorId, `d_core_${side}_n`, doorWall, [c.doorX, -4.75], `${side.toUpperCase()} core north door`, 1.2, 2.2);
  door(floorId, `d_core_${side}_s`, doorWall, [c.doorX, 4.75], `${side.toUpperCase()} core south door`, 1.2, 2.2);
  region(floorId, `r_core_${side}`, `${side === 'w' ? 'West' : 'East'} stair core`, [Math.min(c.x0, c.x1), Math.max(c.x0, c.x1), -6, 6]);
}

// ================================================================== tx-1 podium
ops = [];
ops.push({ op: 'building.update', value: { name: 'Halcyon twin towers', wallThickness: 0.3, wallHeight: 3.2, floorThickness: SLAB, roof: { type: 'none' } } });
ops.push({ op: 'floor.update', id: L1, value: { label: 'L1 mall concourse', wallHeight: H[L1] } });
ops.push({ op: 'floor.insert', id: 'b1', belowFloorId: L1, value: { label: 'B1 plant' } });
ops.push({ op: 'floor.insert', id: 'b2', belowFloorId: 'b1', value: { label: 'B2 parking' } });
ops.push({ op: 'wallType.add', id: 'bulge', value: { label: 'Rotunda bulge', stations: [
  { height: 0, offset: 0, thickness: 0.3 }, { height: 0.35, offset: 0, thickness: 0.3 }, { height: 0.75, offset: -0.45, thickness: 0.3 }, { height: 1, offset: 0, thickness: 0.3 }] } });
const arch = [[0, 0], [1, 0], ...Array.from({ length: 15 }, (_, i) => { const a = (Math.PI * i) / 14; return [0.5 + 0.5 * Math.cos(a), 0.62 + 0.38 * Math.sin(a)]; })];
ops.push({ op: 'openingShape.add', id: 'arch', value: { label: 'Round arch', points: arch.map(([x, y]) => ({ x: +x.toFixed(6), y: +y.toFixed(6) })) } });

// B2 parking: podium box, 32 square pillars, both cores.
const podium = [[-40, -20], [40, -20], [40, 20], [-40, 20]];
loop('b2', 'ext_', podium, 'exterior', 'B2 retaining wall');
const pillars = [];
for (const x of [-32, -24, -16, -8, 0, 8, 16, 24, 32]) for (const z of [-13, -5, 5, 13]) {
  if (Math.abs(x) === 32 && Math.abs(z) === 5) continue;
  pillars.push([x, z]);
  loop('b2', `pil_${x}_${z}_`, [[x - 0.3, z - 0.3], [x + 0.3, z - 0.3], [x + 0.3, z + 0.3], [x - 0.3, z + 0.3]], 'interior', `Pillar ${x},${z}`);
}
core('b2', 'w'); core('b2', 'e');
region('b2', 'r_parking', 'Parking', [-40, 40, -20, 20], { kind: 'garage' });

// B1 plant: four plant rooms behind a service wall, open hall with the car ramp.
loop('b1', 'ext_', podium, 'exterior', 'B1 retaining wall');
wall('b1', 'svc', [-40, -8], [40, -8], 'interior', 'Service wall');
for (const x of [-20, 0, 20]) wall('b1', `plant_${x}`, [x, -20], [x, -8], 'interior', `Plant partition ${x}`);
[-30, -10, 10, 30].forEach((x, i) => { door('b1', `d_plant_${i + 1}`, 'svc', [x, -8], `Plant room ${i + 1} door`, 1.6, 2.4); region('b1', `r_plant_${i + 1}`, `Plant room ${i + 1}`, [x - 10, x + 10, -20, -8]); });
core('b1', 'w'); core('b1', 'e');
region('b1', 'r_hall', 'Loading hall', [-40, 40, -8, 20], { kind: 'garage' });

// L1 mall concourse: podium with an angled entrance bay, a 24-sided bulging
// rotunda with four arches, eight storefront shops and both cores.
const podiumL1 = [[-40, -20], [40, -20], [40, 20], [10, 20], [4, 26], [-4, 26], [-10, 20], [-40, 20]];
loop(L1, 'ext_', podiumL1, 'exterior', 'Podium wall');
const ROT = { cx: 0, cz: 4, r: 8, n: 24 };
const rot = ngon(ROT.cx, ROT.cz, ROT.r, ROT.n, Math.PI / ROT.n);
loop(L1, 'rot_', rot, 'interior', 'Rotunda', { wallTypeId: 'bulge', inwardToward: P(ROT.cx, ROT.cz) });
// Find the rotunda edge whose midpoint faces a compass angle (0 = east, 90 = south).
const edgeAt = deg => { for (let k = 0; k < ROT.n; k++) { const [a, b] = [rot[k], rot[(k + 1) % ROT.n]]; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const ang = (Math.atan2(m[1] - ROT.cz, m[0] - ROT.cx) * 180 / Math.PI + 360) % 360; if (Math.abs(((ang - deg + 540) % 360) - 180) < 1) return { id: `rot_${k + 1}`, m }; } throw new Error(`no rotunda edge at ${deg}`); };
for (const [deg, name] of [[0, 'east'], [90, 'south'], [180, 'west'], [270, 'north']]) { const e = edgeAt(deg); door(L1, `d_arch_${name}`, e.id, e.m, `Rotunda ${name} arch`, 1.7, 3.4, { doorStyle: 'empty', shapeId: 'arch' }); }
region(L1, 'r_rotunda', 'Rotunda', rot);
// Storefronts along z = -12.
wall(L1, 'shopfront', [-29, -12], [29, -12], 'interior', 'Storefront');
wall(L1, 'shop_end_w', [-29, -20], [-29, -12], 'interior', 'Shop end west');
wall(L1, 'shop_end_e', [29, -20], [29, -12], 'interior', 'Shop end east');
for (let k = 1; k < 8; k++) { const x = -29 + 7.25 * k; wall(L1, `shop_${k}`, [x, -20], [x, -12], 'interior', `Shop partition ${k}`); }
for (let k = 0; k < 8; k++) {
  const x = -29 + 7.25 * (k + 0.5);
  door(L1, `d_shop_${k + 1}`, 'shopfront', [x, -12], `Shop ${k + 1} door`, 2.0, 2.6, { doorStyle: 'exterior' });
  win(L1, `w_shop_${k + 1}a`, 'shopfront', [x - 2.4, -12], `Shop ${k + 1} display west`, 1.8, 2.6, 0.4, { windowStyle: 'four_pane' });
  win(L1, `w_shop_${k + 1}b`, 'shopfront', [x + 2.4, -12], `Shop ${k + 1} display east`, 1.8, 2.6, 0.4, { windowStyle: 'four_pane' });
  region(L1, `r_shop_${k + 1}`, `Shop ${k + 1}`, [x - 3.625, x + 3.625, -20, -12]);
}
core(L1, 'w'); core(L1, 'e');
door(L1, 'd_main', 'ext_5', [0, 26], 'Main entrance', 3.2, 3.0, { doorStyle: 'exterior' });
door(L1, 'd_bay_w', 'ext_6', [-7, 23], 'Bay west door', 1.4, 2.6, { doorStyle: 'exterior' });
door(L1, 'd_bay_e', 'ext_4', [7, 23], 'Bay east door', 1.4, 2.6, { doorStyle: 'exterior' });
door(L1, 'd_side_w', 'ext_8', [-40, 0], 'West side entrance', 2.0, 2.8, { doorStyle: 'exterior' });
door(L1, 'd_side_e', 'ext_2', [40, 0], 'East side entrance', 2.0, 2.8, { doorStyle: 'exterior' });
for (const z of [-15, -9, 9, 15]) { win(L1, `w_w_${z}`, 'ext_8', [-40, z], 'West window', 2.4, 2.4, 1.0); win(L1, `w_e_${z}`, 'ext_2', [40, z], 'East window', 2.4, 2.4, 1.0); }
for (const x of [-34, -24, -16, 16, 24, 34]) win(L1, `w_s_${x}`, x < 0 ? 'ext_7' : 'ext_3', [x, 20], 'South window', 2.4, 2.4, 1.0);
region(L1, 'r_concourse', 'Concourse', [-40, 40, -12, 20]);
region(L1, 'r_bay', 'Entrance bay', [[-10, 20], [10, 20], [4, 26], [-4, 26]], { kind: 'bay' });

// L2 food court: duplicate L1, then replace the rotunda with an atrium void
// ringed by railings, and drop the ground-level entrances.
ops.push({ op: 'floor.duplicate', id: 'l2', sourceFloorId: L1, value: { label: 'L2 food court', wallHeight: H.l2 } });
for (const n of ['east', 'south', 'west', 'north']) remove('opening', 'l2', `l2-d_arch_${n}`);
for (let k = 1; k <= ROT.n; k++) remove('wall', 'l2', `l2-rot_${k}`);
remove('region', 'l2', 'l2-r_rotunda');
for (const id of ['d_main', 'd_bay_w', 'd_bay_e', 'd_side_w', 'd_side_e']) remove('opening', 'l2', `l2-${id}`);
const voidPts = ngon(ROT.cx, ROT.cz, 7.6, ROT.n, Math.PI / ROT.n);
region('l2', 'r_atrium', 'Atrium void', voidPts, { effect: 'void' });
voidPts.forEach((p, i) => ops.push({ op: 'railing.add', floorId: 'l2', id: `rail_atrium_${i + 1}`, value: { a: P(...p), b: P(...voidPts[(i + 1) % ROT.n]), label: `Atrium rail ${i + 1}`, style: 'picket', height: 1.1 } }));
tx('tx-1-podium.edit.json', ops);

// ================================================================== tx-2 towers
// L3 is authored once (both towers on the podium roof terrace), then copied
// upward with floor.duplicate. Each copy is inserted directly above L3, so the
// copies are made top-down and every copy's IDs read "<floor>-<L3 id>".
ops = [];
const mx = (side, x) => (side === 'w' ? x : -x);
const tw = (side, key) => `${side}_${key}`;
function tower(floorId, side) {
  const X = x => mx(side, x), T = key => tw(side, key), name = side === 'w' ? 'West' : 'East';
  loop(floorId, `${side}_ext_`, [[X(-34), -12], [X(-14), -12], [X(-14), 12], [X(-34), 12]], 'exterior', `${name} tower wall`);
  wall(floorId, T('shaft'), [X(-29), -6], [X(-29), 6], 'interior', `${name} shaft wall`);
  wall(floorId, T('n6'), [X(-34), -6], [X(-24), -6], 'interior', `${name} lobby north`);
  wall(floorId, T('s6'), [X(-34), 6], [X(-24), 6], 'interior', `${name} lobby south`);
  wall(floorId, T('x24n'), [X(-24), -12], [X(-24), -1.25], 'interior', `${name} lobby east north`);
  wall(floorId, T('x24s'), [X(-24), 1.25], [X(-24), 12], 'interior', `${name} lobby east south`);
  wall(floorId, T('corr_n'), [X(-24), -1.25], [X(-14), -1.25], 'interior', `${name} corridor north`);
  wall(floorId, T('corr_s'), [X(-24), 1.25], [X(-14), 1.25], 'interior', `${name} corridor south`);
  wall(floorId, T('x19n'), [X(-19), -12], [X(-19), -1.25], 'interior', `${name} suite split north`);
  wall(floorId, T('x19s'), [X(-19), 1.25], [X(-19), 12], 'interior', `${name} suite split south`);
  door(floorId, T('d_shaft_n'), T('shaft'), [X(-29), -4.75], `${name} stair door north`, 1.2, 2.2);
  door(floorId, T('d_shaft_s'), T('shaft'), [X(-29), 4.75], `${name} stair door south`, 1.2, 2.2);
  door(floorId, T('d_n1'), T('n6'), [X(-26.5), -6], `${name} suite N1 door`);
  door(floorId, T('d_s1'), T('s6'), [X(-26.5), 6], `${name} suite S1 door`);
  for (const [k, x] of [[2, -21.5], [3, -16.5]]) {
    door(floorId, T(`d_n${k}`), T('corr_n'), [X(x), -1.25], `${name} suite N${k} door`);
    door(floorId, T(`d_s${k}`), T('corr_s'), [X(x), 1.25], `${name} suite S${k} door`);
  }
  for (const x of [-31, -27, -21.5, -16.5]) {
    win(floorId, T(`w_n${-x}`), `${side}_ext_1`, [X(x), -12], `${name} north window`);
    win(floorId, T(`w_s${-x}`), `${side}_ext_3`, [X(x), 12], `${name} south window`);
  }
  for (const z of [-9, -5, 5, 9]) win(floorId, T(`w_e${z}`), `${side}_ext_2`, [X(-14), z], `${name} inner window`);
  for (const z of [-9, 9]) win(floorId, T(`w_w${z}`), `${side}_ext_4`, [X(-34), z], `${name} outer window`);
  // Corridor end: terrace door on L3, sky-bridge door on L6, window elsewhere.
  door(floorId, T('d_end'), `${side}_ext_2`, [X(-14), 0], `${name} corridor end door`, 1.6, 2.4, { doorStyle: 'exterior' });
  const rooms = [['n1', [-34, -24, -12, -6]], ['n2', [-24, -19, -12, -1.25]], ['n3', [-19, -14, -12, -1.25]], ['s1', [-34, -24, 6, 12]], ['s2', [-24, -19, 1.25, 12]], ['s3', [-19, -14, 1.25, 12]],
    ['lobby', [-29, -24, -6, 6]], ['corr', [-24, -14, -1.25, 1.25]], ['shaft', [-34, -29, -6, 6]]];
  for (const [k, [x0, x1, z0, z1]] of rooms) region(floorId, T(`r_${k}`), `${name} ${k}`, [Math.min(X(x0), X(x1)), Math.max(X(x0), X(x1)), z0, z1]);
}
const TOWER_WALLS = side => [1, 2, 3, 4].map(i => `${side}_ext_${i}`).concat(['shaft', 'n6', 's6', 'x24n', 'x24s', 'corr_n', 'corr_s', 'x19n', 'x19s'].map(k => tw(side, k)));
const TOWER_OPENINGS = side => ['d_shaft_n', 'd_shaft_s', 'd_n1', 'd_s1', 'd_n2', 'd_s2', 'd_n3', 'd_s3', 'd_end', ...[31, 27, 21.5, 16.5].flatMap(x => [`w_n${x}`, `w_s${x}`]), ...[-9, -5, 5, 9].map(z => `w_e${z}`), 'w_w-9', 'w_w9'].map(k => tw(side, k));
const TOWER_REGIONS = side => ['n1', 'n2', 'n3', 's1', 's2', 's3', 'lobby', 'corr', 'shaft'].map(k => tw(side, `r_${k}`));

ops.push({ op: 'floor.insert', id: 'l3', aboveFloorId: 'l2', value: { label: 'L3 roof terrace', boundaryMode: 'intentional_open', autoCeiling: false } });
// autoCeiling:false: with roof none an automatic ceiling would also hang over
// the open terrace (LLM_GUIDE §5); the tower rooms are closed by L4's slab.
tower('l3', 'w'); tower('l3', 'e');
ops.push({ op: 'slab.add', floorId: 'l3', id: 'slab_terrace', value: { label: 'Terrace deck', minX: -40, maxX: 40, minZ: -20, maxZ: 20 } });
const terraceRails = [[[-40, -20], [40, -20]], [[40, -20], [40, 20]], [[40, 20], [-40, 20]], [[-40, 20], [-40, -20]]];
terraceRails.forEach(([a, b], i) => ops.push({ op: 'railing.add', floorId: 'l3', id: `rail_terrace_${i + 1}`, value: { a: P(...a), b: P(...b), label: `Terrace parapet ${i + 1}`, style: 'cross_brace', height: 1.1 } }));
region('l3', 'r_terrace', 'Roof terrace', [-40, 40, -20, 20], { kind: 'courtyard' });

const labels = { l4: 'L4 offices', l5: 'L5 offices', l6: 'L6 sky bridge', l7: 'L7 offices', l8: 'L8 west tower / east roof', l9: 'L9 west penthouse' };
for (const f of [...TOWER_FLOORS].reverse()) {
  ops.push({ op: 'floor.duplicate', id: f, sourceFloorId: 'l3', value: { label: labels[f], boundaryMode: 'closed', autoCeiling: f !== 'l8' } });
  remove('slab', f, `${f}-slab_terrace`);
  terraceRails.forEach((_, i) => remove('railing', f, `${f}-rail_terrace_${i + 1}`));
  remove('region', f, `${f}-r_terrace`);
}
for (const f of TOWER_FLOORS) for (const side of ['w', 'e']) {
  if (f === 'l6') continue; // sky-bridge doors stay
  if ((f === 'l8' || f === 'l9') && side === 'e') continue; // removed below
  remove('opening', f, `${f}-${tw(side, 'd_end')}`);
  win(f, `${tw(side, 'w_end')}`, `${f}-${side}_ext_2`, [mx(side, -14), 0], 'Corridor end window', 1.6, 1.5, 0.9);
}
// L6 sky bridge between the towers' corridor doors.
wall('l6', 'bridge_n', [-14, -2], [14, -2], 'exterior', 'Sky bridge north');
wall('l6', 'bridge_s', [14, 2], [-14, 2], 'exterior', 'Sky bridge south');
for (const x of [-10, -5, 0, 5, 10]) { win('l6', `w_bridge_n${x}`, 'bridge_n', [x, -2], 'Bridge glazing north', 3.6, 2.4, 0.3); win('l6', `w_bridge_s${x}`, 'bridge_s', [x, 2], 'Bridge glazing south', 3.6, 2.4, 0.3); }
region('l6', 'r_bridge', 'Sky bridge', [-14, 14, -2, 2], { kind: 'wing' });
// The bridge walls T into the tower walls, which the outline finder reports as
// open ends; its rectangular fallback would floor the whole gap between the
// towers (FINDINGS H1). Floor Footprints give the intended dumbbell.
for (const [id, label, b] of [['slab_w', 'West tower floor', [-34, -14, -12, 12]], ['slab_bridge', 'Sky bridge floor', [-14, 14, -2, 2]], ['slab_e', 'East tower floor', [14, 34, -12, 12]]])
  ops.push({ op: 'slab.add', floorId: 'l6', id, value: { label, minX: b[0], maxX: b[1], minZ: b[2], maxZ: b[3] } });
// L8/L9: west tower only. L8 keeps the east tower's roof as a terrace.
for (const f of ['l8', 'l9']) {
  for (const id of TOWER_OPENINGS('e')) remove('opening', f, `${f}-${id}`);
  for (const id of TOWER_WALLS('e')) remove('wall', f, `${f}-${id}`);
  for (const id of TOWER_REGIONS('e')) remove('region', f, `${f}-${id}`);
}
ops.push({ op: 'floor.update', id: 'l8', value: { boundaryMode: 'intentional_open' } }); // autoCeiling off: the east roof deck is open
ops.push({ op: 'slab.add', floorId: 'l8', id: 'slab_west', value: { label: 'West tower floor', minX: -34, maxX: -14, minZ: -12, maxZ: 12 } });
ops.push({ op: 'slab.add', floorId: 'l8', id: 'slab_east_roof', value: { label: 'East roof deck', minX: 14, maxX: 34, minZ: -12, maxZ: 12 } });
[[[14, -12], [34, -12]], [[34, -12], [34, 12]], [[34, 12], [14, 12]], [[14, 12], [14, -12]]].forEach(([a, b], i) =>
  ops.push({ op: 'railing.add', floorId: 'l8', id: `rail_east_roof_${i + 1}`, value: { a: P(...a), b: P(...b), label: `East roof parapet ${i + 1}`, style: 'picket', height: 1.1 } }));
region('l8', 'r_east_roof', 'East roof deck', [14, 34, -12, 12], { kind: 'courtyard' });
tx('tx-2-towers.edit.json', ops);

// ================================================================== tx-3 circulation
// Switchback flights in both cores, alternating lanes; each upper floor gets
// rails along the open edges of the flight's opening. A car ramp joins B2-B1.
ops = [];
const FLOORS = ['b2', 'b1', L1, 'l2', 'l3', ...TOWER_FLOORS];
const storyHeight = f => (H[f] ?? 3.2) + SLAB;
const RUN = 7, SW = 1.6;
const rail = (floorId, id, a, b, label) => ops.push({ op: 'railing.add', floorId, id, value: { a: P(...a), b: P(...b), label, style: 'two_rail', height: 1.0 } });
for (const side of ['w', 'e']) {
  const top = side === 'w' ? 'l9' : 'l8', c = CORE[side];
  for (let i = 0; FLOORS[i] !== top; i++) {
    const f = FLOORS[i], up = FLOORS[i + 1], lane = c.lanes[i % 2], north = i % 2 === 0;
    const steps = Math.round(storyHeight(f) / 0.175);
    ops.push({ op: 'stair.add', floorId: f, id: `st_${side}_${f}`, value: { label: `${side.toUpperCase()} core ${f} to ${up}`, x: lane, z: 0, width: SW, run: RUN, direction: north ? 'north' : 'south', style: 'steps', steps } });
    // Rails follow the model's opening footprint: 0.06 m outside the flight
    // on the sides and the entry end, flush at the top landing.
    const M = 0.06, toward = Math.sign(c.lanes[1 - (i % 2)] - lane), half = SW / 2 + M;
    const inner = lane + toward * half, outer = lane - toward * half;
    const bottomZ = north ? RUN / 2 + M : -RUN / 2 - M, topZ = north ? -RUN / 2 : RUN / 2;
    rail(up, `rail_${side}_${f}_inner`, [inner, topZ], [inner, bottomZ], `${side.toUpperCase()} stair rail inner`);
    rail(up, `rail_${side}_${f}_end`, [lane - half, bottomZ], [lane + half, bottomZ], `${side.toUpperCase()} stair rail end`);
    if (i % 2 === 1) rail(up, `rail_${side}_${f}_outer`, [outer, topZ], [outer, bottomZ], `${side.toUpperCase()} stair rail outer`);
  }
}
ops.push({ op: 'stair.add', floorId: 'b2', id: 'ramp_cars', value: { label: 'Car ramp', x: 20, z: 0, width: 3.5, run: 12, direction: 'east', style: 'ramp' } });
rail('b1', 'rail_ramp_n', [13.94, -1.81], [26, -1.81], 'Ramp rail north');
rail('b1', 'rail_ramp_s', [13.94, 1.81], [26, 1.81], 'Ramp rail south');
rail('b1', 'rail_ramp_end', [13.94, -1.81], [13.94, 1.81], 'Ramp rail end');
tx('tx-3-circulation.edit.json', ops);

// ================================================================== tx-4 roofs, lights, markers
ops = [];
const elev = {}; { let y = -2 * (3.2 + SLAB); for (const f of FLOORS) { elev[f] = y; y += storyHeight(f); } }
const roof = (id, label, b, baseY) => ops.push({ op: 'roof.add', id, value: { label, minX: b[0], maxX: b[1], minZ: b[2], maxZ: b[3], type: 'flat', baseY, overhang: 0 } });
roof('roof_bay', 'Entrance bay roof', [-10, 10, 20, 26], elev.l2 + H.l2);
roof('roof_bridge', 'Sky bridge roof', [-14, 14, -2, 2], elev.l6 + 3.2);
roof('roof_west', 'West tower roof', [-34, -14, -12, 12], elev.l9 + 3.2);
// One ceiling light per authored room-sized region, a grid in the car park.
const docRegions = [];
const collect = list => { for (const o of list) if (o.op === 'region.add' && !o.value.effect) docRegions.push(o); };
collect(require_ops('tx-1-podium.edit.json')); collect(require_ops('tx-2-towers.edit.json'));
function require_ops(name) { return JSON.parse(readFileSync(join(here, name), 'utf8')).operations; }
const lightAt = (floorId, id, label, x, z, range) => ops.push({ op: 'light.add', floorId, id, value: { label, position: { x: +x.toFixed(3), y: (H[floorId] ?? 3.2) - 0.4, z: +z.toFixed(3) }, color: { r: 1, g: 0.94, b: 0.85 }, energy: 1.2, range, shadows: false } });
for (const o of docRegions) {
  const v = o.value; if (v.kind === 'garage' || v.kind === 'courtyard') continue;
  const b = v.polygon ? { minX: Math.min(...v.polygon.map(p => p.x)), maxX: Math.max(...v.polygon.map(p => p.x)), minZ: Math.min(...v.polygon.map(p => p.z)), maxZ: Math.max(...v.polygon.map(p => p.z)) } : v;
  const targets = o.floorId === 'l3' ? ['l3', ...TOWER_FLOORS] : o.floorId === L1 ? [L1, 'l2'] : [o.floorId];
  for (const f of targets) {
    const rid = f === o.floorId ? o.id : `${f}-${o.id}`;
    if ((f === 'l8' || f === 'l9') && o.id.startsWith('e_')) continue;
    if (f === 'l2' && o.id === 'r_rotunda') continue;
    lightAt(f, `light_${rid}`, `${v.label} light`, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, Math.round(Math.max(6, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) * 0.6) * 10) / 10);
  }
}
for (const f of ['b2', 'b1']) for (let x = -36; x <= 36; x += 12) for (const z of f === 'b2' ? [-15, -3, 9, 17] : [-3, 9, 17]) lightAt(f, `light_${f}_grid_${x}_${z}`, `${f.toUpperCase()} grid light`, x, z, 9);
for (const z of [-14, 0, 14]) for (const x of [-30, -15, 15, 30]) lightAt('l3', `light_terrace_${x}_${z}`, 'Terrace light', x, z, 8);
lightAt('l6', 'light_bridge_w', 'Bridge light west', -7, 0, 8); lightAt('l6', 'light_bridge_e', 'Bridge light east', 7, 0, 8);
const marker = (floorId, id, label, x, z, details = '') => ops.push({ op: 'marker.add', floorId, id, value: { label, position: { x, y: 0, z }, details } });
marker(L1, 'spawn_main', 'Player spawn: main entrance', 0, 28, 'Outside the bay doors, facing north.');
marker('b2', 'spawn_parking', 'Player spawn: parking', -20, 10);
marker('l9', 'goal_penthouse', 'Goal: penthouse', -21.5, -6);
marker('l8', 'goal_east_roof', 'Goal: east roof deck', 24, 0);
marker('l6', 'mid_bridge', 'Sky bridge midpoint', 0, 0);
tx('tx-4-finish.edit.json', ops);
