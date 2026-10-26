import type { Room } from '@/lib/api';

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export type RoomStay = NonNullable<Room['history']>[number];

export type PeriodBar = { label: string; count: number; share: number };

export type RoomStats = {
  bookings: number;
  guests: number;
  revenue: number;
  nights: number;
  occupancy: number;
  cancelled: number;
  topMonths: PeriodBar[];
  topWeekdays: PeriodBar[];
  months: PeriodBar[];
  peakMonth: string;
  peakWeekday: string;
};

function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${String(checkIn).slice(0, 10)}T12:00:00`);
  const end = new Date(`${String(checkOut).slice(0, 10)}T12:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Math.max(1, days);
}

function toBars(counts: number[], labels: string[]): PeriodBar[] {
  const max = Math.max(1, ...counts);
  return counts.map((count, index) => ({
    label: labels[index],
    count,
    share: count / max,
  }));
}

export function computeRoomStats(history: RoomStay[] = []): RoomStats {
  const cancelled = history.filter((row) => row.status === 'annulee').length;
  const stays = history.filter((row) => row.status !== 'annulee');
  const guests = new Set(stays.map((row) => String(row.guest_name || '').trim().toLowerCase()).filter(Boolean)).size;
  const revenue = stays.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const nights = stays.reduce((sum, row) => sum + nightsBetween(row.check_in, row.check_out), 0);
  const monthCounts = Array.from({ length: 12 }, () => 0);
  const dayCounts = Array.from({ length: 7 }, () => 0);
  const yearAgo = Date.now() - 365 * 86400000;
  let recentNights = 0;

  stays.forEach((row) => {
    const date = new Date(`${String(row.check_in).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return;
    monthCounts[date.getMonth()] += 1;
    dayCounts[date.getDay()] += 1;
    if (date.getTime() >= yearAgo) recentNights += nightsBetween(row.check_in, row.check_out);
  });

  const months = toBars(monthCounts, MONTHS);
  const weekdays = toBars(dayCounts, WEEKDAYS);
  const topMonths = [...months].sort((a, b) => b.count - a.count).filter((row) => row.count > 0).slice(0, 3);
  const topWeekdays = [...weekdays].sort((a, b) => b.count - a.count).filter((row) => row.count > 0).slice(0, 3);

  return {
    bookings: stays.length,
    guests,
    revenue,
    nights,
    occupancy: Math.min(100, Math.round((recentNights / 365) * 100)),
    cancelled,
    topMonths,
    topWeekdays,
    months,
    peakMonth: topMonths[0]?.label ?? '—',
    peakWeekday: topWeekdays[0]?.label ?? '—',
  };
}
