import React, { useEffect, useRef, useState } from 'react';
import { formatBrlInput, normalizeBrlInput } from '../../lib/brlInput';
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: string | number; onValueChange: (value: string) => void };
/** Display BRL, keep canonical decimal values in the existing form and API payload. */
export function CurrencyInput({ value, onValueChange, min, max, step: _step, onBlur, onFocus, onPaste, ...props }: Props) {
  const [draft, setDraft] = useState(() => formatBrlInput(value));
  const focused = useRef(false), input = useRef<HTMLInputElement>(null), last = useRef(String(value));
  useEffect(() => { if (!focused.current || String(value) !== last.current) setDraft(formatBrlInput(value)); last.current = String(value); }, [value]);
  function change(raw: string, format = false) {
    const parsed = normalizeBrlInput(raw);
    let error = parsed === null ? 'Informe um valor como 10.000,00.' : '';
    if (parsed && min !== undefined && Number(parsed) < Number(min)) error = `O valor mínimo é ${formatBrlInput(String(min))}.`;
    if (parsed && max !== undefined && Number(parsed) > Number(max)) error = `O valor máximo é ${formatBrlInput(String(max))}.`;
    input.current?.setCustomValidity(error);
    setDraft(format && parsed !== null ? formatBrlInput(parsed) : raw);
    const canonical = parsed ?? ''; last.current = canonical; onValueChange(canonical);
  }
  return <input {...props} ref={input} type="text" inputMode="decimal" value={draft} onChange={event => change(event.target.value)} onFocus={event => { focused.current = true; onFocus?.(event); }} onBlur={event => { focused.current = false; change(draft, true); onBlur?.(event); }} onPaste={event => {
    onPaste?.(event); if (event.defaultPrevented) return;
    const text = event.clipboardData.getData('text');
    if (normalizeBrlInput(text) === null) return;
    event.preventDefault(); change(text, true);
  }} />;
}
