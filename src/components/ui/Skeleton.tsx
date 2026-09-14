import React from 'react';

export const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className = '',
  style,
}) => (
  <div
    style={style}
    className={`animate-pulse rounded bg-slate-200 dark:bg-slate-800 ${className}`}
  />
);

export const SkeletonCard: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2.5"
      >
        <div className="flex justify-between items-center">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-6 rounded-md" />
        </div>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    ))}
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 8,
  columns = 6,
}) => (
  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
    {/* Header */}
    <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50/70 dark:bg-slate-950/40 gap-4">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-3.5 flex-1" />
      ))}
    </div>
    {/* Rows */}
    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center px-4 py-3 gap-4">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-3 flex-1 ${c === 0 ? 'w-20' : c === 1 ? 'w-36' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonChart: React.FC<{ height?: string }> = ({ height = 'h-64' }) => (
  <div
    className={`rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4 ${height} flex flex-col`}
  >
    <div className="flex justify-between items-center">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
    <div className="flex-1 flex items-end gap-2 pt-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
          <Skeleton
            className="w-full rounded-t"
            style={{ height: `${Math.max(15, (i * 17) % 85 + 15)}%` }}
          />
          <Skeleton className="h-2 w-6" />
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonDetail: React.FC = () => (
  <div className="space-y-4 p-4">
    <div className="flex items-center gap-3">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 pt-3">
      <Skeleton className="h-14 rounded-lg" />
      <Skeleton className="h-14 rounded-lg" />
    </div>
    <div className="space-y-2 pt-2">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-4/6" />
    </div>
  </div>
);
