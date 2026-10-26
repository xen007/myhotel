const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { ensurePmsSchema } = require('./pms-schema');
const { seedPms } = require('./pms-seed');
const { translateSql, normalizeRow } = require('./sql-mysql');

function loadDotEnv() {
  const candidates = [path.join(__dirname, '..', '.env'), path.join(process.cwd(), '.env')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
    }
    break;
  }
}

loadDotEnv();

const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = SERVERLESS ? path.join(os.tmpdir(), 'myhotel-data') : path.join(__dirname, 'data');

function parseMysqlUrl(raw) {
  const u = new URL(raw);
  const database = decodeURIComponent((u.pathname || '').replace(/^\//, '').split('/')[0] || '');
  const sslMode = String(u.searchParams.get('ssl-mode') || u.searchParams.get('sslmode') || u.searchParams.get('ssl') || '').toLowerCase();
  const wantSsl =
    ['required', 'require', 'true', '1', 'preferred', 'verify_ca', 'verify_identity'].includes(sslMode) ||
    u.searchParams.has('sslaccept');
  return {
    host: decodeURIComponent(u.hostname),
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: database || 'myhotel',
    ssl: wantSsl ? { rejectUnauthorized: false } : undefined,
  };
}

function mysqlSettings() {
  for (const key of ['MYSQL_URL', 'MYHOTEL_MYSQL_URL', 'DATABASE_URL']) {
    const value = process.env[key];
    if (value && /^(mysql|mysql2):\/\//i.test(value)) return parseMysqlUrl(value);
  }
  const sslFlag = String(process.env.MYHOTEL_MYSQL_SSL || '').toLowerCase();
  return {
    host: process.env.MYHOTEL_MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYHOTEL_MYSQL_PORT || 3306),
    user: process.env.MYHOTEL_MYSQL_USER || 'root',
    password: process.env.MYHOTEL_MYSQL_PASSWORD ?? '',
    database: process.env.MYHOTEL_MYSQL_DATABASE || 'myhotel',
    ssl: sslFlag === '1' || sslFlag === 'true' || sslFlag === 'required' ? { rejectUnauthorized: false } : undefined,
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('$2')) {
    return bcrypt.compareSync(password, stored.replace(/^\$2y\$/, '$2a$'));
  }
  const [algo, salt, hash] = String(stored).split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
  } catch {
    return false;
  }
}

function publicUser(user) {
  return {
    id: Number(user.id),
    full_name: user.full_name,
    email: user.email,
    phone: user.phone ?? null,
    created_at: user.created_at,
    last_login: user.last_login ?? null,
    photo: user.photo ?? null,
    role: user.role ?? 'client',
    status: user.status || 'actif',
  };
}

function createApi(pool) {
  let lastInsertId = 0;

  async function all(sql, params = []) {
    const translated = translateSql(sql);
    try {
      const [rows] = await pool.query(translated, params);
      return Array.isArray(rows) ? rows.map(normalizeRow) : [];
    } catch (error) {
      error.message = `${error.message} — ${translated}`;
      throw error;
    }
  }

  async function get(sql, params = []) {
    const rows = await all(sql, params);
    return rows[0] ?? null;
  }

  async function run(sql, params = []) {
    const [result] = await pool.query(translateSql(sql), params);
    if (result && typeof result.insertId === 'number' && result.insertId > 0) {
      lastInsertId = Number(result.insertId);
    }
    return Number(result?.affectedRows || 0);
  }

  async function lastId() {
    return lastInsertId;
  }

  return {
    all,
    get,
    run,
    lastId,
    persist() {},
    hashPassword,
    verifyPassword,
    publicUser,
  };
}

async function ensureSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      floor INTEGER NOT NULL,
      status TEXT NOT NULL,
      price_night REAL NOT NULL,
      capacity INTEGER NOT NULL,
      photo TEXT NOT NULL,
      description TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      icon TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS room_equipment (
      room_id INTEGER NOT NULL,
      equipment_id INTEGER NOT NULL,
      PRIMARY KEY (room_id, equipment_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      status TEXT NOT NULL,
      hired_at TEXT NOT NULL,
      photo TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      photo TEXT,
      available INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      nationality TEXT,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      status TEXT NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (guest_id) REFERENCES guests(id),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )`,
    `CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      icon TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      label TEXT NOT NULL
    )`,
  ];
  for (const sql of statements) await db.run(sql);
}

function localDay(offset = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function seedIfEmpty(db) {
  const roomsCount = Number((await db.get('SELECT COUNT(*) AS n FROM rooms'))?.n || 0);
  if (roomsCount > 0) return;

  const equipment = [
    ['Lit king size', 'Literie', 'bed', 18],
    ['Lit queen size', 'Literie', 'bed', 10],
    ['Canapé-lit', 'Literie', 'bed', 6],
    ['Télévision 55"', 'Électronique', 'tv', 22],
    ['Wi-Fi haut débit', 'Électronique', 'wifi', 40],
    ['Climatisation', 'Confort', 'wind', 24],
    ['Minibar', 'Confort', 'fridge', 16],
    ['Cafetière Nespresso', 'Confort', 'coffee', 20],
    ['Coffre-fort', 'Sécurité', 'lock-alt', 18],
    ['Bureau & chaise', 'Mobilier', 'briefcase', 22],
    ['Armoire dressing', 'Mobilier', 'cabinet', 20],
    ['Baignoire', 'Salle de bain', 'bath', 8],
    ['Douche à l’italienne', 'Salle de bain', 'shower', 16],
    ['Articles de toilette', 'Salle de bain', 'droplet', 28],
    ['Balcon', 'Espace', 'door-open', 9],
    ['Vue mer / ville', 'Espace', 'map', 7],
  ];
  for (const row of equipment) {
    await db.run('INSERT INTO equipment (name, category, icon, quantity) VALUES (?, ?, ?, ?)', row);
  }

  const rooms = [
    ['101', 'Standard', 1, 'disponible', 45000, 2, 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80', 'Chambre standard meublée, idéale pour un séjour d’affaires.'],
    ['102', 'Standard', 1, 'occupee', 45000, 2, 'https://images.unsplash.com/photo-1566665797739-1674d7ff7f1c?w=1200&q=80', 'Chambre cosy avec bureau, TV et salle d’eau complète.'],
    ['103', 'Deluxe', 1, 'disponible', 72000, 2, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200&q=80', 'Deluxe lumineuse, minibar, climatisation et dressing.'],
    ['105', 'Standard', 1, 'occupee', 45000, 2, 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80', 'Chambre standard avec vue cour intérieure.'],
    ['106', 'Deluxe', 1, 'disponible', 72000, 3, 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200&q=80', 'Deluxe familiale, canapé-lit et espace détente.'],
    ['201', 'Suite', 2, 'occupee', 125000, 3, 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80', 'Suite junior avec salon, baignoire et coffre-fort.'],
    ['202', 'Deluxe', 2, 'nettoyage', 72000, 2, 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1200&q=80', 'Deluxe en remise en état après départ.'],
    ['203', 'Familiale', 2, 'disponible', 98000, 4, 'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?w=1200&q=80', 'Chambre familiale, deux lits et coin salon.'],
    ['301', 'Présidentielle', 3, 'disponible', 210000, 2, 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&q=80', 'Suite présidentielle, salon, baignoire et vue panoramique.'],
    ['302', 'Standard', 3, 'maintenance', 45000, 2, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80', 'Chambre temporairement fermée pour maintenance.'],
    ['303', 'Deluxe', 3, 'reservee', 72000, 2, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80', 'Deluxe réservée pour une arrivée en soirée.'],
    ['304', 'Suite', 3, 'disponible', 125000, 3, 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&q=80', 'Suite avec balcon, minibar et espace bureau.'],
  ];
  for (const row of rooms) {
    await db.run(
      'INSERT INTO rooms (number, type, floor, status, price_night, capacity, photo, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      row,
    );
  }

  const roomEquip = {
    101: [1, 4, 5, 6, 10, 11, 13, 14],
    102: [2, 4, 5, 6, 10, 13, 14],
    103: [1, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14],
    105: [2, 4, 5, 6, 10, 13],
    106: [1, 3, 4, 5, 6, 7, 8, 10, 11, 13, 14],
    201: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15],
    202: [1, 4, 5, 6, 7, 8, 10, 11, 13],
    203: [1, 2, 3, 4, 5, 6, 8, 10, 11, 13, 14],
    301: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16],
    302: [2, 4, 5, 10, 13],
    303: [1, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14],
    304: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15],
  };
  const roomRows = await db.all('SELECT id, number FROM rooms');
  for (const room of roomRows) {
    const ids = roomEquip[Number(room.number)] || [];
    for (const equipmentId of ids) {
      await db.run('INSERT OR IGNORE INTO room_equipment (room_id, equipment_id) VALUES (?, ?)', [room.id, equipmentId]);
    }
  }

  const staff = [
    ['Amina Koffi', 'Réceptionniste', 'Réception', '+225 07 00 11 22', 'receptioniste@gmail.com', 'actif', '2022-03-12', 'Amina+Koffi'],
    ['Jean-Marc Yao', 'Manager d’hôtel', 'Direction', '+225 07 00 33 44', 'gerant@gmail.com', 'actif', '2019-08-01', 'Jean-Marc+Yao'],
    ['Fatou Diarra', 'Gouvernante', 'Étages', '+225 05 22 10 18', 'gouvernante@gmail.com', 'actif', '2021-01-20', 'Fatou+Diarra'],
    ['Koffi Mensah', 'Agent d’étage', 'Étages', '+225 05 18 40 21', 'entretien@gmail.com', 'actif', '2023-06-05', 'Koffi+Mensah'],
    ['Sarah N’Guessan', 'Chef de cuisine', 'Restauration', '+225 01 44 20 09', 'sarah@gmail.com', 'actif', '2020-11-15', 'Sarah+NGuessan'],
    ['Ibrahim Traoré', 'Serveur', 'Restauration', '+225 07 55 12 90', 'ibrahim@gmail.com', 'conge', '2024-02-01', 'Ibrahim+Traore'],
    ['Lucie Bamba', 'Comptable', 'Administration', '+225 27 22 45 10', 'proprietaire@gmail.com', 'actif', '2018-04-09', 'Lucie+Bamba'],
    ['Paul Kouassi', 'Technicien', 'Maintenance', '+225 05 90 12 33', 'paul@gmail.com', 'actif', '2021-09-18', 'Paul+Kouassi'],
    ['Marie Adjoua', 'Spa thérapeute', 'Bien-être', '+225 07 13 88 41', 'marie@gmail.com', 'actif', '2023-01-11', 'Marie+Adjoua'],
    ['Eric Zongo', 'Bagagiste', 'Réception', '+225 01 20 77 65', 'eric@gmail.com', 'arret', '2024-07-22', 'Eric+Zongo'],
  ];
  for (const row of staff) {
    const photo = `https://ui-avatars.com/api/?name=${row[7]}&background=141622&color=D4AF37&size=256&bold=true`;
    await db.run(
      'INSERT INTO staff (full_name, role, department, phone, email, status, hired_at, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [...row.slice(0, 7), photo],
    );
  }

  const dishes = [
    ['Pain perdu à la vanille', 'Petit-déjeuner', 6500, 'Brioche dorée, fruits de saison et miel local.', 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=900&q=80'],
    ['Omelette du chef', 'Petit-déjeuner', 5500, 'Œufs fermiers, fromage, tomates et fines herbes.', 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=900&q=80'],
    ['Salade d’avocat', 'Entrée', 7000, 'Avocat, crevettes, agrumes et vinaigrette passion.', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&q=80'],
    ['Soupe de poisson', 'Entrée', 8000, 'Bouillon iodé, piment doux et croûtons.', 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=900&q=80'],
    ['Poulet braisé attiéké', 'Plat', 12500, 'Poulet grillé, attiéké, piment et oignons.', 'https://images.unsplash.com/photo-1532550907401-a532c00947da?w=900&q=80'],
    ['Filet de capitaine', 'Plat', 16000, 'Poisson entier, légumes vapeur et beurre citronné.', 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=900&q=80'],
    ['Risotto aux champignons', 'Plat', 14000, 'Arborio crémeux, parmesan et thym.', 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=900&q=80'],
    ['Tarte chocolat', 'Dessert', 5500, 'Ganache noire et éclats de cacao.', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=900&q=80'],
    ['Ananas flambé', 'Dessert', 5000, 'Ananas rôti, vanille et glace vanille.', 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=900&q=80'],
    ['Jus bissap', 'Boisson', 2500, 'Hibiscus frais, menthe et gingembre.', 'https://images.unsplash.com/photo-1546173159-315724a31696?w=900&q=80'],
    ['Café MyHotel', 'Boisson', 2000, 'Espresso ou allongé, grains torréfiés sur place.', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900&q=80'],
    ['Cocktail Coco Sunset', 'Boisson', 6000, 'Coco, ananas, citron vert et sirop de canne.', 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=900&q=80'],
  ];
  for (const row of dishes) {
    await db.run('INSERT INTO menu_items (name, category, price, description, photo, available) VALUES (?, ?, ?, ?, ?, 1)', row);
  }

  const guests = [
    ['Claire Dubois', 'claire.dubois@mail.com', '+33 6 12 45 90', 'France', 'Cliente régulière, préfère étage élevé.'],
    ['Kwame Asante', 'kwame.asante@mail.com', '+233 24 111 222', 'Ghana', 'Voyage d’affaires, départ tôt.'],
    ['Nadia El Mansouri', 'nadia.em@mail.com', '+212 6 88 21 10', 'Maroc', 'Allergie gluten.'],
    ['Thomas Berger', 'thomas.berger@mail.com', '+41 79 330 12', 'Suisse', 'Demande parking.'],
    ['Aïcha Koné', 'aicha.kone@mail.com', '+225 07 19 44 20', 'Côte d’Ivoire', 'Anniversaire le 2e soir.'],
  ];
  for (const row of guests) {
    await db.run('INSERT INTO guests (full_name, email, phone, nationality, notes) VALUES (?, ?, ?, ?, ?)', row);
  }

  const reservations = [
    [1, 2, localDay(-2), localDay(0), 'en_cours', 180000],
    [2, 6, localDay(-3), localDay(0), 'en_cours', 500000],
    [3, 11, localDay(-1), localDay(3), 'confirmee', 288000],
    [4, 5, localDay(-10), localDay(-6), 'terminee', 288000],
    [5, 9, localDay(4), localDay(8), 'confirmee', 840000],
    [1, 4, localDay(-5), localDay(-3), 'terminee', 90000],
  ];
  for (const row of reservations) {
    await db.run(
      'INSERT INTO reservations (guest_id, room_id, check_in, check_out, status, total) VALUES (?, ?, ?, ?, ?, ?)',
      row,
    );
  }
  await db.run("UPDATE reservations SET check_in_time = '14:00', check_out_time = '08:00' WHERE room_id = 2 AND status = 'en_cours'");
  await db.run("UPDATE reservations SET check_in_time = '14:00', check_out_time = '09:30' WHERE room_id = 6 AND status = 'en_cours'");

  const services = [
    ['Spa & massage', 'Soin 60 minutes, huiles locales.', 25000, 'spa'],
    ['Navette aéroport', 'Aller-retour selon horaires de vol.', 18000, 'map'],
    ['Room service 24h', 'Plateau repas en chambre.', 4000, 'food-menu'],
    ['Blanchisserie', 'Pressing express 4 heures.', 6000, 'droplet'],
    ['Salle de sport', 'Accès illimité pendant le séjour.', 0, 'wind'],
    ['Wi-Fi premium', 'Bande passante dédiée.', 0, 'wifi'],
    ['Coffre réception', 'Dépôt de valeurs.', 0, 'lock-alt'],
    ['Petit-déjeuner buffet', 'Servi de 6h30 à 10h30.', 8500, 'coffee'],
  ];
  for (const row of services) {
    await db.run('INSERT INTO services (name, description, price, icon) VALUES (?, ?, ?, ?)', row);
  }

  const invoices = [
    ['Claire Dubois', 180000, 'en_attente', '2026-09-28', 'Séjour chambre 102'],
    ['Kwame Asante', 500000, 'payee', '2026-09-27', 'Suite 201'],
    ['Thomas Berger', 288000, 'payee', '2026-09-24', 'Chambre 106'],
    ['Aïcha Koné', 840000, 'en_attente', '2026-09-29', 'Suite présidentielle'],
    ['Nadia El Mansouri', 288000, 'en_retard', '2026-09-22', 'Réservation 303'],
  ];
  for (const row of invoices) {
    await db.run('INSERT INTO invoices (guest_name, amount, status, issued_at, label) VALUES (?, ?, ?, ?, ?)', row);
  }
}

async function seedStaffAccounts(db) {
  const password = hashPassword('password123');
  const accounts = [
    {
      fullName: 'Amina Koffi',
      email: 'receptioniste@gmail.com',
      role: 'receptionist',
      aliases: ['reception@myhotel.test', 'amina@myhotel.ci', 'receptioniste@gamil.ocm', 'receptioniste@gamil.com'],
    },
    {
      fullName: 'Jean-Marc Yao',
      email: 'gerant@gmail.com',
      role: 'manager',
      aliases: ['gerant@myhotel.test', 'jeanmarc@myhotel.ci'],
    },
    {
      fullName: 'Koffi Mensah',
      email: 'entretien@gmail.com',
      role: 'housekeeping',
      aliases: ['entretien@myhotel.test', 'koffi@myhotel.ci'],
    },
    {
      fullName: 'Fatou Diarra',
      email: 'gouvernante@gmail.com',
      role: 'housekeeping',
      aliases: ['fatou@myhotel.test', 'fatou@myhotel.ci'],
    },
    {
      fullName: 'Lucie Bamba',
      email: 'proprietaire@gmail.com',
      role: 'owner',
      aliases: ['proprio@myhotel.test', 'admin@myhotel.test', 'lucie@myhotel.ci'],
    },
  ];
  for (const account of accounts) {
    const placeholders = [account.email, ...account.aliases].map(() => '?').join(', ');
    const existing = await db.get(
      `SELECT id FROM users WHERE email IN (${placeholders}) OR (full_name = ? AND role = ?) LIMIT 1`,
      [account.email, ...account.aliases, account.fullName, account.role],
    );
    if (existing) {
      await db.run('UPDATE users SET email = ?, role = ?, full_name = ?, password_hash = ? WHERE id = ?', [
        account.email,
        account.role,
        account.fullName,
        password,
        existing.id,
      ]);
    } else {
      await db.run('INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
        account.fullName,
        account.email,
        password,
        account.role,
      ]);
    }
    await db.run('UPDATE staff SET email = ? WHERE full_name = ?', [account.email, account.fullName]);
  }
  await db.run("UPDATE staff SET email = REPLACE(email, '@myhotel.ci', '@gmail.com') WHERE email LIKE '%@myhotel.ci'");
  await db.run("UPDATE staff SET email = REPLACE(email, '@myhotel.test', '@gmail.com') WHERE email LIKE '%@myhotel.test'");
  await db.run("UPDATE users SET role = 'client' WHERE role IS NULL OR role = ''");
}

async function ensureRoomCatalog(db) {
  await db.run("UPDATE rooms SET type = 'De luxe' WHERE LOWER(type) IN ('deluxe', 'de luxe', 'luxe')");
  const photos = {
    eco: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80',
    standard: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80',
    luxe: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200&q=80',
    suite: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80',
    family: 'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?w=1200&q=80',
  };
  const extras = [
    ['104', 'Économique', 1, 'disponible', 28000, 1, photos.eco, 'Chambre économique, lit simple et salle d’eau, pour une nuit courte.'],
    ['107', 'Économique', 1, 'disponible', 28000, 1, photos.eco, 'Chambre économique calme, côté cour.'],
    ['108', 'Standard', 1, 'disponible', 45000, 2, photos.standard, 'Chambre standard avec bureau et climatisation.'],
    ['109', 'De luxe', 1, 'disponible', 72000, 2, photos.luxe, 'Chambre de luxe avec minibar et dressing.'],
    ['204', 'Économique', 2, 'disponible', 30000, 1, photos.eco, 'Chambre économique au deuxième étage.'],
    ['205', 'Standard', 2, 'disponible', 45000, 2, photos.standard, 'Chambre standard lumineuse, deux personnes.'],
    ['206', 'De luxe', 2, 'disponible', 78000, 2, photos.luxe, 'Chambre de luxe avec balcon intérieur.'],
    ['207', 'Familiale', 2, 'disponible', 98000, 4, photos.family, 'Chambre familiale, deux lits et coin enfants.'],
    ['208', 'Suite', 2, 'disponible', 135000, 3, photos.suite, 'Suite junior avec salon séparé.'],
    ['305', 'Économique', 3, 'disponible', 32000, 2, photos.eco, 'Chambre économique avec vue dégagée.'],
    ['306', 'De luxe', 3, 'disponible', 82000, 2, photos.luxe, 'Chambre de luxe, dernier étage.'],
    ['307', 'Familiale', 3, 'disponible', 110000, 5, photos.family, 'Chambre familiale spacieuse, jusqu’à cinq personnes.'],
    ['308', 'Suite', 3, 'disponible', 150000, 3, photos.suite, 'Suite avec salon, bureau et baignoire.'],
    ['401', 'Standard', 4, 'disponible', 48000, 2, photos.standard, 'Chambre standard au quatrième étage.'],
    ['402', 'De luxe', 4, 'disponible', 86000, 2, photos.luxe, 'Chambre de luxe avec grande baie vitrée.'],
    ['403', 'Familiale', 4, 'disponible', 115000, 4, photos.family, 'Chambre familiale avec deux espaces nuit.'],
    ['404', 'Suite', 4, 'disponible', 160000, 4, photos.suite, 'Suite familiale avec salon et chambre séparée.'],
  ];
  for (const row of extras) {
    const existing = await db.get('SELECT id FROM rooms WHERE number = ?', [row[0]]);
    if (existing) continue;
    await db.run(
      'INSERT INTO rooms (number, type, floor, status, price_night, capacity, photo, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      row,
    );
  }
  const catalog = await db.all('SELECT id, name FROM equipment');
  const byName = new Map(catalog.map((item) => [item.name, item.id]));
  const kits = {
    'Économique': ['Lit queen size', 'Wi-Fi haut débit', 'Douche à l’italienne'],
    Standard: ['Lit queen size', 'Télévision 55"', 'Wi-Fi haut débit', 'Climatisation', 'Douche à l’italienne'],
    'De luxe': ['Lit king size', 'Télévision 55"', 'Wi-Fi haut débit', 'Climatisation', 'Minibar', 'Douche à l’italienne'],
    Suite: ['Lit king size', 'Télévision 55"', 'Wi-Fi haut débit', 'Climatisation', 'Minibar', 'Baignoire', 'Coffre-fort'],
    Familiale: ['Lit king size', 'Canapé-lit', 'Télévision 55"', 'Wi-Fi haut débit', 'Climatisation', 'Douche à l’italienne'],
  };
  const added = await db.all('SELECT id, number, type FROM rooms');
  for (const room of added) {
    const names = kits[room.type];
    if (!names) continue;
    const linked = await db.get('SELECT room_id FROM room_equipment WHERE room_id = ? LIMIT 1', [room.id]);
    if (linked) continue;
    for (const name of names) {
      const equipmentId = byName.get(name);
      if (equipmentId) {
        await db.run('INSERT OR IGNORE INTO room_equipment (room_id, equipment_id) VALUES (?, ?)', [room.id, equipmentId]);
      }
    }
  }
}

async function openDatabase() {
  const cfg = mysqlSettings();
  const skipCreate = SERVERLESS || process.env.MYHOTEL_MYSQL_SKIP_CREATE === '1';
  if (!skipCreate) {
    try {
      const admin = await mysql.createConnection({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        ssl: cfg.ssl,
        dateStrings: true,
      });
      await admin.query(
        `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      await admin.end();
    } catch (error) {
      console.warn('MySQL CREATE DATABASE ignoré:', error instanceof Error ? error.message : error);
    }
  }

  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: cfg.ssl,
    waitForConnections: true,
    connectionLimit: SERVERLESS ? 2 : 12,
    dateStrings: true,
    charset: 'utf8mb4',
    connectTimeout: 15000,
    enableKeepAlive: true,
  });

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* hébergeur en lecture seule */
  }
  const db = createApi(pool);
  await ensureSchema(db);
  await ensurePmsSchema(db);
  await seedIfEmpty(db);
  await ensureRoomCatalog(db);
  await seedPms(db);
  await seedStaffAccounts(db);
  try {
    const { releaseExpiredStays } = require('./pms-routes');
    await releaseExpiredStays(db);
  } catch {
    /* ignore */
  }
  return db;
}

module.exports = { openDatabase, DATA_DIR };
