import { defaultPermissions, ACTION_MODULES } from './permissions.js';
import { moduleActions } from './governance-config.js';

// Explicit business presets; software roles remain separate from job titles.
export function operationalRolePermissions(level) {
  if (level === 'admin') return defaultPermissions('admin');
  if (!['director','department_head','employee'].includes(level)) throw new Error('Unknown operational role');
  const permissions = defaultPermissions('custom_operational_preset');
  const basic = (module, actions) => {
    for (const action of ACTION_MODULES[module]) permissions[module][action] = actions.includes(action);
    permissions[module].manage = actions.some(action => action !== 'view');
  };
  const scoped = (module, grants) => {
    const allowed = moduleActions(module);
    for (const action of Object.keys(permissions[module].scopes)) permissions[module].scopes[action] = allowed.includes(action) ? grants[action] || 'none' : 'none';
    permissions[module].view = permissions[module].scopes.view !== 'none';
    permissions[module].manage = allowed.some(action => !['view','print'].includes(action) && permissions[module].scopes[action] !== 'none');
  };
  const read = (module,scope) => scoped(module,{view:scope});
  const operations = scope => ({view:scope,create:scope,edit:scope,delete:scope,restore:scope});
  permissions.dashboard.view = true;
  permissions.organization = {view:true,manage:false,scope:level==='director'?'full':'department'};
  basic('accounts',[]);
  basic('departments',level==='employee'?[]:['view']);
  basic('employees',level==='director'?['view','edit']:level==='department_head'?['view']:[]);
  basic('kpi',level==='director'?['view','create','edit']:['view']);
  permissions.kpi.scope = level==='director'?'all':level==='department_head'?'department':'self';
  scoped('tasks',{...operations(level==='director'?'all':level==='department_head'?'department':'self'),
    comment:level==='director'?'all':level==='department_head'?'department':'none',
    approve:level==='director'?'all':level==='department_head'?'department':'none'});
  scoped('reports',{...operations('self'),view:level==='director'?'all':level==='department_head'?'department':'self'});
  read('profiles',level==='director'?'all':level==='department_head'?'department':'self');
  read('positions',level==='director'?'all':'department');
  read('projects',level==='director'?'all':'department');
  read('documents',level==='director'?'all':'department');
  if (level==='director') {
    for (const resource of ['customers','projects','documents','budgets','bonuses']) scoped(resource,operations('all'));
    for (const resource of ['staffing','recruitment']) scoped(resource,{...operations('all'),approve:'all'});
    read('insights','all');
  } else if (level==='department_head') {
    for (const resource of ['customers','budgets','bonuses','insights']) read(resource,'department');
    for (const resource of ['staffing','recruitment']) scoped(resource,{view:'department',create:'department',edit:'department'});
  }
  return permissions;
}
