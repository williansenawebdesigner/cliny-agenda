import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div className="flex flex-col gap-2 min-w-0">
        {eyebrow && (
          <span className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-widest leading-none">
            {eyebrow}
          </span>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && (
          <p className="text-slate-400 font-medium text-sm max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 w-full md:w-auto">{actions}</div>}
    </div>
  );
}
