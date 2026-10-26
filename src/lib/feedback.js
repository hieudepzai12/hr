'use client';

import Swal from 'sweetalert2';

const base = {
  confirmButtonText: 'Đồng ý', cancelButtonText: 'Hủy',
  confirmButtonColor: '#244b80', cancelButtonColor: '#64748b',
  heightAuto: false, returnFocus: true, keydownListenerCapture: true,
  stopKeydownPropagation: true, customClass: { popup: 'otis-alert' },
};
let pending = Promise.resolve();
const notices = new Set();

function enqueue(work) {
  const result = pending.then(work);
  pending = result.catch(() => {});
  return result;
}

export function notify(message, kind = 'success') {
  if (!message || typeof window === 'undefined') return Promise.resolve();
  const text = String(message);
  const icon = kind === 'auto' ? (/^(Đã|Thành công)/i.test(text) ? 'success' : 'error') : kind;
  const key = `${icon}:${text}`;
  if (notices.has(key)) return Promise.resolve();
  notices.add(key);
  return enqueue(() => Swal.fire({ ...base, icon, titleText: text, toast: true,
    position: 'top-end', showConfirmButton: false, showCloseButton: true,
    closeButtonAriaLabel: 'Đóng thông báo', timer: icon === 'error' ? 8000 : 4000,
    timerProgressBar: true, didOpen: popup => {
      popup.addEventListener('mouseenter', Swal.stopTimer);
      popup.addEventListener('mouseleave', Swal.resumeTimer);
    },
  })).finally(() => notices.delete(key));
}

export async function confirmAction(text) {
  if (Swal.getPopup()?.classList.contains('swal2-toast')) Swal.close();
  const result = await enqueue(() => Swal.fire({ ...base, icon: 'warning',
    titleText: 'Xác nhận thao tác', text, showCancelButton: true,
    confirmButtonText: 'Xác nhận', focusCancel: true, allowOutsideClick: false,
  }));
  return result.isConfirmed;
}

export async function requestReason(text) {
  if (Swal.getPopup()?.classList.contains('swal2-toast')) Swal.close();
  const result = await enqueue(() => Swal.fire({ ...base, titleText: text,
    input: 'textarea', inputPlaceholder: 'Nhập lý do…', inputAttributes: { maxlength: '2000', 'aria-label': text },
    showCancelButton: true, confirmButtonText: 'Tiếp tục', allowOutsideClick: false,
    inputValidator: value => !value.trim() ? 'Vui lòng nhập lý do.' : undefined,
  }));
  return result.isConfirmed ? result.value.trim() : null;
}

export const isFeedbackOpen = () => Swal.isVisible() && !Swal.getPopup()?.classList.contains('swal2-toast');
