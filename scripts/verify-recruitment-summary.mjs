import assert from 'node:assert/strict';
import {summarizeRecruitment,departmentHeadcount} from '../src/lib/recruitment-summary.js';
const open={department_id:1,quantity:5,hired_count:2,status:'approved',hiring_status:'recruiting'};
assert.deepEqual(summarizeRecruitment([
 open,{...open,quantity:2,hired_count:0,hiring_status:'pending'},
 {...open,status:'draft'},{...open,status:'submitted'},{...open,status:'rejected'},
 {...open,hiring_status:'cancelled'},{...open,hiring_status:'filled'},{...open,deleted_at:'2026-10-21'},
 {...open,department_id:2,quantity:1,hired_count:1},
]),[{department_id:1,remaining:5,request_count:2},{department_id:2,remaining:0,request_count:1}]);
assert.deepEqual(summarizeRecruitment([]),[]);
assert.equal(summarizeRecruitment([{...open,quantity:1,hired_count:2}])[0].remaining,0);
const staff=[{id:1,department_id:1,role:'manager'},{id:2,department_id:1,role:'employee'},{id:3,department_id:1,role:'employee',status:'inactive'},{id:4,department_id:2,role:'employee'}];
assert.deepEqual(departmentHeadcount(staff,1,[{department_id:1,remaining:3}]),{current:2,needed:3,total:5});
assert.deepEqual(departmentHeadcount(staff,1,[]),{current:2,needed:0,total:2});
assert.deepEqual(departmentHeadcount(staff,1,null),{current:2,needed:null,total:null});
const director={id:5,department_id:9,role:'director',position:'Giám đốc điều hành; Trưởng phòng Kinh doanh'};
assert.deepEqual(departmentHeadcount([director],3,[],'Kinh doanh'),{current:1,needed:0,total:1});
assert.deepEqual(departmentHeadcount([director],3,[{department_id:3,remaining:2}],'Kinh doanh'),{current:1,needed:2,total:3});
assert.equal(departmentHeadcount([{...director,department_id:3},director],3,[],'Kinh doanh').current,1,'Do not duplicate the same employee');
assert.equal(departmentHeadcount([{...director,status:'inactive'}],3,[],'Kinh doanh').current,0);
assert.equal(departmentHeadcount([director],4,[],'Kế toán').current,0);
console.log('PASS: approved open requests only, subtract hires, aggregate departments, empty data and non-negative counts');
