'use client';

import { Toaster } from '@/components/ui/sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'bg-card border-border',
          title: 'text-foreground',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-white',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
    />
  );
}
