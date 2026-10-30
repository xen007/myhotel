function stampNow() {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function rolesForNotice(category, title = '') {
  const key = String(category || '').toUpperCase();
  const label = String(title || '').toLowerCase();
  if (key.includes('SÉJOUR') || key.includes('SEJOUR')) return ['client'];
  if (key.includes('COMPTE')) return ['owner', 'manager'];
  if (key.includes('RÉSA') || key.includes('RESA')) return ['receptionist', 'manager', 'owner'];
  if (key.includes('RÉCEPT') || key.includes('RECEPT')) return ['receptionist'];
  if (key.includes('COMMANDE') || key.includes('RESTO')) return ['restaurant'];
  if (key.includes('STOCK')) return ['restaurant'];
  if (key.includes('MAINT')) return ['manager', 'owner'];
  if (key.includes('SIGNAL')) return ['housekeeping', 'manager', 'owner'];
  if (key.includes('URGEN')) return ['housekeeping'];
  if (key.includes('ÉTAGE') || key.includes('ETAGE')) {
    if (label.includes('prête') || label.includes('prete')) return ['receptionist', 'manager'];
    return ['housekeeping'];
  }
  return ['manager', 'owner'];
}

function noticeVisibleTo(row, user) {
  if (row.user_id && Number(row.user_id) !== Number(user.id)) return false;
  if (row.user_id && Number(row.user_id) === Number(user.id)) return true;
  const audience = String(row.roles || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = audience.length ? audience : rolesForNotice(row.category, row.title);
  return allowed.includes(String(user.role || ''));
}

async function pushNotice(db, { category, title, body, href, roles, at, userId }) {
  const audience = (Array.isArray(roles) && roles.length ? roles : rolesForNotice(category, title)).join(',');
  const text = String(body || '');
  const recent = await db.all('SELECT id, category, body, user_id FROM notifications ORDER BY id DESC LIMIT 40');
  const duplicate = recent.some(
    (row) =>
      String(row.category) === String(category) &&
      String(row.body || '').trim().toLowerCase() === text.trim().toLowerCase() &&
      Number(row.user_id || 0) === Number(userId || 0),
  );
  if (duplicate) return;
  await db.run(
    `INSERT INTO notifications (category, title, body, href, roles, user_id, is_read, created_at)
     VALUES (?,?,?,?,?,?,0,?)`,
    [category, title, text, href || null, audience, userId || null, at || stampNow()],
  );
}

async function listNotices(db, user) {
  const rows = await db.all('SELECT * FROM notifications ORDER BY id DESC LIMIT 200');
  const visible = rows.filter((row) => noticeVisibleTo(row, user)).slice(0, 40);
  let reads = [];
  try {
    reads = await db.all('SELECT notification_id FROM notification_reads WHERE user_id = ?', [user.id]);
  } catch {
    reads = [];
  }
  const readSet = new Set(reads.map((row) => Number(row.notification_id)));
  const items = visible.map((row) => ({
    id: Number(row.id),
    category: row.category,
    title: row.title,
    body: row.body,
    href: row.href,
    created_at: row.created_at,
    is_read: readSet.has(Number(row.id)),
  }));
  return { items, unread: items.filter((item) => !item.is_read).length };
}

async function markNoticeRead(db, user, { id, all }) {
  const { items } = await listNotices(db, user);
  const targets = all ? items.filter((item) => !item.is_read).map((item) => item.id) : [Number(id || 0)].filter(Boolean);
  for (const noticeId of targets) {
    const exists = await db.get(
      'SELECT notification_id FROM notification_reads WHERE notification_id = ? AND user_id = ?',
      [noticeId, user.id],
    );
    if (!exists) {
      await db.run(
        'INSERT INTO notification_reads (notification_id, user_id, read_at) VALUES (?,?,?)',
        [noticeId, user.id, stampNow()],
      );
    }
  }
  return listNotices(db, user);
}

async function notifyMenuLow(db, dishId) {
  const dish = await db.get('SELECT id, name, stock, min_stock FROM menu_items WHERE id = ?', [dishId]);
  if (!dish) return;
  if (Number(dish.stock) > Number(dish.min_stock || 0)) return;
  await pushNotice(db, {
    category: 'STOCK',
    title: Number(dish.stock) <= 0 ? 'Rupture de stock' : 'Stock bas',
    body: `${dish.name} : ${Number(dish.stock)} restant(s) (seuil ${Number(dish.min_stock || 0)}).`,
    href: '/kitchen',
    roles: ['restaurant'],
  });
}

async function notifyGoodLow(db, goodId) {
  const good = await db.get("SELECT id, name, stock, min_stock FROM restaurant_goods WHERE id = ? AND IFNULL(deleted_at, '') = ''", [goodId]);
  if (!good) return;
  if (Number(good.stock) > Number(good.min_stock || 0)) return;
  await pushNotice(db, {
    category: 'STOCK',
    title: Number(good.stock) <= 0 ? 'Rupture de stock' : 'Stock bas',
    body: `${good.name} : ${Number(good.stock)} restant(s) (seuil ${Number(good.min_stock || 0)}).`,
    href: '/kitchen',
    roles: ['restaurant'],
  });
}

module.exports = {
  rolesForNotice,
  pushNotice,
  listNotices,
  markNoticeRead,
  notifyMenuLow,
  notifyGoodLow,
};
