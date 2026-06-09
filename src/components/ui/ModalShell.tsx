import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  zClassName?: string;
}

export function ModalShell({
  title,
  subtitle,
  icon,
  children,
  footer,
  onClose,
  className,
  bodyClassName,
  headerClassName,
  zClassName = 'z-50',
}: ModalShellProps) {
  return (
    <div className={cn('fixed inset-0 flex items-center justify-center p-4', zClassName)}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className={cn(
          'relative bg-white w-full max-w-lg max-h-[90vh] overflow-hidden rounded shadow-2xl flex flex-col',
          className
        )}
      >
        <div
          className={cn(
            'p-8 border-b border-slate-50 flex items-center justify-between shrink-0 bg-white z-10',
            headerClassName
          )}
        >
          <div className="flex items-center gap-4 min-w-0">
            {icon && (
              <div className="w-11 h-11 bg-emerald-500 text-white rounded flex items-center justify-center shadow-lg shadow-emerald-100 shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-xl font-bold tracking-tight text-slate-900">{title}</h3>
              {subtitle && (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded transition-colors shrink-0">
            <X size={20} className="text-slate-300" />
          </button>
        </div>

        <div className={cn('flex-1 overflow-y-auto no-scrollbar p-8', bodyClassName)}>{children}</div>
        {footer && <div className="p-8 border-t border-slate-50 bg-slate-50/30 shrink-0">{footer}</div>}
      </motion.div>
    </div>
  );
}
