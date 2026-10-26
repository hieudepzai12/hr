import assert from 'node:assert/strict';
import { awardBreakdown } from '../src/lib/governance-validation.js';
import { bonusComponents } from '../src/lib/bonus-components.js';

assert.deepEqual(awardBreakdown({calculation:'combined',rate:'3.7500'},{fixed_amount:'1000000',basis_amount:'100000000'}),{fixed_amount:'1000000',percentage_amount:'3750000',amount:'4750000'});
assert.equal(awardBreakdown({calculation:'manual'},{amount:'999999999999999999'}).amount,'999999999999999999');
assert.equal(awardBreakdown({calculation:'percentage',rate:2.5},{amount:'1',basis_amount:'100000020'}).amount,'2500001');
assert.equal(awardBreakdown({calculation:'percentage',rate:50},{basis_amount:'1'}).amount,'1');
for(const value of ['-1','1.2',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>awardBreakdown({calculation:'manual'},{fixed_amount:value}));
assert.throws(()=>awardBreakdown({calculation:'combined',rate:100},{fixed_amount:'999999999999999999',basis_amount:'1'}));
assert.throws(()=>awardBreakdown({calculation:'percentage',rate:10},{fixed_amount:'1',basis_amount:'10'}));
assert.throws(()=>awardBreakdown({calculation:'combined',rate:101},{fixed_amount:'1',basis_amount:'10'}));
assert.deepEqual(bonusComponents({amount:'123',policy_snapshot:{calculation:'percentage',rate:99}}),{fixed_amount:'0',percentage_amount:'123'});
assert.deepEqual(bonusComponents({amount:'123',policy_snapshot:{calculation:'manual'}}),{fixed_amount:'123',percentage_amount:'0'});
assert.deepEqual(bonusComponents({amount:'4750000',policy_snapshot:{award_components:{fixed_amount:'1000000',percentage_amount:'3750000'}}}),{fixed_amount:'1000000',percentage_amount:'3750000'});
console.log('Bonus calculation and historical component checks passed');
