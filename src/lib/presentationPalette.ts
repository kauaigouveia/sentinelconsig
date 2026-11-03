import type { CSSProperties } from 'react';
export function relativeLuminance(rgb: number[]) { const c = rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
export function contrastRatio(a: number[], b: number[]) { const x = relativeLuminance(a), y = relativeLuminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
/** Presentation only. Never changes tenant identity, stored branding or permissions. */
export function paletteStyle(color?: string | null): CSSProperties {
    if (!color)
        return { '--primary-color': 'initial' } as CSSProperties;
    const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
    if (!match)
        return { '--primary-color': color } as CSSProperties;
    const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    return { '--primary-color': color, '--brand-ink': contrastRatio(rgb, [0, 0, 0]) >= contrastRatio(rgb, [255, 255, 255]) ? 'var(--contrast-dark)' : 'var(--contrast-light)' } as CSSProperties;
}
