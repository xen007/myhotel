const crypto = require('crypto');

function actorIdentity(actor) {
  return {
    userId: actor && actor.id ? Number(actor.id) : null,
    email: String((actor && actor.email) || '').trim().toLowerCase(),
    role: String((actor && actor.role) || ''),
    name: String((actor && actor.full_name) || ''),
  };
}

async function writeAudit(db, actor, entry) {
  const who = actorIdentity(actor);
  if (!who.email) return null;
  const at = entry.at || new Date().toISOString();
  const previous = await db.get('SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1');
  const prevHash = previous && previous.row_hash ? String(previous.row_hash) : '';
  const payload = JSON.stringify({
    at,
    email: who.email,
    role: who.role,
    action: entry.action,
    entity_type: entry.entityType || null,
    entity_id: entry.entityId != null ? String(entry.entityId) : null,
    summary: entry.summary || '',
    result: entry.result || 'ok',
    prev: prevHash,
  });
  const rowHash = crypto.createHash('sha256').update(payload).digest('hex');
  await db.run(
    `INSERT INTO audit_log (
      at, user_id, email, role, action, entity_type, entity_id, summary,
      before_json, after_json, reason, ref_type, ref_id, result, prev_hash, row_hash
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      at,
      who.userId,
      who.email,
      who.role,
      entry.action,
      entry.entityType || null,
      entry.entityId != null ? String(entry.entityId) : null,
      entry.summary || '',
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after ? JSON.stringify(entry.after) : null,
      entry.reason || null,
      entry.refType || null,
      entry.refId != null ? String(entry.refId) : null,
      entry.result || 'ok',
      prevHash || null,
      rowHash,
    ],
  );
  return rowHash;
}

module.exports = { writeAudit, actorIdentity };
