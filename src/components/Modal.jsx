'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  const titleId = useId();
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = originalOverflow; previous?.focus?.(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5">
    <button type="button" aria-label="Đóng hộp thoại" className="absolute inset-0 bg-[#101b30]/60" onClick={onClose} />
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative flex max-h-[95dvh] w-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-2xl sm:max-h-[90vh] ${width}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-ink sm:text-lg">{title}</h2>
        <button type="button" onClick={onClose} className="icon-button shrink-0" aria-label="Đóng hộp thoại" title="Đóng"><X size={19} /></button>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </div>
  </div>;
}
