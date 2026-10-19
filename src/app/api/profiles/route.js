import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/auth';
import {query} from '@/lib/db';
import {scopeFor} from '@/lib/access';
import {parsePagination,appendPagination,pagedResult} from '@/lib/pagination';
export const GET=withAuth(async(req,ctx,user)=>{
 const search=new URL(req.url).searchParams,pagination=parsePagination(search);
 if(pagination===false)return NextResponse.json({error:'Phân trang không hợp lệ'},{status:400});
 const scope=scopeFor(user,'profiles','view');
 if(!['self','department','all'].includes(scope))return NextResponse.json({error:'Không có quyền xem hồ sơ'},{status:403});
 const args=[];let where='TRUE';
 if(scope==='self'){args.push(user.id);where='e.id=$1';}
 if(scope==='department'){args.push(user.department_id??-1);where='e.department_id=$1';}
 const term=search.get('search');if(term){if(term.length>300)return NextResponse.json({error:'Từ khóa quá dài'},{status:400});args.push(`%${term}%`);where+=` AND (e.full_name ILIKE $${args.length} OR e.email ILIKE $${args.length})`;}
 const sql=appendPagination(`SELECT e.id,e.full_name,e.email,e.position,e.avatar_path,e.avatar_color,d.name department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE ${where} ORDER BY e.full_name,e.id`,args,pagination);
 return NextResponse.json(pagedResult((await query(sql,args)).rows,pagination));
});
