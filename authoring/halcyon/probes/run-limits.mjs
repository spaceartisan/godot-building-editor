// Limit probes for Building Studio: builds synthetic buildings through the CLI
// transaction code, then times `validate --reachability`, `export` and
// (optionally) `godot-check` on each, recording where things reject, warn,
// slow down or produce suspect geometry.
// Usage (from the editor root): node authoring/halcyon/probes/run-limits.mjs NEW_OUT_DIR [GODOT_BIN]
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { applyTransaction } from '../../../src/transactions.js';
import { prepareDocument } from '../../../src/diagnostics.js';
import { makeEmptyBuilding } from '../../../src/model.js';

const [out, godot] = process.argv.slice(2);
if (!out) { console.error('usage: run-limits.mjs NEW_OUT_DIR [GODOT_BIN]'); process.exit(2); }
if (existsSync(out)) { console.error(`${out} already exists; choose a new directory`); process.exit(2); }
mkdirSync(out, { recursive: true });

const blank = () => { const b = makeEmptyBuilding(); b.floors[0].id = 'floor_1'; return prepareDocument(b).building; };
const P = (x, z) => ({ x, z });
const W = (floorId, id, a, b, extra = {}) => ({ op: 'wall.add', floorId, id, value: { a: P(...a), b: P(...b), role: 'exterior', ...extra } });
const box = (floorId, p, x0, z0, x1, z1, role = 'exterior') => [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]
  .map(([a, b, c, d], i) => W(floorId, `${p}${i}`, [a, b], [c, d], { role }));
const ms = t0 => Math.round(Number(process.hrtime.bigint() - t0) / 1e6);

// Applies operations in chunks of <= 1000 (the transaction limit).
function build(ops, { chunk = 1000 } = {}) {
  // Warnings describe each chunk's final state, so only the last chunk's
  // warnings describe the finished building.
  let b = blank(), warnings = []; const t0 = process.hrtime.bigint();
  for (let i = 0; i < ops.length; i += chunk) {
    const r = applyTransaction(b, { version: 1, operations: ops.slice(i, i + chunk) });
    if (!r.ok) return { ok: false, errors: (r.errors || []).slice(0, 5).map(e => e.message || String(e)), ms: ms(t0) };
    warnings = (r.warnings || []).map(w => w.message || String(w)); b = r.building;
  }
  return { ok: true, building: b, warnings: warnings.slice(0, 6), ms: ms(t0) };
}
function cli(args) {
  const t0 = process.hrtime.bigint();
  try { const stdout = execFileSync(process.execPath, ['cli.mjs', ...args], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 600000 }); return { ok: true, ms: ms(t0), stdout }; }
  catch (e) { return { ok: false, ms: ms(t0), stdout: String(e.stdout || '') + String(e.stderr || '') }; }
}
const lines = (s, re) => s.split('\n').filter(l => re.test(l)).map(l => l.trim()).slice(0, 4);

const results = [];
function probe(name, note, ops, { route = true, godotCheck = false, inspect } = {}) {
  process.stdout.write(`${name} ... `);
  const r = build(ops); const row = { name, note, operations: ops.length, edit: { ok: r.ok, ms: r.ms, ...(r.ok ? { warnings: r.warnings } : { errors: r.errors }) } };
  if (r.ok) {
    const file = join(out, `${name}.building.json`); writeFileSync(file, JSON.stringify(r.building)); row.jsonBytes = statSync(file).size;
    const v = cli(['validate', file, ...(route ? ['--reachability'] : [])]);
    row.validate = { ok: v.ok, ms: v.ms, notes: lines(v.stdout, /WARNING|ERROR/) };
    const ex = cli(['export', file, '--out', join(out, `${name}-assets`), '--quiet']);
    row.export = { ok: ex.ok, ms: ex.ms, ...(ex.ok ? {} : { notes: lines(ex.stdout, /ERROR|FAIL|Error/) }) };
    if (ex.ok) {
      const scene = join(out, `${name}-assets`, `${r.building.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.tscn`);
      if (existsSync(scene)) { row.tscnBytes = statSync(scene).size; if (inspect) row.geometry = inspect(readFileSync(scene, 'utf8'), r.building); }
      if (godot && godotCheck) { const g = cli(['godot-check', '--assets', join(out, `${name}-assets`), '--godot', godot, '--require-collision']); row.godot = { ok: g.ok, ms: g.ms, notes: lines(g.stdout, /FAIL|ERROR|failures/) }; }
    }
  }
  results.push(row); console.log(r.ok ? `edit ${row.edit.ms} ms · validate ${row.validate.ms} ms · export ${row.export.ms} ms` : `rejected: ${row.edit.errors[0]}`);
}
// AABB of every exported mesh named like `pattern`, as [minX,minY,minZ,sizeX,sizeY,sizeZ].
const aabbs = (scene, pattern) => [...scene.matchAll(/\[sub_resource type="ArrayMesh" id="([^"]+)"\][\s\S]*?"aabb": AABB\(([^)]*)\)/g)].filter(m => pattern.test(m[1])).map(m => ({ id: m[1], box: m[2].split(',').map(Number) }));
const extent = (scene, pattern) => { const bs = aabbs(scene, pattern); if (!bs.length) return null; const x0 = Math.min(...bs.map(b => b.box[0])), z0 = Math.min(...bs.map(b => b.box[2])), x1 = Math.max(...bs.map(b => b.box[0] + b.box[3])), z1 = Math.max(...bs.map(b => b.box[2] + b.box[5])); return { minX: +x0.toFixed(3), maxX: +x1.toFixed(3), minZ: +z0.toFixed(3), maxZ: +z1.toFixed(3) }; };
const name = n => ({ op: 'building.update', value: { name: n } });

// ---------------------------------------------------------------- scale
// N x N grid of 4 m rooms on one floor. Grid lines are split at every
// crossing (walls may not cross), with a door from each room to its east
// and south neighbours.
function grid(N, cell = 4) {
  const ops = [name(`grid ${N}`)], half = (N * cell) / 2, X = i => i * cell - half;
  for (let j = 0; j <= N; j++) for (let i = 0; i < N; i++) ops.push(W('floor_1', `h${j}_${i}`, [X(i), X(j)], [X(i + 1), X(j)], { role: j === 0 || j === N ? 'exterior' : 'interior' }));
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) ops.push(W('floor_1', `v${i}_${j}`, [X(i), X(j)], [X(i), X(j + 1)], { role: i === 0 || i === N ? 'exterior' : 'interior' }));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (i < N - 1) ops.push({ op: 'opening.add', floorId: 'floor_1', id: `de${i}_${j}`, value: { type: 'door', wallId: `v${i + 1}_${j}`, t: 0.5, width: 0.9, height: 2.1, doorStyle: 'empty' } });
    if (j < N - 1) ops.push({ op: 'opening.add', floorId: 'floor_1', id: `ds${i}_${j}`, value: { type: 'door', wallId: `h${j + 1}_${i}`, t: 0.5, width: 0.9, height: 2.1, doorStyle: 'empty' } });
  }
  ops.push({ op: 'opening.add', floorId: 'floor_1', id: 'entry', value: { type: 'door', wallId: 'h0_0', t: 0.5, width: 0.9, height: 2.1, doorStyle: 'empty' } });
  return ops;
}
for (const N of [10, 20, 30, 40]) probe(`grid-${N}x${N}`, `${N * N} rooms, ${2 * N * (N + 1)} walls, ${2 * N * (N - 1) + 1} doorways`, grid(N), { godotCheck: N <= 20 });

// Tall stack: a 10 x 10 m box with a door on every floor.
function stack(n) {
  const ops = [name(`stack ${n}`), ...box('floor_1', 'w0_', -5, -5, 5, 5)];
  for (let k = 1; k < n; k++) { ops.push({ op: 'floor.add-top', id: `f${k}`, aboveFloorId: k === 1 ? 'floor_1' : `f${k - 1}` }); ops.push(...box(`f${k}`, `w${k}_`, -5, -5, 5, 5)); }
  ops.push({ op: 'opening.add', floorId: 'floor_1', id: 'entry', value: { type: 'door', wallId: 'w0_0', t: 0.5, width: 1, height: 2.1 } });
  return ops;
}
for (const n of [50, 100, 200]) probe(`stack-${n}`, `${n} floors of a 10 x 10 m box`, stack(n), { route: false, godotCheck: n === 100 });

// Many openings on one 100 m wall.
for (const n of [100, 300]) {
  const ops = [name(`windows ${n}`), ...box('floor_1', 'w', -50, -5, 50, 5)];
  for (let k = 0; k < n; k++) ops.push({ op: 'opening.add', floorId: 'floor_1', id: `o${k}`, value: { type: 'window', wallId: 'w0', t: (k + 0.5) / n, width: 100 / n * 0.6, height: 1.2, sill: 0.9 } });
  ops.push({ op: 'opening.add', floorId: 'floor_1', id: 'entry', value: { type: 'door', wallId: 'w2', t: 0.5, width: 1, height: 2.1 } });
  probe(`windows-${n}`, `${n} windows on one 100 m wall`, ops, { godotCheck: n === 300 });
}

// ---------------------------------------------------------------- geometry
// Acute exterior corner: triangle with apex angle theta at the origin. The
// exported wall shell should stay near the plan (no long miter spike).
for (const deg of [30, 10, 5, 1]) {
  const t = (deg * Math.PI) / 180, L = 20, C = [L * Math.cos(t), L * Math.sin(t)];
  const ops = [name(`acute ${deg}`), W('floor_1', 'a', [0, 0], [L, 0]), W('floor_1', 'b', [L, 0], C), W('floor_1', 'c', C, [0, 0])];
  probe(`acute-${deg}deg`, `triangle, ${deg} degree apex at the origin`, ops, { route: false, godotCheck: true, inspect: scene => ({ wallShell: extent(scene, /Exterior|Wall/i), plan: { minX: 0, maxX: L, minZ: 0, maxZ: +C[1].toFixed(3) } }) });
}
// Star junction: n interior walls meeting at the centre of a box.
for (const n of [8, 16]) {
  const ops = [name(`star ${n}`), ...box('floor_1', 'x', -10, -10, 10, 10)];
  for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n + Math.PI / n; ops.push(W('floor_1', `s${k}`, [0, 0], [+(6 * Math.cos(a)).toFixed(6), +(6 * Math.sin(a)).toFixed(6)], { role: 'interior' })); }
  probe(`star-${n}`, `${n} interior walls meeting at one point`, ops, { route: false, godotCheck: true });
}
// Thin and thick walls.
for (const th of [0.02, 2]) probe(`thickness-${th}`, `${th} m walls, 6 x 6 m room`, [{ op: 'building.update', value: { name: `thick ${th}`, wallThickness: th } }, ...box('floor_1', 'w', -3, -3, 3, 3)], { route: false, godotCheck: true });
// Far from the origin: Godot stores vertices as 32-bit floats.
for (const off of [1e3, 1e5, 1e6]) probe(`offset-${off}`, `10 x 10 m room centred at x = ${off}`, [name(`offset ${off}`), ...box('floor_1', 'w', off - 5, -5, off + 5, 5)], { route: false, godotCheck: true,
  inspect: scene => { const e = extent(scene, /Exterior|Wall/i); return { wallShell: e, expected: { minX: off - 5 - 0.09, maxX: off + 5 + 0.09 }, float32StepAtOffset: Math.pow(2, Math.floor(Math.log2(off)) - 23) }; } });
// Nearly coincident endpoints: a 1 mm and a 0.1 mm gap at one corner.
for (const gap of [0.001, 0.0001]) probe(`gap-${gap}`, `room whose last wall stops ${gap} m short of the first`, [name(`gap ${gap}`), W('floor_1', 'a', [0, 0], [8, 0]), W('floor_1', 'b', [8, 0], [8, 8]), W('floor_1', 'c', [8, 8], [0, 8]), W('floor_1', 'd', [0, 8], [0, gap])], { route: false });
// Polygon regions at the corner limit (solid region on a wall-less floor).
for (const n of [256, 257]) {
  const pts = Array.from({ length: n }, (_, k) => { const a = (2 * Math.PI * k) / n; return P(+(10 * Math.cos(a)).toFixed(6), +(10 * Math.sin(a)).toFixed(6)); });
  probe(`polygon-${n}`, `${n}-corner solid region as the only floor coverage`, [name(`polygon ${n}`), { op: 'region.add', floorId: 'floor_1', id: 'disc', value: { polygon: pts, effect: 'solid' } }], { route: false });
}
// Profiled loop with many segments (shaped walls, per-junction miters).
for (const n of [64, 128]) {
  const ops = [name(`profile ${n}`), { op: 'wallType.add', id: 'flare', value: { label: 'Flare', stations: [{ height: 0, offset: 0, thickness: 0.18 }, { height: 0.5, offset: -0.3, thickness: 0.18 }, { height: 1, offset: 0, thickness: 0.18 }] } }];
  const pts = Array.from({ length: n }, (_, k) => { const a = (2 * Math.PI * k) / n; return [+(12 * Math.cos(a)).toFixed(6), +(12 * Math.sin(a)).toFixed(6)]; });
  pts.forEach((p, k) => ops.push(W('floor_1', `p${k}`, p, pts[(k + 1) % n], { wallTypeId: 'flare', inwardToward: P(0, 0) })));
  probe(`profile-loop-${n}`, `${n}-segment circular loop of a flared profile`, ops, { route: false, godotCheck: true });
}
// Transaction size limit (applied as one transaction, not chunked).
{
  const r = applyTransaction(blank(), { version: 1, operations: Array.from({ length: 1001 }, (_, k) => ({ op: 'light.add', floorId: 'floor_1', id: `l${k}`, value: { position: { x: 0, y: 2, z: k / 100 } } })) });
  results.push({ name: 'ops-1001', note: '1001 operations in one transaction', operations: 1001, edit: { ok: r.ok, ...(r.ok ? {} : { errors: (r.errors || []).slice(0, 2).map(e => e.message || String(e)) }) } });
  console.log(`ops-1001 ... ${r.ok ? 'accepted' : `rejected: ${r.errors[0].message || r.errors[0]}`}`);
}
// Steep and long flights.
for (const [steps, run] of [[512, 1], [2, 10]]) probe(`stair-${steps}-steps-${run}m`, `stair with ${steps} steps over a ${run} m run, 3 m rise`, [name(`stair ${steps}`), ...box('floor_1', 'a', -8, -8, 8, 8), { op: 'floor.add-top', id: 'up', aboveFloorId: 'floor_1' }, ...box('up', 'b', -8, -8, 8, 8),
  { op: 'opening.add', floorId: 'floor_1', id: 'entry', value: { type: 'door', wallId: 'a0', t: 0.5, width: 1, height: 2.1 } },
  { op: 'stair.add', floorId: 'floor_1', id: 's', value: { x: 0, z: 0, width: 1.2, run, direction: 'north', style: 'steps', steps } }]);

writeFileSync(join(out, 'limits.json'), JSON.stringify({ node: process.version, godot: godot ? execFileSync(godot, ['--version'], { encoding: 'utf8' }).trim() : null, results }, null, 2) + '\n');
console.log(`Report: ${join(out, 'limits.json')}`);
