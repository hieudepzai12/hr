'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

function sourcePerson(position){
  if(!position.code?.startsWith('DOCX-'))return '';
  return position.requirements?.match(/^Nhân sự theo tài liệu: (.*?)\. Chưa xác nhận/u)?.[1]||'';
}

function OrgNode({person,childrenByParent,onSelect,ancestors=[]}){
  const [expanded,setExpanded]=useState(true);
  if(ancestors.includes(person.id))return null;
  const children=childrenByParent.get(person.id)||[];
  return <li><button type="button" className="node-box focus-ring" onClick={()=>onSelect(person)} title="Xem thông tin"><span className="node-title">{person.position||'Chưa cập nhật chức danh'}</span><span className="node-name">{person.full_name}</span></button>{children.length>0&&<><button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded} aria-label={`${expanded?'Thu gọn':'Mở rộng'} nhánh ${person.full_name}`} className="my-1 inline-flex items-center gap-1 rounded border border-line bg-white px-2 py-1 text-xs text-teal">{expanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>} {children.length} vị trí/người</button>{expanded&&<ul>{children.map(child=><OrgNode key={child.id} person={child} childrenByParent={childrenByParent} onSelect={onSelect} ancestors={[...ancestors,person.id]}/>)}</ul>}</>}</li>;
}
function Content({ mode }){
  const {can}=useAuth();const [data,setData]=useState(null);const [error,setError]=useState('');const [department,setDepartment]=useState('');const [search,setSearch]=useState('');const [selected,setSelected]=useState(null);
  const [expandVersion,setExpandVersion]=useState(0);
  const [fullscreen,setFullscreen]=useState(false);
  const [viewNotice,setViewNotice]=useState('');
  const chartPanel=useRef(null);
  useEffect(()=>{const update=()=>setFullscreen(document.fullscreenElement===chartPanel.current);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update);},[]);
  const toggleFullscreen=async()=>{try{setViewNotice('');if(document.fullscreenElement)await document.exitFullscreen();else await chartPanel.current?.requestFullscreen();}catch{setViewNotice('Trình duyệt không mở được toàn màn hình. Bạn vẫn có thể cuộn trong khung sơ đồ.');}};
  const selectPerson=async(person)=>{if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});setSelected(person);};
  useEffect(()=>{let active=true;api.get('/organization').then(({data})=>{if(active)setData(data);}).catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được sơ đồ');});return()=>{active=false;};},[]);
  const departments=data?.departments||[];
  const selectedDepartment=mode==='company'?'':department;
  const view=mode==='positions'?'positions':'people';
  const chartPositions=data?.positions||[];
  const all=view==='people'?(data?.employees||[]):chartPositions.map(position=>({...position,full_name:position.holders||(sourcePerson(position)?`Theo tài liệu: ${sourcePerson(position)}`:'Chưa có phân công được xác nhận'),position:position.name,manager_id:position.parent_id,isPosition:true}));
  let people=all.filter(person=>!selectedDepartment||String(person.department_id)===selectedDepartment);
  const title=mode==='company'?'Sơ đồ công ty':mode==='department'?'Chi tiết nhân sự':'Sơ đồ vị trí & Phân công';
  if(search){
    const included=new Set(people.filter(person=>`${person.full_name} ${person.position||''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map(person=>person.id));
    const byId=new Map(people.map(person=>[person.id,person]));
    for(const id of [...included]){let current=byId.get(id);const visited=new Set([id]);while(current?.manager_id&&!visited.has(current.manager_id)){visited.add(current.manager_id);included.add(current.manager_id);current=byId.get(current.manager_id);}}
    people=people.filter(person=>included.has(person.id));
  }
  const ids=new Set(people.map(person=>person.id));const childrenByParent=new Map();const roots=[];
  for(const person of people){if(person.manager_id&&ids.has(person.manager_id)&&person.manager_id!==person.id){const children=childrenByParent.get(person.manager_id)||[];children.push(person);childrenByParent.set(person.manager_id,children);}else roots.push(person);}
  return <Layout title={title} subtitle={mode==='department'?'Chọn phòng ban để xem cơ cấu nhân sự và tuyến quản lý trong phòng.':'Chọn ô để xem thông tin; thu/mở từng nhánh trong phạm vi được cấp quyền.'} actions={can('employees','manage')&&<Link href="/nhan-vien" className="ui-button">Cập nhật nhân sự</Link>}>
    {mode==='company'&&<div className="ui-card mb-4 flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">Xem sơ đồ Phòng Kế toán và Phòng Tài chính đã nhập từ Word.</p><Link href="/so-do-to-chuc/phong-ban" className="btn-primary">Mở sơ đồ phòng ban</Link></div>}
    {mode==='department'&&<div className="mb-4 flex flex-wrap gap-2" aria-label="Chọn sơ đồ phòng ban"><button type="button" aria-pressed={!selectedDepartment} className={!selectedDepartment?'btn-primary':'btn-secondary'} onClick={()=>{setDepartment('');setSearch('');setExpandVersion(v=>v+1);}}>Tất cả phòng ban</button>{departments.map(item=><button key={item.id} type="button" aria-pressed={String(item.id)===selectedDepartment} onClick={()=>{setDepartment(String(item.id));setSelected(null);}} className={String(item.id)===selectedDepartment?'btn-primary':'btn-secondary'}>{item.name}</button>)}</div>}
    <div className="ui-card mb-4 grid gap-3 p-4 sm:grid-cols-2">
      <label className="text-sm"><span className="mb-1 block text-slate">Tìm kiếm</span><input aria-label="Tìm nhân sự hoặc chức danh" placeholder="Tìm người hoặc chức danh..." value={search} onChange={e=>setSearch(e.target.value)} className="ui-field"/></label>
      {mode!=='company'&&<label className="text-sm"><span className="mb-1 block text-slate">Phòng ban</span><select aria-label="Phòng ban" value={selectedDepartment} onChange={e=>setDepartment(e.target.value)} className="ui-field" disabled={!departments.length}>
        <option value="">Tất cả phòng ban được xem</option>
        {departments.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
    </div>
    {view==='positions'&&data&&<p className="mb-3 text-sm text-slate">Các mục cần xác minh chưa được coi là phân công nhân sự chính thức. Mở từng ô để xem đầy đủ nhiệm vụ, tên theo tài liệu và nguồn.</p>}
    {viewNotice&&<p role="status" className="ui-notice mb-3">{viewNotice}</p>}
    {error?<p role="alert" className="ui-notice">{error}</p>:!data?<p role="status" className="ui-card ui-empty">Đang tải sơ đồ...</p>:!roots.length?<p className="ui-card ui-empty">Chưa có dữ liệu phù hợp hoặc dữ liệu quan hệ cần được kiểm tra.</p>:<section ref={chartPanel} className="ui-card min-w-0 overflow-auto bg-white p-3 sm:p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate">{people.length} / {all.length} vị trí</p><div className="flex flex-wrap gap-2"><button type="button" className="ui-button" onClick={()=>{setDepartment('');setSearch('');setExpandVersion(v=>v+1);}}>Xem toàn bộ</button><button type="button" className="ui-button" onClick={toggleFullscreen}>{fullscreen?'Thoát toàn màn hình':'Toàn màn hình'}</button></div></div><div className="overflow-auto"><div className="min-w-0 px-3 py-4 md:min-w-max md:px-8 md:py-8"><div className="org-tree"><ul>{roots.map(person=><OrgNode key={`${view}-${person.id}-${expandVersion}`} person={person} childrenByParent={childrenByParent} onSelect={selectPerson}/>)}</ul></div></div></div></section>}
    {selected&&<Modal title={selected.isPosition?selected.position:selected.full_name} onClose={()=>setSelected(null)}><dl className="space-y-4 text-sm"><div><dt className="text-slate">Chức danh</dt><dd>{selected.position||'Chưa cập nhật'}</dd></div><div><dt className="text-slate">Nhân sự</dt><dd>{selected.full_name}</dd></div><div><dt className="text-slate">Phòng ban</dt><dd>{data.departments.find(item=>item.id===selected.department_id)?.name||'Chưa xác định'}</dd></div>{selected.isPosition&&<><div><dt className="text-slate">Xác minh</dt><dd>{selected.verification_status==='verified'?'Đã xác minh':'Cần xác minh'}</dd></div><div><dt className="text-slate">Chức năng và nhiệm vụ</dt><dd className="whitespace-pre-wrap">{selected.responsibilities}</dd></div><div><dt className="text-slate">Yêu cầu / quyền hạn</dt><dd className="whitespace-pre-wrap">{selected.requirements||'Chưa cập nhật'}</dd></div><div><dt className="text-slate">Nguồn</dt><dd>{selected.source_reference||'Chưa xác định'}</dd></div></>}</dl></Modal>}
  </Layout>;
}
export default function OrganizationChart({ mode='company' }){
  const chart=<ProtectedRoute permission="organization"><Content mode={mode}/></ProtectedRoute>;
  return mode==='positions'?<ProtectedRoute permission="positions">{chart}</ProtectedRoute>:chart;
}
