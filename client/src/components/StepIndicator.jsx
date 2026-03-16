import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { number: 1, label: 'Select Containers' },
  { number: 2, label: 'Review Suggestions' },
  { number: 3, label: 'Add to Uptime Kuma' },
];

export function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => (
        <div key={step.number} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                currentStep > step.number
                  ? 'border-primary bg-primary text-primary-foreground'
                  : currentStep === step.number
                  ? 'border-primary text-primary'
                  : 'border-muted-foreground/30 text-muted-foreground/30'
              )}
            >
              {currentStep > step.number ? <Check className="h-4 w-4" /> : step.number}
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                currentStep >= step.number ? 'text-foreground' : 'text-muted-foreground/50'
              )}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                'mb-5 h-px w-16 transition-colors',
                currentStep > step.number ? 'bg-primary' : 'bg-muted-foreground/20'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
