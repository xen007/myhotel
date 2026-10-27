import type { BoxIconName } from '@/components/box-icon';

export type StaffRole = 'receptionist' | 'manager' | 'housekeeping' | 'owner' | 'restaurant';
export type UserRole = StaffRole | 'client';

export const ROLE_LABEL: Record<UserRole, string> = {
  receptionist: 'Réception',
  manager: 'Gérance',
  housekeeping: 'Sales',
  owner: 'Propriétaire',
  client: 'Client',
  restaurant: 'Restaurant',
};

export type WorkspaceLink = {
  href: string;
  label: string;
  icon: BoxIconName;
  roles: UserRole[];
};

export const WORKSPACE_LINKS: WorkspaceLink[] = [
  { href: '/home', label: 'Tableau de bord', icon: 'home', roles: ['receptionist', 'manager', 'housekeeping', 'owner', 'restaurant'] },
  { href: '/reservations', label: 'Réservations', icon: 'calendar', roles: ['receptionist', 'manager', 'owner'] },
  { href: '/clients', label: 'Clients', icon: 'user', roles: ['receptionist', 'manager', 'owner'] },
  { href: '/pos', label: 'Ventes', icon: 'wallet', roles: ['receptionist', 'manager', 'owner'] },
  { href: '/reports', label: 'Rapports', icon: 'receipt', roles: ['receptionist', 'manager', 'owner'] },
  { href: '/housekeeping', label: 'Sales', icon: 'droplet', roles: ['housekeeping', 'manager', 'owner'] },
  { href: '/issues', label: 'Signalements', icon: 'error-circle', roles: ['housekeeping', 'manager', 'owner'] },
  // Suggestions désactivées : la page reste dans le projet, mais elle n’apparaît plus dans les menus.
  // { href: '/suggestions', label: 'Suggestions', icon: 'bulb', roles: ['receptionist', 'housekeeping', 'manager', 'owner'] },
  { href: '/messages', label: 'Messagerie', icon: 'envelope', roles: ['receptionist', 'housekeeping', 'manager', 'owner', 'restaurant'] },
  { href: '/orders', label: 'Commandes', icon: 'receipt', roles: ['restaurant', 'owner'] },
  { href: '/service', label: 'Vente', icon: 'wallet', roles: ['restaurant', 'owner'] },
  { href: '/restaurant', label: 'Menu', icon: 'food-menu', roles: ['restaurant', 'manager', 'owner'] },
  { href: '/daily', label: 'Menu du jour', icon: 'star', roles: ['restaurant', 'owner'] },
  { href: '/drinks', label: 'Boisson', icon: 'coffee', roles: ['restaurant', 'owner'] },
  { href: '/kitchen', label: 'Gestion stock', icon: 'cabinet', roles: ['restaurant', 'owner'] },
  { href: '/rooms', label: 'Chambres', icon: 'bed', roles: ['receptionist', 'manager', 'owner'] },
  { href: '/stock', label: 'Économat', icon: 'cabinet', roles: ['manager', 'owner'] },
  { href: '/schedule', label: 'Planning', icon: 'time', roles: ['receptionist', 'housekeeping', 'manager', 'owner'] },
  { href: '/staff', label: 'Personnel', icon: 'id-card', roles: ['owner'] },
  { href: '/payroll', label: 'Paie', icon: 'briefcase', roles: ['owner'] },
  { href: '/settings', label: 'Paramètres', icon: 'cog', roles: ['owner'] },
];

export function isStaffRole(role?: string | null): role is StaffRole {
  return role === 'receptionist' || role === 'manager' || role === 'housekeeping' || role === 'owner' || role === 'restaurant';
}

export const CLIENT_LINKS: WorkspaceLink[] = [
  { href: '/home', label: 'Accueil', icon: 'home', roles: ['client'] },
  { href: '/browse', label: 'Chambres', icon: 'bed', roles: ['client'] },
  { href: '/table', label: 'Restaurant', icon: 'restaurant', roles: ['client'] },
  { href: '/note', label: 'Note', icon: 'receipt', roles: ['client'] },
  { href: '/stay', label: 'Historique', icon: 'time', roles: ['client'] },
  { href: '/desk', label: 'Messagerie', icon: 'envelope', roles: ['client'] },
  { href: '/clean', label: 'Nettoyage', icon: 'droplet', roles: ['client'] },
];

const RESTAURANT_NAV = ['/home', '/daily', '/orders', '/service', '/drinks', '/restaurant', '/kitchen', '/messages'];
const OWNER_RESTAURANT = ['/daily', '/orders', '/service', '/drinks', '/restaurant', '/kitchen'];

export function linksFor(role?: string | null) {
  if (!isStaffRole(role)) return [];
  const links = WORKSPACE_LINKS.filter((item) => item.roles.includes(role)).map((item) =>
    item.href === '/issues' && role === 'housekeeping'
      ? { ...item, label: 'Mes signalements' }
      : item.href === '/reports' && role === 'receptionist'
        ? { ...item, label: 'Rapport' }
        : item.href === '/home' && role === 'restaurant'
            ? { ...item, label: 'Accueil' }
            : item.href === '/restaurant' && role === 'owner'
              ? { ...item, label: 'Restaurant', icon: 'restaurant' }
              : item,
  );
  if (role === 'owner') {
    const hotel = links.filter((item) => !OWNER_RESTAURANT.includes(item.href));
    const restaurant = OWNER_RESTAURANT.map((href) => links.find((item) => item.href === href)).filter((item): item is WorkspaceLink => !!item);
    const at = hotel.findIndex((item) => item.href === '/messages');
    hotel.splice(at < 0 ? hotel.length : at, 0, ...restaurant);
    return hotel;
  }
  if (role !== 'restaurant') return links;
  return [...links].sort((a, b) => {
    const left = RESTAURANT_NAV.indexOf(a.href);
    const right = RESTAURANT_NAV.indexOf(b.href);
    return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
  });
}
