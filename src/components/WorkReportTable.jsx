'use client';
import { Fragment } from 'react';
import { progressText } from '@/lib/task-progress';
import { taskGroupKey } from '@/lib/task-grouping';
import { WorkReportStatusBadge as ReportStatusBadge } from './Badges';
const dateText=value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'—';
export default function WorkReportTable({ reports, projects, onOpen, onRestore, deleted }) {
  const people=new Map();
  for(const report of reports){
    const key=String(report.employee_id);
    if(!people.has(key))people.set(key,{name:report.employee_name,reports:[]});
    people.get(key).reports.push(report);
  }
  return <div className="ui-card min-w-0"><table className="ui-table task-list-table report-list-table"><colgroup><col className="task-col-title"/><col className="task-col-deadline"/><col className="task-col-progress"/><col className="task-col-report"/><col className="task-col-report"/><col className="task-col-actions"/><col className="task-col-actions"/></colgroup><thead><tr><th>Công việc</th><th>Hạn</th><th>Tiến độ</th><th>Vướng mắc</th><th>Giải pháp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>{[...people.entries()].map(([personId,person])=><tbody key={personId}><tr className="task-group-heading"><td colSpan={7}><strong>{person.name}</strong></td></tr>{person.reports.map(report=>{
    const groups=new Map();
    for(const item of report.task_summaries?.length?report.task_summaries:[{task_id:null,title:report.title,description:report.excerpt||report.content}]){
      const key=taskGroupKey(item);
      if(!groups.has(key))groups.set(key,{name:item.project_id?item.project_name||projects.find(project=>Number(project.id)===Number(item.project_id))?.name||item.customer_name||'Công việc':item.customer_name||'Công việc khác',items:[]});
      groups.get(key).items.push(item);
    }
    return [...groups.entries()].map(([key,group])=><Fragment key={`${report.id}-${key}`}><tr className="task-project-heading"><td colSpan={7}><div className="task-project-caption"><h3>{group.name}</h3><span>{report.title}</span><span>{dateText(report.period_start)} – {dateText(report.period_end)}</span>{report.submitted_at&&<span>Gửi: {dateText(report.submitted_at)}</span>}</div></td></tr>{group.items.map((item,index)=><tr key={item.task_id||'content'} className="task-project-row" data-report-task-row={item.task_id||''}><td className="task-project-content"><strong className="block whitespace-pre-wrap break-words font-semibold leading-6">{item.title||`Công việc #${item.task_id}`}</strong>{item.description&&<p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate">{item.description}</p>}</td><td data-label="Hạn"><strong className="text-sm">{item.due_date?dateText(item.due_date):''}</strong></td>{['progress','blockers','solution'].map(field=>{const value=field==='progress'?progressText(item):item[field];return <td key={field} data-label={{progress:'Tiến độ',blockers:'Vướng mắc',solution:'Giải pháp'}[field]} className="whitespace-pre-wrap break-words text-sm leading-6">{value&&value!=='—'?value:null}</td>;})}{index===0&&<><td rowSpan={group.items.length} data-label="Trạng thái"><ReportStatusBadge status={report.status}/></td><td rowSpan={group.items.length} className="task-actions-cell" data-label="Thao tác"><button type="button" onClick={()=>deleted?onRestore(report):onOpen(report)} className="ui-button ui-button-secondary">{deleted?'Khôi phục':'Xem chi tiết'}</button></td></>}</tr>)}</Fragment>);
  })}</tbody>)}</table></div>;
}
