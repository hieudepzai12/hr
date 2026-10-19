import { LayoutGrid, Users, Building2, Network, FileText, CalendarClock, Target, ShieldCheck, ContactRound, BriefcaseBusiness, UserRoundCog, UserRoundPlus, BadgeDollarSign, Wallet, FolderTree, Library, ChartNoAxesCombined, History } from 'lucide-react';
export const NAV_GROUPS = [
  { label:'Tổng quan',items:[{to:'/',label:'Tổng quan điều hành',icon:LayoutGrid,permission:'dashboard'}]},
  { label:'Cơ cấu tổ chức',items:[
    {label:'Các sơ đồ quản trị',icon:Network,children:[
      {to:'/so-do-to-chuc',label:'1. Cơ cấu công ty',icon:Network,permission:'organization',exact:true},
      {to:'/so-do-to-chuc/phong-ban',label:'2. Chi tiết nhân sự',icon:Users,permission:'organization'},
      {to:'/so-do-to-chuc/du-an',label:'3. Nhân sự dự án',icon:BriefcaseBusiness,permission:'projects'},
      {to:'/so-do-luu-tru',label:'4. Sơ đồ dữ liệu',icon:FolderTree,permission:'documents'},
    ]},
    {to:'/phong-ban',label:'Phòng ban',icon:Building2,permission:'departments'},
    {to:'/chuc-danh',label:'Chức danh & Nhiệm vụ',icon:UserRoundCog,permission:'positions'},
  ]},
  {label:'Quản lý nhân sự',items:[
    {to:'/nhan-vien',label:'Nhân viên',icon:Users,permission:'employees'},
    {to:'/dinh-bien',label:'Định biên nhân sự',icon:UserRoundCog,permission:'staffing'},
    {to:'/tuyen-dung',label:'Nhu cầu tuyển dụng',icon:UserRoundPlus,permission:'recruitment'},
    {to:'/bien-dong-nhan-su',label:'Phân công & Biến động',icon:History,permission:'positions'},
  ]},
  {label:'Khách hàng & Dự án',items:[
    {to:'/khach-hang',label:'Khách hàng',icon:ContactRound,permission:'customers'},
    {to:'/du-an',label:'Dự án',icon:BriefcaseBusiness,permission:'projects'},
    {to:'/nhan-su-du-an',label:'Nhân sự dự án',icon:Users,permission:'projects'},
  ]},
  {label:'Quản lý công việc',items:[
    {to:'/timeline',label:'Công việc & Kế hoạch',icon:CalendarClock,permission:'tasks'},
    {to:'/bao-cao',label:'Báo cáo công việc',icon:FileText,permission:'reports'},
    {to:'/kpi',label:'Đánh giá KPI',icon:Target,permission:'kpi'},
  ]},
  {label:'Tài chính & Thưởng',items:[
    {to:'/chinh-sach-thuong',label:'Chính sách thưởng',icon:BadgeDollarSign,permission:'bonuses'},
    {to:'/thuong-du-an',label:'Thưởng dự án',icon:BadgeDollarSign,permission:'bonuses'},
    {to:'/ngan-sach-luong',label:'Ngân sách tiền lương',icon:Wallet,permission:'budgets'},
  ]},
  {label:'Tài liệu nội bộ',items:[
    {to:'/tai-lieu',label:'Tài liệu & Truy cập',icon:Library,permission:'documents'},
  ]},
  {label:'Báo cáo & Thống kê',items:[{to:'/bao-cao-quan-tri',label:'Báo cáo quản trị',icon:ChartNoAxesCombined,permission:'insights'}]},
  {label:'Quản trị hệ thống',items:[
    {to:'/phan-quyen',label:'Vai trò và phân quyền',icon:ShieldCheck,adminOnly:true},
    {to:'/nhat-ky',label:'Nhật ký hoạt động',icon:History,permission:'activity'},
  ]},
];
export function visibleNavigation(user,can){
  function filterItems(items){
    return items.flatMap(item=>{
      if(item.adminOnly?user?.role!=='admin':item.permission&&!can(item.permission))return [];
      if(!item.children)return [item];
      const children=filterItems(item.children);
      return children.length?[{...item,children}]:[];
    });
  }
  return NAV_GROUPS.map(group=>({...group,items:filterItems(group.items)})).filter(group=>group.items.length);
}
export function flattenNavigation(items){return items.flatMap(item=>item.children?flattenNavigation(item.children):[item]);}
export function navigationActive(item,pathname){
  if(item.children)return item.children.some(child=>navigationActive(child,pathname));
  return pathname===item.to||(!item.exact&&item.to!=='/'&&pathname.startsWith(`${item.to}/`));
}
