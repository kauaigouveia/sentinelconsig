import React, { useEffect, useId, useRef, useState } from 'react';
import { institutionLabel, resolveInstitutionCode, searchInstitutions } from '../../lib/strParticipants';

export function BankCodeSelect({ label, value, onChange, className, labelClassName, required = true, disabled = false }: { label: string; value: string; onChange: (code: string) => void; className?: string; labelClassName?: string; required?: boolean; disabled?: boolean }) {
  const id = useId(), [query, setQuery] = useState(() => institutionLabel(value));
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const emitted = useRef(value), input = useRef<HTMLInputElement>(null);
  const matches = searchInstitutions(query).slice(0, 30);
  function choose(code: string) { if (disabled) return; emitted.current = code; onChange(code); setQuery(institutionLabel(code)); setOpen(false); input.current?.setCustomValidity(''); }
  useEffect(() => { if (value !== emitted.current) { emitted.current = value; setQuery(institutionLabel(value)); input.current?.setCustomValidity(''); } }, [value]);
  return <label className={`relative block min-w-0 ${labelClassName || ''}`}>{label}<input ref={input} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open && matches[active] ? `${id}-${matches[active].code}` : undefined} value={query} required={required} disabled={disabled} className={className} autoComplete="off" placeholder="Pesquise pelo código ou nome do banco" onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); const code = resolveInstitutionCode(query); if (code) setQuery(institutionLabel(code)); }} onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (open && matches[active]) choose(matches[active].code); }
  }} onChange={event => {
    const text = event.target.value, code = resolveInstitutionCode(text);
    setQuery(text); setOpen(true); setActive(0); emitted.current = code; onChange(code);
    event.target.setCustomValidity(text && !code ? 'Selecione um banco da lista ou informe seu código numérico.' : '');
  }} />{open && !disabled && <span id={id} role="listbox" aria-label={`Resultados: ${label}`} className="absolute left-0 right-0 top-full z-50 max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">{matches.map((bank, index) => <button type="button" role="option" aria-selected={index === active} id={`${id}-${bank.code}`} key={bank.code} onMouseDown={event => event.preventDefault()} onClick={() => choose(bank.code)} className={`block w-full whitespace-normal px-3 py-2 text-left text-xs ${index === active ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>{bank.code} - {bank.name}</button>)}{!matches.length && <span className="block p-2 text-xs">Nenhuma instituição encontrada. Você pode informar um código numérico manualmente.</span>}</span>}<span className="mt-1 block text-[10px] font-normal text-slate-500">Referência STR · aceitação depende do banco e da operação.</span></label>;
}
