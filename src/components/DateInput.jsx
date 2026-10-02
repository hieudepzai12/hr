'use client';

import { useId, useState } from 'react';
import { format, isValid, parse, parseISO } from 'date-fns';

function toDisplayDate(value) {
  if (!value) return '';
  const date = parseISO(String(value).slice(0, 10));
  return isValid(date) ? format(date, 'dd/MM/yyyy') : '';
}

export default function DateInput({ label, value, onChange, required = false, disabled = false }) {
  const id = useId();
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
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        required={required}
        disabled={disabled}
        value={draft.text}
        onChange={handleChange}
        className="form-control"
      />
    </div>
  );
}