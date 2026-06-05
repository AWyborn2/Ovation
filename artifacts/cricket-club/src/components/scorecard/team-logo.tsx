interface TeamLogoProps {
  logoUrl?: string | null;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  size?: number;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  if (words.length === 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
}

function shieldPath(size: number, scale = 1): string {
  const s = scale;
  const cx = size / 2;
  const cy = size / 2;
  const w = size * 0.88 * s;
  const h = size * 0.92 * s;
  const l = cx - w / 2;
  const t = cy - h / 2 + size * 0.02;
  const r = l + w;
  const b = t + h;
  const mid = cx;
  const cornerR = w * 0.18;
  const shoulderDrop = h * 0.38;

  return [
    `M ${l + cornerR} ${t}`,
    `L ${r - cornerR} ${t}`,
    `Q ${r} ${t} ${r} ${t + cornerR}`,
    `L ${r} ${t + shoulderDrop}`,
    `Q ${r} ${t + shoulderDrop + h * 0.08} ${r - w * 0.08} ${t + shoulderDrop + h * 0.14}`,
    `L ${mid} ${b}`,
    `L ${l + w * 0.08} ${t + shoulderDrop + h * 0.14}`,
    `Q ${l} ${t + shoulderDrop + h * 0.08} ${l} ${t + shoulderDrop}`,
    `L ${l} ${t + cornerR}`,
    `Q ${l} ${t} ${l + cornerR} ${t}`,
    `Z`,
  ].join(" ");
}

/**
 * Renders the club badge image when available, otherwise a generated shield
 * crest derived from the team's colour scheme (so opposition clubs without a
 * stored logo still get a branded mark).
 */
export function TeamLogo({ logoUrl, teamName, primaryColor, secondaryColor, size = 56 }: TeamLogoProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${teamName} logo`}
        style={{ width: size, height: size, objectFit: "contain", display: "block" }}
      />
    );
  }

  const initials = getInitials(teamName);
  const r = size / 2;
  const strokeW = size * 0.045;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`${teamName} crest`}
    >
      <path d={shieldPath(size)} fill={primaryColor} stroke={secondaryColor} strokeWidth={strokeW} />
      <path d={shieldPath(size, 0.82)} fill="none" stroke={secondaryColor} strokeWidth={strokeW * 0.6} opacity={0.5} />
      <text
        x={r}
        y={r * 1.15}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={secondaryColor}
        fontSize={size * (initials.length > 2 ? 0.25 : 0.3)}
        fontFamily="'Arial Narrow', Arial, sans-serif"
        fontWeight="800"
        letterSpacing="0.04em"
      >
        {initials}
      </text>
    </svg>
  );
}
