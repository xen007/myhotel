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
  await db.run(
    `CREATE TABLE IF NOT EXISTS room_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
  );
  const defaultCategories = ['Économique', 'Standard', 'De luxe', 'Suite', 'Familiale', 'Présidentielle'];
  for (let index = 0; index < defaultCategories.length; index += 1) {
    const name = defaultCategories[index];
    if (!(await db.get('SELECT id FROM room_categories WHERE name = ?', [name]))) {
      await db.run('INSERT INTO room_categories (name, sort_order) VALUES (?, ?)', [name, index + 1]);
    }
  }
  await addColumn(db, 'rooms', 'maintenance_level', 'TEXT');
  await addColumn(db, 'rooms', 'maintenance_note', 'TEXT');
  await addColumn(db, 'rooms', 'maintenance_at', 'TEXT');
  await addColumn(db, 'rooms', 'maintenance_by', 'TEXT');
  await addColumn(db, 'rooms', 'maintenance_by_email', 'TEXT');
  await addColumn(db, 'rooms', 'deleted_at', 'TEXT');
  await addColumn(db, 'rooms', 'deleted_by_email', 'TEXT');
  await addColumn(db, 'products', 'deleted_at', 'TEXT');
  await addColumn(db, 'products', 'deleted_by_email', 'TEXT');
  await addColumn(db, 'reservations', 'list_total', 'REAL');
  await addColumn(db, 'reservations', 'discount_amount', 'REAL NOT NULL DEFAULT 0');
  await addColumn(db, 'reservations', 'discount_reason', 'TEXT');
  await addColumn(db, 'reservations', 'discount_email', 'TEXT');
  await addColumn(db, 'reservations', 'maintenance_level', 'TEXT');
  await addColumn(db, 'reservations', 'maintenance_id', 'INTEGER');
  await addColumn(db, 'stock_moves', 'unit_cost', 'REAL');
  await addColumn(db, 'stock_moves', 'actor_email', 'TEXT');
  await addColumn(db, 'stock_moves', 'taken_by', 'TEXT');
  await addColumn(db, 'stock_moves', 'cancelled_at', 'TEXT');
  await addColumn(db, 'pos_sales', 'on_account', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn(db, 'pos_sales', 'settled_at', 'TEXT');
  await addColumn(db, 'folio_charges', 'sale_id', 'INTEGER');
  await addColumn(db, 'folio_charges', 'settled_at', 'TEXT');
  await addColumn(db, 'warehouses', 'active', 'INTEGER NOT NULL DEFAULT 1');
  await db.run(
    `CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`,
  );
  const knownCategories = await db.all('SELECT name FROM product_categories');
  const knownNames = new Set(knownCategories.map((row) => String(row.name || '').trim().toLowerCase()));
  const productCategories = await db.all("SELECT DISTINCT category AS name FROM products WHERE IFNULL(category, '') <> ''");
  for (const row of productCategories) {
    const name = String(row.name || '').trim();
    if (!name || knownNames.has(name.toLowerCase())) continue;
    await db.run('INSERT INTO product_categories (name, active) VALUES (?, 1)', [name]);
    knownNames.add(name.toLowerCase());
  }
  await addColumn(db, 'menu_items', 'stock', 'INTEGER NOT NULL DEFAULT 20');
  await addColumn(db, 'menu_items', 'min_stock', 'INTEGER NOT NULL DEFAULT 5');
  await addColumn(db, 'menu_items', 'of_day', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn(db, 'menu_items', 'day_date', 'TEXT');
  await addColumn(db, 'restaurant_orders', 'guest_phone', 'TEXT');
  await widenColumn(db, 'menu_items', 'photo', 'MEDIUMTEXT');
  await db.run(
    `CREATE TABLE IF NOT EXISTS restaurant_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'matiere',
      unit TEXT NOT NULL DEFAULT 'pièce',
      stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      photo MEDIUMTEXT,
      deleted_at TEXT
    )`,
  );
  await db.run(
    `CREATE TABLE IF NOT EXISTS restaurant_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      good_id INTEGER NOT NULL,
      good_name TEXT NOT NULL,
      qty REAL NOT NULL,
      direction TEXT NOT NULL,
      taken_by TEXT,
      note TEXT,
      at TEXT NOT NULL,
      actor_email TEXT
    )`,
  );
  const goodsCount = await db.get('SELECT COUNT(*) AS n FROM restaurant_goods');
  if (!Number(goodsCount && goodsCount.n)) {
    const seedGoods = [
      ['Riz', 'matiere', 'kg', 25, 5, 800],
      ['Huile', 'matiere', 'L', 12, 3, 1500],
      ['Poulet', 'matiere', 'kg', 18, 4, 2500],
      ['Hibiscus', 'matiere', 'kg', 6, 1, 2000],
    ];
    for (const row of seedGoods) {
      await db.run('INSERT INTO restaurant_goods (name, kind, unit, stock, min_stock, cost, price) VALUES (?,?,?,?,?,?,0)', row);
    }
  }
  await db.run(
    `CREATE TABLE IF NOT EXISTS restaurant_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      room_number TEXT,
      reservation_id INTEGER,
      mode TEXT NOT NULL,
      pay TEXT NOT NULL,
      status TEXT NOT NULL,
      total REAL NOT NULL,
      at TEXT NOT NULL,
      user_email TEXT
    )`,
  );
  await db.run(
    `CREATE TABLE IF NOT EXISTS restaurant_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      qty REAL NOT NULL,
      price REAL NOT NULL
    )`,
  );
  await db.run("UPDATE menu_items SET category = 'Jus' WHERE name = 'Jus bissap' AND category = 'Boisson'");
  await db.run("UPDATE menu_items SET category = 'Chaud' WHERE name = 'Café MyHotel' AND category = 'Boisson'");
  await db.run("UPDATE menu_items SET category = 'Alcool' WHERE name = 'Cocktail Coco Sunset' AND category = 'Boisson'");
  const catalog = [
    ['Alloco', 'Entrée', 3000, 'Bananes plantains frites, piment et oignons.'],
    ['Salade d’attiéké', 'Entrée', 4500, 'Attiéké, tomates, oignons et thon.'],
    ['Pastels', 'Entrée', 3500, 'Beignets farcis au poisson et au piment.'],
    ['Brochettes de bœuf', 'Entrée', 5000, 'Bœuf mariné, oignons et piment.'],
    ['Thiéboudienne', 'Plat', 9000, 'Riz au poisson, légumes et sauce tomate.'],
    ['Yassa poulet', 'Plat', 8500, 'Poulet citronné, oignons confits et riz.'],
    ['Mafé', 'Plat', 8000, 'Viande mijotée à la pâte d’arachide.'],
    ['Kédjénou', 'Plat', 11000, 'Poulet et légumes cuits à l’étouffée.'],
    ['Garba', 'Plat', 4000, 'Attiéké, thon frit et piment frais.'],
    ['Placali sauce graine', 'Plat', 7000, 'Pâte de manioc et sauce palmiste.'],
    ['Poisson braisé', 'Plat', 10000, 'Tilapia braisé, attiéké et crudités.'],
    ['Sauce gombo', 'Plat', 7500, 'Gombo, viande et riz blanc.'],
    ['Riz gras', 'Plat', 6500, 'Riz à la tomate, légumes et viande.'],
    ['Foufou sauce arachide', 'Plat', 7000, 'Igname pilée et sauce arachide.'],
    ['Dèguè', 'Dessert', 2500, 'Couscous de mil, lait caillé et vanille.'],
    ['Thiakry', 'Dessert', 2500, 'Mil sucré, lait et muscade.'],
    ['Beignets de banane', 'Dessert', 2000, 'Bananes mûres dorées et sucre.'],
    ['Bouillie de mil', 'Petit-déjeuner', 2000, 'Mil, lait et sucre.'],
    ['Galette d’arachide', 'Petit-déjeuner', 1500, 'Arachides grillées et miel.'],
    ['Eau minérale', 'Eau', 1000, 'Bouteille 50 cl, servie fraîche.'],
    ['Eau gazeuse', 'Eau', 1500, 'Bouteille 33 cl.'],
    ['Jus d’ananas', 'Jus', 2500, 'Ananas pressé, sans sucre ajouté.'],
    ['Jus de mangue', 'Jus', 2500, 'Mangue mûre mixée et fraîche.'],
    ['Jus de gingembre', 'Jus', 2000, 'Gingembre, citron et menthe.'],
    ['Jus de bouye', 'Jus', 2500, 'Pain de singe, lait et vanille.'],
    ['Orange pressée', 'Jus', 2500, 'Oranges pressées à la minute.'],
    ['Flag', 'Bière', 2000, 'Bière blonde locale, 65 cl.'],
    ['Castel', 'Bière', 2000, 'Bière blonde, 65 cl.'],
    ['Beaufort', 'Bière', 2000, 'Bière blonde, 65 cl.'],
    ['Guinness', 'Bière', 2500, 'Bière brune, 33 cl.'],
    ['Heineken', 'Bière', 2500, 'Bière blonde, 33 cl.'],
    ['Desperados', 'Bière', 3000, 'Bière aromatisée, 33 cl.'],
    ['Vin de palme', 'Alcool', 2000, 'Servi très frais, verre.'],
    ['Punch coco', 'Alcool', 5000, 'Coco, rhum et ananas.'],
    ['Vin rouge', 'Alcool', 6000, 'Verre de la cave.'],
    ['Vin blanc', 'Alcool', 6000, 'Verre, servi frais.'],
    ['Thé à la menthe', 'Chaud', 1500, 'Thé vert et menthe fraîche.'],
    ['Café Touba', 'Chaud', 1500, 'Café épicé, poivre de Guinée.'],
    ['Chocolat chaud', 'Chaud', 2000, 'Cacao, lait et sucre.'],
  ];
  for (const row of catalog) {
    const existing = await db.get('SELECT id FROM menu_items WHERE name = ?', [row[0]]);
    if (existing) continue;
    await db.run(
      'INSERT INTO menu_items (name, category, price, description, available, of_day, stock, min_stock) VALUES (?,?,?,?,1,0,24,4)',
      row,
    );
  }
  await db.run(
    `UPDATE menu_items SET of_day = 1, day_date = DATE_FORMAT(NOW(), '%Y-%m-%d')
     WHERE IFNULL(of_day, 0) = 0 AND IFNULL(day_date, '') = ''
       AND name IN (
         'Poulet braisé attiéké', 'Filet de capitaine', 'Salade d’avocat', 'Jus bissap',
         'Alloco', 'Thiéboudienne', 'Yassa poulet', 'Mafé', 'Dèguè',
         'Flag', 'Castel', 'Guinness', 'Jus de gingembre', 'Eau minérale', 'Café Touba'
       )`,
  );
  const sampleOrders = [
    ['Table terrasse', null, 'salle', 'especes', 'commandee', 35, [['Garba', 1, 4000], ['Castel', 2, 2000], ['Alloco', 1, 3000]]],
    ['Mariam Touré', '106', 'chambre', 'note', 'preparation', 18, [['Mafé', 1, 8000], ['Dèguè', 1, 2500], ['Eau minérale', 2, 1000]]],
    ['Kouamé Serge', '301', 'chambre', 'note', 'servie', 50, [['Thiéboudienne', 2, 9000], ['Guinness', 2, 2500]]],
    ['Salon jardin', null, 'salle', 'especes', 'commandee', 12, [['Yassa poulet', 1, 8500], ['Flag', 2, 2000], ['Jus de gingembre', 1, 2000]]],
    ['Famille Bamba', '203', 'chambre', 'note', 'commandee', 8, [['Poisson braisé', 1, 10000], ['Heineken', 2, 2500], ['Beignets de banane', 2, 2000]]],
  ];
  for (const sample of sampleOrders) {
    const found = await db.get('SELECT id FROM restaurant_orders WHERE guest_name = ?', [sample[0]]);
    if (found) continue;
    const items = sample[6];
    const total = items.reduce((sum, line) => sum + line[1] * line[2], 0);
    await db.run(
      `INSERT INTO restaurant_orders (guest_name, room_number, mode, pay, status, total, at, user_email)
       VALUES (?,?,?,?,?,?, DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ? MINUTE), '%Y-%m-%d %H:%i'), 'restaurant@gmail.com')`,
      [sample[0], sample[1], sample[2], sample[3], sample[4], total, sample[5]],
    );
    const orderId = await db.lastId();
    for (const line of items) {
      await db.run('INSERT INTO restaurant_order_items (order_id, name, qty, price) VALUES (?,?,?,?)', [orderId, line[0], line[1], line[2]]);
    }
  }
  await db.run(
    `CREATE TABLE IF NOT EXISTS room_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      room_number TEXT NOT NULL,
      level TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ouverte',
      started_at TEXT NOT NULL,
      closed_at TEXT,
      opened_by TEXT,
      opened_by_email TEXT,
      opened_role TEXT,
      closed_by TEXT,
      closed_by_email TEXT,
      conflict_note TEXT
    )`,
  );
  await db.run(
    `CREATE TABLE IF NOT EXISTS stay_discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL,
      room_id INTEGER,
      room_number TEXT,
      list_price REAL NOT NULL,
      discount_amount REAL NOT NULL,
      final_price REAL NOT NULL,
      reason TEXT,
      maintenance_id INTEGER,
      maintenance_level TEXT,
      actor_id INTEGER,
      actor_name TEXT,
      actor_email TEXT NOT NULL,
      actor_role TEXT,
      at TEXT NOT NULL
    )`,
  );
  await db.run(
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      user_id INTEGER,
      email TEXT NOT NULL,
      role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT,
      before_json MEDIUMTEXT,
      after_json MEDIUMTEXT,
      reason TEXT,
      ref_type TEXT,
      ref_id TEXT,
      result TEXT NOT NULL DEFAULT 'ok',
      prev_hash TEXT,
      row_hash TEXT
    )`,
  );
  await db.run(
    `CREATE TABLE IF NOT EXISTS trash_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      label TEXT NOT NULL,
      payload MEDIUMTEXT,
      deleted_at TEXT NOT NULL,
      deleted_by TEXT,
      deleted_by_email TEXT NOT NULL,
      deleted_role TEXT,
      restored_at TEXT,
      restored_by_email TEXT,
      purged_at TEXT,
      purged_by_email TEXT
    )`,
  );
  await db.run(
    `UPDATE rooms SET maintenance_level = 'grave'
     WHERE status = 'maintenance' AND (maintenance_level IS NULL OR maintenance_level = '')`,
  );
  for (const row of await db.all('SELECT DISTINCT type AS name FROM rooms WHERE type IS NOT NULL AND type != \'\'')) {
    if (!(await db.get('SELECT id FROM room_categories WHERE name = ?', [row.name]))) {
      await db.run('INSERT INTO room_categories (name, sort_order) VALUES (?, ?)', [row.name, 50]);
    }
  }
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
