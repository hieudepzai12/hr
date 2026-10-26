import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { NAV_GROUPS, visibleNavigation, flattenNavigation, navigationActive } from '../src/lib/navigation.js';
import { defaultPermissions } from '../src/lib/permissions.js';

const entries = flattenNavigation(NAV_GROUPS.flatMap(group => group.items));
assert.equal(new Set(entries.map(item => item.to)).size, entries.length);
for (const entry of entries) await access(`src/app${entry.to === '/' ? '' : entry.to}/page.js`);
for (const role of ['admin','director','hr','manager','employee','custom_test']) {
  const grants = defaultPermissions(role);
  const can = module => Boolean(grants[module]?.view);
  const visible = visibleNavigation({ role }, can);
  for (const item of flattenNavigation(visible.flatMap(group => group.items))) {
    assert.ok(item.adminOnly ? role === 'admin' : can(item.permission), `${role}: ${item.to}`);
  }
  assert.ok(visible.every(group => group.items.length > 0));
}
const diagrams = NAV_GROUPS.flatMap(group => group.items).find(item => item.label === 'Sơ đồ');
assert.equal(diagrams.children.length, 4);
for (const item of diagrams.children) assert.ok(navigationActive(diagrams, item.to));
assert.ok(navigationActive(diagrams, '/tai-lieu'), 'Document management keeps its diagram menu active');
assert.ok(!entries.some(item => item.to === '/tai-lieu'), 'No duplicate document menu');
const documentsOnly = visibleNavigation({ role: 'employee' }, module => module === 'documents');
assert.deepEqual(flattenNavigation(documentsOnly.flatMap(group => group.items)).map(item => item.to), ['/so-do-luu-tru']);
console.log(`PASS: ${entries.length} menu routes; six role presets, diagram grouping, aliases and empty-group filtering`);
