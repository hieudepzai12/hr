'use client';
import { Building2, BriefcaseBusiness, ArrowUpRight, Pencil, Search } from 'lucide-react';
import GovernanceFields from './GovernanceFields';

export function PositionDutyFilters({search,onSearch,department,onDepartment,departments,sort,direction,onSort,canRestore,deleted,onDeleted}){
  return <div className="mb-5 rounded-xl border border-line bg-white p-3 sm:p-4">
    <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <label className="relative"><span className="sr-only">Tìm chức vụ</span><Search size={17} className="absolute left-3 top-3.5 text-slate"/><input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Tìm tên chức vụ..." className="ui-field" style={{paddingLeft:'2.5rem'}}/></label>
      <select aria-label="Phòng ban" value={department} onChange={e=>onDepartment(e.target.value)} className="ui-field"><option value="">Tất cả phòng ban được xem</option>{departments?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Sắp xếp chức vụ" value={`${sort}:${direction}`} onChange={e=>onSort(...e.target.value.split(':'))} className="ui-field"><option value="updated_at:desc">Cập nhật gần nhất</option><option value="name:asc">Tên chức vụ: A → Z</option><option value="name:desc">Tên chức vụ: Z → A</option><option value="created_at:desc">Mới tạo gần nhất</option></select>
    </div>
    {canRestore&&<label className="mt-3 inline-flex items-center gap-2 text-xs text-slate"><input type="checkbox" checked={deleted} onChange={e=>onDeleted(e.target.checked)}/>Xem chức vụ đã xóa</label>}
  </div>;
}

export function PositionDutyForm({fields,...props}){
  return <div className="space-y-5">
    <section><h3 className="mb-3 text-sm font-semibold text-ink">Thông tin chức vụ</h3><div className="grid gap-4 sm:grid-cols-2"><GovernanceFields {...props} resource="positions" fields={fields.filter(field=>!['role_description','responsibilities','requirements','source_reference','verification_status'].includes(field.key))}/></div></section>
    <div className="grid overflow-hidden rounded-xl border border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"><section className="min-w-0 border-b border-line bg-slate-50 p-4 sm:p-5 lg:border-b-0 lg:border-r"><GovernanceFields {...props} resource="positions" fields={fields.filter(field=>field.key==='role_description')}/></section><section className="min-w-0 bg-white p-4 sm:p-5"><GovernanceFields {...props} resource="positions" fields={fields.filter(field=>field.key==='responsibilities')}/></section></div>
    <details className="rounded-lg border border-line p-3 text-sm"><summary className="cursor-pointer font-medium text-slate">Nguồn tài liệu / căn cứ (tùy chọn)</summary><div className="mt-3"><GovernanceFields {...props} resource="positions" fields={fields.filter(field=>field.key==='source_reference')}/></div></details>
  </div>;
}

function dutyLines(value){
  return String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^NHIỆM VỤ MẪU\s*[—–-]/i.test(line));
}

export function PositionDutySections({row}){
  const lines=dutyLines(row.responsibilities);
  return <div className="grid min-w-0 overflow-hidden rounded-xl border border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
    <section className="min-w-0 border-b border-line bg-slate-50 p-4 sm:p-5 lg:border-b-0 lg:border-r"><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><span className="rounded-md border border-line bg-white px-2 py-1 text-xs text-teal">01</span>Vai trò, trách nhiệm</h3><p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">{row.role_description||'Chưa bổ sung vai trò, trách nhiệm.'}</p></section>
    <section className="min-w-0 bg-white p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><span className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-teal">02</span>Nhiệm vụ chính</h3>
      {lines.length?<ol className="space-y-3">{lines.map((line,i)=>{const text=line.replace(/^\d+[.)]\s*/, '');const colon=text.indexOf(':');return <li key={i} className="flex items-start gap-3 text-sm leading-6"><span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-paper text-[11px] font-semibold text-slate">{i+1}</span><span className="min-w-0 whitespace-pre-wrap break-words">{colon>0&&colon<90?<><strong className="font-semibold text-ink">{text.slice(0,colon+1)}</strong>{text.slice(colon+1)}</>:text}</span></li>;})}</ol>:<p className="text-sm text-slate">Chưa có nội dung nhiệm vụ.</p>}
    </section>
  </div>;
}

export default function PositionDuties({items,total,onOpen,onEdit,canEdit}){
  const departments=new Map();
  for(const row of items){const key=row.department_id;const group=departments.get(key)||{name:row.department_id_label||'Chưa có phòng ban',items:[]};group.items.push(row);departments.set(key,group);}
  return <div className="min-w-0 space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-ink">Danh mục chức vụ</h2><span className="text-sm text-slate">{total} chức vụ theo bộ lọc</span></div>
    {[...departments].map(([id,group])=><section key={id} className="min-w-0">
      <div className="mb-3 flex items-center gap-2 text-sm"><Building2 size={16} className="text-slate"/><h3 className="font-semibold text-ink">{group.name}</h3><span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs text-slate">{group.items.length} trong trang</span></div>
      <div className="grid min-w-0 gap-3">{group.items.map(row=>{
        return <article key={row.id} className="min-w-0 rounded-xl border border-line bg-white shadow-sm">
          <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper text-teal"><BriefcaseBusiness size={19}/></span><div className="min-w-0"><button type="button" onClick={()=>onOpen(row)} className="rounded text-left text-base font-semibold leading-6 text-ink hover:text-teal focus-ring"><span className="break-words">{row.name}</span></button><p className="mt-0.5 break-all text-xs text-slate">{row.code}</p></div></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={()=>onOpen(row)} className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-sm font-semibold text-teal hover:underline focus-ring">Chi tiết<ArrowUpRight size={15}/></button>{!row.deleted_at&&canEdit(row)&&<button type="button" onClick={()=>onEdit(row)} className="ui-button ui-button-secondary !px-3 !py-1.5"><Pencil size={14}/>Chỉnh sửa</button>}</div></header>
          <div className="p-3 sm:p-4"><PositionDutySections row={row}/></div>
        </article>;
      })}</div>
    </section>)}
  </div>;
}
