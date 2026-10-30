import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { NAV_GROUPS, visibleNavigation, flattenNavigation, navigationActive } from '../src/lib/navigation.js';
import { defaultPermissions } from '../src/lib/permissions.js';

const entries = flattenNavigation(NAV_GROUPS.flatMap(group => group.items));
assert.ok(NAV_GROUPS.find(group=>group.items.some(item=>item.to==='/phan-quyen')).items.some(item=>item.to==='/tai-khoan'));
const work = NAV_GROUPS.find(group=>group.defaultOpen);
assert.deepEqual(work.items.slice(0,2).map(item=>item.to),['/timeline','/bao-cao']);
assert.ok(NAV_GROUPS.indexOf(work)<NAV_GROUPS.findIndex(group=>group.items.some(item=>item.to==='/nhan-vien')));
assert.equal(new Set(entries.map(item => item.to)).size, entries.length);
for (const entry of entries) await access(`src/app${entry.to === '/' ? '' : entry.to}/page.js`);
for (const role of ['admin','director','hr','manager','employee','custom_test']) {
  const grants = defaultPermissions(role);
  const can = (module,action='view') => Boolean(grants[module]?.[action]);
  const visible = visibleNavigation({ role }, can);
  for (const item of flattenNavigation(visible.flatMap(group => group.items))) {
    assert.ok(item.adminOnly ? role === 'admin' : can(item.permission,item.action||'view'), `${role}: ${item.to}`);
  }
  assert.equal(flattenNavigation(visible.flatMap(group=>group.items)).some(item=>item.to==='/tai-khoan'),Boolean(grants.employees.manage),`${role}: accounts require employee management`);
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
