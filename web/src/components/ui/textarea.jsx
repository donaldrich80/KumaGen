// Provenance: generated from the shadcn/ui component template (https://ui.shadcn.com),
// imported in bd6d7e5; upstream version not recorded. Edited locally since (dark-mode theme
// 8f2f7be, Tailwind 4 migration b77f27d) — owned here, not re-synced. See git log for diffs.
import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
