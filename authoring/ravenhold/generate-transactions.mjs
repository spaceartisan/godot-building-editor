// Generates the Ravenhold castle transaction recipes (format 1).
// Run from the editor root: node authoring/ravenhold/generate-transactions.mjs
// Writes tx-*.edit.json next to this script. Plan units are metres; north is -Z.
// The whole castle is authored through supported transactions applied to
// `node cli.mjs new`: no hand-written JSON edits.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const F1 = 'floor_1', F2 = 'f2_ramparts', F3 = 'f3_towertops', F4 = 'f4_keeproof';
const PARAPET = 1.7, CRENEL = { crenelWidth: 0.8, merlonWidth: 1.0, depth: 0.7 };
const r3 = v => Math.round(v * 1000) / 1000;
const P = (x, z) => ({ x: r3(x), z: r3(z) });
const TOWERS = [['nw', -14, -14, -1, -1], ['ne', 14, -14, 1, -1], ['se', 14, 14, 1, 1], ['sw', -14, 14, -1, 1]];

function save(name, operations) {
  writeFileSync(join(here, name), JSON.stringify({ version: 1, operations }, null, 2) + '\n');
  console.log(`${name}: ${operations.length} operations`);
}

// ---------------------------------------------------------------- walls
const walls = [], wallIndex = {}, crenellate = [];
function wall(floorId, key, a, b, role, label = '', height = null) {
  const id = `${{ [F1]: 'g', [F2]: 'r', [F3]: 't', [F4]: 'k' }[floorId]}_${key}`;
  if (wallIndex[id]) throw new Error(`duplicate wall ${id}`);
  const w = { floorId, id, a: P(...a), b: P(...b), role, label, height };
  walls.push(w); wallIndex[id] = w;
  return w;
}
// A crenellated parapet is one wall plus wall.crenellate.
function parapet(floorId, key, a, b, label) {
  const w = wall(floorId, key, a, b, 'exterior', label, PARAPET);
  crenellate.push({ op: 'wall.crenellate', floorId, id: w.id, value: { ...CRENEL } });
}
function parapetLoop(floorId, key, minX, maxX, minZ, maxZ, label) {
  parapet(floorId, `${key}_n`, [minX, minZ], [maxX, minZ], `${label} N`);
  parapet(floorId, `${key}_e`, [maxX, minZ], [maxX, maxZ], `${label} E`);
  parapet(floorId, `${key}_s`, [maxX, maxZ], [minX, maxZ], `${label} S`);
  parapet(floorId, `${key}_w`, [minX, maxZ], [minX, minZ], `${label} W`);
}
const loop4 = (floorId, key, pts, label, height = null) => ['n', 'e', 's', 'w'].forEach((s, i) => wall(floorId, `${key}_${s}`, pts[i], pts[(i + 1) % 4], 'exterior', label, height));

// Ground floor: outer loop, courtyard loop, keep loop; interior dividers.
const outer = [
  [-18, -18], [-10, -18], [-10, -16], [10, -16], [10, -18], [18, -18], [18, -10], [16, -10],
  [16, 10], [18, 10], [18, 18], [10, 18], [10, 16], [6, 16], [6, 20], [-6, 20], [-6, 16],
  [-10, 16], [-10, 18], [-18, 18], [-18, 10], [-16, 10], [-16, -10], [-18, -10]
];
outer.forEach((p, i) => wall(F1, `outer${String(i + 1).padStart(2, '0')}`, p, outer[(i + 1) % outer.length], 'exterior', 'Curtain'));
loop4(F1, 'court', [[-10, -10], [10, -10], [10, 10], [-10, 10]], 'Courtyard face');
const keep = [[-5, -6], [5, -6], [5, 2], [-5, 2]];
loop4(F1, 'keep', keep, 'Keep');
for (const [key, a, b, label] of [
  ['nw_e', [-10, -16], [-10, -10], 'NW tower / hall'], ['nw_s', [-16, -10], [-10, -10], 'NW tower / storehouse'],
  ['ne_w', [10, -16], [10, -10], 'NE tower / hall'], ['ne_s', [10, -10], [16, -10], 'NE tower / barracks'],
  ['se_w', [10, 10], [10, 16], 'SE tower / store'], ['se_n', [10, 10], [16, 10], 'SE tower / barracks'],
  ['sw_e', [-10, 10], [-10, 16], 'SW tower / store'], ['sw_n', [-16, 10], [-10, 10], 'SW tower / stables'],
  ['gate_w', [-2, 10], [-2, 20], 'Gate tunnel W'], ['gate_e', [2, 10], [2, 20], 'Gate tunnel E'],
  ['guard_w', [-6, 10], [-6, 16], 'Guard room / store W'], ['guard_e', [6, 10], [6, 16], 'Guard room / store E'],
  ['east_part', [10, 0], [16, 0], 'Barracks partition'], ['west_part', [-16, 0], [-10, 0], 'Stables partition']
]) wall(F1, key, a, b, 'interior', label);

// Ramparts: tower loops (inner-corner pieces become interior where an upper
// range room abuts them), upper range rooms, winch room, keep, parapets.
for (const [key, cx, cz, sx, sz] of TOWERS) {
  const K = `${key.toUpperCase()} tower`, ix = cx - sx * 4, iz = cz - sz * 4, ox = cx + sx * 4, oz = cz + sz * 4, splitX = cx - sx * 0.5, splitZ = cz - sz * 0.5;
  wall(F2, `${key}_ox`, [ox, iz], [ox, oz], 'exterior', K);
  wall(F2, `${key}_oz`, [ox, oz], [ix, oz], 'exterior', K);
  // North towers: inner-x wall is split where the upper range room begins; south towers face the south walk throughout.
  wall(F2, `${key}_ix_ext`, [ix, oz], sz < 0 ? [ix, splitZ] : [ix, iz], 'exterior', K);
  wall(F2, `${key}_iz_ext`, [splitX, iz], [ox, iz], 'exterior', K);
}
for (const [key, a, b, label] of [
  ['nw_ix_int', [-10, -13.5], [-10, -10], 'NW tower / guest chambers'], ['ne_ix_int', [10, -13.5], [10, -10], 'NE tower / chapel'],
  ['nw_iz_int', [-13.5, -10], [-10, -10], 'NW tower / garrison hall'], ['ne_iz_int', [10, -10], [13.5, -10], 'NE tower / armory'],
  ['sw_iz_int', [-13.5, 10], [-10, 10], 'SW tower / garrison hall'], ['se_iz_int', [10, 10], [13.5, 10], 'SE tower / armory'],
  ['north_part', [0, -13.5], [0, -10], 'Guest chambers / chapel']
]) wall(F2, key, a, b, 'interior', label);
for (const [key, a, b, label] of [
  ['north_walk', [-10, -13.5], [10, -13.5], 'Guest chambers / wall walk'], ['north_court', [10, -10], [-10, -10], 'Guest chambers / courtyard'],
  ['east_walk', [13.5, -10], [13.5, 10], 'Armory / wall walk'], ['east_court', [10, 10], [10, -10], 'Armory / courtyard'],
  ['west_walk', [-13.5, 10], [-13.5, -10], 'Garrison hall / wall walk'], ['west_court', [-10, -10], [-10, 10], 'Garrison hall / courtyard']
]) wall(F2, key, a, b, 'exterior', label);
loop4(F2, 'gh', [[-6, 10], [6, 10], [6, 20], [-6, 20]], 'Winch room');
loop4(F2, 'keep', keep, 'Keep');
parapet(F2, 'par_n', [-10, -16], [10, -16], 'North parapet');
parapet(F2, 'par_e', [16, -10], [16, 10], 'East parapet');
parapet(F2, 'par_w', [-16, 10], [-16, -10], 'West parapet');
parapet(F2, 'par_sw', [-10, 16], [-6, 16], 'South-west parapet');
parapet(F2, 'par_se', [6, 16], [10, 16], 'South-east parapet');

// Tower tops, gatehouse top and keep lord's chamber; keep roof.
for (const [key, cx, cz] of TOWERS) parapetLoop(F3, key, cx - 4, cx + 4, cz - 4, cz + 4, `${key.toUpperCase()} tower top`);
parapetLoop(F3, 'gh', -6, 6, 10, 20, 'Gatehouse top');
loop4(F3, 'keep', keep, 'Keep');
parapetLoop(F4, 'keep', -5, 5, -6, 2, 'Keep roof');

// ---------------------------------------------------------------- stairs and guards
const stairs = [], railings = [];
const rail = (floorId, id, a, b, label) => railings.push({ floorId, id, value: { a: P(...a), b: P(...b), label, height: 1.0, style: 'picket' } });
for (const [key, cx, cz, sx, sz] of TOWERS) {
  const K = key.toUpperCase();
  // Ground -> ramparts along the outer-x wall, arriving in the open room.
  stairs.push({ floorId: F1, id: `st_${key}_1`, label: `${K} tower stair (ground)`, x: cx + sx * 2.9, z: cz, width: 1.2, run: 5.0, direction: sz < 0 ? 'south' : 'north', style: 'steps', steps: 24 });
  // Ramparts -> roof along the outer-z wall, starting from the room side.
  stairs.push({ floorId: F2, id: `st_${key}_2`, label: `${K} tower stair (roof)`, x: cx - sx * 0.25, z: cz + sz * 2.9, width: 1.2, run: 4.5, direction: sx < 0 ? 'west' : 'east', style: 'steps', steps: 21 });
  rail(F2, `rl_${key}_hole1`, [cx + sx * 2.1, cz - sz * 2.5], [cx + sx * 2.1, cz + sz * 2.2], `${K} stair-hole railing`);
  rail(F3, `rl_${key}_hole2_inner`, [cx + sx * 2.0, cz + sz * 2.1], [cx - sx * 2.7, cz + sz * 2.1], `${K} stair-hole railing`);
  rail(F3, `rl_${key}_hole2_end`, [cx - sx * 2.7, cz + sz * 2.1], [cx - sx * 2.7, cz + sz * 3.7], `${K} stair-hole railing`);
}
stairs.push({ floorId: F1, id: 'st_court_w', label: 'Courtyard stair west', x: -8, z: 7, width: 1.6, run: 6, direction: 'south', style: 'steps', steps: 24 });
stairs.push({ floorId: F1, id: 'st_court_e', label: 'Courtyard stair east', x: 8, z: 7, width: 1.6, run: 6, direction: 'south', style: 'steps', steps: 24 });
stairs.push({ floorId: F2, id: 'st_gate', label: 'Gatehouse stair', x: 0, z: 18.9, width: 1.2, run: 4.5, direction: 'east', style: 'steps', steps: 21 });
stairs.push({ floorId: F1, id: 'st_keep_1', label: 'Keep stair (undercroft)', x: -4.0, z: -1.75, width: 1.2, run: 5.0, direction: 'north', style: 'steps', steps: 24 });
stairs.push({ floorId: F2, id: 'st_keep_2', label: 'Keep stair (great chamber)', x: 4.0, z: -2.75, width: 1.2, run: 4.5, direction: 'south', style: 'steps', steps: 21 });
stairs.push({ floorId: F3, id: 'st_keep_3', label: 'Keep stair (lord\'s chamber)', x: -4.0, z: -2.0, width: 1.2, run: 4.5, direction: 'north', style: 'steps', steps: 21 });
rail(F3, 'rl_gh_side', [-2.45, 19.7], [-2.45, 18.1], 'Gatehouse stair-hole railing');
rail(F3, 'rl_gh_long', [-2.45, 18.1], [2.25, 18.1], 'Gatehouse stair-hole railing');
rail(F2, 'rl_keep_hole1_e', [-3.2, -4.25], [-3.2, 0.95], 'Keep stair-hole railing');
rail(F2, 'rl_keep_hole1_s', [-3.2, 0.95], [-4.7, 0.95], 'Keep stair-hole railing');
rail(F3, 'rl_keep_hole2_w', [3.2, -0.5], [3.2, -5.2], 'Keep stair-hole railing');
rail(F3, 'rl_keep_hole2_n', [3.2, -5.2], [4.7, -5.2], 'Keep stair-hole railing');
rail(F4, 'rl_keep_hole3_e', [-3.2, -4.25], [-3.2, 0.5], 'Keep stair-hole railing');
rail(F4, 'rl_keep_hole3_s', [-3.2, 0.5], [-4.7, 0.5], 'Keep stair-hole railing');
// Courtyard edge of the short south walks, open where the courtyard stairs arrive.
for (const side of [-1, 1]) {
  const k = side < 0 ? 'sw' : 'se';
  rail(F2, `rl_walk_${k}_a`, [side * 9.7, 10.3], [side * 8.9, 10.3], 'South walk courtyard railing');
  rail(F2, `rl_walk_${k}_b`, [side * 7.1, 10.3], [side * 6.3, 10.3], 'South walk courtyard railing');
}

// ---------------------------------------------------------------- regions
const regions = [];
const region = (floorId, id, label, minX, maxX, minZ, maxZ, kind, effect) => regions.push({ floorId, id, value: { label, minX, maxX, minZ, maxZ, kind, effect } });
region(F1, 'cov_core', 'Castle ground', -16, 16, -16, 16, 'wing', 'solid');
for (const [key, cx, cz] of TOWERS) region(F1, `cov_${key}`, `${key.toUpperCase()} tower base`, cx - 4, cx + 4, cz - 4, cz + 4, 'room', 'solid');
region(F1, 'cov_gate', 'Gatehouse front', -6, 6, 16, 20, 'room', 'solid');
for (const [id, label, b, kind = 'room'] of [
  ['lbl_hall', 'Great hall', [-10, 10, -16, -10]], ['lbl_barr_n', 'Barracks north', [10, 16, -10, 0]], ['lbl_barr_s', 'Barracks south', [10, 16, 0, 10]],
  ['lbl_store', 'Storehouse', [-16, -10, -10, 0]], ['lbl_stables', 'Stables', [-16, -10, 0, 10]], ['lbl_court', 'Courtyard', [-10, 10, -10, 10], 'courtyard'],
  ['lbl_tunnel', 'Gate tunnel', [-2, 2, 10, 20]], ['lbl_guard_w', 'West guard room', [-6, -2, 10, 20]], ['lbl_guard_e', 'East guard room', [2, 6, 10, 20]],
  ['lbl_undercroft', 'Keep undercroft', [-5, 5, -6, 2]]
]) region(F1, id, label, ...b, kind, 'label');
for (const [id, label, b, kind] of [
  ['cov_n', 'North range', [-10, 10, -16, -10], 'wing'], ['cov_e', 'East range', [10, 16, -10, 10], 'wing'], ['cov_w', 'West range', [-16, -10, -10, 10], 'wing'],
  ['cov_s_w', 'South-west walk', [-10, -6, 10, 16], 'wing'], ['cov_s_e', 'South-east walk', [6, 10, 10, 16], 'wing'],
  ['cov_gate', 'Winch room', [-6, 6, 10, 20], 'room'], ['cov_keep', 'Great chamber', [-5, 5, -6, 2], 'room']
]) region(F2, id, label, ...b, kind, 'solid');
for (const [key, cx, cz] of TOWERS) region(F2, `cov_${key}`, `${key.toUpperCase()} tower`, cx - 4, cx + 4, cz - 4, cz + 4, 'room', 'solid');
for (const [id, label, b, kind] of [
  ['lbl_walk_n', 'North wall walk', [-10, 10, -16, -13.5], 'bay'], ['lbl_walk_e', 'East wall walk', [13.5, 16, -10, 10], 'bay'], ['lbl_walk_w', 'West wall walk', [-16, -13.5, -10, 10], 'bay'],
  ['lbl_guest', 'Guest chambers', [-10, 0, -13.5, -10], 'room'], ['lbl_chapel', 'Chapel', [0, 10, -13.5, -10], 'room'],
  ['lbl_armory', 'Armory', [10, 13.5, -10, 10], 'room'], ['lbl_garrison', 'Garrison hall', [-13.5, -10, -10, 10], 'room']
]) region(F2, id, label, ...b, kind, 'label');
for (const [key, cx, cz] of TOWERS) region(F3, `cov_${key}`, `${key.toUpperCase()} tower top`, cx - 4, cx + 4, cz - 4, cz + 4, 'room', 'solid');
region(F3, 'cov_gate', 'Gatehouse top', -6, 6, 10, 20, 'room', 'solid');
region(F3, 'cov_keep', 'Lord\'s chamber', -5, 5, -6, 2, 'room', 'solid');
region(F4, 'cov_keep', 'Keep roof', -5, 5, -6, 2, 'room', 'solid');

// ---------------------------------------------------------------- openings (world-point placement)
const openings = [];
function opening(floorId, id, wallKey, x, z, type, width, height, extra = {}) {
  if (!wallIndex[wallKey]) throw new Error(`missing wall ${wallKey}`);
  openings.push({ op: 'opening.add', floorId, id, value: { type, wallId: wallKey, at: P(x, z), width, height, ...extra } });
}
const door = (style, label) => ({ doorStyle: style, label });
const slit = label => ({ windowStyle: 'empty', sill: 1.3, label });
const win = (style, label, sill = 1.0) => ({ windowStyle: style, sill, label });
const mid = key => { const w = wallIndex[key]; return [(w.a.x + w.b.x) / 2, (w.a.z + w.b.z) / 2]; };
opening(F1, 'o_gate_outer', 'g_outer15', 0, 20, 'door', 3.0, 3.6, door('empty', 'Outer gate'));
opening(F1, 'o_gate_inner', 'g_court_s', 0, 10, 'door', 3.0, 3.6, door('empty', 'Inner gate'));
opening(F1, 'o_guard_w', 'g_gate_w', -2, 15, 'door', 1.0, 2.2, door('room', 'West guard room door'));
opening(F1, 'o_guard_e', 'g_gate_e', 2, 15, 'door', 1.0, 2.2, door('room', 'East guard room door'));
opening(F1, 'o_store_w', 'g_guard_w', -6, 13, 'door', 1.0, 2.2, door('room', 'South-west store door'));
opening(F1, 'o_store_e', 'g_guard_e', 6, 13, 'door', 1.0, 2.2, door('room', 'South-east store door'));
for (const x of [-4, 4]) opening(F1, `o_slit_g${x < 0 ? 'w' : 'e'}`, 'g_outer15', x, 20, 'window', 0.3, 1.2, slit('Guard slit'));
opening(F1, 'o_hall', 'g_court_n', 0, -10, 'door', 2.0, 3.0, door('exterior', 'Great hall door'));
for (const x of [-7, -3.5, 3.5, 7]) opening(F1, `o_hall_win_${x < 0 ? 'w' : 'e'}${String(Math.abs(x)).replace('.', '_')}`, 'g_court_n', x, -10, 'window', 1.1, 2.0, win('four_pane', 'Hall window', 1.2));
for (const x of [-6, -2, 2, 6]) opening(F1, `o_hall_slit_${x < 0 ? 'w' : 'e'}${Math.abs(x)}`, 'g_outer03', x, -16, 'window', 0.3, 1.4, slit('Hall arrow slit'));
opening(F1, 'o_barr_n', 'g_court_e', 10, -5, 'door', 1.2, 2.4, door('exterior', 'Barracks north door'));
opening(F1, 'o_barr_s', 'g_court_e', 10, 5, 'door', 1.2, 2.4, door('exterior', 'Barracks south door'));
opening(F1, 'o_barr_mid', 'g_east_part', 13, 0, 'door', 1.0, 2.2, door('room', 'Barracks connecting door'));
for (const z of [-5, 5]) opening(F1, `o_barr_slit_${z < 0 ? 'n' : 's'}`, 'g_outer08', 16, z, 'window', 0.3, 1.4, slit('Barracks slit'));
opening(F1, 'o_stables', 'g_court_w', -10, 5, 'door', 2.4, 3.0, door('empty', 'Stable doorway'));
opening(F1, 'o_storehouse', 'g_court_w', -10, -5, 'door', 1.4, 2.6, door('exterior', 'Storehouse door'));
opening(F1, 'o_stables_mid', 'g_west_part', -13, 0, 'door', 1.0, 2.2, door('room', 'Stables/storehouse door'));
for (const z of [-5, 5]) opening(F1, `o_west_slit_${z < 0 ? 'n' : 's'}`, 'g_outer22', -16, z, 'window', 0.3, 1.4, slit('West range slit'));
for (const [id, key, x, z, label] of [
  ['o_nw_hall', 'g_nw_e', -10, -13, 'Hall to NW tower'], ['o_ne_hall', 'g_ne_w', 10, -13, 'Hall to NE tower'],
  ['o_nw_store', 'g_nw_s', -13, -10, 'Storehouse to NW tower'], ['o_ne_barr', 'g_ne_s', 13, -10, 'Barracks to NE tower'],
  ['o_se_barr', 'g_se_n', 13, 10, 'Barracks to SE tower'], ['o_sw_stab', 'g_sw_n', -13, 10, 'Stables to SW tower']
]) opening(F1, id, key, x, z, 'door', 1.0, 2.2, door('room', label));
opening(F1, 'o_keep_door', 'g_keep_s', 0, 2, 'door', 1.6, 2.6, door('exterior', 'Keep door'));
for (const [k, key, x, z] of [['n', 'g_keep_n', 0, -6], ['e', 'g_keep_e', 5, -2], ['w', 'g_keep_w', -5, 1]]) opening(F1, `o_keep_slit_${k}`, key, x, z, 'window', 0.3, 1.2, slit('Undercroft slit'));
for (const [k, keys] of [['nw', ['g_outer01', 'g_outer24']], ['ne', ['g_outer05', 'g_outer06']], ['se', ['g_outer10', 'g_outer11']], ['sw', ['g_outer19', 'g_outer20']]])
  for (const key of keys) opening(F1, `o_${k}_slit_${key.slice(-2)}`, key, ...mid(key), 'window', 0.3, 1.4, slit(`${k.toUpperCase()} tower slit`));
for (const [k, cx, cz, sx, sz] of TOWERS) {
  opening(F2, `o_${k}_walk_ew`, `r_${k}_iz_ext`, sx * 14.75, cz - sz * 4, 'door', 1.1, 2.2, door('exterior', `${k.toUpperCase()} tower to side walk`));
  opening(F2, `o_${k}_walk_ns`, `r_${k}_ix_ext`, cx - sx * 4, sz < 0 ? -14.75 : 13, 'door', 1.1, 2.2, door('exterior', `${k.toUpperCase()} tower to ${sz < 0 ? 'north' : 'south'} walk`));
  for (const key of [`r_${k}_ox`, `r_${k}_oz`]) opening(F2, `o_${k}_slit2_${key.slice(-2)}`, key, ...mid(key), 'window', 0.3, 1.4, slit(`${k.toUpperCase()} tower slit`));
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
  const k = z < 0 ? 'n' : z > 0 ? 's' : 'c';
  opening(F2, `o_armory_win_${k}`, 'r_east_court', 10, z, 'window', 1.0, 1.4, win('double_hung', 'Armory window'));
  opening(F2, `o_garrison_win_${k}`, 'r_west_court', -10, z, 'window', 1.0, 1.4, win('double_hung', 'Garrison window'));
}
opening(F2, 'o_winch_w', 'r_gh_w', -6, 13, 'door', 1.1, 2.2, door('exterior', 'Winch room west door'));
opening(F2, 'o_winch_e', 'r_gh_e', 6, 13, 'door', 1.1, 2.2, door('exterior', 'Winch room east door'));
for (const x of [-4.5, 4.5]) opening(F2, `o_winch_slit_${x < 0 ? 'w' : 'e'}`, 'r_gh_s', x, 20, 'window', 0.3, 1.2, slit('Winch room slit'));
opening(F2, 'o_winch_court', 'r_gh_n', 0, 10, 'window', 1.2, 1.2, win('four_pane', 'Winch room courtyard window'));
for (const [k, key, x, z] of [['n', 'r_keep_n', -1, -6], ['e', 'r_keep_e', 5, 0.5], ['s', 'r_keep_s', 0, 2], ['w', 'r_keep_w', -5, -1.5]])
  opening(F2, `o_keep2_win_${k}`, key, x, z, 'window', 0.9, 1.6, win('four_pane', 'Great chamber window'));
for (const [k, key, x, z] of [['n', 't_keep_n', 1, -6], ['e', 't_keep_e', 5, 0], ['s', 't_keep_s', 0, 2], ['w', 't_keep_w', -5, 1]])
  opening(F3, `o_keep3_win_${k}`, key, x, z, 'window', 0.9, 1.6, win('four_pane', 'Lord\'s chamber window'));

// ---------------------------------------------------------------- recipes
const byFloor = f => walls.filter(w => w.floorId === f);
const wallOp = w => ({ op: 'wall.add', floorId: w.floorId, id: w.id, value: { a: w.a, b: w.b, role: w.role, label: w.label, ...(w.height != null ? { height: w.height } : {}) } });
// Upper range rooms are roofed independently at the rampart wall top (4.18 + 3.5).
const F2_TOP = 4.0 + 0.18 + 3.5;
const roof = (id, label, minX, maxX, minZ, maxZ, direction, edgeModes) => ({ op: 'roof.add', id, value: { minX, maxX, minZ, maxZ, label, type: 'gable', direction, baseY: F2_TOP, pitch: 30, overhang: 0.4, gableEnds: 'none', edgeModes } });

save('tx-1-structure.edit.json', [
  { op: 'building.update', value: { name: 'Ravenhold Castle', wallThickness: 0.5, roof: { type: 'none', overhang: 0 } } },
  { op: 'floor.update', id: F1, value: { label: 'Ground', wallHeight: 4.0, autoCeiling: false } },
  { op: 'floor.add-top', id: F2, aboveFloorId: F1, value: { label: 'Ramparts', wallHeight: 3.5, autoCeiling: false } },
  { op: 'floor.add-top', id: F3, aboveFloorId: F2, value: { label: 'Tower tops', wallHeight: 3.5, autoCeiling: false } },
  { op: 'floor.add-top', id: F4, aboveFloorId: F3, value: { label: 'Keep roof', wallHeight: 3.0, autoCeiling: false } },
  ...regions.map(r => ({ op: 'region.add', ...r })),
  ...[F1, F2, F3, F4].flatMap(f => byFloor(f).map(wallOp))
]);
save('tx-2-openings.edit.json', [...openings, ...crenellate]);
save('tx-3-circulation.edit.json', [
  ...stairs.map(({ floorId, id, ...value }) => ({ op: 'stair.add', floorId, id, value })),
  ...railings.map(r => ({ op: 'railing.add', ...r }))
]);
save('tx-4-roofs.edit.json', [
  roof('roof_north', 'Guest chambers & chapel roof', -10, 10, -13.5, -10, 'x', { minX: 'flush', maxX: 'flush' }),
  roof('roof_east', 'Armory roof', 10, 13.5, -10, 10, 'z', { minZ: 'flush', maxZ: 'flush' }),
  roof('roof_west', 'Garrison hall roof', -13.5, -10, -10, 10, 'z', { minZ: 'flush', maxZ: 'flush' })
]);
console.log(`walls: ${walls.length}, openings: ${openings.length}, crenellated walls: ${crenellate.length}, stairs: ${stairs.length}, railings: ${railings.length}, regions: ${regions.length}`);
