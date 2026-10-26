'use client';
import DateInput from './DateInput';
import MonthInput from './MonthInput';
import PlannedPositionField from './PlannedPositionField';

export default function GovernanceFields({resource,fields,form,setForm,options,editing}){
 const update=(key,value)=>setForm(current=>({
  ...current,[key]:value,
  ...(resource==='assignments'&&key==='employee_id'?{position_title:'',position_id:''}:{}),
 }));
 return fields.map(field=>{
  if(resource==='projects'&&field.key==='status')return null;
  if(resource==='policies'&&field.key==='rate'&&form.calculation==='manual')return null;
  if(resource==='positions'&&field.key==='verification_status')return null;
  if(resource==='positions'&&field.key==='requirements')return null;
  const value=form[field.key]??'';
  const onChange=value=>update(field.key,value);
  if(field.type==='references'){
   const selected=Array.isArray(value)?value.map(Number):[];
   return <fieldset key={field.key} className="min-w-0 rounded-lg border border-line p-4 sm:col-span-2"><legend className="px-1 text-sm font-semibold">{field.label}</legend>
    <p className="mb-3 text-xs text-slate">Chọn các phòng ban cùng thực hiện. Dự án chỉ hoàn thành khi công việc của tất cả các phòng đã được nghiệm thu.</p>
    <div className="grid gap-2 sm:grid-cols-2">{(options[field.resource]||[]).map((item,index)=><label key={item.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(Number(item.id))} required={field.required&&selected.length===0&&index===0} onChange={event=>onChange(event.target.checked?[...selected,Number(item.id)]:selected.filter(id=>id!==Number(item.id)))}/><span>{item.name}</span></label>)}</div>
   </fieldset>;
  }
  if(resource==='positions'&&field.key==='name'){
   const titles=[...new Set([...(options.job_titles||[]).filter(item=>!form.department_id||Number(item.department_id)===Number(form.department_id)).map(item=>item.name),...(editing?.name?[editing.name]:[])])];
   return <label key={field.key} className="block min-w-0 text-sm font-medium">Chức vụ <span className="required-mark">*</span>
    <input required maxLength={300} list="duty-job-titles" value={value} onChange={event=>onChange(event.target.value)} placeholder="Chọn hoặc nhập chức vụ" className="ui-field mt-1"/>
    <datalist id="duty-job-titles">{titles.map(title=><option key={title} value={title}/>)}</datalist>
    <span className="mt-1 block text-xs font-normal text-slate">Gợi ý từ chức vụ hiện có trong phòng ban. Có thể nhập chức vụ mới; không cần chọn nhân viên.</span>
   </label>;
  }
  if(resource==='assignments'&&field.key==='position_id')return null;
  if(['recruitment','budgets'].includes(resource)&&field.key==='position_id')return <PlannedPositionField key={field.key} form={form} setForm={setForm} options={options}/>;
  if(field.type==='month')return <MonthInput key={field.key} label={field.label} required={field.required} value={value} onChange={onChange}/>;
  if(field.type==='date')return <DateInput key={field.key} label={field.label} required={field.required} value={value} onChange={onChange}/>;

  const props={required:field.required,value,onChange:event=>onChange(event.target.value),className:'ui-field mt-1 min-w-0'};
  let input;
  if(field.type==='reference'){
   const choices=(options[field.resource]||[]).filter(item=>!(['positions','folders'].includes(resource)&&field.key==='parent_id'&&item.id===editing?.id));
   input=<select {...props} required={field.required||resource==='policies'&&field.key==='department_id'&&form.calculation==='manual'}><option value="">{resource==='policies'&&field.key==='department_id'&&form.calculation==='percentage'?'Mọi phòng ban':'Chọn...'}</option>{choices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>;
  }else if(field.type==='select'){
   input=<select {...props}>{Object.entries(field.options).filter(([value])=>resource!=='policies'||field.key!=='calculation'||value!=='combined'||editing?.calculation==='combined').map(([value,label])=><option key={value} value={value}>{resource==='policies'&&field.key==='calculation'?(value==='manual'?'Tổng tiền thưởng phòng ban':value==='percentage'?'Phần trăm theo nhân sự':'Kết hợp cũ (giữ lịch sử)'):label}</option>)}</select>;
  }else if(field.type==='textarea'){
   input=<textarea {...props} rows={resource==='positions'?field.key==='responsibilities'?9:7:4}/>;
  }else{
   const numeric=field.type==='number';
   input=<input {...props} type={numeric?'number':field.key==='url'?'url':'text'} min={numeric?0:undefined} step={field.key==='rate'?'0.0001':numeric?1:undefined}/>;
  }
  return <label key={field.key} className={`block min-w-0 text-sm font-medium ${field.type==='textarea'?'sm:col-span-2':''}`}>
   {field.label}{field.required&&<span className="required-mark">*</span>}{input}
  </label>;
 });
}
