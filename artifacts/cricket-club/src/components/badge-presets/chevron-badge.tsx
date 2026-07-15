import { badgeFontSize, type BadgePresetProps } from ".";

export function ChevronBadge({ label, size, className }: BadgePresetProps) {
  const fontSize = badgeFontSize(label);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      className={className}
    >
      <path
        d="M 10 8 L 90 8 L 90 70 L 50 95 L 10 70 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <text
        x="50"
        y="42"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold"
        fontSize={fontSize}
        letterSpacing="0.05em"
      >
        {label.toUpperCase()}
      </text>
    </svg>
  );
}
