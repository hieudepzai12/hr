'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
function Branch({row,childrenByParent,onSelect,visited=[]}){
  if(visited.includes(row.id))return null;
  const children=childrenByParent.get(row.id)||[];
  return <li className="min-w-0 py-1"><details open><summary className="cursor-pointer break-words text-sm"><button type="button" onClick={e=>{e.preventDefault();onSelect(row);}} className="rounded px-1 text-left font-medium text-teal hover:underline">{row.name}</button>{children.length>0&&<span className="ml-2 text-xs text-slate">({children.length})</span>}</summary>{children.length>0&&<ul className="ml-3 border-l border-line pl-3">{children.map(child=><Branch key={child.id} row={child} childrenByParent={childrenByParent} onSelect={onSelect} visited={[...visited,row.id]}/>)}</ul>}</details></li>;
}
export default function FolderMap({onSelect}){
  const [data,setData]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{let active=true;api.get('/governance/folders',{params:{tree:1}}).then(({data})=>{if(active)setData(data);}).catch(err=>{if(active)setError(err.response?.data?.error||'Không tải được cây thư mục');});return()=>{active=false;};},[]);
  const ids=new Set((data?.items||[]).map(row=>row.id));const childrenByParent=new Map();const roots=[];
  for(const row of data?.items||[]){if(row.parent_id&&ids.has(row.parent_id)){const children=childrenByParent.get(row.parent_id)||[];children.push(row);childrenByParent.set(row.parent_id,children);}else roots.push(row);}
  return <section className="ui-card mb-4 min-w-0 p-4"><h2 className="mb-2 font-semibold">Sơ đồ thư mục</h2>{error?<p role="alert" className="ui-notice">{error}</p>:!data?<p role="status" className="text-sm text-slate">Đang tải sơ đồ...</p>:<>{data.truncated&&<p className="text-xs text-amber-dark">Chỉ hiển thị 2.000 thư mục. Dùng danh sách phía dưới để tìm thêm.</p>}{!roots.length?<p className="text-sm text-slate">Chưa có thư mục được xem.</p>:<ul>{roots.map(row=><Branch key={row.id} row={row} childrenByParent={childrenByParent} onSelect={onSelect}/>)}</ul>}</>}</section>;
}
