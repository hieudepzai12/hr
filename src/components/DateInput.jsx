'use client';

import { useId, useRef, useState } from 'react';
import { format, isValid, parse, parseISO } from 'date-fns';
import { CalendarDays } from 'lucide-react';

function toDisplayDate(value) {
  if (!value) return '';
  const date = parseISO(String(value).slice(0, 10));
  return isValid(date) ? format(date, 'dd/MM/yyyy') : '';
}

export default function DateInput({ label, value, onChange, required = false, disabled = false }) {
  const id = useId();
  const textInput = useRef(null);
  const [draft, setDraft] = useState(() => ({ value, text: toDisplayDate(value) }));

  if (draft.value !== value) {
    setDraft({ value, text: toDisplayDate(value) });
  }

  const handleChange = (event) => {
    const input = event.target;
    const date = parse(input.value, 'dd/MM/yyyy', new Date());
    const valid = isValid(date) && format(date, 'dd/MM/yyyy') === input.value;

    setDraft((current) => ({ ...current, text: input.value }));
    input.setCustomValidity(input.value && !valid ? 'Nhập ngày theo dạng dd/mm/yyyy.' : '');

    if (valid) onChange(format(date, 'yyyy-MM-dd'));
    else if (!input.value) onChange('');
  };

  return (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      <div className="relative">
      <input
        ref={textInput}
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        required={required}
        disabled={disabled}
        value={draft.text}
        onChange={handleChange}
        className="form-control"
        style={{ paddingRight: 44 }}
      />
      <span className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate focus-within:ring-2 focus-within:ring-blue-500">
        <CalendarDays size={18} aria-hidden="true" className="pointer-events-none" />
        <input
          type="date"
          lang="vi"
          aria-label={`Chọn ngày: ${label}`}
          title={`Chọn ngày: ${label}`}
          disabled={disabled}
          value={draft.text === toDisplayDate(value) ? String(value || '').slice(0, 10) : ''}
          className="date-picker-input absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onClick={event=>{
            try { event.currentTarget.showPicker?.(); } catch { event.currentTarget.focus(); }
          }}
          onChange={event=>{
            const next=event.target.value;
            textInput.current?.setCustomValidity('');
            setDraft({value:next,text:toDisplayDate(next)});
            onChange(next);
          }}
        />
      </span>
      </div>
    </div>
  );
}
