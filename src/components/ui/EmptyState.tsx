import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'bg-slate-50/50 rounded p-12 text-center flex flex-col items-center border border-dashed border-slate-100',
        className
      )}
    >
      <div className="w-16 h-16 bg-white rounded flex items-center justify-center text-slate-200 mb-6 shadow-sm">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-sm mb-8 leading-relaxed font-medium">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
