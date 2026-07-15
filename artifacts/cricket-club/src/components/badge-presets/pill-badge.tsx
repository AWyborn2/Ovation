import { badgeFontSize, type BadgePresetProps } from ".";

export function PillBadge({ label, size, className }: BadgePresetProps) {
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
      <rect
        x="6"
        y="25"
        width="88"
        height="50"
        rx="25"
        ry="25"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
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
