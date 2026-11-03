import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost';
}>(({ variant = 'secondary', className = '', type = 'button', ...props }, ref) => <button {...props} ref={ref} type={type} className={`ui-button ui-button-${variant} ${className}`}/>);
export const IconButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => <Button {...props} ref={ref} className={`ui-icon-button ${props.className || ''}`}/>);
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...props }, ref) => <input {...props} ref={ref} className={`ui-input ${className}`}/>);
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className = '', ...props }, ref) => <select {...props} ref={ref} className={`ui-input ${className}`}/>);
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className = '', ...props }, ref) => <textarea {...props} ref={ref} className={`ui-input ${className}`}/>);
export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} type="checkbox" className={`ui-checkbox ${props.className || ''}`}/>; }
export function Badge({ children, tone = 'neutral', dot = true, className = '' }: {
    children: React.ReactNode;
    tone?: Tone;
    dot?: boolean;
    className?: string;
}) { return <span className={`ui-badge ui-tone-${tone} ${className}`}>{dot && <span aria-hidden="true" className="ui-status-dot"/>}{children}</span>; }
export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLElement>) { return <section {...props} className={`ui-card ${className}`}/>; }
export function PageHeader({ title, description, children, count }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    count?: number;
}) { return <header className="ui-page-header"><div><div className="ui-page-title"><h1>{title}</h1>{count != null && <Badge dot={false}>{count}</Badge>}</div>{description && <p>{description}</p>}</div><div className="ui-page-actions">{children}</div></header>; }
export function FilterBar({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div {...props} className={`ui-filter-bar ${props.className || ''}`}>{children}</div>; }
export function Tabs({ items, value, onChange, label }: {
    items: {
        id: string;
        label: string;
        disabled?: boolean;
    }[];
    value: string;
    onChange: (id: string) => void;
    label: string;
}) { return <div className="ui-tabs" role="tablist" aria-label={label}>{items.map((item, index) => <button key={item.id} role="tab" type="button" disabled={item.disabled} aria-selected={value === item.id} tabIndex={value === item.id ? 0 : -1} onClick={() => onChange(item.id)} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
    return; event.preventDefault(); const enabled = items.filter(i => !i.disabled); const current = enabled.findIndex(i => i.id === item.id); const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length; onChange(enabled[next].id); const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'); buttons?.[next]?.focus(); }}>{item.label}</button>)}</div>; }
export function Modal({ open, title, onClose, children, drawer = false, closeLabel = 'Fechar' }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    drawer?: boolean;
    closeLabel?: string;
}) { const ref = useRef<HTMLElement>(null), id = useId(); useEffect(() => { if (!open)
    return; const previous = document.activeElement as HTMLElement; ref.current?.querySelector<HTMLElement>('button')?.focus(); const key = (event: KeyboardEvent) => { if (event.key === 'Escape')
    onClose(); if (event.key === 'Tab') {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') || []);
    if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
    }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0]?.focus();
    }
} }; document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus(); }; }, [open, onClose]); if (!open)
    return null; return <div className={`ui-modal-backdrop ${drawer ? 'ui-drawer-backdrop' : ''}`} onClick={onClose}><section ref={ref} className={drawer ? 'ui-drawer' : 'ui-modal'} role="dialog" aria-modal="true" aria-labelledby={id} onClick={e => e.stopPropagation()}><header><h2 id={id}>{title}</h2><IconButton onClick={onClose} aria-label={closeLabel}><X size={18}/></IconButton></header>{children}</section></div>; }
export function Drawer(props: Omit<React.ComponentProps<typeof Modal>, 'drawer'>) { return <Modal {...props} drawer/>; }
export function Table<T>({ rows, columns, rowKey, density = 'compact', caption }: {
    rows: T[];
    columns: {
        key: string;
        label: string;
        render: (row: T) => React.ReactNode;
        compare?: (a: T, b: T) => number;
    }[];
    rowKey: (row: T) => string;
    density?: 'compact' | 'comfortable';
    caption: string;
}) { const [sort, setSort] = useState<{
    key: string;
    direction: number;
} | null>(null); const column = columns.find(c => c.key === sort?.key); const data = column?.compare ? [...rows].sort((a, b) => sort!.direction * column.compare!(a, b)) : rows; return <div className="ui-table-scroll" tabIndex={0} role="region" aria-label={caption}><table className="ui-table" data-density={density}><caption className="sr-only">{caption}</caption><thead><tr>{columns.map(c => <th key={c.key} aria-sort={sort?.key === c.key ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined}>{c.compare ? <button type="button" onClick={() => setSort({ key: c.key, direction: sort?.key === c.key ? -sort.direction : 1 })}>{c.label}<span aria-hidden="true"> ↕</span></button> : c.label}</th>)}</tr></thead><tbody>{data.map(row => <tr key={rowKey(row)}>{columns.map(c => <td key={c.key}>{c.render(row)}</td>)}</tr>)}</tbody></table></div>; }
export function Switch({ label, checked, onChange, disabled = false }: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}) { return <label className="ui-switch"><input role="switch" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled}/><span>{label}</span></label>; }
export { EmptyState } from './EmptyState';
export { Skeleton } from './Skeleton';
