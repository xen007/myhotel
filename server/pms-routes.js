const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { day } = require('./pms-seed');
const { DATA_DIR } = require('./db');
const { writeAudit, actorIdentity } = require('./audit');
const { buildBrandedPdf } = require('./pdf-brand');

const CHAT_DIR = path.join(DATA_DIR, 'chat');
const MAX_CHAT_FILE = 12 * 1024 * 1024;

function num(v) {
  return Number(v || 0);
}

function chatPreview(row) {
  const body = String(row?.body || '').trim();
  if (body) return body;
  const mime = String(row?.attachment_mime || '');
  const name = String(row?.attachment_name || 'Fichier');
  if (mime.startsWith('image/')) return 'Photo';
  if (mime.startsWith('video/')) return 'Vidéo';
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return name;
  return name;
}

function fileExt(name, mime) {
  const fromName = String(name || '').toLowerCase().match(/(\.[a-z0-9]{1,8})$/);
  if (fromName) return fromName[1];
  if (String(mime).startsWith('image/')) return '.jpg';
  if (String(mime).startsWith('video/')) return '.mp4';
  if (mime === 'application/pdf') return '.pdf';
  return '';
}

function saveChatFile(file) {
  const raw = String(file.data || '');
  const comma = raw.indexOf(',');
  const data = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw;
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) throw new Error('Fichier vide.');
  if (buf.length > MAX_CHAT_FILE) throw new Error('Fichier trop volumineux (12 Mo max).');
  fs.mkdirSync(CHAT_DIR, { recursive: true });
  const ext = fileExt(file.name, file.mime);
  const stored = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(CHAT_DIR, stored), buf);
  return {
    url: `/uploads/chat/${stored}`,
    name: String(file.name || stored).slice(0, 180),
    mime: String(file.mime || 'application/octet-stream').slice(0, 120),
    size: buf.length,
  };
}

async function reservationRows(db) {
  const rows = await db.all(
    `SELECT r.*, g.full_name AS guest_name, g.first_name, g.last_name, g.phone AS guest_phone,
            g.document_id, g.vip AS guest_vip,
            rm.number AS room_number, rm.type AS room_type, rm.photo AS room_photo, rm.status AS room_status
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     JOIN rooms rm ON rm.id = r.room_id
     ORDER BY r.check_in DESC`,
  );
  let occupants = [];
  try {
    occupants = await db.all('SELECT * FROM reservation_occupants');
  } catch {
    occupants = [];
  }
  return rows.map((row) => ({
    ...row,
    occupants: occupants.filter((person) => Number(person.reservation_id) === Number(row.id)),
  }));
}

async function planning(db) {
  const rooms = await db.all("SELECT id, number, type, floor, status, maintenance_level FROM rooms WHERE IFNULL(deleted_at, '') = '' ORDER BY number");
  const days = Array.from({ length: 10 }, (_, i) => day(i - 1));
  const res = await reservationRows(db);
  const cells = rooms.map((room) => ({
    ...room,
    days: days.map((d) => {
      const hit = res.find(
        (r) => Number(r.room_id) === Number(room.id) && r.check_in <= d && r.check_out > d && r.status !== 'annulee',
      );
      if (!hit) return { date: d, busy: false };
      return {
        date: d,
        busy: true,
        guest: hit.guest_name,
        status: hit.status,
        confirmed: Number(hit.confirmed) === 1,
        source: hit.source,
        reservation_id: hit.id,
      };
    }),
  }));
  return { days, rooms: cells };
}

function at(date, time) {
  return `${String(date || '').slice(0, 10)} ${String(time || '00:00').slice(0, 5)}`;
}

function mapHkStatus(status, roomStatus) {
  if (roomStatus === 'maintenance') return 'maintenance';
  if (status === 'a_faire' || status === 'ouverte') return 'non_prise';
  if (status === 'controle' || status === 'termine' || status === 'pret') return 'pret';
  if (status === 'nettoyage') return 'en_cours';
  if (status) return status;
  if (roomStatus === 'nettoyage') return 'en_cours';
  return null;
}

async function hkAgentList(db) {
  const map = new Map();
  for (const row of await db.all("SELECT id, full_name, email FROM users WHERE role = 'housekeeping' AND IFNULL(status, 'actif') != 'banni'")) {
    map.set(String(row.full_name), {
      name: row.full_name,
      email: row.email,
      user_id: Number(row.id),
      source: 'compte',
    });
  }
  for (const row of await db.all("SELECT id, full_name, email FROM staff WHERE department = 'Étages' AND status = 'actif'")) {
    if (!map.has(String(row.full_name))) {
      map.set(String(row.full_name), {
        name: row.full_name,
        email: row.email,
        user_id: null,
        source: 'personnel',
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
}

async function isHkAgentName(db, name) {
  const key = String(name || '').trim();
  if (!key) return false;
  return (await hkAgentList(db)).some((agent) => agent.name === key);
}

async function replaceHkCrew(db, taskId, leadName, helpers, agents) {
  const allowed = new Set(agents.map((agent) => agent.name));
  await db.run('DELETE FROM hk_crew WHERE task_id = ?', [taskId]);
  const names = [leadName, ...(Array.isArray(helpers) ? helpers : [])]
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index);
  for (const name of names) {
    if (!allowed.has(name) && name !== leadName) continue;
    const agent = agents.find((item) => item.name === name);
    await db.run('INSERT INTO hk_crew (task_id, agent_name, user_id, is_lead) VALUES (?,?,?,?)', [
      taskId,
      name,
      agent?.user_id || null,
      name === leadName ? 1 : 0,
    ]);
  }
}

async function hkClaimStats(db, name) {
  const who = String(name || '').trim();
  const today = stampNow().slice(0, 10);
  if (!who) return { today: 0, total: 0 };
  const todayRow = await db.get(
    `SELECT COUNT(DISTINCT t.id) AS n
     FROM hk_tasks t
     LEFT JOIN hk_crew c ON c.task_id = t.id
     WHERE t.started_at LIKE ?
       AND (t.lead_name = ? OR t.attendant = ? OR c.agent_name = ?)`,
    [`${today}%`, who, who, who],
  );
  const totalRow = await db.get(
    `SELECT COUNT(DISTINCT t.id) AS n
     FROM hk_tasks t
     LEFT JOIN hk_crew c ON c.task_id = t.id
     WHERE t.started_at IS NOT NULL AND t.started_at != ''
       AND (t.lead_name = ? OR t.attendant = ? OR c.agent_name = ?)`,
    [who, who, who],
  );
  return { today: num(todayRow && todayRow.n), total: num(totalRow && totalRow.n) };
}

function isOpenHk(task) {
  const status = String(task.status || '');
  return status !== 'pret' && status !== 'termine' && status !== 'controle';
}

async function computeDashboard(db, actor) {
  const today = stampNow().slice(0, 10);
  const rooms = await db.get(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'disponible' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'occupee' THEN 1 ELSE 0 END) AS occupied,
      SUM(CASE WHEN status = 'nettoyage' THEN 1 ELSE 0 END) AS cleaning,
      SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance
     FROM rooms`,
  );
  const reservations = await reservationRows(db);
  let tasks = [];
  let issues = [];
  try {
    tasks = await db.all('SELECT * FROM hk_tasks');
  } catch {
    tasks = [];
  }
  try {
    issues = await db.all('SELECT * FROM hk_issues');
  } catch {
    issues = [];
  }
  const series = Array.from({ length: 7 }, (_, i) => {
    const date = day(i - 6);
    const occupied = reservations.filter(
      (row) => row.status !== 'annulee' && row.check_in <= date && row.check_out > date,
    ).length;
    return {
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      occupied,
      arrivals: reservations.filter((row) => row.check_in === date && row.status !== 'annulee').length,
      departures: reservations.filter((row) => row.check_out === date && row.status !== 'annulee').length,
      claimed: tasks.filter((task) => String(task.started_at || '').startsWith(date)).length,
      ready: tasks.filter((task) => String(task.finished_at || '').startsWith(date)).length,
    };
  });
  const billing = await db.get(
    `SELECT
      SUM(CASE WHEN status = 'payee' THEN amount ELSE 0 END) AS paid,
      SUM(CASE WHEN status != 'payee' THEN amount ELSE 0 END) AS pending
     FROM invoices`,
  );
  const posToday = await db.get('SELECT COALESCE(SUM(total), 0) AS n FROM pos_sales WHERE at LIKE ?', [`${today}%`]);
  const posTodayCount = await db.get('SELECT COUNT(*) AS n FROM pos_sales WHERE at LIKE ?', [`${today}%`]);
  const totalRooms = num(rooms && rooms.total);
  return {
    rooms: {
      total: totalRooms,
      available: num(rooms && rooms.available),
      occupied: num(rooms && rooms.occupied),
      cleaning: num(rooms && rooms.cleaning),
      maintenance: num(rooms && rooms.maintenance),
    },
    reservations: {
      total: reservations.length,
      live: reservations.filter((row) => row.status === 'en_cours' || row.status === 'confirmee').length,
      arrivals_today: reservations.filter((row) => row.check_in === today && row.status !== 'annulee').length,
      departures_today: reservations.filter((row) => row.check_out === today && row.status !== 'annulee').length,
      in_house: reservations.filter((row) => row.status === 'en_cours').length,
    },
    housekeeping: {
      urgente: tasks.filter((task) => task.priority === 'urgente' && isOpenHk(task)).length,
      non_prise: tasks.filter((task) => task.status === 'non_prise' || task.status === 'a_faire' || task.status === 'ouverte').length,
      en_cours: tasks.filter((task) => task.status === 'en_cours' || task.status === 'nettoyage').length,
      pret_today: tasks.filter((task) => String(task.finished_at || '').startsWith(today)).length,
      maintenance: num(rooms && rooms.maintenance),
      issues_open: issues.filter((item) => item.status !== 'resolue').length,
    },
    agent: await hkClaimStats(db, actor && actor.full_name),
    billing: { paid: num(billing && billing.paid), pending: num(billing && billing.pending) },
    pos_today: num(posToday && posToday.n),
    pos_count_today: num(posTodayCount && posTodayCount.n),
    occupancy_pct: totalRooms ? Math.round((num(rooms && rooms.occupied) / totalRooms) * 100) : 0,
    series,
    suggestions: await suggestionCounts(db, actor),
    badges: {
      active: Number((await db.get("SELECT COUNT(*) AS n FROM client_badges WHERE IFNULL(status,'actif') = 'actif' AND date(valid_to) >= date('now')")).n || 0),
      expired: Number((await db.get("SELECT COUNT(*) AS n FROM client_badges WHERE IFNULL(status,'actif') = 'actif' AND date(valid_to) < date('now')")).n || 0),
      cancelled: Number((await db.get("SELECT COUNT(*) AS n FROM client_badges WHERE status = 'annule'")).n || 0),
      total: Number((await db.get('SELECT COUNT(*) AS n FROM client_badges')).n || 0),
    },
  };
}

async function suggestionCounts(db, actor) {
  if (actor && actor.role === 'owner') {
    return {
      open: Number((await db.get("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'ouverte'")).n || 0),
      total: Number((await db.get('SELECT COUNT(*) AS n FROM suggestions')).n || 0),
    };
  }
  const who = (actor && actor.full_name) || '';
  return {
    open: Number((await db.get("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'ouverte' AND author = ?", [who])).n || 0),
    total: Number((await db.get('SELECT COUNT(*) AS n FROM suggestions WHERE author = ?', [who])).n || 0),
  };
}

async function staffContacts(db, actorId) {
  const rows = await db.all(
    `SELECT id, full_name, email, role, photo FROM users
     WHERE role IN ('receptionist','manager','housekeeping','owner') AND id != ?
       AND IFNULL(status, 'actif') != 'banni'
     ORDER BY full_name`,
    [actorId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    photo: row.photo || null,
  }));
}

function threadPair(a, b) {
  const x = Number(a);
  const y = Number(b);
  return x < y ? [x, y] : [y, x];
}

async function getOrCreateThread(db, a, b) {
  const [userA, userB] = threadPair(a, b);
  let thread = await db.get('SELECT * FROM chat_threads WHERE user_a = ? AND user_b = ?', [userA, userB]);
  if (!thread) {
    await db.run('INSERT INTO chat_threads (user_a, user_b, created_at) VALUES (?,?,?)', [userA, userB, stampNow()]);
    thread = await db.get('SELECT * FROM chat_threads WHERE id = ?', [db.lastId()]);
  }
  return thread;
}

async function publicContact(db, id) {
  const row = await db.get('SELECT id, full_name, email, role, photo FROM users WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    photo: row.photo || null,
  };
}

const EMPLOYEE_ROLES = ['receptionist', 'manager', 'housekeeping'];

function departmentForRole(role) {
  if (role === 'housekeeping') return 'Étages';
  if (role === 'manager') return 'Gérance';
  if (role === 'owner') return 'Direction';
  return 'Réception';
}

function hrRoleLabel(role) {
  if (role === 'housekeeping') return 'Agent d’étage';
  if (role === 'manager') return 'Manager d’hôtel';
  if (role === 'owner') return 'Propriétaire';
  return 'Réceptionniste';
}

function publicEmployee(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email,
    phone: row.phone || null,
    role: row.role,
    status: row.status || 'actif',
    photo: row.photo || null,
    last_login: row.last_login || null,
    created_at: row.created_at,
  };
}

async function syncHrRecord(db, user) {
  const email = String(user.email || '').trim().toLowerCase();
  if (!email) return;
  const hrStatus = String(user.status || 'actif') === 'banni' ? 'arret' : 'actif';
  const existing = await db.get('SELECT id FROM staff WHERE lower(email) = ?', [email]);
  if (existing) {
    await db.run('UPDATE staff SET full_name=?, role=?, department=?, phone=?, status=? WHERE id=?', [
      user.full_name,
      hrRoleLabel(user.role),
      departmentForRole(user.role),
      user.phone || null,
      hrStatus,
      existing.id,
    ]);
    return;
  }
  await db.run(
    'INSERT INTO staff (full_name, role, department, phone, email, status, hired_at, photo) VALUES (?,?,?,?,?,?,?,?)',
    [
      user.full_name,
      hrRoleLabel(user.role),
      departmentForRole(user.role),
      user.phone || null,
      email,
      hrStatus,
      new Date().toISOString().slice(0, 10),
      user.photo || null,
    ],
  );
}

function parseEmployeeBody(body, { requirePassword }) {
  const fullName = String(body.full_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const role = String(body.role || '').trim();
  const password = String(body.password || '');
  if (fullName.length < 2 || fullName.length > 120) return { error: 'Indiquez un nom complet valide.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Adresse e-mail invalide.' };
  if (phone && !/^[0-9+\s().-]{6,30}$/.test(phone)) return { error: 'Numéro de téléphone invalide.' };
  if (!EMPLOYEE_ROLES.includes(role)) return { error: 'Choisissez un rôle (réception, gérance ou entretien).' };
  if (requirePassword && (password.length < 8 || password.length > 72)) {
    return { error: 'Le mot de passe doit contenir entre 8 et 72 caractères.' };
  }
  if (!requirePassword && password && (password.length < 8 || password.length > 72)) {
    return { error: 'Le mot de passe doit contenir entre 8 et 72 caractères.' };
  }
  return { fullName, email, phone: phone || null, role, password };
}

async function messagesPayload(db, actor) {
  const me = Number(actor.id);
  let threads = [];
  try {
    threads = await db.all('SELECT * FROM chat_threads WHERE user_a = ? OR user_b = ?', [me, me]);
  } catch {
    threads = [];
  }
  const list = [];
  for (const thread of threads) {
    const otherId = Number(thread.user_a) === me ? thread.user_b : thread.user_a;
    const last = await db.get('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1', [thread.id]);
    list.push({
      id: Number(thread.id),
      other: await publicContact(db, otherId),
      last_body: last ? chatPreview(last) : '',
      last_at: last ? last.created_at : thread.created_at,
    });
  }
  list.sort((a, b) => String(b.last_at || '').localeCompare(String(a.last_at || '')));
  const started = list.filter((item) => item.last_body);
  let messages = [];
  if (threads.length) {
    const ids = threads.map((row) => Number(row.id));
    messages = await db.all(
      `SELECT * FROM chat_messages WHERE thread_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
      ids,
    );
  }
  return { contacts: await staffContacts(db, me), threads: started, messages };
}

async function enrichHkTask(db, task) {
  let crew = [];
  let issues = [];
  try {
    crew = await db.all(
      'SELECT agent_name, user_id, is_lead FROM hk_crew WHERE task_id = ? ORDER BY is_lead DESC, agent_name',
      [task.id],
    );
  } catch {
    crew = [];
  }
  try {
    issues = await db.all(
      'SELECT * FROM hk_issues WHERE task_id = ? OR (task_id IS NULL AND room_number = ?) ORDER BY at DESC',
      [task.id, task.room_number],
    );
  } catch {
    issues = [];
  }
  if (!crew.length && task.attendant) {
    crew = [{ agent_name: task.attendant, user_id: null, is_lead: 1 }];
  }
  const room = await db.get('SELECT status FROM rooms WHERE number = ?', [task.room_number]);
  return {
    ...task,
    status: mapHkStatus(task.status, room && room.status),
    lead_name: task.lead_name || task.attendant,
    crew,
    helpers: crew.filter((row) => Number(row.is_lead) !== 1).map((row) => row.agent_name),
    issues,
  };
}

function localNowStamp() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

async function queueDepartureCleaning(db, roomNumber, guestName, endStamp) {
  const room = await db.get('SELECT * FROM rooms WHERE number = ?', [roomNumber]);
  if (!room || room.status === 'maintenance') return;
  const open = await db.get(
    "SELECT id FROM hk_tasks WHERE room_number = ? AND status NOT IN ('pret','termine','controle') ORDER BY id DESC LIMIT 1",
    [roomNumber],
  );
  if (!open) {
    await db.run(
      `INSERT INTO hk_tasks (room_number, attendant, priority, status, eta_minutes, due_at, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        roomNumber,
        '',
        'normale',
        'non_prise',
        45,
        stampNow(),
        `Départ automatique${guestName ? ` · ${guestName}` : ''} — chambre à nettoyer.`,
        stampNow(),
      ],
    );
  }
  await db.run("UPDATE rooms SET status = 'nettoyage' WHERE number = ? AND status != 'maintenance'", [roomNumber]);
  await db.run(
    `INSERT INTO notifications (category, title, body, href, is_read, created_at)
     VALUES ('ÉTAGES', 'Chambre à nettoyer', ?, '/housekeeping', 0, ?)`,
    [`Chambre ${roomNumber} libérée (${endStamp}) — passage entretien.`, stampNow()],
  );
}

async function releaseExpiredStays(db) {
  const now = localNowStamp();
  let rows = [];
  try {
    rows = await db.all(
      `SELECT r.id, r.check_out, r.check_out_time, rm.number AS room_number, g.full_name AS guest_name
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       JOIN guests g ON g.id = r.guest_id
       WHERE r.status IN ('en_cours', 'confirmee')`,
    );
  } catch {
    return;
  }
  for (const row of rows) {
    const end = at(row.check_out, row.check_out_time || '12:00');
    if (end > now) continue;
    await db.run("UPDATE reservations SET status = 'terminee' WHERE id = ?", [row.id]);
    try {
      await db.run(
        "UPDATE client_badges SET status = 'expire' WHERE IFNULL(status,'actif') = 'actif' AND (reservation_id = ? OR (room_number = ? AND guest_name = ?))",
        [row.id, row.room_number, row.guest_name],
      );
    } catch {
      /* badges optionnels */
    }
    try {
      await queueDepartureCleaning(db, row.room_number, row.guest_name, end);
    } catch {
      /* hk_tasks peut manquer une colonne */
    }
  }
}

async function markReadyRoomsDisponible(db) {
  try {
    await db.run(
      `UPDATE rooms SET status = 'disponible'
       WHERE status = 'nettoyage'
         AND number IN (
           SELECT room_number FROM hk_tasks t
           WHERE status IN ('pret','termine','controle')
             AND NOT EXISTS (
               SELECT 1 FROM hk_tasks o
               WHERE o.room_number = t.room_number
                 AND o.status NOT IN ('pret','termine','controle')
             )
         )`,
    );
  } catch {
    /* ignore */
  }
}

async function enrichRooms(db) {
  const today = day(0);
  const now = at(today, new Date().toTimeString().slice(0, 5));
  await markReadyRoomsDisponible(db);
  const stays = (await reservationRows(db)).filter((row) => row.status !== 'annulee' && row.status !== 'terminee');
  const tasks = await db.all('SELECT * FROM hk_tasks ORDER BY id DESC');
  const rooms = await db.all(
    `SELECT id, number, type, floor, status, price_night, capacity, photo, video, description,
            maintenance_level, maintenance_note
     FROM rooms WHERE IFNULL(deleted_at, '') = '' ORDER BY number`,
  );
  return rooms.map((room) => {
    const roomStays = stays
      .filter((row) => Number(row.room_id) === Number(room.id))
      .map((row) => ({
        ...row,
        start: at(row.check_in, row.check_in_time || '14:00'),
        end: at(row.check_out, row.check_out_time || '12:00'),
      }))
      .sort((a, b) => a.start.localeCompare(b.start));
    const current = roomStays.find((row) => row.start <= now && row.end > now) || null;
    const nextStay = roomStays.find((row) => row.start > (current ? current.end : now)) || null;
    const covering = roomStays.filter((row) => row.start <= now && row.end > now);
    let nextFree = covering.length ? covering.map((row) => row.end).sort().pop() : now;
    const openTask = tasks.find((task) => task.room_number === room.number && !['pret', 'termine', 'controle'].includes(task.status));
    const light = room.status === 'maintenance' && room.maintenance_level === 'legere';
    const hkStatus = light ? mapHkStatus(openTask?.status, null) : mapHkStatus(openTask?.status, room.status);
    if (!current && !light && (hkStatus === 'en_cours' || hkStatus === 'non_prise' || hkStatus === 'maintenance')) {
      const eta = Number(openTask?.eta_minutes || 45);
      const later = new Date();
      later.setMinutes(later.getMinutes() + eta);
      const etaStamp = at(today, later.toTimeString().slice(0, 5));
      if (etaStamp > nextFree) nextFree = etaStamp;
    }
    let bucket = 'disponible';
    const hkBusy = hkStatus === 'en_cours' || hkStatus === 'non_prise' || hkStatus === 'maintenance';
    if (room.status === 'maintenance' && !light) bucket = 'entretien';
    else if (current) bucket = 'occupee';
    else if (hkBusy || room.status === 'nettoyage') bucket = 'entretien';
    const [freeDate, freeTime] = String(nextFree).split(' ');
    return {
      ...room,
      bucket,
      hk_status: hkStatus,
      hk_eta: Number(openTask?.eta_minutes || 0),
      hk_attendant: openTask?.attendant || null,
      occupant: current
        ? {
            name: current.guest_name,
            phone: current.guest_phone,
            check_in: current.check_in,
            check_out: current.check_out,
            check_in_time: current.check_in_time || '14:00',
            check_out_time: current.check_out_time || '12:00',
          }
        : null,
      next_stay: nextStay
        ? {
            name: nextStay.guest_name,
            check_in: nextStay.check_in,
            check_out: nextStay.check_out,
            check_in_time: nextStay.check_in_time || '14:00',
            check_out_time: nextStay.check_out_time || '12:00',
          }
        : null,
      next_free_date: freeDate,
      next_free_time: freeTime || '14:00',
    };
  });
}

async function computeKpis(db) {
  const roomCount = num((await db.get('SELECT COUNT(*) AS n FROM rooms')).n) || 12;
  const live = (await reservationRows(db)).filter((r) => r.status === 'en_cours' || r.status === 'confirmee');
  const occupied = (await reservationRows(db)).filter((r) => r.status === 'en_cours').length;
  const occupancy = roomCount ? occupied / roomCount : 0;
  const folioRoom = num((await db.get("SELECT SUM(amount) AS n FROM folio_charges WHERE source = 'hebergement'")).n);
  const stayRevenue = num((await db.get("SELECT SUM(total) AS n FROM reservations WHERE status != 'annulee'")).n);
  const roomRevenue = folioRoom || stayRevenue;
  const posRevenue = num((await db.get("SELECT SUM(total) AS n FROM pos_sales")).n);
  const venueRevenue = num((await db.get('SELECT SUM(paid) AS n FROM venue_bookings')).n);
  const allRevenue = roomRevenue + posRevenue + venueRevenue + num((await db.get("SELECT SUM(amount) AS n FROM folio_charges WHERE source != 'hebergement'")).n);
  const sold = Math.max(occupied, 1);
  const adr = roomRevenue / sold;
  const revpar = occupancy * adr;
  const trevpar = allRevenue / roomCount;
  const seats = num((await db.get('SELECT SUM(seats) AS n FROM outlets')).n) || 64;
  const revpash = posRevenue / Math.max(seats * 8, 1);
  const guestsIn = Math.max((await reservationRows(db)).filter((r) => r.status === 'en_cours').length, 1);
  const dined = (await db.all("SELECT DISTINCT guest_name FROM pos_sales WHERE guest_name IS NOT NULL AND outlet LIKE 'Restaurant%'")).length;
  const capture = dined / guestsIn;
  const costs = num((await db.get('SELECT SUM(amount) AS n FROM cost_allocations')).n);
  const goppar = (allRevenue - costs) / roomCount;
  const revpac = allRevenue / Math.max((await db.all('SELECT id FROM guests')).length, 1);
  return {
    occupancy,
    adr,
    revpar,
    trevpar,
    revpash,
    revpac,
    goppar,
    capture,
    roomRevenue,
    posRevenue,
    venueRevenue,
    allRevenue,
    costs,
    roomCount,
    occupied,
  };
}

async function handlePms(req, res, ctx) {
  const { db, pathName, method, readBody, ok, fail, requireUser } = ctx;
  if (!pathName.startsWith('/pms')) return false;
  const actor = await requireUser(db, req, res);
  if (!actor) return true;
  try {
    await releaseExpiredStays(db);
  } catch {
    /* ignore */
  }

  if (method === 'POST' && pathName === '/pms/document') {
    try {
      const body = await readBody(req);
      const company = await db.get('SELECT * FROM company_profile WHERE id = 1');
      const title = String(body.title || 'MyHotel').slice(0, 140);
      const lines = Array.isArray(body.lines) ? body.lines.slice(0, 400).map((line) => String(line).slice(0, 500)) : [];
      const filename = String(body.filename || 'document.pdf').replace(/[^a-z0-9._-]+/gi, '-') || 'document.pdf';
      const bytes = await buildBrandedPdf(title, lines, company || {});
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
        'Cache-Control': 'no-store',
      });
      res.end(Buffer.from(bytes));
    } catch (error) {
      console.error('[pdf]', error);
      fail(res, error instanceof Error ? error.message : 'PDF impossible.', 500);
    }
    return true;
  }

  if (method === 'GET' && pathName === '/pms/company') {
    const row = await db.get('SELECT * FROM company_profile WHERE id = 1');
    ok(res, row || {});
    return true;
  }

  if (method === 'POST' && pathName === '/pms/company') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut modifier l’identité de l’entreprise.', 403);
      return true;
    }
    const body = await readBody(req);
    const existing = await db.get('SELECT id FROM company_profile WHERE id = 1');
    const fields = [
      String(body.name || 'MyHotel').trim() || 'MyHotel',
      String(body.legal_name || '').trim(),
      String(body.address || '').trim(),
      String(body.city || '').trim(),
      String(body.country || 'Cameroun').trim(),
      String(body.phone || '').trim(),
      String(body.email || '').trim(),
      String(body.website || '').trim(),
      String(body.nif || '').trim(),
      String(body.rccm || '').trim(),
      String(body.slogan || '').trim(),
      body.logo ? String(body.logo) : null,
      body.stamp ? String(body.stamp) : null,
    ];
    if (existing) {
      await db.run(
        `UPDATE company_profile SET name=?, legal_name=?, address=?, city=?, country=?, phone=?, email=?, website=?, nif=?, rccm=?, slogan=?, logo=?, stamp=? WHERE id=1`,
        fields,
      );
    } else {
      await db.run(
        `INSERT INTO company_profile (id, name, legal_name, address, city, country, phone, email, website, nif, rccm, slogan, logo, stamp)
         VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        fields,
      );
    }
    ok(res, await db.get('SELECT * FROM company_profile WHERE id = 1'), 'Identité de l’entreprise enregistrée.');
    return true;
  }

  if (method === 'GET' && pathName === '/pms/front-office') {
    ok(res, {
      reservations: await reservationRows(db),
      planning: await planning(db),
      lost_items: await db.all('SELECT * FROM lost_items ORDER BY stored_at DESC'),
      visits: await db.all('SELECT * FROM visits ORDER BY arrived_at DESC'),
      vip_tasks: await db.all('SELECT * FROM vip_tasks ORDER BY scheduled_at'),
      transfers: await db.all('SELECT * FROM room_transfers ORDER BY at DESC'),
      charges: await db.all('SELECT * FROM folio_charges ORDER BY at DESC'),
      rooms: await enrichRooms(db),
      guests: await db.all('SELECT * FROM guests ORDER BY full_name'),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/housekeeping') {
    const agents = await hkAgentList(db);
    let tasks = [];
    try {
      const raw = await Promise.all(
        (await db.all('SELECT * FROM hk_tasks ORDER BY id DESC')).map((task) => enrichHkTask(db, task)),
      );
      const openSeen = new Set();
      tasks = raw.filter((task) => {
        if (task.status === 'pret' || task.status === 'termine' || task.status === 'controle') return true;
        if (openSeen.has(task.room_number)) return false;
        openSeen.add(task.room_number);
        return true;
      });
      tasks.sort((a, b) => {
        const pa = a.priority === 'urgente' ? 0 : a.priority === 'haute' ? 1 : 2;
        const pb = b.priority === 'urgente' ? 0 : b.priority === 'haute' ? 1 : 2;
        if (pa !== pb) return pa - pb;
        return String(a.room_number).localeCompare(String(b.room_number), 'fr');
      });
      await markReadyRoomsDisponible(db);
      if (actor.role === 'housekeeping') {
        tasks = tasks.filter(
          (task) => !['pret', 'termine', 'controle', 'maintenance'].includes(task.status),
        );
      }
    } catch {
      tasks = [];
    }
    let issues = [];
    try {
      issues = await db.all('SELECT * FROM hk_issues ORDER BY at DESC');
    } catch {
      issues = [];
    }
    ok(res, {
      tasks,
      issues,
      agents,
      rooms:
        actor.role === 'housekeeping'
          ? await db.all(
              "SELECT id, number, type, floor, status, photo FROM rooms WHERE status != 'maintenance' ORDER BY floor, number",
            )
          : await db.all('SELECT id, number, type, floor, status, photo FROM rooms ORDER BY floor, number'),
      agent_stats: await hkClaimStats(db, actor.full_name),
      inspections: await db.all('SELECT * FROM inspections ORDER BY at DESC'),
      anomalies: await db.all('SELECT * FROM anomalies ORDER BY at DESC'),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/issues') {
    let issues = [];
    try {
      issues = await db.all('SELECT * FROM hk_issues ORDER BY at DESC');
    } catch {
      issues = [];
    }
    if (actor.role === 'housekeeping') {
      issues = issues.filter((item) => item.reporter === actor.full_name);
    }
    ok(res, { issues, open: issues.filter((item) => item.status !== 'resolue').length });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/maintenance') {
    ok(res, {
      orders: await db.all('SELECT * FROM work_orders ORDER BY opened_at DESC'),
      history: await db.all("SELECT nature, COUNT(*) AS n FROM work_orders GROUP BY nature"),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/purchasing') {
    const products = await db.all(
      `SELECT p.*, w.name AS warehouse FROM products p JOIN warehouses w ON w.id = p.warehouse_id WHERE IFNULL(p.deleted_at, '') = '' ORDER BY p.name`,
    );
    ok(res, {
      products,
      to_order: products.filter((p) => Number(p.stock) <= Number(p.min_stock)),
      suppliers: await db.all('SELECT * FROM suppliers'),
      orders: await db.all(
        `SELECT o.*, s.name AS supplier FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id ORDER BY o.ordered_at DESC`,
      ),
      items: await db.all('SELECT * FROM purchase_items'),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/pos') {
    const sales = await Promise.all(
      (await db.all('SELECT * FROM pos_sales ORDER BY id DESC')).map((row) => saleDetail(db, row)),
    );
    ok(res, {
      products: await db.all(
        "SELECT * FROM products WHERE IFNULL(deleted_at, '') = '' AND (kind = 'vente' OR kind IS NULL OR kind = '') ORDER BY name",
      ),
      sales,
      items: await db.all('SELECT * FROM pos_sale_items'),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/stock') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut consulter le stock.', 403);
      return true;
    }
    const products = await db.all(
      `SELECT p.*, w.name AS warehouse FROM products p LEFT JOIN warehouses w ON w.id = p.warehouse_id WHERE IFNULL(p.deleted_at, '') = '' ORDER BY p.name`,
    );
    ok(res, {
      products,
      warehouses: await db.all('SELECT * FROM warehouses ORDER BY name'),
      moves: await db.all('SELECT * FROM stock_moves ORDER BY id DESC LIMIT 80'),
      staff: await db.all(
        "SELECT full_name AS name, role FROM users WHERE role IN ('housekeeping','receptionist','manager','owner') ORDER BY full_name",
      ),
      rupture: products.filter((p) => Number(p.stock) <= 0).length,
      low: products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.min_stock)).length,
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/venues') {
    ok(res, {
      venues: await db.all('SELECT * FROM venues'),
      bookings: await db.all(
        `SELECT b.*, v.name AS venue_name, v.area_m2 FROM venue_bookings b JOIN venues v ON v.id = b.venue_id ORDER BY b.start_at`,
      ),
      payments: await db.all('SELECT * FROM venue_payments ORDER BY at DESC'),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/finance') {
    ok(res, {
      registers: await db.all('SELECT * FROM cash_registers'),
      sessions: await db.all('SELECT * FROM cash_sessions ORDER BY opened_at DESC'),
      lines: await db.all('SELECT * FROM cash_lines ORDER BY at DESC'),
      deposits: await db.all('SELECT * FROM deposits ORDER BY at DESC'),
      allocations: await db.all('SELECT * FROM cost_allocations ORDER BY period DESC'),
      invoices: await db.all('SELECT * FROM invoices ORDER BY issued_at DESC'),
      charges: await db.all('SELECT * FROM folio_charges ORDER BY at DESC'),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/kpis') {
    ok(res, await computeKpis(db));
    return true;
  }

  if (method === 'GET' && pathName === '/pms/dashboard') {
    ok(res, await computeDashboard(db, actor));
    return true;
  }

  if (method === 'GET' && pathName === '/pms/reports') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Rapports réservés à la gérance.', 403);
      return true;
    }
    const today = day(0);
    const reservations = await reservationRows(db);
    const products = await db.all(
      `SELECT p.*, w.name AS warehouse FROM products p LEFT JOIN warehouses w ON w.id = p.warehouse_id WHERE IFNULL(p.deleted_at, '') = '' ORDER BY p.name`,
    );
    const sales = await Promise.all(
      (await db.all('SELECT * FROM pos_sales ORDER BY id DESC')).map((row) => saleDetail(db, row)),
    );
    let issues = [];
    try {
      issues = await db.all('SELECT * FROM hk_issues ORDER BY at DESC');
    } catch {
      issues = [];
    }
    const salesByOutlet = await db.all(
      'SELECT COALESCE(outlet, seller, \'Réception\') AS outlet, COUNT(*) AS n, SUM(total) AS amount FROM pos_sales GROUP BY outlet',
    );
    const topProducts = await db.all(
      'SELECT product_name, SUM(qty) AS qty, SUM(qty*price) AS amount FROM pos_sale_items GROUP BY product_name ORDER BY amount DESC',
    );
    ok(res, {
      company: await db.get('SELECT * FROM company_profile WHERE id = 1'),
      kpis: await computeKpis(db),
      today: {
        date: today,
        arrivals: reservations.filter((row) => String(row.check_in).slice(0, 10) === today && row.status !== 'annulee').length,
        departures: reservations.filter((row) => String(row.check_out).slice(0, 10) === today && row.status !== 'annulee').length,
        in_house: reservations.filter((row) => row.status === 'en_cours').length,
        sales_count: Number((await db.get('SELECT COUNT(*) AS n FROM pos_sales WHERE date(at) = date(?)', [today])).n || 0),
        sales_amount: Number((await db.get('SELECT COALESCE(SUM(total),0) AS n FROM pos_sales WHERE date(at) = date(?)', [today])).n || 0),
        cash_in: Number((await db.get("SELECT COALESCE(SUM(amount),0) AS n FROM cash_moves WHERE kind = 'entree' AND date(at) = date(?)", [today])).n || 0),
        cash_out: Number((await db.get("SELECT COALESCE(SUM(amount),0) AS n FROM cash_moves WHERE kind = 'sortie' AND date(at) = date(?)", [today])).n || 0),
      },
      rooms: await db.all("SELECT id, number, type, status, price_night, maintenance_level FROM rooms WHERE IFNULL(deleted_at, '') = '' ORDER BY number"),
      reservations,
      sales,
      salesByOutlet,
      topProducts,
      products,
      moves: await db.all('SELECT * FROM stock_moves ORDER BY at DESC'),
      maintenance: await db.all('SELECT * FROM room_maintenance ORDER BY id DESC LIMIT 300'),
      discounts: await db.all('SELECT * FROM stay_discounts ORDER BY id DESC LIMIT 300'),
      issues,
      cash: await db.all('SELECT * FROM cash_moves ORDER BY at DESC'),
      guests: await db.all('SELECT * FROM guests ORDER BY full_name'),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/schedule') {
    const manager = actor.role === 'manager' || actor.role === 'owner';
    const employee = actor.role === 'receptionist' || actor.role === 'housekeeping';
    if (!manager && !employee) {
      fail(res, 'Le planning est réservé au personnel.', 403);
      return true;
    }
    let tasks = [];
    try {
      tasks = await db.all("SELECT * FROM hk_tasks WHERE status NOT IN ('pret','termine','controle') ORDER BY room_number");
    } catch {
      tasks = [];
    }
    let jobs = [];
    try {
      jobs = await db.all('SELECT * FROM work_tasks ORDER BY day DESC, id DESC');
    } catch {
      jobs = [];
    }
    let staff = await db.all(
      "SELECT id, full_name, role, email FROM users WHERE role IN ('receptionist','housekeeping','manager','owner') AND IFNULL(status, 'actif') != 'banni' ORDER BY full_name",
    );
    let shifts = await db.all('SELECT * FROM staff_shifts ORDER BY day, start_hour');
    if (!manager) {
      const mine = (value) => String(value || '').trim().toLowerCase() === String(actor.full_name || '').trim().toLowerCase();
      staff = staff.filter((row) => mine(row.full_name));
      shifts = shifts.filter((row) => mine(row.staff_name));
      jobs = jobs.filter((row) => mine(row.assignee));
      tasks = tasks.filter((row) => mine(row.attendant) || mine(row.lead_name));
    }
    ok(res, {
      staff,
      shifts,
      tasks,
      jobs,
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/payroll') {
    const staff = await db.all('SELECT * FROM staff ORDER BY department, full_name');
    const payslips = await db.all(
      `SELECT p.*, st.full_name, st.role, st.department, st.iban, st.union_name, st.mutual_name, st.id_number
       FROM payslips p JOIN staff st ON st.id = p.staff_id ORDER BY p.net DESC`,
    );
    const byDept = {};
    for (const row of payslips) {
      const key = row.department || 'Siège';
      if (!byDept[key]) byDept[key] = { department: key, n: 0, gross: 0, net: 0 };
      byDept[key].n += 1;
      byDept[key].gross += Number(row.gross);
      byDept[key].net += Number(row.net);
    }
    ok(res, {
      staff,
      timesheets: await db.all('SELECT * FROM timesheets ORDER BY day DESC'),
      sanctions: await db.all('SELECT s.*, st.full_name FROM sanctions s JOIN staff st ON st.id = s.staff_id'),
      advances: await db.all('SELECT a.*, st.full_name FROM advances a JOIN staff st ON st.id = a.staff_id'),
      payslips,
      indemnities: await db.all(
        `SELECT i.*, st.full_name FROM indemnity_lines i JOIN staff st ON st.id = i.staff_id ORDER BY i.at DESC`,
      ),
      by_department: Object.values(byDept),
      virements: staff.filter((s) => s.iban),
      mass: payslips.reduce((sum, row) => sum + Number(row.net), 0),
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/assets') {
    ok(res, {
      assets: await db.all('SELECT * FROM assets ORDER BY value DESC'),
      events: await db.all(
        `SELECT e.*, a.name AS asset_name FROM asset_events e JOIN assets a ON a.id = e.asset_id ORDER BY e.at DESC`,
      ),
    });
    return true;
  }

  if (method === 'POST' && pathName === '/pms/reservations') {
    const body = await readBody(req);
    const firstName = String(body.first_name || '').trim();
    const lastName = String(body.last_name || '').trim();
    const guestName = String(body.guest_name || `${firstName} ${lastName}`).trim();
    const phone = String(body.phone || '').trim();
    const documentId = String(body.document_id || '').trim();
    const roomNumber = String(body.room_number || '').trim();
    const checkIn = String(body.check_in || day(0)).slice(0, 10);
    const checkOut = String(body.check_out || day(1)).slice(0, 10);
    const checkInTime = String(body.check_in_time || '14:00').slice(0, 5);
    const checkOutTime = String(body.check_out_time || '12:00').slice(0, 5);
    const source = body.source === 'walk_in' ? 'walk_in' : 'reservation';
    const companions = Array.isArray(body.companions) ? body.companions : [];
    if (!guestName || !roomNumber) {
      fail(res, 'Indiquez le client et la chambre.');
      return true;
    }
    if (!firstName || !lastName || !phone || !documentId) {
      fail(res, 'Nom, prénom, téléphone et numéro de CNI sont obligatoires.');
      return true;
    }
    const room = await db.get('SELECT * FROM rooms WHERE number = ?', [roomNumber]);
    if (!room) {
      fail(res, 'Chambre introuvable.');
      return true;
    }
    const start = at(checkIn, checkInTime);
    const end = at(checkOut, checkOutTime);
    if (start >= end) {
      fail(res, 'La date et l’heure de départ doivent être après l’arrivée.');
      return true;
    }
    const clash = (await db.all(
      `SELECT r.*, g.full_name AS guest_name FROM reservations r
       JOIN guests g ON g.id = r.guest_id
       WHERE r.room_id = ? AND r.status NOT IN ('annulee', 'terminee')`,
      [room.id],
    )).find((row) => {
      const busyStart = at(row.check_in, row.check_in_time || '14:00');
      const busyEnd = at(row.check_out, row.check_out_time || '12:00');
      return start < busyEnd && end > busyStart;
    });
    if (clash) {
      fail(
        res,
        `Chambre occupée par ${clash.guest_name} du ${clash.check_in} ${clash.check_in_time || '14:00'} au ${clash.check_out} ${clash.check_out_time || '12:00'}. Choisissez après la libération.`,
      );
      return true;
    }
    const extra = companions
      .map((row) => ({
        first_name: String(row.first_name || '').trim(),
        last_name: String(row.last_name || '').trim(),
        phone: String(row.phone || '').trim(),
        document_id: String(row.document_id || '').trim(),
      }))
      .filter((row) => row.first_name && row.last_name);
    const capacity = Math.max(1, Number(room.capacity || 1));
    if (1 + extra.length > capacity) {
      fail(res, `Cette chambre accepte au plus ${capacity} personne(s).`);
      return true;
    }
    let guest = await db.get('SELECT * FROM guests WHERE document_id = ? AND document_id IS NOT NULL LIMIT 1', [documentId]);
    if (!guest) {
      guest = await db.get('SELECT * FROM guests WHERE full_name = ? LIMIT 1', [guestName]);
    }
    if (!guest) {
      await db.run(
        'INSERT INTO guests (full_name, first_name, last_name, email, phone, nationality, notes, vip, loyalty_nights, document_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [guestName, firstName, lastName, null, phone, body.nationality || 'Cameroun', null, 0, 0, documentId],
      );
      guest = await db.get('SELECT * FROM guests WHERE id = ?', [db.lastId()]);
    } else {
      await db.run(
        'UPDATE guests SET full_name=?, first_name=?, last_name=?, phone=?, document_id=? WHERE id=?',
        [guestName, firstName, lastName, phone, documentId, guest.id],
      );
      guest = await db.get('SELECT * FROM guests WHERE id = ?', [guest.id]);
    }
    const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
    const quote = quoteStay(room, nights, body, actor);
    if (quote.error) {
      fail(res, quote.error, quote.status || 400);
      return true;
    }
    const openMaint = quote.level
      ? await db.get(
          "SELECT id FROM room_maintenance WHERE room_id = ? AND status = 'ouverte' ORDER BY id DESC LIMIT 1",
          [room.id],
        )
      : null;
    await db.run(
      `INSERT INTO reservations (guest_id, room_id, check_in, check_out, check_in_time, check_out_time, status, total, source, confirmed, notes, deposit_amount, adults, children, list_total, discount_amount, discount_reason, discount_email, maintenance_level, maintenance_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        guest.id,
        room.id,
        checkIn,
        checkOut,
        checkInTime,
        checkOutTime,
        source === 'walk_in' ? 'en_cours' : 'confirmee',
        quote.total,
        source,
        1,
        body.notes || null,
        Number(body.deposit_amount || 0),
        1 + extra.length,
        Number(body.children || 0),
        quote.list,
        quote.discount,
        quote.reason,
        quote.discount ? actorIdentity(actor).email : null,
        quote.level,
        openMaint ? openMaint.id : null,
      ],
    );
    const reservationId = await db.lastId();
    if (quote.discount > 0) {
      const who = actorIdentity(actor);
      await db.run(
        `INSERT INTO stay_discounts (reservation_id, room_id, room_number, list_price, discount_amount, final_price, reason, maintenance_id, maintenance_level, actor_id, actor_name, actor_email, actor_role, at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          reservationId,
          room.id,
          room.number,
          quote.list,
          quote.discount,
          quote.total,
          quote.reason,
          openMaint ? openMaint.id : null,
          quote.level,
          who.userId,
          who.name,
          who.email,
          who.role,
          stampNow(),
        ],
      );
    }
    await writeAudit(db, actor, {
      action: 'reservation.create',
      entityType: 'reservation',
      entityId: reservationId,
      summary: `Réservation chambre ${room.number} · ${quote.total} FCFA`,
      after: { list: quote.list, discount: quote.discount, total: quote.total, level: quote.level },
      reason: quote.reason,
      refType: 'room',
      refId: room.id,
    });
    const occupants = [
      { first_name: firstName, last_name: lastName, phone, document_id: documentId, is_primary: 1 },
      ...extra.map((row) => ({ ...row, is_primary: 0 })),
    ];
    for (const person of occupants) {
      await db.run(
        'INSERT INTO reservation_occupants (reservation_id, is_primary, first_name, last_name, phone, document_id) VALUES (?,?,?,?,?,?)',
        [reservationId, person.is_primary, person.first_name, person.last_name, person.phone || null, person.document_id || null],
      );
    }
    if (room.status === 'disponible' && checkIn <= day(0)) {
      await db.run('UPDATE rooms SET status = ? WHERE id = ?', [source === 'walk_in' ? 'occupee' : 'reservee', room.id]);
    }
    ok(
      res,
      { id: reservationId, occupants },
      source === 'walk_in' ? 'Walk-in enregistré.' : 'Réservation créée.',
      201,
    );
    return true;
  }

  if (method === 'POST' && pathName.match(/^\/pms\/reservations\/(\d+)\/confirm$/)) {
    const id = Number(pathName.split('/')[3]);
    await db.run('UPDATE reservations SET confirmed = 1, status = ? WHERE id = ?', ['confirmee', id]);
    ok(res, { id }, 'Réservation confirmée.');
    return true;
  }

  if (method === 'POST' && pathName.match(/^\/pms\/reservations\/(\d+)\/cancel$/)) {
    const id = Number(pathName.split('/')[3]);
    const resv = await db.get(
      `SELECT r.*, rm.number AS room_number FROM reservations r JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`,
      [id],
    );
    await db.run("UPDATE reservations SET status = 'annulee', confirmed = 0 WHERE id = ?", [id]);
    if (resv) await db.run("UPDATE rooms SET status = 'disponible' WHERE id = ?", [resv.room_id]);
    ok(res, { id }, 'Réservation annulée.');
    return true;
  }

  if (method === 'POST' && pathName.match(/^\/pms\/reservations\/(\d+)\/update$/)) {
    const id = Number(pathName.split('/')[3]);
    const body = await readBody(req);
    const resv = await db.get('SELECT * FROM reservations WHERE id = ?', [id]);
    if (!resv) {
      fail(res, 'Réservation introuvable.');
      return true;
    }
    const firstName = String(body.first_name || '').trim();
    const lastName = String(body.last_name || '').trim();
    const phone = String(body.phone || '').trim();
    const documentId = String(body.document_id || '').trim();
    const roomNumber = String(body.room_number || '').trim();
    const checkIn = String(body.check_in || resv.check_in).slice(0, 10);
    const checkOut = String(body.check_out || resv.check_out).slice(0, 10);
    const checkInTime = String(body.check_in_time || resv.check_in_time || '14:00').slice(0, 5);
    const checkOutTime = String(body.check_out_time || resv.check_out_time || '12:00').slice(0, 5);
    const room = await db.get('SELECT * FROM rooms WHERE number = ?', [roomNumber]);
    if (!firstName || !lastName || !phone || !documentId || !room) {
      fail(res, 'Client et chambre sont obligatoires.');
      return true;
    }
    const start = at(checkIn, checkInTime);
    const end = at(checkOut, checkOutTime);
    const clash = (await db.all(
      `SELECT r.*, g.full_name AS guest_name FROM reservations r
       JOIN guests g ON g.id = r.guest_id
       WHERE r.room_id = ? AND r.id != ? AND r.status NOT IN ('annulee', 'terminee')`,
      [room.id, id],
    )).find((row) => {
      const busyStart = at(row.check_in, row.check_in_time || '14:00');
      const busyEnd = at(row.check_out, row.check_out_time || '12:00');
      return start < busyEnd && end > busyStart;
    });
    if (clash) {
      fail(res, `Chevauchement avec ${clash.guest_name} (${clash.check_in} → ${clash.check_out}).`);
      return true;
    }
    const guestName = `${firstName} ${lastName}`.trim();
    await db.run(
      'UPDATE guests SET full_name=?, first_name=?, last_name=?, phone=?, document_id=? WHERE id=?',
      [guestName, firstName, lastName, phone, documentId, resv.guest_id],
    );
    const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
    const quote = quoteStay(room, nights, body, actor);
    if (quote.error) {
      fail(res, quote.error, quote.status || 400);
      return true;
    }
    await db.run(
      `UPDATE reservations SET room_id=?, check_in=?, check_out=?, check_in_time=?, check_out_time=?, total=?, adults=?, list_total=?, discount_amount=?, discount_reason=?, discount_email=?, maintenance_level=? WHERE id=?`,
      [
        room.id,
        checkIn,
        checkOut,
        checkInTime,
        checkOutTime,
        quote.total,
        Number(body.adults || 1),
        quote.list,
        quote.discount,
        quote.reason,
        quote.discount ? actorIdentity(actor).email : null,
        quote.level,
        id,
      ],
    );
    await writeAudit(db, actor, {
      action: 'reservation.update',
      entityType: 'reservation',
      entityId: id,
      summary: `Réservation ${id} mise à jour · chambre ${room.number}`,
      before: { total: resv.total, room_id: resv.room_id },
      after: { total: quote.total, room_id: room.id, discount: quote.discount },
    });
    if (resv.room_id !== room.id) {
      await db.run("UPDATE rooms SET status = 'disponible' WHERE id = ?", [resv.room_id]);
      if (room.status === 'disponible') await db.run("UPDATE rooms SET status = 'reservee' WHERE id = ?", [room.id]);
    }
    ok(res, { id }, 'Réservation modifiée.');
    return true;
  }

  if (method === 'POST' && pathName.match(/^\/pms\/reservations\/(\d+)\/badges$/)) {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut générer un nouveau badge.', 403);
      return true;
    }
    const id = Number(pathName.split('/')[3]);
    const resv = await db.get(
      `SELECT r.*, rm.number AS room_number FROM reservations r JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`,
      [id],
    );
    if (!resv) {
      fail(res, 'Réservation introuvable.');
      return true;
    }
    let people = await db.all('SELECT * FROM reservation_occupants WHERE reservation_id = ?', [id]);
    if (!people.length) {
      const guest = await db.get('SELECT * FROM guests WHERE id = ?', [resv.guest_id]);
      people = [
        {
          first_name: guest?.first_name || String(guest?.full_name || '').split(' ')[0],
          last_name: guest?.last_name || String(guest?.full_name || '').split(' ').slice(1).join(' '),
        },
      ];
    }
    const createdBy = actor.full_name || 'Réception';
    const now = stampNow();
    await db.run(
      `UPDATE client_badges SET status = 'annule', revoked_at = ?
       WHERE reservation_id = ? AND IFNULL(status, 'actif') != 'annule'`,
      [now, id],
    );
    const badges = [];
    for (const person of people) {
      const full = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Client';
      await db.run(
        `UPDATE client_badges SET status = 'annule', revoked_at = ?
         WHERE room_number = ? AND guest_name = ? AND reservation_id IS NULL AND IFNULL(status, 'actif') != 'annule'`,
        [now, resv.room_number, full],
      );
      const code = `MH-${resv.room_number}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await db.run(
        'INSERT INTO client_badges (guest_name, room_number, valid_from, valid_to, code, created_by, reservation_id, status) VALUES (?,?,?,?,?,?,?,?)',
        [full, resv.room_number, resv.check_in, resv.check_out, code, createdBy, id, 'actif'],
      );
      badges.push({
        id: await db.lastId(),
        guest_name: full,
        room_number: resv.room_number,
        valid_from: resv.check_in,
        valid_to: resv.check_out,
        check_in_time: resv.check_in_time,
        check_out_time: resv.check_out_time,
        code,
        created_by: createdBy,
        status: 'actif',
      });
    }
    ok(res, { badges }, 'Badges générés.', 201);
    return true;
  }

  if (method === 'POST' && pathName.match(/^\/pms\/reservations\/(\d+)\/transfer$/)) {
    const id = Number(pathName.split('/')[3]);
    const body = await readBody(req);
    const toNumber = String(body.to_room || '').trim();
    const resv = await db.get(
      `SELECT r.*, g.full_name AS guest_name, rm.number AS from_room FROM reservations r
       JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`,
      [id],
    );
    const dest = await db.get('SELECT * FROM rooms WHERE number = ?', [toNumber]);
    if (!resv || !dest) {
      fail(res, 'Chambre ou séjour introuvable.');
      return true;
    }
    await db.run('UPDATE reservations SET room_id = ? WHERE id = ?', [dest.id, id]);
    await db.run("UPDATE rooms SET status = 'disponible' WHERE number = ?", [resv.from_room]);
    await db.run("UPDATE rooms SET status = 'occupee' WHERE id = ?", [dest.id]);
    await db.run(
      'INSERT INTO room_transfers (reservation_id, guest_name, from_room, to_room, reason, at) VALUES (?,?,?,?,?,?)',
      [id, resv.guest_name, resv.from_room, dest.number, body.reason || 'Transfert', stampNow()],
    );
    ok(res, { to: dest.number }, 'Chambre transférée.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/lost-items/return') {
    const body = await readBody(req);
    await db.run("UPDATE lost_items SET status = 'restitue', returned_at = ? WHERE id = ?", [day(0), Number(body.id)]);
    ok(res, { id: body.id }, 'Objet restitué.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/housekeeping/status') {
    const body = await readBody(req);
    const room = String(body.room_number || '');
    const taskStatus = String(body.task_status || body.status || 'en_cours');
    const existing = await db.get('SELECT status FROM rooms WHERE number = ?', [room]);
    if (existing && existing.status === 'maintenance') {
      if (actor.role !== 'manager' && actor.role !== 'owner') {
        fail(res, 'Seul le gérant peut sortir une chambre de maintenance.', 403);
        return true;
      }
      if (taskStatus !== 'pret') {
        fail(res, 'Marquez d’abord la chambre prête pour relancer l’entretien.', 403);
        return true;
      }
    }
    const roomStatus = taskStatus === 'pret' ? 'disponible' : 'nettoyage';
    await db.run('UPDATE rooms SET status = ? WHERE number = ?', [roomStatus, room]);
    if (body.task_id) {
      if (taskStatus === 'pret') {
        await db.run('UPDATE hk_tasks SET status = ?, finished_at = ? WHERE id = ?', [taskStatus, stampNow(), Number(body.task_id)]);
      } else if (taskStatus === 'en_cours') {
        await db.run('UPDATE hk_tasks SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?', [
          taskStatus,
          stampNow(),
          Number(body.task_id),
        ]);
      } else {
        await db.run('UPDATE hk_tasks SET status = ? WHERE id = ?', [taskStatus, Number(body.task_id)]);
      }
    }
    if (taskStatus === 'pret') {
      await db.run(
        `INSERT INTO notifications (category, title, body, href, is_read, created_at)
         VALUES ('ÉTAGES', 'Chambre prête', ?, '/housekeeping', 0, ?)`,
        [`Chambre ${room} nettoyée et prête.`, stampNow()],
      );
    }
    ok(res, { room, status: taskStatus }, 'Statut chambre mis à jour.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/housekeeping/claim') {
    const body = await readBody(req);
    const room = String(body.room_number || '').trim();
    if (!room) {
      fail(res, 'Indiquez la chambre.');
      return true;
    }
    const roomRow = await db.get('SELECT status FROM rooms WHERE number = ?', [room]);
    if (roomRow && roomRow.status === 'maintenance') {
      fail(res, 'Cette chambre est en maintenance. Seul le gérant peut la marquer prête.', 403);
      return true;
    }
    const agents = await hkAgentList(db);
    const lead = String(body.lead_name || actor.full_name || '').trim();
    if (!await isHkAgentName(db, lead) && actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul un agent d’entretien enregistré peut prendre une chambre en charge.');
      return true;
    }
    const helpers = Array.isArray(body.helpers) ? body.helpers.map(String) : [];
    const invalid = [];
    for (const name of helpers) {
      if (name !== lead && !(await isHkAgentName(db, name))) invalid.push(name);
    }
    if (invalid.length) {
      fail(res, 'Les équipiers doivent être des agents d’entretien enregistrés.');
      return true;
    }
    let taskId = body.task_id ? Number(body.task_id) : 0;
    const open =
      taskId
        ? await db.get('SELECT * FROM hk_tasks WHERE id = ?', [taskId])
        : await db.get(
            "SELECT * FROM hk_tasks WHERE room_number = ? AND status NOT IN ('pret','termine','controle') ORDER BY id DESC LIMIT 1",
            [room],
          );
    if (open) {
      taskId = Number(open.id);
      await db.run(
        "UPDATE hk_tasks SET attendant = ?, lead_name = ?, status = 'en_cours', started_at = COALESCE(started_at, ?) WHERE id = ?",
        [lead, lead, stampNow(), taskId],
      );
    } else {
      await db.run(
        "INSERT INTO hk_tasks (room_number, attendant, lead_name, priority, status, eta_minutes, due_at, started_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [room, lead, lead, body.priority || 'normale', 'en_cours', 40, stampNow(), stampNow(), stampNow()],
      );
      taskId = await db.lastId();
    }
    await replaceHkCrew(db, taskId, lead, helpers, agents);
    await db.run("UPDATE rooms SET status = 'nettoyage' WHERE number = ?", [room]);
    ok(res, { id: taskId, room }, 'Chambre prise en charge.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/housekeeping/helpers') {
    const body = await readBody(req);
    const taskId = Number(body.task_id);
    const task = await db.get('SELECT * FROM hk_tasks WHERE id = ?', [taskId]);
    if (!task) {
      fail(res, 'Intervention introuvable.');
      return true;
    }
    const lead = task.lead_name || task.attendant;
    const canEdit = actor.full_name === lead || actor.role === 'manager' || actor.role === 'owner';
    if (!canEdit) {
      fail(res, 'Seul le responsable de l’intervention peut modifier l’équipe.');
      return true;
    }
    const helpers = Array.isArray(body.helpers) ? body.helpers.map(String) : [];
    const invalid = [];
    for (const name of helpers) {
      if (name !== lead && !(await isHkAgentName(db, name))) invalid.push(name);
    }
    if (invalid.length) {
      fail(res, 'Les équipiers doivent être des agents d’entretien enregistrés.');
      return true;
    }
    await replaceHkCrew(db, taskId, lead, helpers, await hkAgentList(db));
    ok(res, { id: taskId }, 'Équipe mise à jour.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/housekeeping/issue') {
    const body = await readBody(req);
    const room = String(body.room_number || '').trim();
    const description = String(body.description || '').trim();
    if (!room || !description) {
      fail(res, 'Indiquez la chambre et le détail du signalement.');
      return true;
    }
    const open = await db.get(
      "SELECT id FROM hk_tasks WHERE room_number = ? AND status NOT IN ('pret','termine','controle') ORDER BY id DESC LIMIT 1",
      [room],
    );
    await db.run(
      'INSERT INTO hk_issues (room_number, task_id, reporter, category, description, status, at) VALUES (?,?,?,?,?,?,?)',
      [
        room,
        open ? open.id : null,
        actor.full_name || 'Entretien',
        'Autre',
        description,
        'ouverte',
        stampNow(),
      ],
    );
    const issueId = await db.lastId();
    await db.run(
      `INSERT INTO notifications (category, title, body, href, is_read, created_at)
       VALUES ('SIGNALEMENT', ?, ?, '/issues', 0, ?)`,
      [`Chambre ${room}`, description, stampNow()],
    );
    ok(res, { id: issueId, room }, 'Signalement enregistré.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/housekeeping/issue/resolve') {
    const body = await readBody(req);
    const id = Number(body.id);
    const issue = await db.get('SELECT * FROM hk_issues WHERE id = ?', [id]);
    if (!issue) {
      fail(res, 'Signalement introuvable.');
      return true;
    }
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut clôturer un signalement.', 403);
      return true;
    }
    const requested = String(body.status || '').trim();
    const next =
      requested === 'en_attente' || requested === 'resolue' || requested === 'ouverte'
        ? requested
        : issue.status === 'resolue'
          ? 'ouverte'
          : 'resolue';
    if (next === 'resolue') {
      await db.run('UPDATE hk_issues SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?', [
        next,
        stampNow(),
        actor.full_name || 'Gérance',
        id,
      ]);
    } else {
      await db.run('UPDATE hk_issues SET status = ?, resolved_at = NULL, resolved_by = NULL WHERE id = ?', [next, id]);
    }
    const message =
      next === 'resolue'
        ? 'Problème marqué comme résolu.'
        : next === 'en_attente'
          ? 'Signalement mis en attente.'
          : 'Signalement rouvert.';
    ok(res, { id, status: next }, message);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/maintenance/close') {
    const body = await readBody(req);
    await db.run(
      "UPDATE work_orders SET status = 'clos', closed_at = ?, validated_by = ? WHERE id = ?",
      [stampNow(), body.validated_by || 'Hiérarchie', Number(body.id)],
    );
    if (body.room_number) await db.run("UPDATE rooms SET status = 'nettoyage' WHERE number = ?", [body.room_number]);
    ok(res, { id: body.id }, 'Intervention clôturée.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/pos/sale') {
    const body = await readBody(req);
    const lines = Array.isArray(body.items) ? body.items : [];
    if (!lines.length) {
      fail(res, 'Ajoutez au moins un produit.');
      return true;
    }
    const prepared = [];
    for (const line of lines) {
      const product = await db.get('SELECT * FROM products WHERE id = ?', [Number(line.product_id)]);
      const qty = Number(line.qty || 0);
      if (!product || product.deleted_at || qty <= 0) {
        fail(res, 'Produit ou quantité invalide.');
        return true;
      }
      if (product.kind === 'interne') {
        fail(res, `${product.name} est un article magasin, pas un article de vente.`);
        return true;
      }
      if (Number(product.stock) < qty) {
        fail(res, `Stock insuffisant pour ${product.name} (${product.stock} restant).`);
        return true;
      }
      prepared.push({ product, qty, price: Number(product.price || 0) });
    }
    const total = prepared.reduce((sum, line) => sum + line.qty * line.price, 0);
    await db.run(
      'INSERT INTO pos_sales (outlet, seller, guest_name, room_number, total, at) VALUES (?,?,?,?,?,?)',
      [
        'Réception',
        actor.full_name || 'Réception',
        String(body.guest_name || '').trim() || null,
        String(body.room_number || '').trim() || null,
        total,
        stampNow(),
      ],
    );
    const saleId = await db.lastId();
    for (const line of prepared) {
      await db.run('INSERT INTO pos_sale_items (sale_id, product_name, qty, price, product_id) VALUES (?,?,?,?,?)', [
        saleId,
        line.product.name,
        line.qty,
        line.price,
        line.product.id,
      ]);
      await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [line.qty, line.product.id]);
      await db.run(
        'INSERT INTO stock_moves (product_name, warehouse, type, qty, at, note, dest, actor, product_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          line.product.name,
          'Réception',
          'vente',
          line.qty,
          stampNow(),
          'Vente accueil',
          body.guest_name || null,
          actor.full_name,
          line.product.id,
        ],
      );
    }
    const guestName = String(body.guest_name || '').trim();
    const roomNumber = String(body.room_number || '').trim();
    if (guestName && roomNumber) {
      const resv = await db.get(
        `SELECT r.id FROM reservations r JOIN rooms rm ON rm.id = r.room_id
         JOIN guests g ON g.id = r.guest_id
         WHERE rm.number = ? AND g.full_name = ? AND r.status = 'en_cours' LIMIT 1`,
        [roomNumber, guestName],
      );
      await db.run(
        'INSERT INTO folio_charges (reservation_id, guest_name, source, label, amount, at, outlet) VALUES (?,?,?,?,?,?,?)',
        [resv ? resv.id : null, guestName, 'pos', 'Boutique accueil', total, day(0), 'Réception'],
      );
    }
    ok(res, await saleDetail(db, await db.get('SELECT * FROM pos_sales WHERE id = ?', [saleId])), 'Vente enregistrée.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/cash/expense') {
    const body = await readBody(req);
    const session = await db.get("SELECT * FROM cash_sessions WHERE status = 'ouverte' ORDER BY id DESC LIMIT 1");
    if (!session) {
      fail(res, 'Aucune caisse ouverte.');
      return true;
    }
    await db.run('INSERT INTO cash_lines (session_id, type, label, amount, at) VALUES (?,?,?,?,?)', [
      session.id,
      'expense',
      body.label || 'Dépense',
      Number(body.amount || 0),
      stampNow(),
    ]);
    ok(res, { id: await db.lastId() }, 'Dépense enregistrée.');
    return true;
  }

  if (method === 'GET' && pathName === '/pms/desk') {
    const today = day(0);
    const recentRes = await db.all(
      `SELECT r.*, g.full_name AS guest_name, rm.number AS room_number
       FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id
       WHERE date(r.check_in) = date(?) OR date(r.check_out) = date(?)
       ORDER BY r.check_in DESC LIMIT 8`,
      [today, today],
    );
    ok(res, {
      today,
      reservations: Number((await db.get('SELECT COUNT(*) AS n FROM reservations WHERE date(check_in) = date(?)', [today])).n),
      in_house: Number((await db.get("SELECT COUNT(*) AS n FROM reservations WHERE status = 'en_cours'")).n),
      checkouts: Number((await db.get('SELECT COUNT(*) AS n FROM reservations WHERE date(check_out) = date(?)', [today])).n),
      sales_count: Number((await db.get('SELECT COUNT(*) AS n FROM pos_sales WHERE date(at) = date(?)', [today])).n),
      sales_amount: Number((await db.get('SELECT SUM(total) AS n FROM pos_sales WHERE date(at) = date(?)', [today])).n || 0),
      visits: Number((await db.get('SELECT COUNT(*) AS n FROM visits WHERE date(arrived_at) = date(?)', [today])).n),
      badges: Number((await db.get("SELECT COUNT(*) AS n FROM client_badges WHERE date(valid_to) >= date('now')")).n),
      suggestions_open: (await suggestionCounts(db, actor)).open,
      hk_urgent: Number((await db.get("SELECT COUNT(*) AS n FROM hk_tasks WHERE priority = 'urgente' AND status != 'pret'")).n),
      hk_open: Number((await db.get("SELECT COUNT(*) AS n FROM hk_tasks WHERE status IN ('non_prise','en_cours')")).n),
      rooms: await db.get(
        `SELECT
          SUM(CASE WHEN status = 'disponible' THEN 1 ELSE 0 END) AS available,
          SUM(CASE WHEN status = 'occupee' THEN 1 ELSE 0 END) AS occupied,
          SUM(CASE WHEN status = 'nettoyage' THEN 1 ELSE 0 END) AS cleaning,
          SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS blocked
         FROM rooms`,
      ),
      recent_sales: await db.all(
        `SELECT s.*, (SELECT product_name FROM pos_sale_items i WHERE i.sale_id = s.id LIMIT 1) AS item
         FROM pos_sales s ORDER BY at DESC LIMIT 6`,
      ),
      recent_res: recentRes,
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/badges') {
    const today = day(0);
    const items = (await db.all('SELECT * FROM client_badges ORDER BY id DESC')).map((row) => {
      const status = row.status || 'actif';
      const until = String(row.valid_to || '').slice(0, 10);
      const state = status === 'annule' ? 'annule' : until && until < today ? 'expire' : 'actif';
      return { ...row, status, state, expired: state !== 'actif' };
    });
    ok(res, { items });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/workspace') {
    ok(res, {
      badges: await db.all('SELECT * FROM client_badges ORDER BY id DESC LIMIT 40'),
      suggestions:
        actor.role === 'owner'
          ? await db.all('SELECT * FROM suggestions ORDER BY id DESC LIMIT 40')
          : await db.all('SELECT * FROM suggestions WHERE author = ? ORDER BY id DESC LIMIT 40', [actor.full_name]),
      cash: await db.all('SELECT * FROM cash_moves ORDER BY id DESC LIMIT 40'),
      shifts: await db.all('SELECT * FROM staff_shifts ORDER BY day DESC, start_hour'),
      visits: await db.all('SELECT * FROM visits ORDER BY arrived_at DESC LIMIT 40'),
      staff: await db.all('SELECT id, full_name, role, department FROM staff WHERE status = ? ORDER BY full_name', ['actif']),
      products: await db.all('SELECT * FROM products ORDER BY name'),
      rooms: await db.all("SELECT id, number, type, status, price_night, maintenance_level FROM rooms WHERE IFNULL(deleted_at, '') = '' ORDER BY number"),
    });
    return true;
  }

  if (method === 'POST' && pathName === '/pms/badges') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut générer un nouveau badge.', 403);
      return true;
    }
    const body = await readBody(req);
    const code = `MH-${String(body.room_number || '00')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await db.run(
      'INSERT INTO client_badges (guest_name, room_number, valid_from, valid_to, code, created_by, status) VALUES (?,?,?,?,?,?,?)',
      [
        body.guest_name,
        body.room_number,
        body.valid_from,
        body.valid_to,
        code,
        body.created_by || actor.full_name || 'Réception',
        'actif',
      ],
    );
    ok(res, { id: await db.lastId(), code }, 'Badge généré.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/visits') {
    const body = await readBody(req);
    await db.run(
      'INSERT INTO visits (visitor_name, host_name, room_number, purpose, arrived_at, left_at) VALUES (?,?,?,?,?,?)',
      [body.visitor_name, body.host_name, body.room_number, body.purpose || 'Visite', stampNow(), null],
    );
    ok(res, { id: await db.lastId() }, 'Visite enregistrée.', 201);
    return true;
  }

  if (method === 'GET' && pathName === '/pms/employees') {
    if (actor.role !== 'owner') {
      fail(res, 'La gestion des employés est réservée au propriétaire.', 403);
      return true;
    }
    const items = (
      await db.all(
        `SELECT id, full_name, email, phone, role, status, photo, last_login, created_at
         FROM users
         WHERE role IN ('receptionist','manager','housekeeping','owner')
         ORDER BY full_name`,
      )
    ).map(publicEmployee);
    ok(res, { items });
    return true;
  }

  if (method === 'POST' && pathName === '/pms/employees') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut ajouter un employé.', 403);
      return true;
    }
    const parsed = parseEmployeeBody(await readBody(req), { requirePassword: true });
    if (parsed.error) {
      fail(res, parsed.error);
      return true;
    }
    if (await db.get('SELECT id FROM users WHERE email = ? LIMIT 1', [parsed.email])) {
      fail(res, 'Un compte existe déjà avec cet e-mail.', 409);
      return true;
    }
    await db.run('INSERT INTO users (full_name, email, phone, password_hash, role, status) VALUES (?,?,?,?,?,?)', [
      parsed.fullName,
      parsed.email,
      parsed.phone,
      db.hashPassword(parsed.password),
      parsed.role,
      'actif',
    ]);
    const created = await db.get('SELECT * FROM users WHERE id = ?', [db.lastId()]);
    try {
      await syncHrRecord(db, created);
    } catch {
      /* table staff optionnelle */
    }
    ok(res, { item: publicEmployee(created) }, 'Employé ajouté.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/employees/update') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut modifier un employé.', 403);
      return true;
    }
    const body = await readBody(req);
    const id = Number(body.id);
    const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!target || !['receptionist', 'manager', 'housekeeping', 'owner'].includes(target.role)) {
      fail(res, 'Employé introuvable.');
      return true;
    }
    if (Number(target.id) === Number(actor.id)) {
      fail(res, 'Modifiez votre propre profil dans Paramètres.');
      return true;
    }
    if (target.role === 'owner') {
      fail(res, 'Le compte propriétaire ne peut pas être modifié ici.');
      return true;
    }
    const parsed = parseEmployeeBody(body, { requirePassword: false });
    if (parsed.error) {
      fail(res, parsed.error);
      return true;
    }
    const clash = await db.get('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [parsed.email, id]);
    if (clash) {
      fail(res, 'Un compte existe déjà avec cet e-mail.', 409);
      return true;
    }
    if (parsed.password) {
      await db.run(
        'UPDATE users SET full_name=?, email=?, phone=?, role=?, password_hash=?, updated_at=datetime(\'now\') WHERE id=?',
        [parsed.fullName, parsed.email, parsed.phone, parsed.role, db.hashPassword(parsed.password), id],
      );
    } else {
      await db.run(
        'UPDATE users SET full_name=?, email=?, phone=?, role=?, updated_at=datetime(\'now\') WHERE id=?',
        [parsed.fullName, parsed.email, parsed.phone, parsed.role, id],
      );
    }
    const fresh = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    try {
      await syncHrRecord(db, fresh);
    } catch {
      /* ignore */
    }
    ok(res, { item: publicEmployee(fresh) }, 'Employé mis à jour.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/employees/ban') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut bannir un employé.', 403);
      return true;
    }
    const body = await readBody(req);
    const id = Number(body.id);
    const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!target || !['receptionist', 'manager', 'housekeeping', 'owner'].includes(target.role)) {
      fail(res, 'Employé introuvable.');
      return true;
    }
    if (Number(target.id) === Number(actor.id) || target.role === 'owner') {
      fail(res, 'Impossible de bannir le propriétaire.');
      return true;
    }
    await db.run("UPDATE users SET status = 'banni', updated_at = datetime('now') WHERE id = ?", [id]);
    await db.run('DELETE FROM auth_tokens WHERE user_id = ?', [id]);
    const fresh = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    try {
      await syncHrRecord(db, fresh);
    } catch {
      /* ignore */
    }
    ok(res, { item: publicEmployee(fresh) }, 'Employé banni.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/employees/unban') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut réactiver un employé.', 403);
      return true;
    }
    const body = await readBody(req);
    const id = Number(body.id);
    const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!target || !['receptionist', 'manager', 'housekeeping', 'owner'].includes(target.role)) {
      fail(res, 'Employé introuvable.');
      return true;
    }
    await db.run("UPDATE users SET status = 'actif', updated_at = datetime('now') WHERE id = ?", [id]);
    const fresh = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    try {
      await syncHrRecord(db, fresh);
    } catch {
      /* ignore */
    }
    ok(res, { item: publicEmployee(fresh) }, 'Employé réactivé.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/employees/delete') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut supprimer un employé.', 403);
      return true;
    }
    const body = await readBody(req);
    const id = Number(body.id);
    const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!target || !['receptionist', 'manager', 'housekeeping', 'owner'].includes(target.role)) {
      fail(res, 'Employé introuvable.');
      return true;
    }
    if (Number(target.id) === Number(actor.id) || target.role === 'owner') {
      fail(res, 'Impossible de supprimer le propriétaire.');
      return true;
    }
    await db.run('DELETE FROM auth_tokens WHERE user_id = ?', [id]);
    try {
      await db.run("UPDATE staff SET status = 'arret' WHERE lower(email) = ?", [String(target.email || '').toLowerCase()]);
    } catch {
      /* ignore */
    }
    await db.run('DELETE FROM users WHERE id = ?', [id]);
    ok(res, { id }, 'Employé supprimé.');
    return true;
  }

  if (method === 'GET' && pathName === '/pms/suggestions') {
    let items = await db.all('SELECT * FROM suggestions ORDER BY id DESC');
    if (actor.role !== 'owner') {
      items = items.filter((item) => item.author === actor.full_name);
    }
    ok(res, { items });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/messages') {
    try {
      ok(res, await messagesPayload(db, actor));
    } catch {
      ok(res, { contacts: await staffContacts(db, actor.id), threads: [], messages: [] });
    }
    return true;
  }

  if (method === 'POST' && pathName === '/pms/suggestions') {
    if (actor.role === 'owner') {
      fail(res, 'Le propriétaire ne soumet pas de suggestion.', 403);
      return true;
    }
    const body = await readBody(req);
    const message = String(body.message || '').trim();
    if (!message) {
      fail(res, 'Écrivez une suggestion.');
      return true;
    }
    await db.run('INSERT INTO suggestions (author, role, message, status) VALUES (?,?,?,?)', [
      actor.full_name,
      actor.role || 'receptionist',
      message,
      'ouverte',
    ]);
    ok(res, { id: await db.lastId() }, 'Suggestion envoyée.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/messages/thread') {
    const body = await readBody(req);
    const otherId = Number(body.user_id);
    if (!otherId || otherId === Number(actor.id)) {
      fail(res, 'Choisissez un membre de l’équipe.');
      return true;
    }
    const other = await publicContact(db, otherId);
    if (!other || !['receptionist', 'manager', 'housekeeping', 'owner'].includes(other.role)) {
      fail(res, 'Ce compte ne peut pas être contacté.');
      return true;
    }
    const thread = await getOrCreateThread(db, actor.id, otherId);
    ok(res, { ...await messagesPayload(db, actor), thread_id: Number(thread.id) }, 'Conversation ouverte.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/messages') {
    const body = await readBody(req);
    const text = String(body.body || '').trim();
    let attachment = null;
    if (body.file && (body.file.data || body.file.url)) {
      try {
        attachment = saveChatFile(body.file);
      } catch (err) {
        fail(res, err instanceof Error ? err.message : 'Fichier refusé.');
        return true;
      }
    }
    if (!text && !attachment) {
      fail(res, 'Écrivez un message ou joignez un fichier.');
      return true;
    }
    let threadId = Number(body.thread_id || 0);
    if (!threadId && body.user_id) {
      threadId = Number((await getOrCreateThread(db, actor.id, Number(body.user_id))).id);
    }
    const thread = await db.get('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
    if (!thread || (Number(thread.user_a) !== Number(actor.id) && Number(thread.user_b) !== Number(actor.id))) {
      fail(res, 'Conversation introuvable.');
      return true;
    }
    await db.run(
      `INSERT INTO chat_messages
        (thread_id, sender_id, body, created_at, attachment_url, attachment_name, attachment_mime, attachment_size)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        threadId,
        actor.id,
        text,
        stampNow(),
        attachment ? attachment.url : null,
        attachment ? attachment.name : null,
        attachment ? attachment.mime : null,
        attachment ? attachment.size : null,
      ],
    );
    ok(res, { ...await messagesPayload(db, actor), thread_id: threadId }, 'Message envoyé.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/suggestions/decide') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut valider une suggestion.', 403);
      return true;
    }
    const body = await readBody(req);
    const status = body.status === 'refusee' ? 'refusee' : 'approuvee';
    const id = Number(body.id);
    const row = await db.get('SELECT * FROM suggestions WHERE id = ?', [id]);
    if (!row) {
      fail(res, 'Suggestion introuvable.');
      return true;
    }
    await db.run('UPDATE suggestions SET status = ?, reply = ? WHERE id = ?', [
      status,
      status === 'approuvee' ? 'Approuvée' : 'Refusée',
      id,
    ]);
    ok(res, { id, status }, status === 'approuvee' ? 'Suggestion approuvée.' : 'Suggestion refusée.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/suggestions/reply') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut répondre à une suggestion.', 403);
      return true;
    }
    const body = await readBody(req);
    await db.run("UPDATE suggestions SET reply = ?, status = 'traitee' WHERE id = ?", [body.reply, Number(body.id)]);
    ok(res, { id: body.id }, 'Réponse enregistrée.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/cash-moves') {
    const body = await readBody(req);
    await db.run('INSERT INTO cash_moves (kind, label, amount, actor, at) VALUES (?,?,?,?,?)', [
      body.kind === 'sortie' ? 'sortie' : 'entree',
      body.label,
      Number(body.amount || 0),
      body.actor || actor.full_name || 'Gérance',
      stampNow(),
    ]);
    ok(res, { id: await db.lastId() }, 'Mouvement de caisse enregistré.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/shifts') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut planifier un horaire.', 403);
      return true;
    }
    const body = await readBody(req);
    const staffName = String(body.staff_name || '').trim();
    const shiftDay = String(body.day || '').trim();
    const startHour = String(body.start_hour || '').trim();
    const endHour = String(body.end_hour || '').trim();
    if (!staffName || !shiftDay || !startHour || !endHour) {
      fail(res, 'Indiquez l’employé, le jour et les horaires.');
      return true;
    }
    const id = body.id ? Number(body.id) : 0;
    if (id) {
      await db.run('UPDATE staff_shifts SET staff_name=?, day=?, start_hour=?, end_hour=?, task=? WHERE id=?', [
        staffName,
        shiftDay,
        startHour,
        endHour,
        String(body.task || '').trim(),
        id,
      ]);
      ok(res, { id }, 'Vacation mise à jour.');
      return true;
    }
    await db.run('INSERT INTO staff_shifts (staff_name, day, start_hour, end_hour, task) VALUES (?,?,?,?,?)', [
      staffName,
      shiftDay,
      startHour,
      endHour,
      String(body.task || '').trim(),
    ]);
    ok(res, { id: await db.lastId() }, 'Vacation planifiée.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/shifts/delete') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut retirer un horaire.', 403);
      return true;
    }
    const body = await readBody(req);
    await db.run('DELETE FROM staff_shifts WHERE id = ?', [Number(body.id)]);
    ok(res, { id: body.id }, 'Vacation retirée.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/work-tasks') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut créer une tâche.', 403);
      return true;
    }
    const body = await readBody(req);
    const title = String(body.title || '').trim();
    const assignee = String(body.assignee || '').trim();
    const jobDay = String(body.day || '').trim();
    if (!title || !assignee || !jobDay) {
      fail(res, 'Indiquez la tâche, l’employé et le jour.');
      return true;
    }
    await db.run('INSERT INTO work_tasks (title, assignee, day, status, notes, created_at) VALUES (?,?,?,?,?,?)', [
      title,
      assignee,
      jobDay,
      'a_faire',
      String(body.notes || '').trim(),
      stampNow(),
    ]);
    ok(res, { id: await db.lastId() }, 'Tâche planifiée.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/work-tasks/status') {
    const body = await readBody(req);
    const row = await db.get('SELECT assignee FROM work_tasks WHERE id = ?', [Number(body.id)]);
    if (!row) {
      fail(res, 'Tâche introuvable.', 404);
      return true;
    }
    const mine = String(row.assignee || '').trim().toLowerCase() === String(actor.full_name || '').trim().toLowerCase();
    const manager = actor.role === 'manager' || actor.role === 'owner';
    if (!manager && !mine) {
      fail(res, 'Vous ne pouvez mettre à jour que vos propres tâches.', 403);
      return true;
    }
    const status = body.status === 'fait' ? 'fait' : body.status === 'en_cours' ? 'en_cours' : 'a_faire';
    await db.run('UPDATE work_tasks SET status = ? WHERE id = ?', [status, Number(body.id)]);
    ok(res, { id: body.id, status }, 'Tâche mise à jour.');
    return true;
  }

  if (method === 'GET' && pathName === '/pms/room-categories') {
    ok(res, { categories: await db.all('SELECT id, name FROM room_categories ORDER BY sort_order, name') });
    return true;
  }

  if (method === 'POST' && pathName === '/pms/room-categories') {
    if (actor.role !== 'manager' && actor.role !== 'owner' && actor.role !== 'receptionist') {
      fail(res, 'Vous ne pouvez pas créer de catégorie.', 403);
      return true;
    }
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) {
      fail(res, 'Indiquez le nom de la catégorie.');
      return true;
    }
    const existing = await db.get('SELECT id FROM room_categories WHERE LOWER(name) = LOWER(?)', [name]);
    if (existing) {
      fail(res, 'Cette catégorie existe déjà.');
      return true;
    }
    const last = await db.get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM room_categories');
    await db.run('INSERT INTO room_categories (name, sort_order) VALUES (?, ?)', [name, Number(last?.n || 0) + 1]);
    ok(res, { id: await db.lastId(), name }, 'Catégorie créée.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/room-categories/delete') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut retirer une catégorie.', 403);
      return true;
    }
    const body = await readBody(req);
    const row = await db.get('SELECT name FROM room_categories WHERE id = ?', [Number(body.id)]);
    if (!row) {
      fail(res, 'Catégorie introuvable.', 404);
      return true;
    }
    const used = await db.get('SELECT COUNT(*) AS n FROM rooms WHERE type = ?', [row.name]);
    if (Number(used?.n || 0) > 0) {
      fail(res, 'Cette catégorie est utilisée par des chambres.');
      return true;
    }
    await db.run('DELETE FROM room_categories WHERE id = ?', [Number(body.id)]);
    ok(res, { id: body.id }, 'Catégorie retirée.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/work-tasks/delete') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut supprimer une tâche.', 403);
      return true;
    }
    const body = await readBody(req);
    await db.run('DELETE FROM work_tasks WHERE id = ?', [Number(body.id)]);
    ok(res, { id: body.id }, 'Tâche retirée.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/rooms/save') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut créer ou modifier une chambre.', 403);
      return true;
    }
    const body = await readBody(req);
    const photos = Array.isArray(body.photos) ? body.photos.map(String).filter(Boolean) : [];
    const videos = Array.isArray(body.videos) ? body.videos.map(String).filter(Boolean) : [];
    const equipmentIds = Array.isArray(body.equipment_ids) ? body.equipment_ids.map(Number).filter(Boolean) : [];
    const cover = photos[0] || body.photo || 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80';
    const video = videos[0] || body.video || null;
    const number = String(body.number || '').trim();
    if (!number) {
      fail(res, 'Indiquez le numéro de chambre.');
      return true;
    }
    let roomId = body.id ? Number(body.id) : 0;
    if (roomId) {
      await db.run(
        'UPDATE rooms SET number=?, type=?, floor=?, price_night=?, capacity=?, photo=?, video=?, description=?, status=? WHERE id=?',
        [
          number,
          body.type || 'Standard',
          Number(body.floor || 1),
          Number(body.price_night || 0),
          Number(body.capacity || 2),
          cover,
          video,
          body.description || '',
          body.status || 'disponible',
          roomId,
        ],
      );
    } else {
      await db.run(
        'INSERT INTO rooms (number, type, floor, status, price_night, capacity, photo, description, video) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          number,
          body.type || 'Standard',
          Number(body.floor || 1),
          body.status || 'disponible',
          Number(body.price_night || 0),
          Number(body.capacity || 2),
          cover,
          body.description || '',
          video,
        ],
      );
      roomId = await db.lastId();
    }
    await db.run('DELETE FROM room_photos WHERE room_id = ?', [roomId]);
    await db.run('DELETE FROM room_videos WHERE room_id = ?', [roomId]);
    await db.run('DELETE FROM room_equipment WHERE room_id = ?', [roomId]);
    for (let index = 0; index < photos.length; index += 1) {
      await db.run('INSERT INTO room_photos (room_id, url, sort) VALUES (?,?,?)', [roomId, photos[index], index]);
    }
    for (let index = 0; index < videos.length; index += 1) {
      await db.run('INSERT INTO room_videos (room_id, url, sort) VALUES (?,?,?)', [roomId, videos[index], index]);
    }
    for (const equipmentId of equipmentIds) {
      await db.run('INSERT OR IGNORE INTO room_equipment (room_id, equipment_id) VALUES (?,?)', [roomId, equipmentId]);
    }
    ok(res, { id: roomId }, body.id ? 'Chambre enregistrée.' : 'Chambre créée.', body.id ? 200 : 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/equipment/save') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) {
      fail(res, 'Indiquez le nom de l’équipement.');
      return true;
    }
    await db.run('INSERT INTO equipment (name, category, icon, quantity) VALUES (?,?,?,?)', [
      name,
      body.category || 'Confort',
      body.icon || 'cabinet',
      1,
    ]);
    ok(res, { id: await db.lastId(), name }, 'Équipement créé.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/equipment/delete') {
    const body = await readBody(req);
    const id = Number(body.id);
    if (!id) {
      fail(res, 'Équipement introuvable.');
      return true;
    }
    await db.run('DELETE FROM room_equipment WHERE equipment_id = ?', [id]);
    await db.run('DELETE FROM equipment WHERE id = ?', [id]);
    ok(res, { id }, 'Équipement supprimé.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/rooms/delete') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut supprimer une chambre.', 403);
      return true;
    }
    const body = await readBody(req);
    const id = Number(body.id);
    const room = await db.get('SELECT * FROM rooms WHERE id = ?', [id]);
    if (!room || room.deleted_at) {
      fail(res, 'Chambre introuvable.');
      return true;
    }
    const active = await db.get(
      "SELECT COUNT(*) AS n FROM reservations WHERE room_id = ? AND status IN ('confirmee','en_cours')",
      [id],
    );
    if (Number(active?.n || 0) > 0) {
      fail(res, 'Cette chambre a une réservation active. Annulez ou terminez le séjour avant de la retirer.');
      return true;
    }
    const who = actorIdentity(actor);
    const when = stampNow();
    await db.run('UPDATE rooms SET deleted_at = ?, deleted_by_email = ? WHERE id = ?', [when, who.email, id]);
    await db.run(
      `INSERT INTO trash_items (entity_type, entity_id, label, payload, deleted_at, deleted_by, deleted_by_email, deleted_role)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['room', String(id), `Chambre ${room.number}`, JSON.stringify({ number: room.number, type: room.type, status: room.status }), when, who.name, who.email, who.role],
    );
    await writeAudit(db, actor, {
      action: 'room.delete',
      entityType: 'room',
      entityId: id,
      summary: `Chambre ${room.number} placée dans la corbeille`,
      before: { number: room.number, status: room.status },
    });
    ok(res, { id }, 'Chambre placée dans la corbeille.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/rooms/status') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut mettre une chambre en maintenance ou la marquer prête.', 403);
      return true;
    }
    const body = await readBody(req);
    const id = Number(body.id);
    const status = String(body.status || '');
    if (!id || (status !== 'maintenance' && status !== 'disponible')) {
      fail(res, 'Statut invalide.');
      return true;
    }
    const room = await db.get('SELECT * FROM rooms WHERE id = ? AND IFNULL(deleted_at, \'\') = \'\'', [id]);
    if (!room) {
      fail(res, 'Chambre introuvable.');
      return true;
    }
    const who = actorIdentity(actor);
    const when = stampNow();
    if (status === 'disponible') {
      await db.run(
        `UPDATE rooms SET status = 'disponible', maintenance_level = NULL, maintenance_note = NULL WHERE id = ?`,
        [id],
      );
      await db.run(
        `UPDATE room_maintenance SET status = 'cloturee', closed_at = ?, closed_by = ?, closed_by_email = ?
         WHERE room_id = ? AND status = 'ouverte'`,
        [when, who.name, who.email, id],
      );
      await db.run(
        "UPDATE hk_tasks SET status = 'pret', finished_at = COALESCE(finished_at, ?) WHERE room_number = ? AND status NOT IN ('pret','termine','controle')",
        [when, room.number],
      );
      await writeAudit(db, actor, {
        action: 'room.maintenance.close',
        entityType: 'room',
        entityId: id,
        summary: `Chambre ${room.number} remise en service`,
        before: { status: room.status, level: room.maintenance_level },
        after: { status: 'disponible' },
      });
      ok(res, { id, number: room.number, status: 'disponible' }, 'Chambre marquée prête.');
      return true;
    }
    const level = body.level === 'legere' ? 'legere' : body.level === 'grave' ? 'grave' : '';
    const description = String(body.description || '').trim();
    if (!level || !description) {
      fail(res, 'Choisissez le niveau (légère ou grave) et décrivez le problème.');
      return true;
    }
    const active = await db.all(
      `SELECT r.id, g.full_name AS guest_name, r.status FROM reservations r
       JOIN guests g ON g.id = r.guest_id
       WHERE r.room_id = ? AND r.status IN ('confirmee','en_cours')`,
      [id],
    );
    const conflict = level === 'grave' && active.length
      ? `Séjours conservés : ${active.map((row) => `#${row.id} ${row.guest_name} (${row.status})`).join(', ')}`
      : null;
    await db.run(
      `UPDATE rooms SET status = 'maintenance', maintenance_level = ?, maintenance_note = ?, maintenance_at = ?, maintenance_by = ?, maintenance_by_email = ? WHERE id = ?`,
      [level, description, when, who.name, who.email, id],
    );
    await db.run(
      `INSERT INTO room_maintenance (room_id, room_number, level, description, status, started_at, opened_by, opened_by_email, opened_role, conflict_note)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, room.number, level, description, 'ouverte', when, who.name, who.email, who.role, conflict],
    );
    await writeAudit(db, actor, {
      action: 'room.maintenance.open',
      entityType: 'room',
      entityId: id,
      summary: `Chambre ${room.number} en maintenance ${level === 'legere' ? 'légère' : 'grave'}`,
      reason: description,
      after: { level, conflict },
    });
    ok(
      res,
      { id, number: room.number, status: 'maintenance', level, conflict },
      conflict ? `Maintenance grave enregistrée. ${conflict}` : 'Chambre en maintenance.',
    );
    return true;
  }

  if (method === 'POST' && pathName === '/pms/rooms/block') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut mettre une chambre en maintenance.', 403);
      return true;
    }
    const body = await readBody(req);
    await db.run("UPDATE rooms SET status = 'maintenance' WHERE number = ?", [body.room_number]);
    await db.run(
      `INSERT INTO notifications (category, title, body, href, is_read, created_at)
       VALUES ('MAINTENANCE', 'Chambre indisponible', ?, '/rooms', 0, ?)`,
      [`Chambre ${body.room_number} placée hors service.`, stampNow()],
    );
    ok(res, { room: body.room_number }, 'Chambre rendue indisponible.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/housekeeping/urgent') {
    const body = await readBody(req);
    await db.run(
      'INSERT INTO hk_tasks (room_number, attendant, priority, status, eta_minutes, due_at) VALUES (?,?,?,?,?,?)',
      [body.room_number, body.attendant || 'Étages', 'urgente', 'non_prise', 20, stampNow()],
    );
    await db.run("UPDATE rooms SET status = 'nettoyage' WHERE number = ?", [body.room_number]);
    await db.run(
      `INSERT INTO notifications (category, title, body, href, is_read, created_at)
       VALUES ('URGENCE', 'Nettoyage urgent', ?, '/housekeeping', 0, ?)`,
      [`Chambre ${body.room_number} à nettoyer en urgence.`, stampNow()],
    );
    ok(res, { id: await db.lastId() }, 'Urgence de nettoyage signalée.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/warehouses') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut créer un magasin.', 403);
      return true;
    }
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) {
      fail(res, 'Indiquez le nom du magasin.');
      return true;
    }
    const existing = await db.get('SELECT id FROM warehouses WHERE lower(name) = lower(?)', [name]);
    if (existing) {
      fail(res, 'Ce magasin existe déjà.');
      return true;
    }
    await db.run('INSERT INTO warehouses (name, kind) VALUES (?, ?)', [name, String(body.kind || 'magasin').trim() || 'magasin']);
    ok(res, { id: await db.lastId() }, 'Magasin créé.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/warehouses/delete') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut supprimer un magasin.', 403);
      return true;
    }
    const body = await readBody(req);
    const id = Number(body.id || 0);
    const warehouse = await db.get('SELECT id, name FROM warehouses WHERE id = ?', [id]);
    if (!warehouse) {
      fail(res, 'Magasin introuvable.', 404);
      return true;
    }
    const used = await db.get('SELECT COUNT(*) AS n FROM products WHERE warehouse_id = ?', [id]);
    if (Number(used?.n || 0) > 0) {
      fail(res, 'Ce magasin contient encore des produits.');
      return true;
    }
    await db.run('DELETE FROM warehouses WHERE id = ?', [id]);
    ok(res, { id });
    return true;
  }

  if (method === 'POST' && pathName === '/pms/products') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut enregistrer un produit.', 403);
      return true;
    }
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) {
      fail(res, 'Indiquez le nom du produit.');
      return true;
    }
    const warehouse = await db.get('SELECT id FROM warehouses WHERE id = ?', [Number(body.warehouse_id || 0)]);
    if (!warehouse) {
      fail(res, 'Choisissez le magasin où se trouve le produit.');
      return true;
    }
    const warehouseId = warehouse.id;
    const lot = String(body.lot || '').trim() || null;
    const expiresAt = String(body.expires_at || '').trim() || null;
    const photo = body.photo ? String(body.photo) : null;
    const kind = body.kind === 'interne' ? 'interne' : 'vente';
    const unit = String(body.unit || 'u').trim() || 'u';
    const stock = Number(body.stock || 0);
    const minStock = Number(body.min_stock || 0);
    const cost = Number(body.cost || 0);
    const price = kind === 'interne' ? 0 : Number(body.price || 0);
    const id = body.id ? Number(body.id) : 0;
    if (id) {
      await db.run(
        'UPDATE products SET name=?, category=?, unit=?, stock=?, min_stock=?, cost=?, price=?, warehouse_id=?, lot=?, expires_at=?, photo=?, kind=? WHERE id=?',
        [name, kind === 'vente' ? 'Accueil' : 'Magasin', unit, stock, minStock, cost, price, warehouseId, lot, expiresAt, photo, kind, id],
      );
      ok(res, { id }, 'Produit mis à jour.');
      return true;
    }
    await db.run(
      'INSERT INTO products (name, category, unit, stock, min_stock, cost, price, warehouse_id, lot, expires_at, photo, kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [name, kind === 'vente' ? 'Accueil' : 'Magasin', unit, stock, minStock, cost, price, warehouseId, lot, expiresAt, photo, kind],
    );
    ok(res, { id: await db.lastId() }, 'Produit enregistré.', 201);
    return true;
  }

  if (method === 'POST' && pathName === '/pms/stock/issue') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut sortir un article du magasin.', 403);
      return true;
    }
    const body = await readBody(req);
    const product = await db.get(
      `SELECT p.*, w.name AS warehouse FROM products p LEFT JOIN warehouses w ON w.id = p.warehouse_id WHERE p.id = ?`,
      [Number(body.product_id)],
    );
    const qty = Number(body.qty || 0);
    const takenBy = String(body.taken_by || '').trim();
    if (!product) {
      fail(res, 'Produit introuvable.');
      return true;
    }
    if (qty <= 0) {
      fail(res, 'Indiquez la quantité sortie.');
      return true;
    }
    if (!takenBy) {
      fail(res, 'Indiquez qui récupère le produit.');
      return true;
    }
    if (Number(product.stock) < qty) {
      fail(res, `Stock insuffisant (${product.stock} restant).`);
      return true;
    }
    const moveKind = ['perte', 'casse', 'perime', 'service', 'vente'].includes(String(body.kind || ''))
      ? String(body.kind)
      : 'service';
    await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, product.id]);
    const who = actorIdentity(actor);
    await db.run(
      'INSERT INTO stock_moves (product_name, warehouse, type, qty, at, note, dest, actor, product_id, actor_email) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        product.name,
        product.warehouse || 'Magasin',
        moveKind,
        qty,
        stampNow(),
        String(body.note || '').trim() || 'Sortie magasin',
        takenBy,
        who.name,
        product.id,
        who.email,
      ],
    );
    await writeAudit(db, actor, {
      action: 'stock.out',
      entityType: 'product',
      entityId: product.id,
      summary: `Sortie ${moveKind} · ${product.name} × ${qty}`,
      reason: String(body.note || '').trim() || null,
    });
    ok(res, { id: product.id, stock: Number(product.stock) - qty }, 'Sortie magasin enregistrée.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/products/delete') {
    if (actor.role !== 'manager' && actor.role !== 'owner') {
      fail(res, 'Seul le gérant peut supprimer un produit.', 403);
      return true;
    }
    const body = await readBody(req);
    const product = await db.get('SELECT * FROM products WHERE id = ?', [Number(body.id)]);
    if (!product || product.deleted_at) {
      fail(res, 'Produit introuvable.');
      return true;
    }
    const who = actorIdentity(actor);
    const when = stampNow();
    await db.run('UPDATE products SET deleted_at = ?, deleted_by_email = ? WHERE id = ?', [when, who.email, product.id]);
    await db.run(
      `INSERT INTO trash_items (entity_type, entity_id, label, payload, deleted_at, deleted_by, deleted_by_email, deleted_role)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['product', String(product.id), product.name, JSON.stringify({ stock: product.stock, price: product.price }), when, who.name, who.email, who.role],
    );
    await writeAudit(db, actor, {
      action: 'product.delete',
      entityType: 'product',
      entityId: product.id,
      summary: `Produit ${product.name} placé dans la corbeille`,
    });
    ok(res, { id: product.id }, 'Produit placé dans la corbeille.');
    return true;
  }

  if (method === 'GET' && pathName === '/pms/trash') {
    if (actor.role !== 'owner') {
      fail(res, 'La corbeille est réservée au propriétaire.', 403);
      return true;
    }
    ok(res, {
      items: await db.all(
        `SELECT * FROM trash_items WHERE restored_at IS NULL AND purged_at IS NULL ORDER BY id DESC`,
      ),
    });
    return true;
  }

  if (method === 'POST' && pathName === '/pms/trash/restore') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut restaurer un élément.', 403);
      return true;
    }
    const body = await readBody(req);
    const item = await db.get('SELECT * FROM trash_items WHERE id = ? AND restored_at IS NULL AND purged_at IS NULL', [Number(body.id)]);
    if (!item) {
      fail(res, 'Élément introuvable dans la corbeille.');
      return true;
    }
    const who = actorIdentity(actor);
    if (item.entity_type === 'room') {
      const room = await db.get('SELECT * FROM rooms WHERE id = ?', [Number(item.entity_id)]);
      if (!room) {
        fail(res, 'La chambre d’origine n’existe plus.');
        return true;
      }
      const clash = await db.get(
        'SELECT id FROM rooms WHERE number = ? AND id != ? AND IFNULL(deleted_at, \'\') = \'\'',
        [room.number, room.id],
      );
      if (clash) {
        fail(res, `Une chambre ${room.number} est déjà active. Résolvez le conflit avant de restaurer.`);
        return true;
      }
      await db.run('UPDATE rooms SET deleted_at = NULL, deleted_by_email = NULL WHERE id = ?', [room.id]);
    } else if (item.entity_type === 'product') {
      await db.run('UPDATE products SET deleted_at = NULL, deleted_by_email = NULL WHERE id = ?', [Number(item.entity_id)]);
    } else {
      fail(res, 'Ce type d’élément ne peut pas être restauré automatiquement.');
      return true;
    }
    await db.run('UPDATE trash_items SET restored_at = ?, restored_by_email = ? WHERE id = ?', [stampNow(), who.email, item.id]);
    await writeAudit(db, actor, {
      action: 'trash.restore',
      entityType: item.entity_type,
      entityId: item.entity_id,
      summary: `Restauration : ${item.label}`,
      refType: 'trash',
      refId: item.id,
    });
    ok(res, { id: item.id }, 'Élément restauré.');
    return true;
  }

  if (method === 'POST' && pathName === '/pms/trash/purge') {
    if (actor.role !== 'owner') {
      fail(res, 'Seul le propriétaire peut supprimer définitivement.', 403);
      return true;
    }
    const body = await readBody(req);
    if (body.confirm !== 'SUPPRIMER') {
      fail(res, 'Confirmation requise.');
      return true;
    }
    const item = await db.get('SELECT * FROM trash_items WHERE id = ? AND restored_at IS NULL AND purged_at IS NULL', [Number(body.id)]);
    if (!item) {
      fail(res, 'Élément introuvable dans la corbeille.');
      return true;
    }
    if (item.entity_type === 'room') {
      const active = await db.get(
        "SELECT COUNT(*) AS n FROM reservations WHERE room_id = ? AND status IN ('confirmee','en_cours')",
        [Number(item.entity_id)],
      );
      if (Number(active?.n || 0) > 0) {
        fail(res, 'Des séjours actifs empêchent la suppression définitive.');
        return true;
      }
      await db.run('DELETE FROM room_photos WHERE room_id = ?', [Number(item.entity_id)]);
      await db.run('DELETE FROM room_videos WHERE room_id = ?', [Number(item.entity_id)]);
      await db.run('DELETE FROM room_equipment WHERE room_id = ?', [Number(item.entity_id)]);
      await db.run('DELETE FROM rooms WHERE id = ?', [Number(item.entity_id)]);
    } else if (item.entity_type === 'product') {
      const moves = await db.get('SELECT COUNT(*) AS n FROM stock_moves WHERE product_id = ?', [Number(item.entity_id)]);
      if (Number(moves?.n || 0) > 0) {
        fail(res, 'Ce produit a des mouvements de stock. Conservez-le dans la corbeille pour l’historique.');
        return true;
      }
      await db.run('DELETE FROM products WHERE id = ?', [Number(item.entity_id)]);
    }
    const who = actorIdentity(actor);
    await db.run('UPDATE trash_items SET purged_at = ?, purged_by_email = ? WHERE id = ?', [stampNow(), who.email, item.id]);
    await writeAudit(db, actor, {
      action: 'trash.purge',
      entityType: item.entity_type,
      entityId: item.entity_id,
      summary: `Suppression définitive : ${item.label}`,
      reason: 'Confirmation propriétaire',
      refType: 'trash',
      refId: item.id,
    });
    ok(res, { id: item.id }, 'Élément supprimé définitivement.');
    return true;
  }

  if (method === 'GET' && pathName === '/pms/audit') {
    if (actor.role !== 'owner') {
      fail(res, 'Le journal d’audit est réservé au propriétaire.', 403);
      return true;
    }
    const url = new URL(req.url, 'http://localhost');
    const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
    const action = String(url.searchParams.get('action') || '').trim().toLowerCase();
    const entity = String(url.searchParams.get('entity') || '').trim().toLowerCase();
    let rows = await db.all('SELECT id, at, user_id, email, role, action, entity_type, entity_id, summary, reason, ref_type, ref_id, result, row_hash FROM audit_log ORDER BY id DESC LIMIT 400');
    if (email) rows = rows.filter((row) => String(row.email).toLowerCase().includes(email));
    if (action) rows = rows.filter((row) => String(row.action).toLowerCase().includes(action));
    if (entity) rows = rows.filter((row) => String(row.entity_type || '').toLowerCase().includes(entity) || String(row.entity_id || '') === entity);
    ok(res, {
      items: rows,
      note: 'Chaque ligne est liée au compte authentifié (e-mail de session). La chaîne de hash détecte une altération du journal. Ce n’est pas une signature cryptographique de l’utilisateur.',
    });
    return true;
  }

  if (method === 'GET' && pathName === '/pms/room-maintenance') {
    const url = new URL(req.url, 'http://localhost');
    const roomId = Number(url.searchParams.get('room_id') || 0);
    const rows = roomId
      ? await db.all('SELECT * FROM room_maintenance WHERE room_id = ? ORDER BY id DESC', [roomId])
      : await db.all('SELECT * FROM room_maintenance ORDER BY id DESC LIMIT 200');
    const discounts = await db.all('SELECT * FROM stay_discounts ORDER BY id DESC LIMIT 200');
    ok(res, { items: rows, discounts: roomId ? discounts.filter((row) => Number(row.room_id) === roomId) : discounts });
    return true;
  }

  return false;
}

async function saleDetail(db, sale) {
  if (!sale) return null;
  const items = await db.all('SELECT * FROM pos_sale_items WHERE sale_id = ? ORDER BY id', [sale.id]);
  return { ...sale, items };
}

function quoteStay(room, nights, body, actor) {
  const list = Math.max(0, nights) * Number(room.price_night || 0);
  const level = room.status === 'maintenance' ? room.maintenance_level || 'grave' : null;
  if (level === 'grave') {
    return { error: 'Cette chambre est en maintenance grave et ne peut pas être louée.', status: 409 };
  }
  if (room.deleted_at) {
    return { error: 'Cette chambre n’est plus disponible.', status: 404 };
  }
  const raw = body.final_price;
  if (raw === undefined || raw === null || raw === '') {
    return { list, discount: 0, total: list, reason: null, level };
  }
  const allowed = actor.role === 'receptionist' || actor.role === 'manager' || actor.role === 'owner';
  if (!allowed) {
    return { error: 'Vous n’êtes pas autorisé à accorder une réduction.', status: 403 };
  }
  if (level !== 'legere') {
    return { error: 'Une réduction exceptionnelle n’est possible que pour une chambre en maintenance légère.' };
  }
  const finalPrice = Number(raw);
  if (!Number.isFinite(finalPrice) || finalPrice < 0) {
    return { error: 'Le prix final doit être un montant positif ou nul.' };
  }
  if (finalPrice > list + 0.001) {
    return { error: 'Le prix négocié ne peut pas dépasser le tarif normal de la chambre.' };
  }
  return {
    list,
    discount: Math.max(0, list - finalPrice),
    total: finalPrice,
    reason: String(body.discount_reason || '').trim() || null,
    level,
  };
}

function stampNow() {
  const d = new Date();
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

module.exports = { handlePms, computeKpis, markReadyRoomsDisponible, releaseExpiredStays };
