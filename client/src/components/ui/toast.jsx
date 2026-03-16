import * as React from 'react';
import { cva } from 'class-variance-authority';
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const toastVariants = cva(
  'flex items-start gap-3 w-full max-w-sm rounded-lg border px-4 py-3 shadow-lg text-sm pointer-events-auto transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'bg-background border-border text-foreground',
        success: 'bg-green-50 border-green-200 text-green-900',
        destructive: 'bg-red-50 border-red-200 text-red-900',
        warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

const ICONS = {
  success: CheckCircle2,
  destructive: XCircle,
  warning: AlertTriangle,
  default: Info,
};

const ICON_COLORS = {
  success: 'text-green-600',
  destructive: 'text-red-600',
  warning: 'text-yellow-600',
  default: 'text-foreground',
};

export function Toast({ id, variant = 'default', title, description, onDismiss }) {
  const Icon = ICONS[variant];
  return (
    <div className={cn(toastVariants({ variant }))}>
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', ICON_COLORS[variant])} />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium leading-snug">{title}</p>}
        {description && <p className="mt-0.5 text-xs opacity-80 leading-snug">{description}</p>}
      </div>
      <button onClick={() => onDismiss(id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Toaster({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

let _addToast = null;

export function useToast() {
  const [toasts, setToasts] = React.useState([]);

  const addToast = React.useCallback((toast) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, ...toast }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const dismiss = React.useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, toast: addToast, dismiss };
}
