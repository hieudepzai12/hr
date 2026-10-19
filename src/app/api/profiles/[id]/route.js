import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/auth';
import {queryOne} from '@/lib/db';
import {scopeFor} from '@/lib/access';
import {profileDetail} from '@/lib/profile-detail';
export const GET=withAuth(async(req,{params},user)=>{
 const {id}=await params;
 if(!/^[1-9]\d*$/.test(id)||Number(id)>2147483647)return NextResponse.json({error:'ID không hợp lệ'},{status:400});
 const scope=scopeFor(user,'profiles','view');
 if(!['self','department','all'].includes(scope))return NextResponse.json({error:'Không có quyền xem hồ sơ'},{status:403});
 if(scope==='self'&&Number(id)!==user.id)return NextResponse.json({error:'Không tìm thấy hồ sơ'},{status:404});
 const emp=await queryOne(`SELECT e.id,e.full_name,e.email,e.role,e.position,e.department_id,e.manager_id,e.phone,e.join_date,e.status,e.avatar_color,e.avatar_path,d.name department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1`,[id]);
 if(!emp)return NextResponse.json({error:'Không tìm thấy hồ sơ'},{status:404});
 if(scope==='department'&&(user.department_id==null||emp.department_id!==user.department_id))return NextResponse.json({error:'Không tìm thấy hồ sơ'},{status:404});
 return NextResponse.json(await profileDetail(emp,user));
});
