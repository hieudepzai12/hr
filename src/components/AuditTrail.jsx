const ACTIONS={leader_opinion:'Ghi ý kiến lãnh đạo',create:'Tạo mới',edit:'Chỉnh sửa',update:'Cập nhật',submit:'Gửi duyệt',approve:'Phê duyệt',approved:'Phê duyệt',reject:'Yêu cầu bổ sung',reopen:'Mở lại',delete:'Xóa',restore:'Khôi phục',verify:'Xác nhận dữ liệu',accept:'Nghiệm thu',reset_password:'Đặt lại mật khẩu'};
const LABELS={title:'Tên',name:'Tên',status:'Trạng thái',progress:'Tiến độ (%)',due_date:'Hạn chót',start_date:'Ngày bắt đầu',end_date:'Ngày kết thúc',assignee_id:'Người phụ trách',department_id:'Phòng ban',customer_id:'Khách hàng',project_id:'Dự án',collaborators:'Người phối hợp',result:'Kết quả',completed_result:'Kết quả',next_step:'Bước tiếp theo',blockers:'Vướng mắc',solution:'Giải pháp',proposed_solution:'Giải pháp',leader_opinion:'Ý kiến lãnh đạo',feedback:'Phản hồi',content:'Nội dung',notes:'Ghi chú',deleted_reason:'Lý do xóa',responsibilities:'Nhiệm vụ chính',role_description:'Vai trò, trách nhiệm',requirements:'Yêu cầu / quyền hạn'};
const HIDDEN=new Set(['_record','id','version','created_at','updated_at','password','password_hash','token_version','created_by','source_import_key','source_import_row']);
const STATUS={draft:'Bản nháp',submitted:'Chờ duyệt',approved:'Đã duyệt',rejected:'Yêu cầu bổ sung',todo:'Chưa bắt đầu',in_progress:'Đang thực hiện',review:'Chờ nghiệm thu',done:'Hoàn thành',completed:'Hoàn thành',active:'Đang hoạt động',planned:'Chưa bắt đầu',on_hold:'Tạm dừng',cancelled:'Đã hủy'};
function valueText(value,key,field){
 if(value==null||value==='')return '—';
 if(key==='status')return STATUS[value]||String(value);
 if(field?.options?.[value])return field.options[value];
 if(field?.type==='reference')return `#${value}`;
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value.split('-').reverse().join('/');
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&!Number.isNaN(Date.parse(value)))return new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
 if(Array.isArray(value))return value.length?value.map(item=>typeof item==='object'?JSON.stringify(item):String(item)).join(', '):'—';
 if(typeof value==='object')return Object.entries(value).filter(([key])=>!HIDDEN.has(key)).map(([key,item])=>`${LABELS[key]||key}: ${typeof item==='object'?JSON.stringify(item):item}`).join('\n')||'—';
 return String(value);
}
export default function AuditTrail({entries=[],fields=[],hiddenFields=[]}){
 const fieldMap=new Map(fields.map(field=>[field.key,field]));
 const visible=entries.map(entry=>({...entry,items:Object.entries(entry.changes||{}).filter(([key])=>!HIDDEN.has(key)&&!hiddenFields.includes(key))})).filter(entry=>entry.items.length||!['edit','update','verify'].includes(entry.action));
 if(!visible.length)return <p className="rounded-lg bg-paper p-4 text-sm text-slate">Chưa có thay đổi nội dung được ghi nhận.</p>;
 return <ol className="space-y-3">{visible.map(entry=><li key={entry.id} className="min-w-0 rounded-xl border border-line bg-white p-4">
  <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm"><strong className="font-semibold text-ink">{entry.actor_name||'Hệ thống'}</strong><span className="ml-2 text-slate">{entry.entity_type==='report'&&entry.action==='submit'?'Gửi báo cáo':ACTIONS[entry.action]||'Thay đổi dữ liệu'}</span></p><time className="text-xs text-slate" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</time></div>
  {entry.reason&&<p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate">Lý do: {entry.reason}</p>}
  {!!entry.items.length&&<details className="mt-3"><summary className="cursor-pointer rounded text-sm font-medium text-teal focus-ring">Xem {entry.items.length} trường thay đổi</summary><dl className="mt-3 divide-y divide-line">{entry.items.map(([key,change])=><div key={key} className="py-3"><dt className="mb-2 text-xs font-semibold text-slate">{fieldMap.get(key)?.label||LABELS[key]||key}</dt><dd className="grid min-w-0 gap-2 sm:grid-cols-2"><div className="min-w-0 rounded-lg bg-paper p-3"><span className="mb-1 block text-xs text-slate">Trước</span><p className="whitespace-pre-wrap break-words text-sm">{valueText(change?.before,key,fieldMap.get(key))}</p></div><div className="min-w-0 rounded-lg border border-line p-3"><span className="mb-1 block text-xs text-slate">Sau</span><p className="whitespace-pre-wrap break-words text-sm">{valueText(change?.after,key,fieldMap.get(key))}</p></div></dd></div>)}</dl></details>}
 </li>)}</ol>;
}
