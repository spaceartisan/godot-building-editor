import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportGodotFiles } from './src/exporter.js';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';

// Halcyon scale fixes: wall-union clipping skips solids by plan bounds and
// join offsets are cached per exported floor view. Neither may go stale when
// the web editor edits its live building in place and exports it again.
for (const file of ['examples/angled_partitions.building.json', 'examples/farmhouse.building.json', 'examples/shaped_walls.building.json']) {
  const live = JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
  exportGodotFiles(live); exportGodotFiles(live, { collision: false });
  const wall = live.floors[0].walls.find(w => w.role === 'interior') || live.floors[0].walls[0];
  wall.b = { x: wall.b.x + 0.37, z: wall.b.z + 0.21 };
  assert.equal(exportGodotFiles(live).tscn, exportGodotFiles(structuredClone(live)).tscn, `${file}: re-export after an in-place edit matches a fresh export`);
}
console.log('PASS export caches: in-place edits re-export exactly like a fresh copy');

// A 12 x 12 grid of rooms (312 walls): every interior wall still gets its own
// faces, and the grid exports with the same shells as a single room does.
{
  const b0 = makeEmptyBuilding(); b0.floors[0].id = 'floor_1';
  const N = 12, X = i => i * 4 - 24, ops = [{ op: 'building.update', value: { roof: { type: 'flat' } } }];
  const W = (id, a, b, role) => ({ op: 'wall.add', floorId: 'floor_1', id, value: { a: { x: a[0], z: a[1] }, b: { x: b[0], z: b[1] }, role } });
  for (let j = 0; j <= N; j++) for (let i = 0; i < N; i++) ops.push(W(`h${j}_${i}`, [X(i), X(j)], [X(i + 1), X(j)], j % N ? 'interior' : 'exterior'));
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) ops.push(W(`v${i}_${j}`, [X(i), X(j)], [X(i), X(j + 1)], i % N ? 'interior' : 'exterior'));
  const r = applyTransaction(prepareDocument(b0).building, { version: 1, operations: ops }); assert.equal(r.ok, true, JSON.stringify(r.errors));
  const t0 = Date.now(), scene = exportGodotFiles(r.building).tscn, ms = Date.now() - t0;
  for (const shell of ['OutsideFaces', 'InsideFaces', 'SideAFaces', 'SideBFaces', 'EdgeFaces']) assert.match(scene, new RegExp(`name="${shell}"`));
  console.log(`PASS 12 x 12 room grid (${ops.length - 1} walls) exports in ${ms} ms with all wall shells`);
}
