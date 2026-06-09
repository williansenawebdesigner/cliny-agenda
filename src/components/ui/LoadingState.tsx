import { cn } from '../../lib/utils';

interface LoadingStateProps {
  label?: string;
  className?: string;
  spinnerClassName?: string;
}

export function LoadingState({ label, className, spinnerClassName }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-20', className)}>
      <div
        className={cn(
          'w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin',
          spinnerClassName
        )}
      />
      {label && (
        <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">{label}</span>
      )}
    </div>
  );
}
