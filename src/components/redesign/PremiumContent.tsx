import React from 'react';
/** Stable wrapper: changing presentation must not recreate operational children. */
export function PremiumContent({ active, className, children }: { active: boolean; className: string; children: React.ReactNode }) {
  return <div className={active ? className : `${className} contents p2-legacy-content`}>{children}</div>;
}
