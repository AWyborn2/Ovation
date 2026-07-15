import { badgeFontSize, type BadgePresetProps } from ".";

export function ShieldBadge({ label, size, className }: BadgePresetProps) {
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
        d="M 50 5 C 35 5 20 5 10 8 L 10 45 C 10 65 25 82 50 95 C 75 82 90 65 90 45 L 90 8 C 80 5 65 5 50 5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <text
        x="50"
        y="50"
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
