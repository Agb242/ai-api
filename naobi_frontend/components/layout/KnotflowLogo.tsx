import Image from 'next/image';
import { cn } from '@/lib/utils';
import { SIDEBAR_LOGO, SITE } from '@/lib/site';

type Props = {
  size?: number;
  className?: string;
};

/** K mark only — no wordmark text. */
export function KnotflowLogo({ size = SIDEBAR_LOGO.expanded, className }: Props) {
  return (
    <Image
      src={SITE.logoMark}
      alt={SITE.name}
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
      priority
    />
  );
}
