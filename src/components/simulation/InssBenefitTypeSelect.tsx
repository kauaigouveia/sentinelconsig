import React from 'react';

export const INSS_BENEFIT_TYPES = [
  [1, 'Pensão por Morte de Trabalhador Rural'], [2, 'Pensão por Morte por Acidente de Trabalho do Trabalhador Rural'],
  [3, 'Pensão por Morte do Empregador Rural'], [4, 'Aposentadoria por Invalidez do Trabalhador Rural'],
  [5, 'Aposentadoria por Invalidez por Acidente de Trabalho do Trabalhador Rural'], [6, 'Aposentadoria por Invalidez do Empregador Rural'],
  [7, 'Aposentadoria por Idade do Trabalhador Rural'], [8, 'Aposentadoria por Idade do Empregador Rural'],
  [11, 'Amparo Previdenciário por Invalidez do Trabalhador Rural'], [12, 'Amparo Previdenciário por Idade do Trabalhador Rural'],
  [18, 'Auxílio Inclusão'], [19, 'Pensão de Estudante (Lei 7.004/82)'], [20, 'Pensão por Morte de Ex-Diplomata'],
  [21, 'Pensão por Morte Previdenciária'], [22, 'Pensão por Morte Estatutária'], [23, 'Pensão por Morte de Ex-Combatente'],
  [24, 'Pensão Especial (Ato Institucional)'], [26, 'Pensão por Morte Especial'], [27, 'Pensão por Morte Servidor Público Federal'],
  [28, 'Pensão por Morte Regime Geral'], [29, 'Pensão por Morte ex-Combatente Marítimo'], [30, 'Renda Mensal Vitalícia por Incapacidade'],
  [32, 'Aposentadoria Invalidez Previdenciária'], [33, 'Aposentadoria Invalidez Aeronauta'], [34, 'Aposentadoria Invalidez Ex-Combatente Marítimo'],
  [37, 'Aposentadoria Extranumerário Capin'], [38, 'Aposentadoria Extranumerário Funcionário Público'], [40, 'Renda Mensal Vitalícia por Idade'],
  [41, 'Aposentadoria por Idade'], [42, 'Aposentadoria por Tempo de Contribuição'], [43, 'Aposentadoria por Tempo Serviço Ex-Combatente'],
  [44, 'Aposentadoria Especial de Aeronauta'], [45, 'Aposentadoria por Tempo de Serviço Jornalista'], [46, 'Aposentadoria Especial'],
  [49, 'Aposentadoria Ordinária'], [51, 'Aposentadoria Invalidez Extinto Plano Básico'], [52, 'Aposentadoria Idade Extinto Plano Básico'],
  [54, 'Pensão Especial Vitalícia (Lei 9.793/99)'], [55, 'Pensão por Morte Extinto Plano Básico'], [56, 'Pensão Vitalícia Síndrome Talidomida'],
  [57, 'Aposentadoria Tempo de Serviço de Professor'], [58, 'Aposentadoria de Anistiados'], [59, 'Pensão por Morte de Anistiados'],
  [60, 'Pensão Especial Portador de SIDA'], [72, 'Aposentadoria Tempo Serviço - Lei de Guerra'], [78, 'Aposentadoria idade - Lei de Guerra'],
  [81, 'Aposentadoria Compulsória Ex-Sasse'], [82, 'Aposentadoria Tempo de Serviço Ex-Sasse'], [83, 'Aposentadoria por Invalidez Ex-Sasse'],
  [84, 'Pensão por Morte Ex-Sasse'], [87, 'Amparo Social Pessoa Portadora de Deficiência'], [88, 'Amparo Social ao Idoso'],
  [89, 'Pensão Especial Vítimas Hemodiálise - Caruaru'], [92, 'Aposentadoria Invalidez Acidente de Trabalho'],
  [93, 'Pensão por Morte Acidente do Trabalho'], [96, 'Pensão Especial para Pessoas Atingidas pela Hanseníase (Lei 11.520/07)'],
] as const;

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
