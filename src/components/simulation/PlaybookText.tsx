import React from 'react';
export function PlaybookText({ text }: { text: string }) {
 const paragraphs = text.split(/\n+|;\s+|(?<=[.!?])\s+(?=[A-ZÀ-Ú])/).map(value => value.trim()).filter(Boolean);
 return <div className="max-w-4xl space-y-4 text-base leading-7 text-slate-700 dark:text-slate-200">{paragraphs.map((paragraph,index) => <p key={index} className="break-words">{paragraph}</p>)}</div>;
}
