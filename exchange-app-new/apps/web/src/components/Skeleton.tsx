import { cn } from '@/lib/utils';

/** Animated skeleton placeholder */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-terminal-border/50',
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** Table row skeleton with n columns */
export function TableRowSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-terminal-border/30">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-5 py-3.5">
              <Skeleton className="h-4 w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** KPI card skeleton */
export function StatCardSkeleton() {
  return (
    <div className="stat-card space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-7 h-7 rounded-lg" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** Full-width card skeleton */
export function CardSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={cn('card', height)}>
      <div className="card-header">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-7 h-7 rounded-lg" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="p-5 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
