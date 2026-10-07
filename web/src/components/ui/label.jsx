// Provenance: generated from the shadcn/ui component template (https://ui.shadcn.com),
// imported in bd6d7e5; upstream version not recorded. Edited locally since (dark-mode theme
// 8f2f7be, Tailwind 4 migration b77f27d) — owned here, not re-synced. See git log for diffs.
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
