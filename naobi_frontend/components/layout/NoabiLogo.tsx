export function NoabiLogo({
  size = 22,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5v-7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 12l8-4.5M12 12v8M12 12L4 7.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}
