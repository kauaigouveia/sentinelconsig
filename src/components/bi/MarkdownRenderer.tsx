import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Normalizes text to fix double/triple asterisk issues and inconsistent markdown
 */
export function normalizeMarkdown(text: string): string {
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => {
      let l = line;
      // Convert leading *** to **
      if (l.trim().startsWith('***')) {
        l = l.replace('***', '**');
      }
      // Fix cases like ***Text*** or ***Text**
      return l.replace(/\*\*\*([^*]+)\*\*\*/g, '**$1**').replace(/\*\*\*([^*]+)\*\*/g, '**$1**');
    })
    .join('\n')
    .replace(/\r\n/g, '\n');
}

/**
 * Parses inline formatting like **bold**, *italic*, `code`, [link](url)
 * Returns array of React nodes (text strings and JSX elements)
 * React automatically text-escapes string content, guaranteeing 100% XSS safety without dangerouslySetInnerHTML.
 */
export function parseInline(text: string): React.ReactNode[] {
  if (!text) return [];

  const nodes: React.ReactNode[] = [];
  // Tokenizer regex for inline markdown patterns:
  // 1. `code`
  // 2. **bold**
  // 3. *italic* or _italic_
  // 4. [text](url)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add preceding plain text
    if (match.index > lastIndex) {
      nodes.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];
    const key = `inline-${match.index}-${lastIndex}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      const codeText = token.slice(1, -1);
      nodes.push(
        <code key={key} className="bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded font-mono text-xs">
          {codeText}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      const boldText = token.slice(2, -2);
      nodes.push(
        <strong key={key} className="font-semibold text-slate-900 dark:text-slate-100">
          {boldText}
        </strong>
      );
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      const italicText = token.slice(1, -1);
      nodes.push(
        <em key={key} className="italic text-slate-800 dark:text-slate-200">
          {italicText}
        </em>
      );
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const labelEnd = token.indexOf('](');
      const label = token.slice(1, labelEnd);
      const rawUrl = token.slice(labelEnd + 2, -1).trim();

      // XSS Protection for links: Only allow http://, https:// or relative paths (no javascript: or data:)
      const safeUrl = (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('/'))
        ? rawUrl
        : '#';

      nodes.push(
        <a
          key={key}
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {label}
        </a>
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex));
  }

  return nodes;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const normalized = normalizeMarkdown(content);
  const lines = normalized.split('\n');

  const blocks: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let currentTable: string[] | null = null;

  const flushList = (key: string) => {
    if (!currentList) return;
    const ListTag = currentList.type === 'ul' ? 'ul' : 'ol';
    const listClass = currentList.type === 'ul'
      ? 'list-disc list-inside space-y-1 my-2 text-slate-700 dark:text-slate-200'
      : 'list-decimal list-inside space-y-1 my-2 text-slate-700 dark:text-slate-200';

    blocks.push(
      <ListTag key={key} className={listClass}>
        {currentList.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {parseInline(item)}
          </li>
        ))}
      </ListTag>
    );
    currentList = null;
  };

  const flushTable = (key: string) => {
    if (!currentTable || currentTable.length < 2) {
      if (currentTable) {
        currentTable.forEach((line, idx) => {
          blocks.push(<p key={`${key}-fallback-${idx}`} className="my-1">{parseInline(line)}</p>);
        });
      }
      currentTable = null;
      return;
    }

    // Filter divider line (|---|---|)
    const rows = currentTable
      .map(row => row.trim())
      .filter(row => !/^\|?\s*:?-+:?\s*(\||\+)?/.test(row.replace(/\s+/g, '')));

    if (rows.length === 0) {
      currentTable = null;
      return;
    }

    const parseRow = (rowStr: string) => {
      const cells = rowStr.split('|');
      if (cells[0].trim() === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
      return cells.map(c => c.trim());
    };

    const headerCells = parseRow(rows[0]);
    const bodyRows = rows.slice(1).map(parseRow);

    blocks.push(
      <div key={key} className="overflow-x-auto my-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold">
            <tr>
              {headerCells.map((cell, idx) => (
                <th key={idx} className="px-3 py-2 text-left">
                  {parseInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
            {bodyRows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/40'}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-2 whitespace-nowrap">
                    {parseInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    currentTable = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const key = `block-${index}`;

    // Table line
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (currentList) flushList(`list-before-${key}`);
      if (!currentTable) currentTable = [];
      currentTable.push(trimmed);
      return;
    } else if (currentTable) {
      flushTable(`table-${key}`);
    }

    // Bullet list (- or *)
    const bulletMatch = /^[-*]\s+(.+)/.exec(trimmed);
    if (bulletMatch) {
      const itemText = bulletMatch[1];
      if (!currentList || currentList.type !== 'ul') {
        if (currentList) flushList(`list-switch-${key}`);
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(itemText);
      return;
    }

    // Numbered list (1. , 2. )
    const numberedMatch = /^\d+\.\s+(.+)/.exec(trimmed);
    if (numberedMatch) {
      const itemText = numberedMatch[1];
      if (!currentList || currentList.type !== 'ol') {
        if (currentList) flushList(`list-switch-${key}`);
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(itemText);
      return;
    }

    // If we reach non-list line, flush list
    if (currentList) {
      flushList(`list-end-${key}`);
    }

    // Empty line / paragraph break
    if (!trimmed) {
      blocks.push(<div key={`spacer-${key}`} className="h-2" />);
      return;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={key} className="text-base font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1">
          {parseInline(trimmed.slice(4))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={key} className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-4 mb-2">
          {parseInline(trimmed.slice(3))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={key} className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-4 mb-2">
          {parseInline(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote key={key} className="border-l-4 border-blue-500 pl-3 py-1 my-2 italic text-slate-600 dark:text-slate-300 bg-blue-50/50 dark:bg-blue-950/20 rounded-r">
          {parseInline(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    // Standard paragraph line
    blocks.push(
      <p key={key} className="my-1 leading-relaxed text-slate-800 dark:text-slate-200">
        {parseInline(trimmed)}
      </p>
    );
  });

  // Flush any remaining trailing list or table
  if (currentList) flushList('list-final');
  if (currentTable) flushTable('table-final');

  return <div className={`space-y-1 ${className}`}>{blocks}</div>;
};
