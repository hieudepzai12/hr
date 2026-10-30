const TASK_STATUS = {
  todo: { label: 'Chưa bắt đầu', bg: '#e8edf4', fg: '#465a75' },
  in_progress: { label: 'Đang thực hiện', bg: '#dbeafe', fg: '#1d4f95' },
  review: { label: 'Chờ nghiệm thu', bg: '#fff0cb', fg: '#895600' },
  done: { label: 'Đã nghiệm thu', bg: '#dff4e8', fg: '#17623a' },
};

const PRIORITY = {
  low: { label: 'Thấp', bg: '#e8edf4', fg: '#465a75' },
  medium: { label: 'Trung bình', bg: '#dbeafe', fg: '#1d4f95' },
  high: { label: 'Cao', bg: '#fff0cb', fg: '#895600' },
  urgent: { label: 'Khẩn cấp', bg: '#fee2e5', fg: '#a32639' },
};

const REPORT_STATUS = {
  draft: { label: 'Bản nháp', bg: '#e8edf4', fg: '#465a75' },
  submitted: { label: 'Chờ duyệt', bg: '#dbeafe', fg: '#1d4f95' },
  reviewed: { label: 'Đã xem xét', bg: '#fff0cb', fg: '#895600' },
  approved: { label: 'Đã duyệt · Khóa', bg: '#dff4e8', fg: '#17623a' },
  rejected: { label: 'Cần bổ sung', bg: '#fee2e5', fg: '#a32639' },
  reopened: { label: 'Đã mở lại', bg: '#dbeafe', fg: '#1d4f95' },
};

function Badge({ map, value }) {
  const item = map[value] || { label: value, bg: '#e8edf4', fg: '#465a75' };
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: item.bg, color: item.fg }}
    >
      {item.label}
    </span>
  );
}

export const TaskStatusBadge = ({ status }) => <Badge map={TASK_STATUS} value={status} />;
export const PriorityBadge = ({ priority }) => <Badge map={PRIORITY} value={priority} />;
export const ReportStatusBadge = ({ status }) => <Badge map={REPORT_STATUS} value={status} />;

export { TASK_STATUS, PRIORITY, REPORT_STATUS };

export const WorkReportStatusBadge = ({status}) => <Badge map={{draft:{label:'Bản nháp',bg:'#e8edf4',fg:'#465a75'},submitted:{label:'Đã gửi',bg:'#dff4e8',fg:'#17623a'}}} value={['submitted','reviewed','approved'].includes(status)?'submitted':'draft'} />;
