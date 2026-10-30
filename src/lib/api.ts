import { getApiBaseUrl } from '@/constants/config';
import { removeItem } from '@/lib/storage';

export type ApiUser = {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  last_login?: string | null;
  photo?: string | null;
  role?: string | null;
  status?: string | null;
};

export type AuthPayload = {
  user: ApiUser;
  token: string;
};

export type EquipmentItem = {
  id: number;
  name: string;
  category: string;
  icon: string;
  quantity?: number;
  rooms_count?: number;
};

export type Room = {
  id: number;
  number: string;
  type: string;
  floor: number;
  status: string;
  price_night: number;
  capacity: number;
  photo: string;
  photos?: string[];
  videos?: string[];
  video?: string | null;
  description: string;
  equipment: EquipmentItem[];
  history?: {
    id: number;
    guest_name: string;
    guest_phone?: string | null;
    check_in: string;
    check_out: string;
    check_in_time?: string;
    check_out_time?: string;
    status: string;
    total: number;
  }[];
};

export type StaffMember = {
  id: number;
  full_name: string;
  role: string;
  department: string;
  phone: string | null;
  email: string | null;
  status: string;
  hired_at: string;
  photo: string | null;
  contract_type?: string | null;
  salary_type?: string | null;
  salary_amount?: number | null;
  id_number?: string | null;
};

export type MenuItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  description: string | null;
  photo: string | null;
  available: number;
};

export type Guest = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  notes: string | null;
};

export type Reservation = {
  id: number;
  guest_id: number;
  room_id: number;
  check_in: string;
  check_out: string;
  status: string;
  total: number;
  guest_name: string;
  guest_phone: string | null;
  room_number: string;
  room_type: string;
  room_photo: string;
};

export type HotelService = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  icon: string;
};

export type Invoice = {
  id: number;
  guest_name: string;
  amount: number;
  status: string;
  issued_at: string;
  label: string;
};

export type DashboardStats = {
  rooms: {
    total: number;
    available: number;
    occupied: number;
    cleaning: number;
    maintenance: number;
  };
  staff: { total: number; active: number };
  reservations: { total: number; live: number };
  billing: { paid: number; pending: number };
};

type ApiSuccess<T> = { ok: true; data: T; message?: string };
type ApiFailure = { ok: false; error: string };

async function request<T>(path: string, init: RequestInit = {}, token?: string | null, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    const raw = await response.text();
    let json: ApiSuccess<T> | ApiFailure;
    try {
      json = JSON.parse(raw) as ApiSuccess<T> | ApiFailure;
    } catch {
      throw new Error('Réponse serveur invalide. Vérifiez que l’API MyHotel est démarrée.');
    }

    if (response.status === 401 && token && path !== '/auth/login' && path !== '/auth/register') {
      await removeItem('myhotel.auth.token');
      await removeItem('myhotel.auth.user');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }

    if (!response.ok || !json.ok) {
      const message = !json.ok ? json.error : 'Une erreur est survenue.';
      throw new Error(message);
    }

    return json.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Impossible de joindre le serveur. Lancez l’API : npm run api');
      }
      if (
        error.message === 'Network request failed' ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('ERR_CONNECTION_REFUSED')
      ) {
        throw new Error('Connexion refusée. L’API ne répond pas. En local, lancez npm run api puis npx expo start.');
      }
      throw error;
    }
    throw new Error('Une erreur inattendue est survenue.');
  } finally {
    clearTimeout(timer);
  }
}

export function loginRequest(email: string, password: string) {
  return request<AuthPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function registerRequest(payload: {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
}) {
  return request<AuthPayload>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function meRequest(token: string) {
  return request<{ user: ApiUser }>('/auth/me', { method: 'GET' }, token);
}

export function logoutRequest(token: string) {
  return request<{ closed: boolean }>('/auth/logout', { method: 'POST' }, token);
}

export function updateProfileRequest(
  token: string,
  payload: { full_name?: string; photo?: string | null },
) {
  return request<{ user: ApiUser }>('/auth/profile', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function updatePasswordRequest(
  token: string,
  payload: { current_password: string; new_password: string },
) {
  return request<{ updated: boolean }>('/auth/password', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export type HotelNotification = {
  id: number;
  category: string;
  title: string;
  body: string;
  href?: string | null;
  is_read: boolean;
  created_at: string;
};

export type NotificationsPayload = {
  items: HotelNotification[];
  unread: number;
};

export function notificationsRequest(token: string) {
  return request<NotificationsPayload>('/notifications', { method: 'GET' }, token);
}

export function readNotificationsRequest(token: string, payload: { id?: number; all?: boolean }) {
  return request<NotificationsPayload>('/notifications/read', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function dashboardRequest(token: string) {
  return request<DashboardStats>('/dashboard', { method: 'GET' }, token);
}

export function roomsRequest(token: string) {
  return request<Room[]>('/rooms', { method: 'GET' }, token);
}

export function roomRequest(token: string, id: string) {
  return request<Room>(`/rooms/${id}`, { method: 'GET' }, token);
}

export function equipmentRequest(token: string) {
  return request<EquipmentItem[]>('/equipment', { method: 'GET' }, token);
}

export function staffRequest(token: string) {
  return request<StaffMember[]>('/staff', { method: 'GET' }, token);
}

export function menuRequest(token: string) {
  return request<MenuItem[]>('/menu', { method: 'GET' }, token);
}

export function reservationsRequest(token: string) {
  return request<Reservation[]>('/reservations', { method: 'GET' }, token);
}

export function guestsRequest(token: string) {
  return request<Guest[]>('/guests', { method: 'GET' }, token);
}

export function servicesRequest(token: string) {
  return request<HotelService[]>('/services', { method: 'GET' }, token);
}

export function invoicesRequest(token: string) {
  return request<Invoice[]>('/invoices', { method: 'GET' }, token);
}

export function housekeepingRequest(token: string) {
  return request<{ rooms: Room[]; team: StaffMember[] }>('/housekeeping', { method: 'GET' }, token);
}

export type CompanyProfile = {
  id?: number;
  name: string;
  legal_name?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  nif?: string | null;
  rccm?: string | null;
  slogan?: string | null;
  logo?: string | null;
  stamp?: string | null;
};

export function pmsGet<T>(token: string, path: string) {
  return request<T>(`/pms/${path}`, { method: 'GET' }, token);
}

export function visitGet<T>(path: string) {
  return request<T>(`/pms/${path}`, { method: 'GET' }, null, 30000);
}

export function visitPost<T>(path: string, body: Record<string, unknown> = {}) {
  return request<T>(`/pms/${path}`, { method: 'POST', body: JSON.stringify(body) });
}

export function pmsPost<T>(token: string, path: string, body: Record<string, unknown> = {}, timeoutMs = 15000) {
  return request<T>(`/pms/${path}`, { method: 'POST', body: JSON.stringify(body) }, token, timeoutMs);
}
