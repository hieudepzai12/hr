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
  const value=form[field.key]??'';
  const onChange=value=>update(field.key,value);
  if(resource==='assignments'&&field.key==='position_id')return null;
  if(['recruitment','budgets'].includes(resource)&&field.key==='position_id')return <PlannedPositionField key={field.key} form={form} setForm={setForm} options={options}/>;
  if(field.type==='month')return <MonthInput key={field.key} label={field.label} required={field.required} value={value} onChange={onChange}/>;
  if(field.type==='date')return <DateInput key={field.key} label={field.label} required={field.required} value={value} onChange={onChange}/>;

  const props={required:field.required,value,onChange:event=>onChange(event.target.value),className:'ui-field mt-1 min-w-0'};
  let input;
  if(field.type==='reference'){
   const choices=(options[field.resource]||[]).filter(item=>!(['positions','folders'].includes(resource)&&field.key==='parent_id'&&item.id===editing?.id));
   input=<select {...props}><option value="">Chọn...</option>{choices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>;
  }else if(field.type==='select'){
   input=<select {...props}>{Object.entries(field.options).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>;
  }else if(field.type==='textarea'){
   input=<textarea {...props} rows={4}/>;
  }else{
   const numeric=field.type==='number';
   input=<input {...props} type={numeric?'number':field.key==='url'?'url':'text'} min={numeric?0:undefined} step={field.key==='rate'?'0.0001':numeric?1:undefined}/>;
  }
  return <label key={field.key} className={`block min-w-0 text-sm font-medium ${field.type==='textarea'?'sm:col-span-2':''}`}>
   {field.label}{field.required&&<span className="required-mark">*</span>}{input}
  </label>;
 });
}
