import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ icon, title, description, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="w-12 h-12 rounded-full bg-terminal-surface flex items-center justify-center mb-4">
        {icon ?? <Inbox className="w-6 h-6 text-text-muted" />}
      </div>
      <h3 className="text-sm font-semibold text-text-secondary mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-text-muted max-w-[280px]">{description}</p>
      )}
    </div>
  );
}
