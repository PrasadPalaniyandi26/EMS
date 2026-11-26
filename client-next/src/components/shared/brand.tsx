import { useId } from 'react';
import { cn } from '@/lib/utils';

// The Kanakku brand, drawn as vectors so no Tamil font has to load. Colours are the --brand-* tokens.
// The icon files in src/app (icon.svg, apple-icon.png, favicon.ico) are the same drawing on a dark tile.
const LETTER = 'M146 122H342M168 122V232M260 122V312C260 372 234 402 184 402C134 402 104 372 104 322C104 268 138 232 190 232H332C388 232 416 268 416 316C416 370 380 402 334 402H312';
const TREND = 'M72 428L190 300L240 350L416 160';
const ARROW = 'M466 106L449 212L363 133Z';

// The first letter, ka, with a rising trend cut through it. Decorative: the text or link beside it carries the name
export function BrandMark({ className, small }: { className?: string; small?: boolean }) {
  const id = useId();
  return (
    <svg aria-hidden viewBox="50 78 450 370" className={cn('shrink-0', className)} fill="none">
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="white" />
        <path d={TREND} stroke="black" strokeWidth={small ? 64 : 58} />
      </mask>
      <path mask={`url(#${id})`} d={LETTER} stroke="var(--brand-ink)" strokeWidth={small ? 50 : 46} />
      <path d={TREND} stroke="var(--brand-trend)" strokeWidth={small ? 40 : 34} />
      <path d={ARROW} fill="var(--brand-trend)" />
      <circle cx="466" cy="398" r="27" fill="var(--brand-dot)" />
    </svg>
  );
}
