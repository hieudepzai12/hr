const TASK_STATUS = {
  todo: { label: 'Chưa bắt đầu', bg: '#E4E2D9', fg: '#5B6663' },
  in_progress: { label: 'Đang thực hiện', bg: '#DCE7DD', fg: '#3F7069' },
  review: { label: 'Đang xem xét', bg: '#F3E3CB', fg: '#B8752E' },
  done: { label: 'Hoàn thành', bg: '#DEE8D5', fg: '#5C7A4F' },
};

const PRIORITY = {
  low: { label: 'Thấp', bg: '#E4E2D9', fg: '#5B6663' },
  medium: { label: 'Trung bình', bg: '#DCE7DD', fg: '#3F7069' },
  high: { label: 'Cao', bg: '#F3E3CB', fg: '#B8752E' },
  urgent: { label: 'Khẩn cấp', bg: '#F1DAD5', fg: '#B85C4A' },
};

const REPORT_STATUS = {
  submitted: { label: 'Đã gửi', bg: '#E4E2D9', fg: '#5B6663' },
  reviewed: { label: 'Đã xem xét', bg: '#F3E3CB', fg: '#B8752E' },
  approved: { label: 'Đã duyệt', bg: '#DEE8D5', fg: '#5C7A4F' },
  rejected: { label: 'Từ chối', bg: '#F1DAD5', fg: '#B85C4A' },
};

function Badge({ map, value }) {
  const item = map[value] || { label: value, bg: '#E4E2D9', fg: '#5B6663' };
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium"
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
