export function money(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(value);
}

export const roomStatusLabel: Record<string, string> = {
  disponible: 'Disponible',
  occupee: 'Occupée',
  nettoyage: 'Nettoyage',
  maintenance: 'Maintenance',
  reservee: 'Réservée',
  hors_service: 'Hors service',
};

export const staffStatusLabel: Record<string, string> = {
  actif: 'Actif',
  conge: 'En congé',
  arret: 'Arrêt',
  banni: 'Banni',
};

export const reservationStatusLabel: Record<string, string> = {
  confirmee: 'Confirmée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  annulee: 'Annulée',
};

export const reservationTone: Record<string, 'gold' | 'ink' | 'muted'> = {
  confirmee: 'gold',
  en_cours: 'ink',
  terminee: 'muted',
  annulee: 'muted',
};

export const invoiceStatusLabel: Record<string, string> = {
  payee: 'Payée',
  en_attente: 'En attente',
  en_retard: 'En retard',
};

export function prettyDate(value: string) {
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

export function prettyWhen(date: string, time?: string | null) {
  const hour = time ? String(time).slice(0, 5) : '';
  return hour ? `${prettyDate(date)} à ${hour}` : prettyDate(date);
}

export function prettyStamp(value?: string | null) {
  if (!value) return '—';
  const raw = String(value);
  return prettyWhen(raw.slice(0, 10), raw.slice(11, 16));
}

export function prettyChatTime(value?: string | null) {
  if (!value) return '';
  const day = String(value).slice(0, 10);
  const time = String(value).slice(11, 16);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (day === today) return time || prettyDate(day);
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const [, month, date] = day.split('-');
  if (!month || !date) return prettyDate(day);
  return `${Number(date)} ${months[Number(month) - 1]}`;
}

export const hkStatusLabel: Record<string, string> = {
  non_prise: 'Non pris en charge',
  en_cours: 'En cours de nettoyage',
  pret: 'Prêt',
  maintenance: 'Maintenance',
};

export const hkPriorityLabel: Record<string, string> = {
  urgente: 'Urgence',
  haute: 'Haute',
  normale: 'Normale',
};
