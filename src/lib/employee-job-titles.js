// Keep the existing text column readable by old screens and API clients.
export function jobTitles(value){
 if(typeof value!=='string')return [];
 return value.split(';').map(title=>title.trim()).filter(Boolean);
}
// Department annotations are kept in stored titles for concurrent-role mapping.
export function displayJobTitles(value,departmentName=''){
 const normalized=text=>text.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi').replace(/^phòng\s+/u,'');
 return jobTitles(value).map(title=>{
  const match=title.match(/^(.*?)\s+[—–-]\s+(.+)$/u);
  if(!match)return title;
  const suffix=normalized(match[2]);
  return suffix&&(suffix===normalized(departmentName)||normalized(match[1]).endsWith(` ${suffix}`))?match[1].trim():title;
 }).join('; ');
}
export function employeePosition(body){
 const supplied=Object.hasOwn(body||{},'position_titles');
 const value=supplied?body.position_titles:body?.position;
 if(!supplied&&value==null)return null;
 if(supplied?!Array.isArray(value):typeof value!=='string')throw new Error('Danh sách chức vụ không hợp lệ.');
 const values=supplied?value:jobTitles(value);
 if(values.length>10)throw new Error('Chỉ chọn tối đa 10 chức vụ.');
 const titles=[],seen=new Set();
 for(const value of values){
  if(typeof value!=='string'||!value.trim()||value.length>300||/[;\r\n]/.test(value))throw new Error('Mỗi chức vụ cần có tên, tối đa 300 ký tự và không chứa dấu chấm phẩy hoặc xuống dòng.');
  const title=value.trim(),key=title.normalize('NFC').toLocaleLowerCase('vi');
  if(!seen.has(key)){seen.add(key);titles.push(title);}
 }
 return titles.length?titles.join('; '):null;
}
