// Runs reachability.gd against an exported asset directory.
// Usage: node authoring/ravenhold/probe/run-reachability.mjs ASSET_DIR GODOT_BIN OUT_JSON
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [assets, godot, out] = process.argv.slice(2);
if (!assets || !godot || !out || fs.existsSync(out)) { console.error('usage: run-reachability.mjs ASSET_DIR GODOT_BIN NEW_OUT_JSON'); process.exit(2); }

// World targets per floor (elevations 0 / 4.18 / 7.86 / 11.54). Start inside the gate tunnel.
const Y = [0, 4.18, 7.86, 11.54];
const T = (name, x, f, z) => ({ name, at: [x, Y[f], z] });
const targets = [
  T('Courtyard', 0, 0, 6), T('Great hall', 0, 0, -13), T('Barracks north', 13, 0, -5), T('Barracks south', 13, 0, 5),
  T('Storehouse', -13, 0, -5), T('Stables', -13, 0, 5), T('West guard room', -4, 0, 15), T('East guard room', 4, 0, 15),
  T('South-west store', -8, 0, 13), T('South-east store', 8, 0, 13), T('Keep undercroft', 1, 0, -2),
  T('NW tower ground', -13, 0, -13), T('NE tower ground', 13, 0, -13), T('SE tower ground', 13, 0, 13), T('SW tower ground', -13, 0, 13),
  T('North wall walk', 0, 1, -14.75), T('East wall walk', 14.75, 1, 0), T('West wall walk', -14.75, 1, 0),
  T('South-west walk', -8, 1, 13), T('South-east walk', 8, 1, 13), T('Guest chambers', -5, 1, -11.75), T('Chapel', 5, 1, -11.75),
  T('Armory', 11.75, 1, 0), T('Garrison hall', -11.75, 1, 0), T('Winch room', 3, 1, 14), T('Keep great chamber', 1, 1, -2),
  T('NW tower rampart room', -13, 1, -13), T('NE tower rampart room', 13, 1, -13), T('SE tower rampart room', 13, 1, 13), T('SW tower rampart room', -13, 1, 13),
  T('NW tower top', -14, 2, -13), T('NE tower top', 14, 2, -13), T('SE tower top', 14, 2, 13), T('SW tower top', -14, 2, 13),
  T('Gatehouse top', 0, 2, 14), T('Keep lord\'s chamber', 0, 2, -2), T('Keep roof', 1, 3, -2)
];
// Route legs: a nearby destination must not require a long detour.
const L = (name, from, to, maxLength) => ({ name, from: from.at, at: to.at, maxLength });
const byName = Object.fromEntries(targets.map(t => [t.name, t]));
for (const k of ['NW', 'NE', 'SE', 'SW']) {
  targets.push(L(`${k} rampart room -> ${k} tower top`, byName[`${k} tower rampart room`], byName[`${k} tower top`], 20));
  targets.push(L(`${k} rampart room -> ${k} tower ground`, byName[`${k} tower rampart room`], byName[`${k} tower ground`], 20));
}
targets.push(L('Winch room -> gatehouse top', byName['Winch room'], byName['Gatehouse top'], 20));
targets.push(L('Keep undercroft -> keep roof', byName['Keep undercroft'], byName['Keep roof'], 50));
const cfg = { scene: null, start: [0, 0, 17], agent: { radius: 0.3, height: 1.8, max_climb: 0.3, max_slope: 46 }, targets };
cfg.scene = fs.readdirSync(assets).find(f => f.endsWith('.tscn'));
if (!cfg.scene) { console.error('no building .tscn in asset dir'); process.exit(3); }

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'building-reach-'));
try {
  fs.cpSync(assets, path.join(temp, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(here, 'reachability.gd'), path.join(temp, 'reachability.gd'));
  fs.writeFileSync(path.join(temp, 'targets.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(temp, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Reachability probe"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
  // First run imports resources; the scene uses only built-in resources, so one run suffices.
  const r = spawnSync(godot, ['--headless', '--path', temp, '--script', 'reachability.gd'], { encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const line = (r.stdout || '').split('\n').find(l => l.startsWith('REACHABILITY_JSON '));
  if (!line) { console.error(r.stdout, r.stderr); process.exit(3); }
  if (!/"navPolygons":[1-9]/.test(line)) { console.error('probe setup failed:\n' + r.stdout + r.stderr); process.exit(3); }
  const report = { engine: spawnSync(godot, ['--headless', '--version'], { encoding: 'utf8' }).stdout.trim(), ...JSON.parse(line.slice(18)) };
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  for (const t of report.results) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.maxLength && t.ok ? ` (${t.pathLength.toFixed(1)} m)` : ''}${t.ok ? '' : `  (floorCovered=${t.floorCovered} pathArrives=${t.pathArrives} length=${t.pathLength.toFixed(1)}${t.maxLength ? ` max=${t.maxLength}` : ''})`}`);
  console.log(`unreachable: ${report.unreachable} / ${report.results.length}; nav polygons ${report.navPolygons}; door panels removed ${report.doorPanelsRemoved}`);
  process.exit(report.unreachable ? 1 : 0);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
