export type DialCountry = {
  iso: string;
  dial: string;
  name: string;
  flag: string;
  lengths: number[];
};

export const DIAL_COUNTRIES: DialCountry[] = [
  { iso: 'CM', dial: '237', name: 'Cameroun', flag: '🇨🇲', lengths: [9] },
  { iso: 'GA', dial: '241', name: 'Gabon', flag: '🇬🇦', lengths: [7, 8] },
  { iso: 'CG', dial: '242', name: 'Congo', flag: '🇨🇬', lengths: [9] },
  { iso: 'CD', dial: '243', name: 'RDC', flag: '🇨🇩', lengths: [9] },
  { iso: 'TD', dial: '235', name: 'Tchad', flag: '🇹🇩', lengths: [8] },
  { iso: 'CF', dial: '236', name: 'Centrafrique', flag: '🇨🇫', lengths: [8] },
  { iso: 'GQ', dial: '240', name: 'Guinée équatoriale', flag: '🇬🇶', lengths: [9] },
  { iso: 'NG', dial: '234', name: 'Nigéria', flag: '🇳🇬', lengths: [10] },
  { iso: 'CI', dial: '225', name: 'Côte d’Ivoire', flag: '🇨🇮', lengths: [10] },
  { iso: 'SN', dial: '221', name: 'Sénégal', flag: '🇸🇳', lengths: [9] },
  { iso: 'ML', dial: '223', name: 'Mali', flag: '🇲🇱', lengths: [8] },
  { iso: 'BF', dial: '226', name: 'Burkina Faso', flag: '🇧🇫', lengths: [8] },
  { iso: 'GN', dial: '224', name: 'Guinée', flag: '🇬🇳', lengths: [9] },
  { iso: 'BJ', dial: '229', name: 'Bénin', flag: '🇧🇯', lengths: [8] },
  { iso: 'TG', dial: '228', name: 'Togo', flag: '🇹🇬', lengths: [8] },
  { iso: 'GH', dial: '233', name: 'Ghana', flag: '🇬🇭', lengths: [9] },
  { iso: 'MA', dial: '212', name: 'Maroc', flag: '🇲🇦', lengths: [9] },
  { iso: 'DZ', dial: '213', name: 'Algérie', flag: '🇩🇿', lengths: [9] },
  { iso: 'TN', dial: '216', name: 'Tunisie', flag: '🇹🇳', lengths: [8] },
  { iso: 'FR', dial: '33', name: 'France', flag: '🇫🇷', lengths: [9] },
  { iso: 'BE', dial: '32', name: 'Belgique', flag: '🇧🇪', lengths: [8, 9] },
  { iso: 'CH', dial: '41', name: 'Suisse', flag: '🇨🇭', lengths: [9] },
  { iso: 'CA', dial: '1', name: 'Canada', flag: '🇨🇦', lengths: [10] },
  { iso: 'US', dial: '1', name: 'États-Unis', flag: '🇺🇸', lengths: [10] },
  { iso: 'GB', dial: '44', name: 'Royaume-Uni', flag: '🇬🇧', lengths: [10] },
  { iso: 'DE', dial: '49', name: 'Allemagne', flag: '🇩🇪', lengths: [10, 11] },
  { iso: 'IT', dial: '39', name: 'Italie', flag: '🇮🇹', lengths: [9, 10] },
  { iso: 'ES', dial: '34', name: 'Espagne', flag: '🇪🇸', lengths: [9] },
];

const TZ_ISO: Record<string, string> = {
  'Africa/Douala': 'CM',
  'Africa/Libreville': 'GA',
  'Africa/Brazzaville': 'CG',
  'Africa/Kinshasa': 'CD',
  'Africa/Ndjamena': 'TD',
  'Africa/Bangui': 'CF',
  'Africa/Malabo': 'GQ',
  'Africa/Lagos': 'CM',
  'Africa/Abidjan': 'CI',
  'Africa/Dakar': 'SN',
  'Africa/Bamako': 'ML',
  'Africa/Ouagadougou': 'BF',
  'Africa/Conakry': 'GN',
  'Africa/Porto-Novo': 'BJ',
  'Africa/Lome': 'TG',
  'Africa/Accra': 'GH',
  'Africa/Casablanca': 'MA',
  'Africa/Algiers': 'DZ',
  'Africa/Tunis': 'TN',
  'Europe/Paris': 'FR',
  'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH',
  'America/Toronto': 'CA',
  'America/New_York': 'US',
  'Europe/London': 'GB',
  'Europe/Berlin': 'DE',
  'Europe/Rome': 'IT',
  'Europe/Madrid': 'ES',
};

export function detectDialCountry(): DialCountry {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const fromTz = TZ_ISO[tz];
    if (fromTz) {
      const hit = DIAL_COUNTRIES.find((row) => row.iso === fromTz);
      if (hit) return hit;
    }
    const lang = typeof navigator !== 'undefined' ? navigator.language || '' : '';
    const region = lang.split('-')[1]?.toUpperCase();
    const fromLang = DIAL_COUNTRIES.find((row) => row.iso === region);
    if (fromLang) return fromLang;
  } catch {
    /* ignore */
  }
  return DIAL_COUNTRIES[0];
}

export function digitsOnly(value: string) {
  return String(value || '').replace(/\D/g, '');
}

export function nationalDigits(value: string, country: DialCountry) {
  let digits = digitsOnly(value);
  if (digits.startsWith(country.dial)) digits = digits.slice(country.dial.length);
  if (digits.startsWith('0')) digits = digits.slice(1);
  const max = Math.max(...country.lengths);
  return digits.slice(0, max);
}

export function formatNational(value: string, country: DialCountry) {
  const digits = nationalDigits(value, country);
  const parts: string[] = [];
  if (country.dial === '1') {
    if (digits.length > 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length > 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return digits;
  }
  for (let i = 0; i < digits.length; i += 2) parts.push(digits.slice(i, i + 2));
  return parts.join(' ');
}

export function isValidNational(value: string, country: DialCountry) {
  const digits = nationalDigits(value, country);
  return country.lengths.includes(digits.length);
}

export function e164(value: string, country: DialCountry) {
  return `+${country.dial}${nationalDigits(value, country)}`;
}

export function phoneHint(country: DialCountry) {
  const n = country.lengths.join(' ou ');
  return `${n} chiffre${country.lengths[0] > 1 ? 's' : ''} sans l’indicatif`;
}
