import { characterById } from '@standoff/shared';

interface Props {
  id: string;
  size?: number;
  down?: boolean;   // knocked down / ducking
  dead?: boolean;
  wounds?: number;
}

/** Original cartoon-noir gangster bust, drawn from the character spec. */
export function Avatar({ id, size = 64, down, dead, wounds = 0 }: Props) {
  const c = characterById(id);
  const ink = '#16131a';
  return (
    <svg
      viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"
      className={`avatar${down ? ' is-down' : ''}${dead ? ' is-dead' : ''}`}
    >
      {/* shoulders */}
      <path d="M12 100 C14 76 30 68 50 68 C70 68 86 76 88 100 Z" fill={c.color} stroke={ink} strokeWidth="3" />
      <path d="M42 70 L50 86 L58 70" fill="#f4efe6" stroke={ink} strokeWidth="2.5" />
      {c.extra === 'bowtie'
        ? <path d="M42 74 L50 78 L58 74 L58 82 L50 78 L42 82 Z" fill="#d9372b" stroke={ink} strokeWidth="2" />
        : <path d="M48 72 L52 72 L54 92 L50 96 L46 92 Z" fill={ink} />}
      {/* head */}
      <ellipse cx="50" cy="44" rx="21" ry="24" fill={c.skin} stroke={ink} strokeWidth="3" />
      {/* eyes */}
      {c.hat === 'shades' ? (
        <path d="M30 40 H70 V45 C70 51 62 51 60 45 H40 C38 51 30 51 30 45 Z" fill={ink} />
      ) : dead ? (
        <g stroke={ink} strokeWidth="3" strokeLinecap="round">
          <path d="M37 38 l6 6 M43 38 l-6 6" /><path d="M57 38 l6 6 M63 38 l-6 6" />
        </g>
      ) : (
        <g>
          <path d="M35 38 Q40 35 45 38" stroke={ink} strokeWidth="2.5" fill="none" />
          <path d="M55 38 Q60 35 65 38" stroke={ink} strokeWidth="2.5" fill="none" />
          <circle cx="40" cy="43" r="2.6" fill={ink} /><circle cx="60" cy="43" r="2.6" fill={ink} />
        </g>
      )}
      {c.extra === 'monocle' && <circle cx="60" cy="43" r="6" fill="none" stroke="#e2b23a" strokeWidth="2" />}
      {/* nose + mouth */}
      <path d="M50 44 Q53 52 48 54" stroke={ink} strokeWidth="2" fill="none" />
      {c.extra === 'moustache'
        ? <path d="M38 58 Q44 54 50 57 Q56 54 62 58 Q56 61 50 59 Q44 61 38 58 Z" fill={ink} />
        : <path d="M42 60 Q50 63 58 59" stroke={ink} strokeWidth="2.5" fill="none" />}
      {c.extra === 'goldtooth' && <rect x="51" y="59" width="4" height="3" fill="#e2b23a" />}
      {c.extra === 'cigar' && (
        <g><rect x="56" y="58" width="16" height="4" rx="1.5" fill="#7a4a2a" stroke={ink} strokeWidth="1.5" /><circle cx="72" cy="60" r="1.6" fill="#ff7b2e" /></g>
      )}
      {c.extra === 'scar' && <path d="M58 48 l8 8 M60 52 l3 -2 M63 55 l3 -2" stroke="#8a2b2b" strokeWidth="2" />}
      {c.extra === 'earring' && <circle cx="29" cy="52" r="3" fill="none" stroke="#e2b23a" strokeWidth="2" />}
      {c.extra === 'pearls' && <g fill="#f4efe6" stroke={ink} strokeWidth="1">{[36, 42, 48, 54, 60, 66].map(x => <circle key={x} cx={x} cy={70 + Math.abs(51 - x) / 6} r="2.6" />)}</g>}
      {/* hats */}
      {c.hat === 'fedora' && <g><path d="M22 30 Q50 24 78 30 L74 34 Q50 29 26 34 Z" fill="#2b2530" stroke={ink} strokeWidth="2.5" /><path d="M32 30 Q34 12 50 12 Q66 12 68 30 Z" fill="#2b2530" stroke={ink} strokeWidth="2.5" /><path d="M33 26 H67" stroke={c.color} strokeWidth="3" /></g>}
      {c.hat === 'bowler' && <g><ellipse cx="50" cy="30" rx="27" ry="4" fill="#2b2530" stroke={ink} strokeWidth="2.5" /><path d="M31 30 Q31 10 50 10 Q69 10 69 30 Z" fill="#2b2530" stroke={ink} strokeWidth="2.5" /></g>}
      {c.hat === 'top' && <g><ellipse cx="50" cy="28" rx="26" ry="4" fill="#2b2530" stroke={ink} strokeWidth="2.5" /><rect x="34" y="4" width="32" height="24" fill="#2b2530" stroke={ink} strokeWidth="2.5" /><rect x="34" y="20" width="32" height="4" fill={c.color} /></g>}
      {c.hat === 'cap' && <g><path d="M28 30 Q30 14 50 14 Q70 14 72 30 Z" fill="#5b4a3a" stroke={ink} strokeWidth="2.5" /><path d="M66 28 Q80 28 82 33 L66 33 Z" fill="#5b4a3a" stroke={ink} strokeWidth="2.5" /></g>}
      {c.hat === 'beret' && <path d="M26 30 Q24 14 48 14 Q74 12 74 26 Q64 32 26 30 Z" fill="#1e1e2a" stroke={ink} strokeWidth="2.5" />}
      {c.hat === 'bandana' && <g><path d="M29 32 Q30 16 50 16 Q70 16 71 32 Z" fill="#d9372b" stroke={ink} strokeWidth="2.5" /><path d="M71 30 l10 4 l-8 4 Z" fill="#d9372b" stroke={ink} strokeWidth="2" /><circle cx="44" cy="24" r="1.5" fill="#f4efe6" /><circle cx="56" cy="22" r="1.5" fill="#f4efe6" /></g>}
      {c.hat === 'none' && <path d="M28 40 Q26 16 50 16 Q74 16 72 40 Q70 26 50 24 Q30 26 28 40 Z" fill="#3a2a22" stroke={ink} strokeWidth="2.5" />}
      {/* bandages */}
      {wounds > 0 && <path d="M30 34 L44 28" stroke="#f4efe6" strokeWidth="5" strokeLinecap="round" />}
      {wounds > 1 && <path d="M58 60 L70 54" stroke="#f4efe6" strokeWidth="5" strokeLinecap="round" />}
      {wounds > 2 && <path d="M64 30 L72 38" stroke="#f4efe6" strokeWidth="5" strokeLinecap="round" />}
    </svg>
  );
}
