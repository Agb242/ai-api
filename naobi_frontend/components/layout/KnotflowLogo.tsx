import Image from 'next/image';
import { cn } from '@/lib/utils';
import { SITE } from '@/lib/site';

type Props = {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
};

export function KnotflowLogo({
  size = 28,
  className,
  showWordmark = false,
  wordmarkClassName,
}: Props) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src={SITE.logo}
        alt={SITE.name}
        width={size}
        height={size}
        className="shrink-0 rounded-md object-contain"
        priority
      />
      {showWordmark ? (
        <span
          className={cn(
            'font-display text-[17px] font-semibold tracking-tight md:text-[18px]',
            wordmarkClassName,
          )}
        >
          {SITE.name}
        </span>
      ) : null}
    </span>
  );
}
