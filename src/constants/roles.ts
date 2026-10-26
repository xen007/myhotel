import type { BoxIconName } from '@/components/box-icon';

export type StaffRole = 'receptionist' | 'manager' | 'housekeeping' | 'owner';
export type UserRole = StaffRole | 'client';

export const ROLE_LABEL: Record<UserRole, string> = {
  receptionist: 'Réception',
  manager: 'Gérance',
  housekeeping: 'Entretien',
  owner: 'Propriétaire',
  client: 'Compte',
};

export type WorkspaceLink = {
  href: string;
  label: string;
  icon: BoxIconName;
  roles: StaffRole[];
};

export const WORKSPACE_LINKS: WorkspaceLink[] = [
  { href: '/home', label: 'Tableau de bord', icon: 'home', roles: ['receptionist', 'manager', 'housekeeping', 'owner'] },
  { href: '/reservations', label: 'Réservations', icon: 'calendar', roles: ['receptionist', 'manager', 'owner'] },
  { href: '/pos', label: 'Ventes', icon: 'wallet', roles: ['receptionist', 'manager', 'owner'] },
  { href: '/housekeeping', label: 'Entretien', icon: 'droplet', roles: ['housekeeping', 'manager', 'owner'] },
  { href: '/issues', label: 'Signalements', icon: 'error-circle', roles: ['housekeeping', 'manager', 'owner'] },
  // Suggestions désactivées : la page reste dans le projet, mais elle n’apparaît plus dans les menus.
  // { href: '/suggestions', label: 'Suggestions', icon: 'bulb', roles: ['receptionist', 'housekeeping', 'manager', 'owner'] },
  { href: '/messages', label: 'Messagerie', icon: 'envelope', roles: ['receptionist', 'housekeeping', 'manager', 'owner'] },
  { href: '/rooms', label: 'Chambres', icon: 'bed', roles: ['receptionist', 'manager', 'owner'] },
  { href: '/stock', label: 'Gestion des stocks', icon: 'cabinet', roles: ['manager', 'owner'] },
  { href: '/schedule', label: 'Planning', icon: 'time', roles: ['receptionist', 'housekeeping', 'manager', 'owner'] },
  { href: '/reports', label: 'Rapports', icon: 'receipt', roles: ['manager', 'owner'] },
  { href: '/staff', label: 'Personnel', icon: 'id-card', roles: ['owner'] },
  { href: '/payroll', label: 'Paie', icon: 'briefcase', roles: ['owner'] },
  { href: '/settings', label: 'Paramètres', icon: 'cog', roles: ['owner'] },
];

export function isStaffRole(role?: string | null): role is StaffRole {
  return role === 'receptionist' || role === 'manager' || role === 'housekeeping' || role === 'owner';
}

export function linksFor(role?: string | null) {
  if (!isStaffRole(role)) return [];
  return WORKSPACE_LINKS.filter((item) => item.roles.includes(role)).map((item) =>
    item.href === '/issues' && role === 'housekeeping' ? { ...item, label: 'Mes signalements' } : item,
  );
}
