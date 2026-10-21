// Keep the existing text column readable by old screens and API clients.
export function jobTitles(value){
 if(typeof value!=='string')return [];
 return value.split(';').map(title=>title.trim()).filter(Boolean);
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
