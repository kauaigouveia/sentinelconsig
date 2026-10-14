import React, { useEffect, useRef } from "react";
import { X, Info } from "lucide-react";
export function SectionHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p2-section-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="p2-actions">{children}</div>
    </div>
  );
}
export function StatusBadge({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  return (
    <span
      className="p2-badge"
      style={{ "--badge-color": color } as React.CSSProperties}
    >
      <i />
      {label}
    </span>
  );
}
export function PremiumStatCard({
  label,
  value,
  detail,
  color,
  icon: Icon,
  definition,
  state = "ready",
}: {
  label: string;
  value: string | number;
  detail: string;
  color: string;
  icon: React.ElementType;
  definition: string;
  state?: "ready" | "loading" | "empty" | "error";
}) {
  return (
    <section
      className="p2-stat"
      style={{ "--accent": color } as React.CSSProperties}
      aria-busy={state === "loading"}
    >
      <div>
        <span className="p2-stat-icon">
          <Icon size={17} />
        </span>
        <span
          title={definition}
          tabIndex={0}
          aria-label={`${label}: ${definition}`}
        >
          <Info size={13} />
        </span>
      </div>
      <span>{label}</span>
      <strong className={state === "loading" ? "p2-skeleton" : ""}>
        {state === "loading"
          ? "…"
          : state === "error" || state === "empty"
            ? "—"
            : value}
      </strong>
      <small>
        {state === "error"
          ? "Não foi possível carregar"
          : state === "empty"
            ? "Fonte indisponível nesta prévia"
            : detail}
      </small>
    </section>
  );
}
export function DetailDrawer({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]',
          ) || [],
        );
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="p2-drawer-backdrop" onClick={close}>
      <aside
        ref={ref}
        className="p2-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionHeader
          title={title}
          subtitle="Demonstração · sem alteração de registros"
        >
          <button
            className="s2-button"
            aria-label="Fechar detalhes"
            onClick={close}
          >
            <X size={18} />
          </button>
        </SectionHeader>
        {children}
      </aside>
    </div>
  );
}
export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="s2-empty">
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
