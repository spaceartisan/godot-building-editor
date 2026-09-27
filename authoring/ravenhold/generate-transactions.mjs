// Generates the Ravenhold castle transaction recipes (format 1).
// Run from the editor root: node authoring/ravenhold/generate-transactions.mjs
// Writes tx-*.edit.json next to this script. Plan units are metres; north is -Z.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const F1 = 'floor_1', F2 = 'f2_ramparts', F3 = 'f3_towertops', F4 = 'f4_keeproof';
const MERLON = 1.7, CRENEL = 1.0, PARAPET = 1.0, GUARD = 1.0;
const r2 = v => Math.round(v * 1000) / 1000;
const P = (x, z) => ({ x: r2(x), z: r2(z) });

function tx(operations) { return { version: 1, operations }; }
function save(name, operations) {
  writeFileSync(join(here, name), JSON.stringify(tx(operations), null, 2) + '\n');
  console.log(`${name}: ${operations.length} operations`);
}

// ---------------------------------------------------------------- walls
const walls = [];
const wallIndex = {};
let wallSeq = 0;
function wall(floorId, key, a, b, role, label = '', height = null) {
  const id = `${floorId === F1 ? 'g' : floorId === F2 ? 'r' : floorId === F3 ? 't' : 'k'}_${key}`;
  if (wallIndex[id]) throw new Error(`duplicate wall ${id}`);
  const w = { floorId, id, a: P(...a), b: P(...b), role, label, height };
  walls.push(w); wallIndex[id] = w; wallSeq++;
  return w;
}
// A crenellated parapet: odd number of alternating merlon/crenel segments.
function crenellated(floorId, key, a, b, label, targetLen = 1.1) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let n = Math.max(3, Math.round(len / targetLen)); if (n % 2 === 0) n += 1;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    wall(floorId, `${key}${String(i + 1).padStart(2, '0')}`,
      [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
      [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
      'exterior', `${label} ${i % 2 ? 'crenel' : 'merlon'}`, i % 2 ? CRENEL : MERLON);
  }
}
function crenellatedLoop(floorId, key, minX, maxX, minZ, maxZ, label) {
  crenellated(floorId, `${key}n`, [minX, minZ], [maxX, minZ], `${label} N`);
  crenellated(floorId, `${key}e`, [maxX, minZ], [maxX, maxZ], `${label} E`);
  crenellated(floorId, `${key}s`, [maxX, maxZ], [minX, maxZ], `${label} S`);
  crenellated(floorId, `${key}w`, [minX, maxZ], [minX, minZ], `${label} W`);
}

// Ground floor (F1): outer loop, courtyard loop, keep loop; interior dividers.
const outer = [
  [-18, -18], [-10, -18], [-10, -16], [10, -16], [10, -18], [18, -18], [18, -10], [16, -10],
  [16, 10], [18, 10], [18, 18], [10, 18], [10, 16], [6, 16], [6, 20], [-6, 20], [-6, 16],
  [-10, 16], [-10, 18], [-18, 18], [-18, 10], [-16, 10], [-16, -10], [-18, -10]
];
outer.forEach((p, i) => wall(F1, `outer${String(i + 1).padStart(2, '0')}`, p, outer[(i + 1) % outer.length], 'exterior', 'Curtain'));
const court = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
['n', 'e', 's', 'w'].forEach((s, i) => wall(F1, `court_${s}`, court[i], court[(i + 1) % 4], 'exterior', 'Courtyard face'));
const keep = [[-5, -6], [5, -6], [5, 2], [-5, 2]];
['n', 'e', 's', 'w'].forEach((s, i) => wall(F1, `keep_${s}`, keep[i], keep[(i + 1) % 4], 'exterior', 'Keep'));
// Tower/range dividers (interior).
wall(F1, 'nw_e', [-10, -16], [-10, -10], 'interior', 'NW tower / hall');
wall(F1, 'nw_s', [-16, -10], [-10, -10], 'interior', 'NW tower / storehouse');
wall(F1, 'ne_w', [10, -16], [10, -10], 'interior', 'NE tower / hall');
wall(F1, 'ne_s', [10, -10], [16, -10], 'interior', 'NE tower / barracks');
wall(F1, 'se_w', [10, 10], [10, 16], 'interior', 'SE tower / store');
wall(F1, 'se_n', [10, 10], [16, 10], 'interior', 'SE tower / barracks');
wall(F1, 'sw_e', [-10, 10], [-10, 16], 'interior', 'SW tower / store');
wall(F1, 'sw_n', [-16, 10], [-10, 10], 'interior', 'SW tower / stables');
// Gatehouse: tunnel walls and guard-room/store dividers.
wall(F1, 'gate_w', [-2, 10], [-2, 20], 'interior', 'Gate tunnel W');
wall(F1, 'gate_e', [2, 10], [2, 20], 'interior', 'Gate tunnel E');
wall(F1, 'guard_w', [-6, 10], [-6, 16], 'interior', 'Guard room / store W');
wall(F1, 'guard_e', [6, 10], [6, 16], 'interior', 'Guard room / store E');
// Range partitions.
wall(F1, 'east_part', [10, 0], [16, 0], 'interior', 'Barracks partition');
wall(F1, 'west_part', [-16, 0], [-10, 0], 'interior', 'Stables partition');

// Ramparts (F2). Towers are closed loops whose inner-corner pieces become
// interior walls where an upper range room abuts them.
function towerF2(key, cx, cz, sx, sz) {
  // sx/sz: +1/-1 outward direction of the tower's outer corner.
  const o = 4, ix = cx - sx * o, iz = cz - sz * o, ox = cx + sx * o, oz = cz + sz * o;
  const splitX = cx - sx * 0.5, splitZ = cz - sz * 0.5; // 13.5-line junction
  // Outer walls.
  wall(F2, `${key}_ox`, [ox, iz], [ox, oz], 'exterior', `${key.toUpperCase()} tower`);
  wall(F2, `${key}_oz`, [ox, oz], [ix, oz], 'exterior', `${key.toUpperCase()} tower`);
  // Inner-x wall (faces +/-X toward N/S range): exterior to the split, interior beyond.
  wall(F2, `${key}_ix_ext`, [ix, oz], [ix, splitZ], 'exterior', `${key.toUpperCase()} tower`);
  // Inner-z wall (faces courtyard in Z).
  wall(F2, `${key}_iz_ext`, [splitX, iz], [ox, iz], 'exterior', `${key.toUpperCase()} tower`);
  return { ix, iz, ox, oz, splitX, splitZ };
}
const tNW = towerF2('nw', -14, -14, -1, -1);
const tNE = towerF2('ne', 14, -14, 1, -1);
const tSE = towerF2('se', 14, 14, 1, 1);
const tSW = towerF2('sw', -14, 14, -1, 1);
// North towers abut the north upper range (interior pieces on inner-x walls);
// all towers abut the east/west upper ranges (interior pieces on inner-z walls).
wall(F2, 'nw_ix_int', [-10, -13.5], [-10, -10], 'interior', 'NW tower / guest chambers');
wall(F2, 'ne_ix_int', [10, -13.5], [10, -10], 'interior', 'NE tower / chapel');
wall(F2, 'nw_iz_int', [-13.5, -10], [-10, -10], 'interior', 'NW tower / garrison hall');
wall(F2, 'ne_iz_int', [10, -10], [13.5, -10], 'interior', 'NE tower / armory');
wall(F2, 'sw_iz_int', [-13.5, 10], [-10, 10], 'interior', 'SW tower / garrison hall');
wall(F2, 'se_iz_int', [10, 10], [13.5, 10], 'interior', 'SE tower / armory');
// South towers: inner-x walls face the south walk and are exterior all the way.
// towerF2 made sw_ix_ext from (ix, oz)=(-10,18) to (-10, 14.5); extend to the corner.
wallIndex['r_sw_ix_ext'].b = P(-10, 10);
wallIndex['r_se_ix_ext'].b = P(10, 10);
// Upper range rooms (walk-side and courtyard-side walls).
wall(F2, 'north_walk', [-10, -13.5], [10, -13.5], 'exterior', 'Guest chambers / wall walk');
wall(F2, 'north_court', [10, -10], [-10, -10], 'exterior', 'Guest chambers / courtyard');
wall(F2, 'north_part', [0, -13.5], [0, -10], 'interior', 'Guest chambers / chapel');
wall(F2, 'east_walk', [13.5, -10], [13.5, 10], 'exterior', 'Armory / wall walk');
wall(F2, 'east_court', [10, 10], [10, -10], 'exterior', 'Armory / courtyard');
wall(F2, 'west_walk', [-13.5, 10], [-13.5, -10], 'exterior', 'Garrison hall / wall walk');
wall(F2, 'west_court', [-10, -10], [-10, 10], 'exterior', 'Garrison hall / courtyard');
// Gatehouse winch room.
const gh = [[-6, 10], [6, 10], [6, 20], [-6, 20]];
['n', 'e', 's', 'w'].forEach((s, i) => wall(F2, `gh_${s}`, gh[i], gh[(i + 1) % 4], 'exterior', 'Winch room'));
// Keep great chamber.
['n', 'e', 's', 'w'].forEach((s, i) => wall(F2, `keep_${s}`, keep[i], keep[(i + 1) % 4], 'exterior', 'Keep'));
// Crenellated outer parapets on the wall walks.
crenellated(F2, 'par_n', [-10, -16], [10, -16], 'North parapet');
crenellated(F2, 'par_e', [16, -10], [16, 10], 'East parapet');
crenellated(F2, 'par_w', [-16, 10], [-16, -10], 'West parapet');
crenellated(F2, 'par_sw', [-10, 16], [-6, 16], 'South-west parapet');
crenellated(F2, 'par_se', [6, 16], [10, 16], 'South-east parapet');
// Inner (courtyard-side) guard parapets on the short south walks, leaving
// the courtyard stair arrival open (stairs at x = +/-8, width 1.6).
wall(F2, 'guard_sw_a', [-9.75, 10], [-8.85, 10], 'exterior', 'South-west walk guard', PARAPET);
wall(F2, 'guard_sw_b', [-7.15, 10], [-6.25, 10], 'exterior', 'South-west walk guard', PARAPET);
wall(F2, 'guard_se_a', [6.25, 10], [7.15, 10], 'exterior', 'South-east walk guard', PARAPET);
wall(F2, 'guard_se_b', [8.85, 10], [9.75, 10], 'exterior', 'South-east walk guard', PARAPET);

// Tower tops and keep chamber (F3).
crenellatedLoop(F3, 'nw', -18, -10, -18, -10, 'NW tower top');
crenellatedLoop(F3, 'ne', 10, 18, -18, -10, 'NE tower top');
crenellatedLoop(F3, 'se', 10, 18, 10, 18, 'SE tower top');
crenellatedLoop(F3, 'sw', -18, -10, 10, 18, 'SW tower top');
crenellatedLoop(F3, 'gh', -6, 6, 10, 20, 'Gatehouse top');
['n', 'e', 's', 'w'].forEach((s, i) => wall(F3, `keep_${s}`, keep[i], keep[(i + 1) % 4], 'exterior', 'Keep'));
// Keep roof (F4).
crenellatedLoop(F4, 'keep', -5, 5, -6, 2, 'Keep roof');

// ---------------------------------------------------------------- stairs
// Tower stairs, in tower-local coordinates (sx/sz point to the outer corner).
const stairs = [];
function towerStairs(key, cx, cz, sx, sz) {
  // F1 -> F2 along the outer-x wall, ascending toward the outer-z side.
  stairs.push({ floorId: F1, id: `st_${key}_1`, label: `${key.toUpperCase()} tower stair (ground)`,
    x: cx + sx * 2.9, z: cz, width: 1.2, run: 5.0, direction: sz < 0 ? 'north' : 'south', style: 'steps', steps: 24 });
  // F2 -> F3 along the outer-z wall, ascending away from the outer-x side.
  stairs.push({ floorId: F2, id: `st_${key}_2`, label: `${key.toUpperCase()} tower stair (roof)`,
    x: cx - sx * 0.25, z: cz + sz * 2.9, width: 1.2, run: 4.5, direction: sx < 0 ? 'east' : 'west', style: 'steps', steps: 21 });
  // Guard walls around the F2 stair hole on the tower top (open at its top end).
  const zi = cz + sz * 1.85, xb = cx + sx * 2.45, xt = cx - sx * 2.5, zo = cz + sz * 3.75;
  wall(F3, `${key}_holeguard_side`, [xb, zo], [xb, zi], 'interior', `${key.toUpperCase()} stair-hole guard`, GUARD);
  wall(F3, `${key}_holeguard_long`, [xb, zi], [xt, zi], 'interior', `${key.toUpperCase()} stair-hole guard`, GUARD);
}
towerStairs('nw', -14, -14, -1, -1);
towerStairs('ne', 14, -14, 1, -1);
towerStairs('se', 14, 14, 1, 1);
towerStairs('sw', -14, 14, -1, 1);
// Courtyard stairs to the south wall walks.
stairs.push({ floorId: F1, id: 'st_court_w', label: 'Courtyard stair west', x: -8, z: 7, width: 1.6, run: 6, direction: 'south', style: 'steps', steps: 24 });
stairs.push({ floorId: F1, id: 'st_court_e', label: 'Courtyard stair east', x: 8, z: 7, width: 1.6, run: 6, direction: 'south', style: 'steps', steps: 24 });
// Gatehouse winch room to gatehouse top.
stairs.push({ floorId: F2, id: 'st_gate', label: 'Gatehouse stair', x: 0, z: 18.9, width: 1.2, run: 4.5, direction: 'east', style: 'steps', steps: 21 });
wall(F3, 'gh_holeguard_side', [-2.65, 19.75], [-2.65, 17.9], 'interior', 'Gatehouse stair-hole guard', GUARD);
wall(F3, 'gh_holeguard_long', [-2.65, 17.9], [2.25, 17.9], 'interior', 'Gatehouse stair-hole guard', GUARD);
// Keep stairs: F1 west (north), F2 east (south), F3 west (north).
stairs.push({ floorId: F1, id: 'st_keep_1', label: 'Keep stair (undercroft)', x: -4.0, z: -1.75, width: 1.2, run: 5.0, direction: 'north', style: 'steps', steps: 24 });
stairs.push({ floorId: F2, id: 'st_keep_2', label: 'Keep stair (great chamber)', x: 4.0, z: -2.75, width: 1.2, run: 4.5, direction: 'south', style: 'steps', steps: 21 });
stairs.push({ floorId: F3, id: 'st_keep_3', label: 'Keep stair (lord\'s chamber)', x: -4.0, z: -2.0, width: 1.2, run: 4.5, direction: 'north', style: 'steps', steps: 21 });
// Guard walls around the keep-roof stair hole (open at its north arrival).
wall(F4, 'keep_holeguard_e', [-3.0, -4.25], [-3.0, 0.65], 'interior', 'Keep stair-hole guard', GUARD);
wall(F4, 'keep_holeguard_s', [-3.0, 0.65], [-4.75, 0.65], 'interior', 'Keep stair-hole guard', GUARD);

// ---------------------------------------------------------------- regions
const regions = [];
function region(floorId, id, label, minX, maxX, minZ, maxZ, kind, effect) {
  regions.push({ floorId, id, label, minX, maxX, minZ, maxZ, kind, effect });
}
// F1 coverage: core square (ranges + courtyard), towers, gatehouse extension.
region(F1, 'cov_core', 'Castle ground', -16, 16, -16, 16, 'wing', 'solid');
region(F1, 'cov_nw', 'NW tower base', -18, -10, -18, -10, 'room', 'solid');
region(F1, 'cov_ne', 'NE tower base', 10, 18, -18, -10, 'room', 'solid');
region(F1, 'cov_se', 'SE tower base', 10, 18, 10, 18, 'room', 'solid');
region(F1, 'cov_sw', 'SW tower base', -18, -10, 10, 18, 'room', 'solid');
region(F1, 'cov_gate', 'Gatehouse front', -6, 6, 16, 20, 'room', 'solid');
region(F1, 'lbl_hall', 'Great hall', -10, 10, -16, -10, 'room', 'label');
region(F1, 'lbl_barr_n', 'Barracks north', 10, 16, -10, 0, 'room', 'label');
region(F1, 'lbl_barr_s', 'Barracks south', 10, 16, 0, 10, 'room', 'label');
region(F1, 'lbl_store', 'Storehouse', -16, -10, -10, 0, 'room', 'label');
region(F1, 'lbl_stables', 'Stables', -16, -10, 0, 10, 'room', 'label');
region(F1, 'lbl_court', 'Courtyard', -10, 10, -10, 10, 'courtyard', 'label');
region(F1, 'lbl_tunnel', 'Gate tunnel', -2, 2, 10, 20, 'room', 'label');
region(F1, 'lbl_guard_w', 'West guard room', -6, -2, 10, 20, 'room', 'label');
region(F1, 'lbl_guard_e', 'East guard room', 2, 6, 10, 20, 'room', 'label');
region(F1, 'lbl_undercroft', 'Keep undercroft', -5, 5, -6, 2, 'room', 'label');
// F2 coverage: ranges (walks + upper rooms), towers, gatehouse, keep.
region(F2, 'cov_n', 'North range', -10, 10, -16, -10, 'wing', 'solid');
region(F2, 'cov_e', 'East range', 10, 16, -10, 10, 'wing', 'solid');
region(F2, 'cov_w', 'West range', -16, -10, -10, 10, 'wing', 'solid');
region(F2, 'cov_s_w', 'South-west walk', -10, -6, 10, 16, 'wing', 'solid');
region(F2, 'cov_s_e', 'South-east walk', 6, 10, 10, 16, 'wing', 'solid');
region(F2, 'cov_nw', 'NW tower', -18, -10, -18, -10, 'room', 'solid');
region(F2, 'cov_ne', 'NE tower', 10, 18, -18, -10, 'room', 'solid');
region(F2, 'cov_se', 'SE tower', 10, 18, 10, 18, 'room', 'solid');
region(F2, 'cov_sw', 'SW tower', -18, -10, 10, 18, 'room', 'solid');
region(F2, 'cov_gate', 'Winch room', -6, 6, 10, 20, 'room', 'solid');
region(F2, 'cov_keep', 'Great chamber', -5, 5, -6, 2, 'room', 'solid');
region(F2, 'lbl_walk_n', 'North wall walk', -10, 10, -16, -13.5, 'bay', 'label');
region(F2, 'lbl_walk_e', 'East wall walk', 13.5, 16, -10, 10, 'bay', 'label');
region(F2, 'lbl_walk_w', 'West wall walk', -16, -13.5, -10, 10, 'bay', 'label');
region(F2, 'lbl_guest', 'Guest chambers', -10, 0, -13.5, -10, 'room', 'label');
region(F2, 'lbl_chapel', 'Chapel', 0, 10, -13.5, -10, 'room', 'label');
region(F2, 'lbl_armory', 'Armory', 10, 13.5, -10, 10, 'room', 'label');
region(F2, 'lbl_garrison', 'Garrison hall', -13.5, -10, -10, 10, 'room', 'label');
// F3 coverage: tower tops, gatehouse top, keep lord's chamber.
region(F3, 'cov_nw', 'NW tower top', -18, -10, -18, -10, 'room', 'solid');
region(F3, 'cov_ne', 'NE tower top', 10, 18, -18, -10, 'room', 'solid');
region(F3, 'cov_se', 'SE tower top', 10, 18, 10, 18, 'room', 'solid');
region(F3, 'cov_sw', 'SW tower top', -18, -10, 10, 18, 'room', 'solid');
region(F3, 'cov_gate', 'Gatehouse top', -6, 6, 10, 20, 'room', 'solid');
region(F3, 'cov_keep', 'Lord\'s chamber', -5, 5, -6, 2, 'room', 'solid');
// F4 coverage: keep roof terrace.
region(F4, 'cov_keep', 'Keep roof', -5, 5, -6, 2, 'room', 'solid');

// ---------------------------------------------------------------- openings
const openings = [];
// Place an opening by world centre point on a named wall.
function opening(floorId, id, wallKey, cx, cz, type, width, height, extra = {}) {
  const w = wallIndex[wallKey]; if (!w) throw new Error(`missing wall ${wallKey}`);
  const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L2 = dx * dx + dz * dz;
  const t = r2(((cx - w.a.x) * dx + (cz - w.a.z) * dz) / L2);
  if (t <= 0 || t >= 1) throw new Error(`${id} outside ${wallKey}`);
  openings.push({ floorId, id, type, wallId: w.id, t, width, height, ...extra });
}
const door = (style, label) => ({ doorStyle: style, label });
const slit = label => ({ windowStyle: 'empty', sill: 1.3, label });
const win = (style, label, sill = 1.0) => ({ windowStyle: style, sill, label });
// Ground floor.
opening(F1, 'o_gate_outer', 'g_outer15', 0, 20, 'door', 3.0, 3.6, door('empty', 'Outer gate'));
opening(F1, 'o_gate_inner', 'g_court_s', 0, 10, 'door', 3.0, 3.6, door('empty', 'Inner gate'));
opening(F1, 'o_guard_w', 'g_gate_w', -2, 15, 'door', 1.0, 2.2, door('room', 'West guard room door'));
opening(F1, 'o_guard_e', 'g_gate_e', 2, 15, 'door', 1.0, 2.2, door('room', 'East guard room door'));
opening(F1, 'o_store_w', 'g_guard_w', -6, 13, 'door', 1.0, 2.2, door('room', 'South-west store door'));
opening(F1, 'o_store_e', 'g_guard_e', 6, 13, 'door', 1.0, 2.2, door('room', 'South-east store door'));
opening(F1, 'o_slit_gw', 'g_outer15', -4, 20, 'window', 0.3, 1.2, slit('Guard slit W'));
opening(F1, 'o_slit_ge', 'g_outer15', 4, 20, 'window', 0.3, 1.2, slit('Guard slit E'));
opening(F1, 'o_hall', 'g_court_n', 0, -10, 'door', 2.0, 3.0, door('exterior', 'Great hall door'));
for (const x of [-7, -3.5, 3.5, 7]) opening(F1, `o_hall_win_${x < 0 ? 'w' : 'e'}${Math.abs(x)}`.replace('.', '_'), 'g_court_n', x, -10, 'window', 1.1, 2.0, win('four_pane', 'Hall window', 1.2));
for (const x of [-6, -2, 2, 6]) opening(F1, `o_hall_slit_${x < 0 ? 'w' : 'e'}${Math.abs(x)}`, 'g_outer03', x, -16, 'window', 0.3, 1.4, slit('Hall arrow slit'));
opening(F1, 'o_barr_n', 'g_court_e', 10, -5, 'door', 1.2, 2.4, door('exterior', 'Barracks north door'));
opening(F1, 'o_barr_s', 'g_court_e', 10, 5, 'door', 1.2, 2.4, door('exterior', 'Barracks south door'));
opening(F1, 'o_barr_mid', 'g_east_part', 13, 0, 'door', 1.0, 2.2, door('room', 'Barracks connecting door'));
for (const z of [-5, 5]) opening(F1, `o_barr_slit_${z < 0 ? 'n' : 's'}`, 'g_outer08', 16, z, 'window', 0.3, 1.4, slit('Barracks slit'));
opening(F1, 'o_stables', 'g_court_w', -10, 5, 'door', 2.4, 3.0, door('empty', 'Stable doorway'));
opening(F1, 'o_storehouse', 'g_court_w', -10, -5, 'door', 1.4, 2.6, door('exterior', 'Storehouse door'));
opening(F1, 'o_stables_mid', 'g_west_part', -13, 0, 'door', 1.0, 2.2, door('room', 'Stables/storehouse door'));
for (const z of [-5, 5]) opening(F1, `o_west_slit_${z < 0 ? 'n' : 's'}`, 'g_outer22', -16, z, 'window', 0.3, 1.4, slit('West range slit'));
opening(F1, 'o_nw_hall', 'g_nw_e', -10, -13, 'door', 1.0, 2.2, door('room', 'Hall to NW tower'));
opening(F1, 'o_ne_hall', 'g_ne_w', 10, -13, 'door', 1.0, 2.2, door('room', 'Hall to NE tower'));
opening(F1, 'o_nw_store', 'g_nw_s', -13, -10, 'door', 1.0, 2.2, door('room', 'Storehouse to NW tower'));
opening(F1, 'o_ne_barr', 'g_ne_s', 13, -10, 'door', 1.0, 2.2, door('room', 'Barracks to NE tower'));
opening(F1, 'o_se_barr', 'g_se_n', 13, 10, 'door', 1.0, 2.2, door('room', 'Barracks to SE tower'));
opening(F1, 'o_sw_stab', 'g_sw_n', -13, 10, 'door', 1.0, 2.2, door('room', 'Stables to SW tower'));
opening(F1, 'o_keep_door', 'g_keep_s', 0, 2, 'door', 1.6, 2.6, door('exterior', 'Keep door'));
for (const [k, wk, x, z] of [['n', 'g_keep_n', 0, -6], ['e', 'g_keep_e', 5, -2], ['w', 'g_keep_w', -5, 1]])
  opening(F1, `o_keep_slit_${k}`, wk, x, z, 'window', 0.3, 1.2, slit('Undercroft slit'));
// Tower ground-floor slits on outer faces.
for (const [k, wx, wz] of [['nw', 'g_outer01', 'g_outer24'], ['ne', 'g_outer05', 'g_outer06'], ['se', 'g_outer10', 'g_outer11'], ['sw', 'g_outer19', 'g_outer20']]) {
  const [cx, cz] = { nw: [-14, -14], ne: [14, -14], se: [14, 14], sw: [-14, 14] }[k];
  for (const wk of [wx, wz]) { const w = wallIndex[wk]; opening(F1, `o_${k}_slit_${wk.slice(-2)}`, wk, (w.a.x + w.b.x) / 2, (w.a.z + w.b.z) / 2, 'window', 0.3, 1.4, slit(`${k.toUpperCase()} tower slit`)); }
}
// Ramparts: walk to tower doors.
for (const [k, cx, cz, sx, sz] of [['nw', -14, -14, -1, -1], ['ne', 14, -14, 1, -1], ['se', 14, 14, 1, 1], ['sw', -14, 14, -1, 1]]) {
  // Door on the inner-z wall onto the east/west walk (walk centre at 14.75 from origin).
  opening(F2, `o_${k}_walk_ew`, `r_${k}_iz_ext`, sx * 14.75, cz - sz * 4, 'door', 1.1, 2.2, door('exterior', `${k.toUpperCase()} tower to side walk`));
  // Door on the inner-x wall onto the north walk (north towers) or south walk (south towers).
  const doorZ = sz < 0 ? -14.75 : 13;
  opening(F2, `o_${k}_walk_ns`, `r_${k}_ix_ext`, cx - sx * 4, doorZ, 'door', 1.1, 2.2, door('exterior', `${k.toUpperCase()} tower to ${sz < 0 ? 'north' : 'south'} walk`));
  // Outer slits.
  for (const wk of [`r_${k}_ox`, `r_${k}_oz`]) { const w = wallIndex[wk]; opening(F2, `o_${k}_slit2_${wk.slice(-2)}`, wk, (w.a.x + w.b.x) / 2, (w.a.z + w.b.z) / 2, 'window', 0.3, 1.4, slit(`${k.toUpperCase()} tower slit`)); }
}
opening(F2, 'o_guest_door', 'r_north_walk', -5, -13.5, 'door', 1.0, 2.2, door('exterior', 'Guest chambers door'));
opening(F2, 'o_chapel_door', 'r_north_walk', 5, -13.5, 'door', 1.0, 2.2, door('exterior', 'Chapel door'));
for (const x of [-7, -3]) opening(F2, `o_guest_win${Math.abs(x)}`, 'r_north_court', x, -10, 'window', 1.0, 1.4, win('double_hung', 'Guest chamber window'));
for (const x of [3, 5, 7]) opening(F2, `o_chapel_win${x}`, 'r_north_court', x, -10, 'window', 0.8, 2.2, win('four_pane', 'Chapel window', 0.8));
for (const z of [-5, 5]) {
  opening(F2, `o_armory_door_${z < 0 ? 'n' : 's'}`, 'r_east_walk', 13.5, z, 'door', 1.0, 2.2, door('exterior', 'Armory door'));
  opening(F2, `o_garrison_door_${z < 0 ? 'n' : 's'}`, 'r_west_walk', -13.5, z, 'door', 1.0, 2.2, door('exterior', 'Garrison hall door'));
}
for (const z of [-6, 0, 6]) {
  opening(F2, `o_armory_win_${z < 0 ? 'n' : z > 0 ? 's' : 'c'}`, 'r_east_court', 10, z, 'window', 1.0, 1.4, win('double_hung', 'Armory window'));
  opening(F2, `o_garrison_win_${z < 0 ? 'n' : z > 0 ? 's' : 'c'}`, 'r_west_court', -10, z, 'window', 1.0, 1.4, win('double_hung', 'Garrison window'));
}
opening(F2, 'o_winch_w', 'r_gh_w', -6, 13, 'door', 1.1, 2.2, door('exterior', 'Winch room west door'));
opening(F2, 'o_winch_e', 'r_gh_e', 6, 13, 'door', 1.1, 2.2, door('exterior', 'Winch room east door'));
for (const x of [-4.5, 4.5]) opening(F2, `o_winch_slit_${x < 0 ? 'w' : 'e'}`, 'r_gh_s', x, 20, 'window', 0.3, 1.2, slit('Winch room slit'));
opening(F2, 'o_winch_court', 'r_gh_n', 0, 10, 'window', 1.2, 1.2, win('four_pane', 'Winch room courtyard window'));
for (const [k, wk, x, z] of [['n', 'r_keep_n', -1, -6], ['e', 'r_keep_e', 5, 0.5], ['s', 'r_keep_s', 0, 2], ['w', 'r_keep_w', -5, 1]])
  opening(F2, `o_keep2_win_${k}`, wk, x, z, 'window', 0.9, 1.6, win('four_pane', 'Great chamber window'));
for (const [k, wk, x, z] of [['n', 't_keep_n', 1, -6], ['e', 't_keep_e', 5, 0], ['s', 't_keep_s', 0, 2], ['w', 't_keep_w', -5, 1]])
  opening(F3, `o_keep3_win_${k}`, wk, x, z, 'window', 0.9, 1.6, win('four_pane', 'Lord\'s chamber window'));

// ---------------------------------------------------------------- roofs
// Independent gable roofs over the upper range rooms; base = F2 wall top.
const F2_TOP = 4.0 + 0.18 + 3.5;
const roofs = [
  { id: 'roof_north', label: 'Guest chambers & chapel roof', minX: -10, maxX: 10, minZ: -13.5, maxZ: -10, direction: 'x', edgeModes: { minX: 'flush', maxX: 'flush' } },
  { id: 'roof_east', label: 'Armory roof', minX: 10, maxX: 13.5, minZ: -10, maxZ: 10, direction: 'z', edgeModes: { minZ: 'flush', maxZ: 'flush' } },
  { id: 'roof_west', label: 'Garrison hall roof', minX: -13.5, maxX: -10, minZ: -10, maxZ: 10, direction: 'z', edgeModes: { minZ: 'flush', maxZ: 'flush' } }
];

// ---------------------------------------------------------------- recipes
const floorWalls = f => walls.filter(w => w.floorId === f);
const wallOp = w => ({ op: 'wall.add', floorId: w.floorId, id: w.id, value: { a: w.a, b: w.b, role: w.role, label: w.label, ...(w.height != null ? { height: w.height } : {}) } });

save('tx-1-levels.edit.json', [
  ...['wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'wall_7', 'wall_8', 'wall_9'].map(id => ({ op: 'wall.remove', floorId: F1, id })),
  ...['regions_10', 'regions_11', 'regions_12', 'regions_13'].map(id => ({ op: 'region.remove', floorId: F1, id })),
  { op: 'floor.update', id: F1, value: { label: 'Ground', wallHeight: 4.0 } },
  { op: 'floor.add-top', id: F2, aboveFloorId: F1, value: { label: 'Ramparts', wallHeight: 3.5, autoCeiling: false } },
  { op: 'floor.add-top', id: F3, aboveFloorId: F2, value: { label: 'Tower tops', wallHeight: 3.5, autoCeiling: false } },
  { op: 'floor.add-top', id: F4, aboveFloorId: F3, value: { label: 'Keep roof', wallHeight: 3.0, autoCeiling: false } },
  ...regions.map(r => ({ op: 'region.add', floorId: r.floorId, id: r.id, value: { label: r.label, minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, kind: r.kind, effect: r.effect } })),
  ...[F1, F2, F3, F4].flatMap(f => floorWalls(f).map(wallOp))
]);
save('tx-2-openings.edit.json', openings.map(o => {
  const { floorId, id, ...value } = o;
  return { op: 'opening.add', floorId, id, value };
}));
save('tx-3-stairs.edit.json', stairs.map(s => {
  const { floorId, id, ...value } = s;
  return { op: 'stair.add', floorId, id, value };
}));
save('tx-4-roofs.edit.json', roofs.flatMap(r => [
  { op: 'roof.add', id: r.id, value: { minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ } },
  { op: 'roof.update', id: r.id, value: { label: r.label, type: 'gable', direction: r.direction, baseY: F2_TOP, pitch: 30, overhang: 0.4, gableEnds: 'none', edgeModes: r.edgeModes } }
]));
console.log(`walls: ${walls.length}, openings: ${openings.length}, stairs: ${stairs.length}, regions: ${regions.length}`);

// ---------------------------------------------------------------- v2 review fix
// Visual review of v1 found that each tower's ground stair arrived in a pocket
// enclosed by its own stair hole and the upper flight, so the rampart-level
// tower rooms (and their wall-walk doors) had no route to either stair.
// Reverse both tower flights so each arrives in the open room, replace the
// tower-top hole guards, and guard the lower-level stair holes as well.
const fix = [];
const guardAdd = (floorId, id, a, b, label) => fix.push({ op: 'wall.add', floorId, id, value: { a: P(...a), b: P(...b), role: 'interior', label, height: GUARD } });
for (const [key, cx, cz, sx, sz] of [['nw', -14, -14, -1, -1], ['ne', 14, -14, 1, -1], ['se', 14, 14, 1, 1], ['sw', -14, 14, -1, 1]]) {
  const K = key.toUpperCase();
  fix.push({ op: 'stair.update', floorId: F1, id: `st_${key}_1`, value: { direction: sz < 0 ? 'south' : 'north' } });
  fix.push({ op: 'stair.update', floorId: F2, id: `st_${key}_2`, value: { direction: sx < 0 ? 'west' : 'east' } });
  fix.push({ op: 'wall.remove', floorId: F3, id: `t_${key}_holeguard_side` });
  fix.push({ op: 'wall.remove', floorId: F3, id: `t_${key}_holeguard_long` });
  // Tower top: guard the inner side and the low end of the F2 flight's hole.
  guardAdd(F3, `t_${key}_hole2_inner`, [cx + sx * 2.0, cz + sz * 1.95], [cx - sx * 2.85, cz + sz * 1.95], `${K} stair-hole guard`);
  guardAdd(F3, `t_${key}_hole2_end`, [cx - sx * 2.85, cz + sz * 1.95], [cx - sx * 2.85, cz + sz * 3.75], `${K} stair-hole guard`);
  // Rampart level: guard the room side of the ground flight's hole.
  guardAdd(F2, `r_${key}_hole1_side`, [cx + sx * 1.95, cz - sz * 2.5], [cx + sx * 1.95, cz + sz * 2.2], `${K} stair-hole guard`);
}
// Keep: guard the undercroft flight's hole on the great-chamber floor and the
// great-chamber flight's hole on the lord's-chamber floor. Move the west
// great-chamber window clear of the new guard.
guardAdd(F2, 'r_keep_hole1_e', [-3.05, -4.25], [-3.05, 1.1], 'Keep stair-hole guard');
guardAdd(F2, 'r_keep_hole1_s', [-3.05, 1.1], [-4.75, 1.1], 'Keep stair-hole guard');
guardAdd(F3, 't_keep_hole2_w', [3.05, -0.5], [3.05, -5.35], 'Keep stair-hole guard');
guardAdd(F3, 't_keep_hole2_n', [3.05, -5.35], [4.75, -5.35], 'Keep stair-hole guard');
{ const w = wallIndex['r_keep_w']; fix.push({ op: 'opening.update', floorId: F2, id: 'o_keep2_win_w', value: { t: r2((w.a.z - (-1.5)) / (w.a.z - w.b.z)) } }); }
save('tx-5-circulation.edit.json', fix);
