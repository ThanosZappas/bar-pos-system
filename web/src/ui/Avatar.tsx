import { ICON_STROKE, ICON_VIEWBOX, PROFILE_ICONS } from './profileIconSet';
import type { Role } from '../session';

/** The role's icon when a profile has not chosen one. Same table as worker/src/icons.ts. */
export function defaultIcon(role: Role): string {
  return role === 'admin' ? 'admin' : role === 'barman' ? 'barman' : 'person';
}

/** The icon a profile shows: its own choice if it is a known icon, else its role's default. */
export function iconOf(icon: string | undefined, role: Role): string {
  return icon && icon in PROFILE_ICONS ? icon : defaultIcon(role);
}

export function ProfileIcon({ icon, size = 24 }: { icon: string; size?: number }) {
  const paths = PROFILE_ICONS[icon] ?? PROFILE_ICONS.person!;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      fill="none"
      stroke="currentColor"
      stroke-width={ICON_STROKE}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => <path d={d} />)}
    </svg>
  );
}

/** A profile's picture, or its gold line icon, in a square hairline frame. */
export function Avatar({ icon, photoUrl, size = 40, selected = false }: { icon: string; photoUrl?: string | null; size?: number; selected?: boolean }) {
  return (
    <span class={selected ? 'avatar selected' : 'avatar'} style={{ width: `${size}px`, height: `${size}px` }}>
      {photoUrl ? <img src={photoUrl} alt="" /> : <ProfileIcon icon={icon} size={Math.round(size * 0.62)} />}
    </span>
  );
}
