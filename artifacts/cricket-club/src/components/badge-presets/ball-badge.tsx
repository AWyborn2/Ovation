import { badgeFontSize, type BadgePresetProps } from ".";

export function BallBadge({ label, size, className }: BadgePresetProps) {
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
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
      />
      {/* Cricket ball seam — characteristic S-curve */}
      <path
        d="M 28 20 C 38 35, 62 35, 72 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <path
        d="M 28 80 C 38 65, 62 65, 72 80"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
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
