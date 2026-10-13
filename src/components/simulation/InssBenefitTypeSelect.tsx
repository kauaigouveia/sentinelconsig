import React from 'react';

import { INSS_BENEFIT_TYPES } from '../../lib/inssBenefitTypes';
export { INSS_BENEFIT_TYPES } from '../../lib/inssBenefitTypes';

type Props = { value: string; onChange: (code: string) => void; className?: string; required?: boolean };

export function filterInssBenefitTypes(query: string) {
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const normalized = normalize(query.trim());
  return INSS_BENEFIT_TYPES.filter(([code, name]) => {
    const aliases = code === 87 || code === 88 ? 'loas bpc' : code === 30 || code === 40 ? 'lops renda mensal vitalicia' : '';
    return !normalized || String(code).startsWith(normalized) || normalize(`${name} ${aliases}`).includes(normalized);
  });
}

export const InssBenefitTypeSelect: React.FC<Props> = ({ value, onChange, className = '', required }) => {
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const editing = React.useRef(false);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const selected = INSS_BENEFIT_TYPES.find(([code]) => String(code) === value);
  const [query, setQuery] = React.useState(selected ? `${selected[0]} - ${selected[1]}` : value);
  const options = React.useMemo(() => filterInssBenefitTypes(selected && query === `${selected[0]} - ${selected[1]}` ? '' : query), [query, selected]);

  React.useEffect(() => {
    const current = INSS_BENEFIT_TYPES.find(([code]) => String(code) === value);
    if (!editing.current) setQuery(current ? `${current[0]} - ${current[1]}` : value);
    inputRef.current?.setCustomValidity(required && !current ? 'Selecione uma espécie do benefício na lista.' : '');
  }, [value, required]);

  const choose = (option: typeof INSS_BENEFIT_TYPES[number]) => {
    editing.current = false;
    setQuery(`${option[0]} - ${option[1]}`);
    onChange(String(option[0]));
    setOpen(false);
    setActiveIndex(-1);
  };

  return <div className={`${className} relative`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); editing.current = false; }
  }}>
    <label htmlFor={id}>Espécie do benefício (pesquise por código ou nome)</label>
    <input ref={inputRef} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      autoComplete="off" required={required} value={query} onFocus={() => setOpen(true)}
      onChange={event => {
        editing.current = true;
        setQuery(event.target.value);
        setOpen(true);
        setActiveIndex(-1);
        inputRef.current?.setCustomValidity(required ? 'Selecione uma espécie do benefício na lista.' : '');
        if (value) onChange('');
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          setActiveIndex(index => event.key === 'ArrowDown' ? Math.min(index + 1, options.length - 1) : Math.max(index - 1, 0));
        }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (options[activeIndex]) choose(options[activeIndex]); }
      }}
      placeholder="Ex.: 4, 41, aposentadoria ou LOAS" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
    {open && <ul id={`${id}-options`} role="listbox" className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      {options.map((option, index) => <li key={option[0]} id={`${id}-option-${index}`} role="option" aria-selected={String(option[0]) === value}>
        <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)} className={`w-full rounded-md px-3 py-2 text-left text-xs leading-relaxed hover:bg-violet-100 dark:hover:bg-violet-900/40 ${index === activeIndex ? 'bg-violet-100 dark:bg-violet-900/40' : ''}`}>{option[0]} - {option[1]}</button>
      </li>)}
      {!options.length && <li className="px-3 py-2 text-xs text-slate-500">Nenhuma espécie encontrada.</li>}
    </ul>}
  </div>;
};
