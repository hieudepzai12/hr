'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from './feedback';

export function useFeedbackEffect(message, kind = 'error') {
  const previous = useRef('');
  useEffect(() => {
    if (message && message !== previous.current) void notify(message, kind);
    previous.current = message || '';
  }, [message, kind]);
}

export default function useFeedback(kind = 'error') {
  const [state, setState] = useState({ value: '', sequence: 0 });
  const handled = useRef(0);
  const setValue = useCallback(value => setState(current => ({
    value: typeof value === 'function' ? value(current.value) : value,
    sequence: current.sequence + 1,
  })), [setState]);
  useEffect(() => {
    if (!state.value || handled.current === state.sequence) return;
    handled.current = state.sequence;
    void notify(state.value, kind);
  }, [state, kind]);
  return [state.value, setValue];
}
