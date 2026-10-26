const SCHEMA_VERSION = 'mysql-2';

async function addColumn(db, table, column, def) {
  const row = await db.get(
    `SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (row) return;
  const exists = await db.get(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  if (!exists) return;
  await db.run(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${def}`);
}

async function widenColumn(db, table, column, def) {
  const row = await db.get(
    `SELECT DATA_TYPE AS t
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (!row) return;
  const type = String(row.t || '').toLowerCase();
  if (type === 'mediumtext' || type === 'longtext') return;
  if (type === 'text' || type === 'tinytext' || type === 'varchar' || type === 'blob') {
    await db.run(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${def}`);
  }
}

async function ensurePmsSchema(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);

  const tables = [
    `CREATE TABLE IF NOT EXISTS lost_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      room_number TEXT,
      item TEXT NOT NULL,
      kind TEXT NOT NULL,
      location TEXT,
      status TEXT NOT NULL,
      stored_at TEXT NOT NULL,
      returned_at TEXT,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_name TEXT NOT NULL,
      host_name TEXT,
      room_number TEXT,
      purpose TEXT,
      arrived_at TEXT NOT NULL,
      left_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS vip_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      room_number TEXT,
      service TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS room_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER,
      guest_name TEXT NOT NULL,
      from_room TEXT NOT NULL,
      to_room TEXT NOT NULL,
      reason TEXT,
      at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS folio_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER,
      guest_name TEXT NOT NULL,
      source TEXT NOT NULL,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      at TEXT NOT NULL,
      outlet TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL,
      inspector TEXT NOT NULL,
      at TEXT NOT NULL,
      result TEXT NOT NULL,
      notes TEXT,
      ready_for_control INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_to TEXT,
      at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS hk_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL,
      attendant TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      eta_minutes INTEGER NOT NULL,
      due_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS hk_crew (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      agent_name TEXT NOT NULL,
      user_id INTEGER,
      is_lead INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS hk_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL,
      task_id INTEGER,
      reporter TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ouverte',
      at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS equipment_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      room_number TEXT,
      direction TEXT NOT NULL,
      qty INTEGER NOT NULL,
      at TEXT NOT NULL,
      note TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS subcontractors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      service TEXT NOT NULL,
      equipment TEXT,
      status TEXT NOT NULL,
      invoice_amount REAL NOT NULL DEFAULT 0,
      invoice_status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT,
      title TEXT NOT NULL,
      nature TEXT NOT NULL,
      urgency TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_to TEXT,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      validated_by TEXT,
      preventive INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      stock REAL NOT NULL,
      min_stock REAL NOT NULL,
      cost REAL NOT NULL,
      price REAL NOT NULL,
      warehouse_id INTEGER NOT NULL,
      lot TEXT,
      expires_at TEXT,
      photo TEXT,
      kind TEXT NOT NULL DEFAULT 'vente'
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      ordered_at TEXT NOT NULL,
      total REAL NOT NULL,
      delivery_at TEXT,
      invoice_ref TEXT,
      paid INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS stock_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      warehouse TEXT NOT NULL,
      type TEXT NOT NULL,
      qty REAL NOT NULL,
      at TEXT NOT NULL,
      note TEXT,
      dest TEXT,
      actor TEXT,
      product_id INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS inventories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse TEXT NOT NULL,
      at TEXT NOT NULL,
      counted_by TEXT,
      variance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS outlets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      warehouse_id INTEGER NOT NULL,
      seats INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      outlet_id INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pos_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outlet TEXT NOT NULL,
      seller TEXT NOT NULL,
      guest_name TEXT,
      room_number TEXT,
      total REAL NOT NULL,
      at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pos_sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      qty REAL NOT NULL,
      price REAL NOT NULL,
      product_id INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      area_m2 REAL NOT NULL,
      rate REAL NOT NULL,
      status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS venue_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      status TEXT NOT NULL,
      amount REAL NOT NULL,
      paid REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'XAF'
    )`,
    `CREATE TABLE IF NOT EXISTS venue_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      at TEXT NOT NULL,
      method TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cash_registers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cash_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      register TEXT NOT NULL,
      cashier TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      opening_float REAL NOT NULL,
      closing_amount REAL,
      status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cash_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      reservation_id INTEGER,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cost_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      period TEXT NOT NULL,
      method TEXT NOT NULL,
      target TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS timesheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      present INTEGER NOT NULL,
      overtime_hours REAL NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS sanctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      at TEXT NOT NULL,
      note TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      amount REAL NOT NULL,
      at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS payslips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      gross REAL NOT NULL,
      overtime REAL NOT NULL,
      indemnities REAL NOT NULL,
      irpp REAL NOT NULL,
      cac REAL NOT NULL,
      cfc REAL NOT NULL,
      rav REAL NOT NULL,
      tdl REAL NOT NULL,
      pv REAL NOT NULL,
      cnps_employee REAL NOT NULL,
      cnps_employer REAL NOT NULL,
      advances REAL NOT NULL,
      net REAL NOT NULL,
      status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      category TEXT NOT NULL,
      value REAL NOT NULL,
      method TEXT NOT NULL,
      life_years INTEGER NOT NULL,
      assigned_to TEXT,
      status TEXT NOT NULL,
      acquired_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS asset_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      at TEXT NOT NULL,
      note TEXT,
      amount REAL
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      href TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS room_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS room_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS reservation_occupants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      document_id TEXT,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS client_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      room_number TEXT NOT NULL,
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL,
      code TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      role TEXT,
      message TEXT NOT NULL,
      reply TEXT,
      status TEXT NOT NULL DEFAULT 'ouverte',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS staff_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_name TEXT NOT NULL,
      sender_role TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a INTEGER NOT NULL,
      user_b INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attachment_url TEXT,
      attachment_name TEXT,
      attachment_mime TEXT,
      attachment_size INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS cash_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      actor TEXT NOT NULL,
      at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS staff_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_name TEXT NOT NULL,
      day TEXT NOT NULL,
      start_hour TEXT NOT NULL,
      end_hour TEXT NOT NULL,
      task TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS work_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      assignee TEXT NOT NULL,
      day TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'a_faire',
      notes TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS indemnity_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      amount REAL NOT NULL,
      at TEXT NOT NULL,
      note TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS company_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      legal_name TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      nif TEXT,
      rccm TEXT,
      slogan TEXT,
      logo MEDIUMTEXT,
      stamp MEDIUMTEXT
    )`,
  ];

  for (const sql of tables) await db.run(sql);

  const version = await db.get("SELECT value FROM app_meta WHERE key = 'schema_version'");
  const needsMigrate = !version || String(version.value) !== SCHEMA_VERSION;

  if (needsMigrate) {
  await addColumn(db, 'users', 'last_login', 'TEXT');
  await addColumn(db, 'users', 'photo', 'MEDIUMTEXT');
  await addColumn(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'client'");
  await addColumn(db, 'users', 'status', "TEXT NOT NULL DEFAULT 'actif'");

  await addColumn(db, 'guests', 'vip', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn(db, 'guests', 'document_id', 'TEXT');
  await addColumn(db, 'guests', 'loyalty_nights', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn(db, 'guests', 'first_name', 'TEXT');
  await addColumn(db, 'guests', 'last_name', 'TEXT');

  await addColumn(db, 'rooms', 'video', 'TEXT');
  await addColumn(db, 'hk_tasks', 'lead_name', 'TEXT');
  await addColumn(db, 'hk_tasks', 'started_at', 'TEXT');
  await addColumn(db, 'hk_tasks', 'finished_at', 'TEXT');
  await addColumn(db, 'hk_tasks', 'notes', 'TEXT');
  await addColumn(db, 'hk_tasks', 'created_at', 'TEXT');
  await addColumn(db, 'hk_issues', 'resolved_at', 'TEXT');
  await addColumn(db, 'hk_issues', 'resolved_by', 'TEXT');
  await addColumn(db, 'chat_messages', 'attachment_url', 'TEXT');
  await addColumn(db, 'chat_messages', 'attachment_name', 'TEXT');
  await addColumn(db, 'chat_messages', 'attachment_mime', 'TEXT');
  await addColumn(db, 'chat_messages', 'attachment_size', 'INTEGER');
  await addColumn(db, 'reservations', 'source', "TEXT NOT NULL DEFAULT 'reservation'");
  await addColumn(db, 'reservations', 'confirmed', 'INTEGER NOT NULL DEFAULT 1');
  await addColumn(db, 'reservations', 'notes', 'TEXT');
  await addColumn(db, 'reservations', 'deposit_amount', 'REAL NOT NULL DEFAULT 0');
  await addColumn(db, 'reservations', 'adults', 'INTEGER NOT NULL DEFAULT 1');
  await addColumn(db, 'reservations', 'children', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn(db, 'reservations', 'check_in_time', "TEXT NOT NULL DEFAULT '14:00'");
  await addColumn(db, 'reservations', 'check_out_time', "TEXT NOT NULL DEFAULT '12:00'");
  await addColumn(db, 'products', 'lot', 'TEXT');
  await addColumn(db, 'products', 'expires_at', 'TEXT');
  await addColumn(db, 'products', 'photo', 'TEXT');
  await addColumn(db, 'products', 'kind', "TEXT NOT NULL DEFAULT 'vente'");
  await addColumn(db, 'stock_moves', 'actor', 'TEXT');
  await addColumn(db, 'stock_moves', 'product_id', 'INTEGER');
  await addColumn(db, 'pos_sale_items', 'product_id', 'INTEGER');

  await addColumn(db, 'staff', 'contract_type', "TEXT DEFAULT 'CDI'");
  await addColumn(db, 'staff', 'salary_type', "TEXT DEFAULT 'Mensuel'");
  await addColumn(db, 'staff', 'salary_amount', 'REAL NOT NULL DEFAULT 0');
  await addColumn(db, 'staff', 'union_name', 'TEXT');
  await addColumn(db, 'staff', 'mutual_name', 'TEXT');
  await addColumn(db, 'staff', 'cnps_number', 'TEXT');
  await addColumn(db, 'staff', 'iban', 'TEXT');
  await addColumn(db, 'staff', 'departure_type', 'TEXT');
  await addColumn(db, 'staff', 'departure_at', 'TEXT');
  await addColumn(db, 'staff', 'id_number', 'TEXT');

  await addColumn(db, 'client_badges', 'reservation_id', 'INTEGER');
  await addColumn(db, 'client_badges', 'status', "TEXT NOT NULL DEFAULT 'actif'");
  await addColumn(db, 'client_badges', 'revoked_at', 'TEXT');
  await widenColumn(db, 'users', 'photo', 'MEDIUMTEXT');
  await widenColumn(db, 'company_profile', 'logo', 'MEDIUMTEXT');
  await widenColumn(db, 'company_profile', 'stamp', 'MEDIUMTEXT');
  await db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)", [SCHEMA_VERSION]);
  }
  await addColumn(db, 'reservations', 'check_in_time', "TEXT NOT NULL DEFAULT '14:00'");
  await addColumn(db, 'reservations', 'check_out_time', "TEXT NOT NULL DEFAULT '12:00'");
  if (!await db.get('SELECT id FROM company_profile WHERE id = 1')) {
    await db.run(
      `INSERT INTO company_profile (id, name, legal_name, address, city, country, phone, email, website, nif, rccm, slogan)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'MyHotel',
        'MyHotel SARL',
        'Boulevard de la République',
        'Douala',
        'Cameroun',
        '+237 6 00 00 00 00',
        'contact@myhotel.cm',
        'www.myhotel.cm',
        'M123456789000P',
        'RC/DLA/2024/B/1284',
        'L’élégance de votre séjour',
      ],
    );
  }
  await seedNotifications(db);
  await seedWorkspace(db);
}

async function seedNotifications(db) {
  if (Number((await db.get('SELECT COUNT(*) AS n FROM notifications')).n) > 0) return;

  const users = await db.all('SELECT full_name, email, created_at FROM users ORDER BY id DESC LIMIT 4');
  for (const user of users) {
    await db.run(
      `INSERT INTO notifications (category, title, body, href, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'COMPTE',
        'Nouvel inscrit',
        `${user.full_name} (${user.email}) vient de créer un compte.`,
        null,
        0,
        user.created_at,
      ],
    );
  }

  const extras = [
    ['RÉSERVATION', 'Nouvelle réservation', 'Chambre 102 — Claire Dubois, arrivée demain.', 0, "datetime('now', '-2 hours')"],
    ['ÉTAGES', 'Chambre prête', 'Chambre 201 nettoyée et inspectée.', 1, "datetime('now', '-1 day')"],
    ['MAINTENANCE', 'Ticket ouvert', 'Climatisation 303 — intervention demandée.', 0, "datetime('now', '-2 days')"],
    ['RÉSERVATION', 'Check-in du jour', 'Kwame Asante — chambre 201.', 1, "datetime('now', '-4 days')"],
  ];
  for (const [category, title, body, isRead, at] of extras) {
    await db.run(
      `INSERT INTO notifications (category, title, body, href, is_read, created_at)
       VALUES (?, ?, ?, NULL, ?, ${at})`,
      [category, title, body, isRead],
    );
  }
}

async function seedWorkspace(db) {
  if (Number((await db.get('SELECT COUNT(*) AS n FROM room_photos')).n) === 0) {
    const extras = [
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200&q=80',
    ];
    for (const room of await db.all('SELECT id, photo FROM rooms')) {
      await db.run('INSERT INTO room_photos (room_id, url, sort) VALUES (?,?,?)', [room.id, room.photo, 0]);
      for (let i = 0; i < extras.length; i += 1) {
        await db.run('INSERT INTO room_photos (room_id, url, sort) VALUES (?,?,?)', [room.id, extras[i], i + 1]);
      }
    }
  }
  if (Number((await db.get('SELECT COUNT(*) AS n FROM suggestions')).n) === 0) {
    await db.run(
      `INSERT INTO suggestions (author, role, message, status, created_at)
       VALUES ('Amina Koffi', 'receptionist', 'Proposer un late check-out payant le dimanche.', 'ouverte', datetime('now', '-3 hours'))`,
    );
    await db.run(
      `INSERT INTO suggestions (author, role, message, status, created_at)
       VALUES ('Koffi Mensah', 'housekeeping', 'Manque de kits d’accueil à l’étage 3.', 'ouverte', datetime('now', '-1 day'))`,
    );
  }
  if (Number((await db.get('SELECT COUNT(*) AS n FROM cash_moves')).n) === 0) {
    await db.run(
      `INSERT INTO cash_moves (kind, label, amount, actor, at)
       VALUES ('entree', 'Encaissement réservations', 180000, 'Jean-Marc Yao', datetime('now', '-2 hours'))`,
    );
    await db.run(
      `INSERT INTO cash_moves (kind, label, amount, actor, at)
       VALUES ('sortie', 'Achat fournitures étages', 25000, 'Jean-Marc Yao', datetime('now', '-5 hours'))`,
    );
  }
  if (Number((await db.get('SELECT COUNT(*) AS n FROM staff_shifts')).n) === 0) {
    const today = new Date().toISOString().slice(0, 10);
    await db.run('INSERT INTO staff_shifts (staff_name, day, start_hour, end_hour, task) VALUES (?,?,?,?,?)', [
      'Amina Koffi',
      today,
      '07:00',
      '15:00',
      'Réception matin',
    ]);
    await db.run('INSERT INTO staff_shifts (staff_name, day, start_hour, end_hour, task) VALUES (?,?,?,?,?)', [
      'Koffi Mensah',
      today,
      '08:00',
      '16:00',
      'Étages 2 et 3',
    ]);
    await db.run(
      "INSERT INTO work_tasks (title, assignee, day, status, notes, created_at) VALUES ('Contrôle linge étage 2', 'Koffi Mensah', ?, 'en_cours', 'Chariots et draps', datetime('now'))",
      [today],
    );
    await db.run(
      "INSERT INTO work_tasks (title, assignee, day, status, notes, created_at) VALUES ('Clôture caisse accueil', 'Amina Koffi', ?, 'a_faire', 'Remise au gérant', datetime('now'))",
      [today],
    );
  }
  if (Number((await db.get('SELECT COUNT(*) AS n FROM client_badges')).n) === 0) {
    await db.run(
      `INSERT INTO client_badges (guest_name, room_number, valid_from, valid_to, code, created_by)
       VALUES ('Claire Dubois', '102', date('now'), date('now','+3 day'), 'MH-102-CL', 'Amina Koffi')`,
    );
  }
  const video =
    'https://videos.pexels.com/video-files/3770033/3770033-hd_1920_1080_25fps.mp4';
  await db.run('UPDATE rooms SET video = ? WHERE video IS NULL OR video = \'\'', [video]);
  for (const row of await db.all('SELECT id FROM staff WHERE id_number IS NULL OR id_number = \'\'')) {
    await db.run('UPDATE staff SET id_number = ? WHERE id = ?', [`CNI-00${1000 + row.id}`, row.id]);
  }
  if (Number((await db.get('SELECT COUNT(*) AS n FROM indemnity_lines')).n) === 0) {
    const people = await db.all('SELECT id FROM staff ORDER BY id LIMIT 3');
    const kinds = [
      ['licenciement', 180000, 'Indemnité de licenciement'],
      ['conges', 45000, 'Indemnité de congés'],
      ['preavis', 90000, 'Indemnité de préavis'],
    ];
    for (let i = 0; i < people.length; i += 1) {
      const row = kinds[i];
      if (!row) continue;
      await db.run('INSERT INTO indemnity_lines (staff_id, kind, amount, at, note) VALUES (?,?,?,?,?)', [
        people[i].id,
        row[0],
        row[1],
        new Date().toISOString().slice(0, 10),
        row[2],
      ]);
    }
  }
  if (!await db.get("SELECT id FROM notifications WHERE category = 'URGENCE' LIMIT 1")) {
    await db.run(
      `INSERT INTO notifications (category, title, body, href, is_read, created_at)
       VALUES ('ÉTAGES', 'Chambre libre à nettoyer', 'Chambre 106 libérée — passage entretien.', '/housekeeping', 0, datetime('now', '-40 minutes'))`,
    );
    await db.run(
      `INSERT INTO notifications (category, title, body, href, is_read, created_at)
       VALUES ('URGENCE', 'Nettoyage urgent', 'Chambre 303 indisponible — intervention immédiate.', '/housekeeping', 0, datetime('now', '-12 minutes'))`,
    );
  }

  try {
    await db.run(
      `DELETE FROM hk_tasks WHERE status NOT IN ('pret','termine','controle')
       AND id NOT IN (
         SELECT id FROM (
           SELECT MAX(id) AS id FROM hk_tasks WHERE status NOT IN ('pret','termine','controle') GROUP BY room_number
         )
       )`,
    );
  } catch {
    /* ignore */
  }

  try {
    if (Number((await db.get('SELECT COUNT(*) AS n FROM hk_crew')).n) === 0) {
      const open = await db.get("SELECT id FROM hk_tasks WHERE room_number = '202' ORDER BY id DESC LIMIT 1");
      if (open) {
        await db.run('INSERT INTO hk_crew (task_id, agent_name, is_lead) VALUES (?,?,1)', [open.id, 'Koffi Mensah']);
        await db.run('INSERT INTO hk_crew (task_id, agent_name, is_lead) VALUES (?,?,0)', [open.id, 'Fatou Diarra']);
        await db.run("UPDATE hk_tasks SET lead_name = 'Koffi Mensah', started_at = datetime('now','-40 minutes') WHERE id = ?", [
          open.id,
        ]);
      }
    }
    if (Number((await db.get('SELECT COUNT(*) AS n FROM hk_issues')).n) === 0) {
      await db.run(
        `INSERT INTO hk_issues (room_number, task_id, reporter, category, description, status, at)
         VALUES ('202', (SELECT id FROM hk_tasks WHERE room_number = '202' ORDER BY id DESC LIMIT 1), 'Koffi Mensah', 'Consommables', 'Plus de savon ni de gel douche.', 'ouverte', datetime('now','-30 minutes'))`,
      );
      await db.run(
        `INSERT INTO hk_issues (room_number, task_id, reporter, category, description, status, at)
         VALUES ('202', (SELECT id FROM hk_tasks WHERE room_number = '202' ORDER BY id DESC LIMIT 1), 'Koffi Mensah', 'Électricité', 'La lampe du salon ne s’allume plus.', 'ouverte', datetime('now','-25 minutes'))`,
      );
      await db.run(
        `INSERT INTO hk_issues (room_number, reporter, category, description, status, at)
         VALUES ('303', 'Fatou Diarra', 'Électricité', 'Ampoule salle de bain HS.', 'ouverte', datetime('now','-12 minutes'))`,
      );
    }
  } catch {
    /* tables may not exist yet on first migrate */
  }

  try {
    if (!await db.get("SELECT value FROM app_meta WHERE key = 'demo_hk_checkouts'")) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await db.run(
        `UPDATE reservations SET check_out = ?, check_out_time = '08:00'
         WHERE status IN ('en_cours','confirmee')
           AND room_id = (SELECT id FROM rooms WHERE number = '102' LIMIT 1)`,
        [today],
      );
      await db.run(
        `UPDATE reservations SET check_out = ?, check_out_time = '09:30'
         WHERE status IN ('en_cours','confirmee')
           AND room_id = (SELECT id FROM rooms WHERE number = '201' LIMIT 1)`,
        [today],
      );
      await db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('demo_hk_checkouts', '1')");
    }
  } catch {
    /* ignore */
  }

  await ensureHotelProducts(db);
}

async function ensureHotelProducts(db) {
  try {
    await db.run("DELETE FROM products WHERE name IN ('Riz parfumé 25kg','Huile 5L','Poulet entier','Filet de capitaine','Cocktail Coco','Pagne souvenir')");
    const warehouse = await db.get('SELECT id FROM warehouses ORDER BY id LIMIT 1');
    const wid = warehouse ? warehouse.id : 1;
    const catalog = [
      ['Préservatifs', 'vente', 'boîte', 4, 10, 400, 1500, 'LOT-PRE'],
      ['Eau minérale 50cl', 'vente', 'u', 48, 20, 200, 500, 'LOT-EAU'],
      ['Eau minérale 1.5L', 'vente', 'u', 30, 12, 350, 800, 'LOT-E15'],
      ['Coca-Cola 33cl', 'vente', 'u', 36, 12, 400, 1000, 'LOT-COC'],
      ['Jus d’orange 33cl', 'vente', 'u', 20, 8, 450, 1200, 'LOT-JUS'],
      ['Bière 33cl', 'vente', 'u', 24, 10, 500, 1500, 'LOT-BIE'],
      ['Savon de toilette', 'vente', 'u', 18, 8, 300, 800, 'LOT-SAV'],
      ['Brosse à dents', 'vente', 'u', 15, 6, 200, 700, 'LOT-BRO'],
      ['Dentifrice', 'vente', 'u', 12, 5, 400, 1000, 'LOT-DEN'],
      ['Rasoir jetable', 'vente', 'u', 16, 6, 150, 500, 'LOT-RAS'],
      ['Peigne', 'vente', 'u', 10, 4, 200, 600, 'LOT-PEI'],
      ['Chips', 'vente', 'u', 14, 6, 400, 1000, 'LOT-CHI'],
      ['Carte postale', 'vente', 'u', 40, 10, 100, 500, 'LOT-CAR'],
      ['Draps lit double', 'interne', 'u', 0, 6, 8000, 0, 'LOT-DRA'],
      ['Draps lit simple', 'interne', 'u', 8, 4, 5500, 0, 'LOT-DRS'],
      ['Taies d’oreiller', 'interne', 'u', 12, 8, 1500, 0, 'LOT-TAI'],
      ['Serviettes de bain', 'interne', 'u', 2, 10, 2500, 0, 'LOT-SER'],
      ['Gants de toilette', 'interne', 'u', 20, 8, 400, 0, 'LOT-GAN'],
      ['Savon d’accueil', 'interne', 'u', 5, 15, 250, 0, 'LOT-ETA'],
      ['Papier toilette', 'interne', 'rouleau', 30, 20, 200, 0, 'LOT-PAP'],
      ['Javel 5L', 'interne', 'bidon', 4, 3, 1800, 0, 'LOT-JAV'],
      ['Sacs poubelle', 'interne', 'paquet', 6, 4, 1200, 0, 'LOT-POU'],
      ['Ampoules', 'interne', 'u', 0, 8, 600, 0, 'LOT-AMP'],
    ];
    for (const row of catalog) {
      const existing = await db.get('SELECT id FROM products WHERE name = ?', [row[0]]);
      if (existing) {
        await db.run('UPDATE products SET kind=?, unit=? WHERE id=?', [row[1], row[2], existing.id]);
        continue;
      }
      await db.run(
        'INSERT INTO products (name, category, unit, stock, min_stock, cost, price, warehouse_id, lot, kind) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [row[0], row[1] === 'vente' ? 'Accueil' : 'Magasin', row[2], row[3], row[4], row[5], row[6], wid, row[7], row[1]],
      );
    }
  } catch {
    /* products table may be missing on first migrate */
  }
}

module.exports = { ensurePmsSchema };
