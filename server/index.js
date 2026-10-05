const http = require('http');
const fs = require('fs');
const path = require('path');

const { openDatabase, DATA_DIR } = require('./db');
const {
  handlePms,
  markReadyRoomsDisponible,
  releaseExpiredStays,
} = require('./pms-routes');

const PORT = Number(
  process.env.PORT ||
  process.env.MYHOTEL_API_PORT ||
  3847
);

function send(res, status, body) {
  const payload = JSON.stringify(body);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  });

  res.end(payload);
}

function ok(res, data, message = '', status = 200) {
  const body = { ok: true, data };

  if (message) body.message = message;

  send(res, status, body);
}

function fail(res, error, status = 400) {
  send(res, status, { ok: false, error });
}

function readBody(req) {
  if (req.body != null && req.body !== '') {
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString('utf8');

      return Promise.resolve(
        raw ? JSON.parse(raw) : {},
      );
    }

    if (typeof req.body === 'string') {
      return Promise.resolve(
        req.body ? JSON.parse(req.body) : {},
      );
    }

    if (typeof req.body === 'object') {
      return Promise.resolve(req.body);
    }
  }

  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');

      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON invalide.'));
      }
    });

    req.on('error', reject);
  });
}

function requestPath(req) {
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  );

  let pathName =
    url.pathname.replace(/\/$/, '') || '/';

  if (
    pathName === '/api' ||
    pathName.startsWith('/api/')
  ) {
    pathName = pathName.slice(4) || '/';
  }

  return pathName;
}

function bearer(req) {
  const header = req.headers.authorization || '';

  const match = header.match(
    /Bearer\s+(\S+)/i,
  );

  return match ? match[1] : null;
}

function hashToken(token) {
  const crypto = require('crypto');

  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

async function issueToken(db, userId) {
  const crypto = require('crypto');

  const raw = crypto
    .randomBytes(32)
    .toString('hex');

  const expires = new Date(
    Date.now() +
      30 * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  await db.run(
    'INSERT INTO auth_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [
      userId,
      hashToken(raw),
      expires,
    ],
  );

  return raw;
}

async function userFromToken(db, token) {
  if (!token) return null;

  return await db.get(
    `SELECT u.*
     FROM auth_tokens t
     INNER JOIN users u
       ON u.id = t.user_id
     WHERE t.token_hash = ?
       AND t.expires_at > datetime('now')
     LIMIT 1`,
    [hashToken(token)],
  );
}

async function requireUser(
  db,
  req,
  res,
) {
  const user = await userFromToken(
    db,
    bearer(req),
  );

  if (!user) {
    fail(
      res,
      'Session expirée. Veuillez vous reconnecter.',
      401,
    );

    return null;
  }

  if (
    String(
      user.status || 'actif',
    ) === 'banni'
  ) {
    fail(
      res,
      'Ce compte a été banni. Contactez le propriétaire.',
      403,
    );

    return null;
  }

  return user;
}

async function withEquipment(
  db,
  room,
  withHistory = false,
) {
  const items = await db.all(
    `SELECT
       e.id,
       e.name,
       e.category,
       e.icon
     FROM room_equipment re
     JOIN equipment e
       ON e.id = re.equipment_id
     WHERE re.room_id = ?
     ORDER BY e.category, e.name`,
    [room.id],
  );

  const photoRows = (
    await db.all(
      'SELECT url FROM room_photos WHERE room_id = ? ORDER BY sort, id',
      [room.id],
    )
  ).map((p) => p.url);

  let videoRows = [];

  try {
    videoRows = (
      await db.all(
        'SELECT url FROM room_videos WHERE room_id = ? ORDER BY sort, id',
        [room.id],
      )
    ).map((p) => p.url);
  } catch {
    videoRows = [];
  }

  const photos = [...photoRows];

  if (
    room.photo &&
    !photos.includes(room.photo)
  ) {
    photos.unshift(room.photo);
  }

  const videos = [...videoRows];

  if (
    room.video &&
    !videos.includes(room.video)
  ) {
    videos.unshift(room.video);
  }

  const payload = {
    ...room,
    equipment: items,
    photos,
    videos,
    photo:
      photos[0] || room.photo,
    video:
      videos[0] ||
      room.video ||
      null,
  };

  if (!withHistory) {
    return payload;
  }

  payload.history = await db.all(
    `SELECT
       r.id,
       g.full_name AS guest_name,
       g.phone AS guest_phone,
       r.check_in,
       r.check_out,
       r.check_in_time,
       r.check_out_time,
       r.status,
       r.total
     FROM reservations r
     JOIN guests g
       ON g.id = r.guest_id
     WHERE r.room_id = ?
     ORDER BY r.check_in DESC`,
    [room.id],
  );

  return payload;
}

function mimeFromName(name) {
  const ext = String(name || '')
    .toLowerCase()
    .split('.')
    .pop();

  if (ext === 'html') {
    return 'text/html; charset=utf-8';
  }

  if (ext === 'js') {
    return 'application/javascript; charset=utf-8';
  }

  if (ext === 'css') {
    return 'text/css; charset=utf-8';
  }

  if (ext === 'json') {
    return 'application/json; charset=utf-8';
  }

  if (ext === 'svg') {
    return 'image/svg+xml';
  }

  if (ext === 'ico') {
    return 'image/x-icon';
  }

  if (ext === 'woff') {
    return 'font/woff';
  }

  if (ext === 'woff2') {
    return 'font/woff2';
  }

  if (ext === 'png') {
    return 'image/png';
  }

  if (ext === 'gif') {
    return 'image/gif';
  }

  if (ext === 'webp') {
    return 'image/webp';
  }

  if (
    ext === 'jpg' ||
    ext === 'jpeg'
  ) {
    return 'image/jpeg';
  }

  if (ext === 'mp4') {
    return 'video/mp4';
  }

  if (ext === 'webm') {
    return 'video/webm';
  }

  if (ext === 'mov') {
    return 'video/quicktime';
  }

  if (ext === 'pdf') {
    return 'application/pdf';
  }

  if (ext === 'txt') {
    return 'text/plain; charset=utf-8';
  }

  return 'application/octet-stream';
}

/*
|--------------------------------------------------------------------------
| FRONTEND EXPO WEB
|--------------------------------------------------------------------------
*/

const WEB_DIST = path.join(
  __dirname,
  '..',
  'dist',
);

function serveWeb(req, res) {
  if (
    req.method !== 'GET' &&
    req.method !== 'HEAD'
  ) {
    return false;
  }

  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  );

  const pathname =
    decodeURIComponent(
      url.pathname,
    );

  /*
   * Les routes /api restent
   * exclusivement gérées par l'API.
   */
  if (
    pathname === '/api' ||
    pathname.startsWith('/api/')
  ) {
    return false;
  }

  /*
   * En local, dist peut ne pas
   * exister si Expo tourne avec
   * son serveur de développement.
   */
  if (!fs.existsSync(WEB_DIST)) {
    return false;
  }

  const relativePath =
    pathname === '/'
      ? 'index.html'
      : pathname.replace(
          /^\/+/,
          '',
        );

  const distRoot =
    path.resolve(WEB_DIST);

  const filePath =
    path.resolve(
      WEB_DIST,
      relativePath,
    );

  /*
   * Protection contre les chemins
   * de type ../../
   */
  if (
    filePath !== distRoot &&
    !filePath.startsWith(
      distRoot + path.sep,
    )
  ) {
    return false;
  }

  /*
   * Si le fichier demandé existe,
   * on l'envoie directement.
   *
   * Exemples :
   * /_expo/static/...
   * /assets/...
   * /favicon.ico
   */
  if (
    fs.existsSync(filePath) &&
    fs.statSync(filePath).isFile()
  ) {
    const stat =
      fs.statSync(filePath);

    res.writeHead(200, {
      'Content-Type':
        mimeFromName(filePath),

      'Content-Length':
        stat.size,
    });

    if (req.method === 'HEAD') {
      res.end();
    } else {
      fs
        .createReadStream(
          filePath,
        )
        .pipe(res);
    }

    return true;
  }

  /*
   * Fallback pour Expo Router.
   *
   * Exemple :
   * /login
   * /dashboard
   * /rooms
   *
   * Ces URL doivent retourner
   * index.html pour que React
   * prenne ensuite le relais.
   */
  const indexFile = path.join(
    WEB_DIST,
    'index.html',
  );

  if (fs.existsSync(indexFile)) {
    const stat =
      fs.statSync(indexFile);

    res.writeHead(200, {
      'Content-Type':
        'text/html; charset=utf-8',

      'Content-Length':
        stat.size,
    });

    if (req.method === 'HEAD') {
      res.end();
    } else {
      fs
        .createReadStream(
          indexFile,
        )
        .pipe(res);
    }

    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

function createRequestHandler(db) {
  return async function handleRequest(
    req,
    res,
  ) {
    try {
      if (
        req.method === 'OPTIONS'
      ) {
        send(res, 204, {});
        return;
      }

      const pathName =
        requestPath(req);

      /*
      |--------------------------------------------------------------------------
      | FICHIERS CHAT
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName.startsWith(
          '/uploads/chat/',
        )
      ) {
        const name =
          path.basename(pathName);

        if (
          !/^[\w\.-]+$/.test(name)
        ) {
          fail(
            res,
            'Fichier introuvable.',
            404,
          );

          return;
        }

        const file = path.join(
          DATA_DIR,
          'chat',
          name,
        );

        if (!fs.existsSync(file)) {
          fail(
            res,
            'Fichier introuvable.',
            404,
          );

          return;
        }

        const buf =
          fs.readFileSync(file);

        res.writeHead(200, {
          'Content-Type':
            mimeFromName(name),

          'Content-Length':
            buf.length,

          'Access-Control-Allow-Origin':
            '*',

          'Cache-Control':
            'private, max-age=86400',

          'Content-Disposition':
            'inline',
        });

        res.end(buf);

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | HEALTH
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName === '/health'
      ) {
        ok(res, {
          status: 'ok',
          engine: 'mysql',
        });

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | LOGIN
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'POST' &&
        pathName === '/auth/login'
      ) {
        const body =
          await readBody(req);

        const email = String(
          body.email || '',
        )
          .trim()
          .toLowerCase();

        const password = String(
          body.password || '',
        );

        const user = await db.get(
          'SELECT * FROM users WHERE email = ? LIMIT 1',
          [email],
        );

        if (
          !user ||
          !db.verifyPassword(
            password,
            user.password_hash,
          )
        ) {
          fail(
            res,
            'E-mail ou mot de passe incorrect.',
            401,
          );

          return;
        }

        if (
          String(
            user.status || 'actif',
          ) === 'banni'
        ) {
          fail(
            res,
            'Ce compte a été banni. Contactez le propriétaire.',
            403,
          );

          return;
        }

        await db.run(
          "UPDATE users SET last_login = datetime('now') WHERE id = ?",
          [user.id],
        );

        const fresh =
          await db.get(
            'SELECT * FROM users WHERE id = ?',
            [user.id],
          );

        ok(
          res,
          {
            user:
              db.publicUser(fresh),

            token:
              await issueToken(
                db,
                user.id,
              ),
          },
          'Connexion réussie.',
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | REGISTER
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'POST' &&
        pathName ===
          '/auth/register'
      ) {
        const body =
          await readBody(req);

        const fullName = String(
          body.full_name || '',
        ).trim();

        const email = String(
          body.email || '',
        )
          .trim()
          .toLowerCase();

        const phone = String(
          body.phone || '',
        ).trim();

        const password = String(
          body.password || '',
        );

        if (
          fullName.length < 2 ||
          fullName.length > 120
        ) {
          fail(
            res,
            'Indiquez un nom complet valide.',
          );

          return;
        }

        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email,
          )
        ) {
          fail(
            res,
            'Adresse e-mail invalide.',
          );

          return;
        }

        if (
          phone &&
          !/^[0-9+\s().-]{6,30}$/.test(
            phone,
          )
        ) {
          fail(
            res,
            'Numéro de téléphone invalide.',
          );

          return;
        }

        if (
          password.length < 8 ||
          password.length > 72
        ) {
          fail(
            res,
            'Le mot de passe doit contenir entre 8 et 72 caractères.',
          );

          return;
        }

        if (
          await db.get(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [email],
          )
        ) {
          fail(
            res,
            'Un compte existe déjà avec cet e-mail.',
            409,
          );

          return;
        }

        await db.run(
          'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
          [
            fullName,
            email,
            phone || null,
            db.hashPassword(
              password,
            ),
            'client',
          ],
        );

        const user =
          await db.get(
            'SELECT * FROM users WHERE id = ?',
            [db.lastId()],
          );

        await db.run(
          "UPDATE users SET last_login = datetime('now') WHERE id = ?",
          [user.id],
        );

        await db.run(
          `INSERT INTO notifications
            (
              category,
              title,
              body,
              is_read,
              created_at
            )
           VALUES
            (
              'COMPTE',
              'Nouvel inscrit',
              ?,
              0,
              datetime('now')
            )`,
          [
            `${fullName} (${email}) vient de créer un compte.`,
          ],
        );

        const fresh =
          await db.get(
            'SELECT * FROM users WHERE id = ?',
            [user.id],
          );

        ok(
          res,
          {
            user:
              db.publicUser(fresh),

            token:
              await issueToken(
                db,
                user.id,
              ),
          },
          'Compte créé avec succès.',
          201,
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | UTILISATEUR CONNECTÉ
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName === '/auth/me'
      ) {
        const user =
          await requireUser(
            db,
            req,
            res,
          );

        if (!user) return;

        ok(res, {
          user:
            db.publicUser(user),
        });

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | PROFIL
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'POST' &&
        pathName ===
          '/auth/profile'
      ) {
        const user =
          await requireUser(
            db,
            req,
            res,
          );

        if (!user) return;

        const body =
          await readBody(req);

        const fullName = String(
          body.full_name ??
            user.full_name,
        ).trim();

        const photo =
          body.photo === undefined
            ? user.photo ?? null
            : body.photo === null
              ? null
              : String(
                  body.photo,
                );

        if (
          fullName.length < 2
        ) {
          fail(
            res,
            'Indiquez un nom valide.',
          );

          return;
        }

        if (
          photo &&
          (
            !String(
              photo,
            ).startsWith(
              'data:image/',
            ) ||
            String(photo).length >
              700000
          )
        ) {
          fail(
            res,
            'Photo invalide ou trop lourde.',
          );

          return;
        }

        await db.run(
          "UPDATE users SET full_name = ?, photo = ?, updated_at = datetime('now') WHERE id = ?",
          [
            fullName,
            photo,
            user.id,
          ],
        );

        const fresh =
          await db.get(
            'SELECT * FROM users WHERE id = ?',
            [user.id],
          );

        ok(
          res,
          {
            user:
              db.publicUser(fresh),
          },
          'Profil mis à jour.',
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | MOT DE PASSE
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'POST' &&
        pathName ===
          '/auth/password'
      ) {
        const user =
          await requireUser(
            db,
            req,
            res,
          );

        if (!user) return;

        const body =
          await readBody(req);

        const current = String(
          body.current_password ||
            '',
        );

        const next = String(
          body.new_password || '',
        );

        if (
          !db.verifyPassword(
            current,
            user.password_hash,
          )
        ) {
          fail(
            res,
            'Ancien mot de passe incorrect.',
          );

          return;
        }

        if (
          next.length < 8 ||
          next.length > 72
        ) {
          fail(
            res,
            'Le mot de passe doit contenir au moins 8 caractères.',
          );

          return;
        }

        await db.run(
          "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
          [
            db.hashPassword(next),
            user.id,
          ],
        );

        ok(
          res,
          {
            updated: true,
          },
          'Mot de passe modifié.',
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | LOGOUT
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'POST' &&
        pathName ===
          '/auth/logout'
      ) {
        const token =
          bearer(req);

        if (token) {
          await db.run(
            'DELETE FROM auth_tokens WHERE token_hash = ?',
            [hashToken(token)],
          );
        }

        ok(res, {
          closed: true,
        });

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | NOTIFICATIONS
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName ===
          '/notifications'
      ) {
        const user =
          await requireUser(
            db,
            req,
            res,
          );

        if (!user) return;

        const items =
          await db.all(
            'SELECT * FROM notifications ORDER BY datetime(created_at) DESC, id DESC LIMIT 40',
          );

        ok(res, {
          items: items.map(
            (row) => ({
              ...row,

              id: Number(
                row.id,
              ),

              is_read:
                Number(
                  row.is_read,
                ) === 1,
            }),
          ),

          unread: Number(
            (
              await db.get(
                'SELECT COUNT(*) AS n FROM notifications WHERE is_read = 0',
              )
            ).n,
          ),
        });

        return;
      }

      if (
        req.method === 'POST' &&
        pathName ===
          '/notifications/read'
      ) {
        const user =
          await requireUser(
            db,
            req,
            res,
          );

        if (!user) return;

        const body =
          await readBody(req);

        if (body.all) {
          await db.run(
            'UPDATE notifications SET is_read = 1 WHERE is_read = 0',
          );
        } else {
          const id = Number(
            body.id,
          );

          if (!id) {
            fail(
              res,
              'Notification invalide.',
            );

            return;
          }

          await db.run(
            'UPDATE notifications SET is_read = 1 WHERE id = ?',
            [id],
          );
        }

        const items =
          await db.all(
            'SELECT * FROM notifications ORDER BY datetime(created_at) DESC, id DESC LIMIT 40',
          );

        ok(res, {
          items: items.map(
            (row) => ({
              ...row,

              id: Number(
                row.id,
              ),

              is_read:
                Number(
                  row.is_read,
                ) === 1,
            }),
          ),

          unread: Number(
            (
              await db.get(
                'SELECT COUNT(*) AS n FROM notifications WHERE is_read = 0',
              )
            ).n,
          ),
        });

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | DASHBOARD
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName ===
          '/dashboard'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        const rooms =
          await db.get(
            `SELECT
              COUNT(*) AS total,
              SUM(
                CASE
                  WHEN status = 'disponible'
                  THEN 1
                  ELSE 0
                END
              ) AS available,
              SUM(
                CASE
                  WHEN status = 'occupee'
                  THEN 1
                  ELSE 0
                END
              ) AS occupied,
              SUM(
                CASE
                  WHEN status = 'nettoyage'
                  THEN 1
                  ELSE 0
                END
              ) AS cleaning,
              SUM(
                CASE
                  WHEN status = 'maintenance'
                  THEN 1
                  ELSE 0
                END
              ) AS maintenance
             FROM rooms`,
          );

        const staff =
          await db.get(
            `SELECT
              COUNT(*) AS total,
              SUM(
                CASE
                  WHEN status = 'actif'
                  THEN 1
                  ELSE 0
                END
              ) AS active
             FROM staff`,
          );

        const reservations =
          await db.get(
            `SELECT
              COUNT(*) AS total,
              SUM(
                CASE
                  WHEN status IN (
                    'confirmee',
                    'en_cours'
                  )
                  THEN 1
                  ELSE 0
                END
              ) AS live
             FROM reservations`,
          );

        const billing =
          await db.get(
            `SELECT
              SUM(
                CASE
                  WHEN status = 'payee'
                  THEN amount
                  ELSE 0
                END
              ) AS paid,
              SUM(
                CASE
                  WHEN status != 'payee'
                  THEN amount
                  ELSE 0
                END
              ) AS pending
             FROM invoices`,
          );

        ok(res, {
          rooms,
          staff,
          reservations,
          billing,
        });

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | ROOMS
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName === '/rooms'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        try {
          await releaseExpiredStays(
            db,
          );
        } catch {
          /*
           * Ignore une erreur
           * éventuelle de libération.
           */
        }

        await markReadyRoomsDisponible(
          db,
        );

        const rooms =
          await Promise.all(
            (
              await db.all(
                'SELECT * FROM rooms ORDER BY number',
              )
            ).map(
              (room) =>
                withEquipment(
                  db,
                  room,
                ),
            ),
          );

        ok(res, rooms);

        return;
      }

      const roomMatch =
        pathName.match(
          /^\/rooms\/(\d+)$/,
        );

      if (
        req.method === 'GET' &&
        roomMatch
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        const room =
          await db.get(
            'SELECT * FROM rooms WHERE id = ?',
            [
              Number(
                roomMatch[1],
              ),
            ],
          );

        if (!room) {
          fail(
            res,
            'Chambre introuvable.',
            404,
          );

          return;
        }

        ok(
          res,
          await withEquipment(
            db,
            room,
            true,
          ),
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | EQUIPMENT
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName ===
          '/equipment'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        const items =
          await db.all(
            `SELECT
              e.*,
              COUNT(re.room_id) AS rooms_count
             FROM equipment e
             LEFT JOIN room_equipment re
               ON re.equipment_id = e.id
             GROUP BY e.id
             ORDER BY
               e.category,
               e.name`,
          );

        ok(res, items);

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | STAFF
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName === '/staff'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        ok(
          res,
          await db.all(
            'SELECT * FROM staff ORDER BY department, full_name',
          ),
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | MENU
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName === '/menu'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        ok(
          res,
          await db.all(
            'SELECT * FROM menu_items ORDER BY category, name',
          ),
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | RESERVATIONS
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName ===
          '/reservations'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        const rows =
          await db.all(
            `SELECT
              r.*,
              g.full_name AS guest_name,
              g.phone AS guest_phone,
              rm.number AS room_number,
              rm.type AS room_type,
              rm.photo AS room_photo
             FROM reservations r
             JOIN guests g
               ON g.id = r.guest_id
             JOIN rooms rm
               ON rm.id = r.room_id
             ORDER BY r.check_in DESC`,
          );

        ok(res, rows);

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | GUESTS
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName === '/guests'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        ok(
          res,
          await db.all(
            'SELECT * FROM guests ORDER BY full_name',
          ),
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | SERVICES
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName ===
          '/services'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        ok(
          res,
          await db.all(
            'SELECT * FROM services ORDER BY name',
          ),
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | FACTURES
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName === '/invoices'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        ok(
          res,
          await db.all(
            'SELECT * FROM invoices ORDER BY issued_at DESC',
          ),
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | HOUSEKEEPING
      |--------------------------------------------------------------------------
      */

      if (
        req.method === 'GET' &&
        pathName ===
          '/housekeeping'
      ) {
        if (
          !await requireUser(
            db,
            req,
            res,
          )
        ) {
          return;
        }

        const rooms =
          await Promise.all(
            (
              await db.all(
                `SELECT *
                 FROM rooms
                 WHERE status IN (
                   'nettoyage',
                   'maintenance',
                   'occupee'
                 )
                 ORDER BY
                   floor,
                   number`,
              )
            ).map(
              (room) =>
                withEquipment(
                  db,
                  room,
                ),
            ),
          );

        const team =
          await db.all(
            `SELECT *
             FROM staff
             WHERE department IN (
               'Étages',
               'Maintenance'
             )
             ORDER BY
               role,
               full_name`,
          );

        ok(res, {
          rooms,
          team,
        });

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | PMS
      |--------------------------------------------------------------------------
      */

      const pmsHandled =
        await handlePms(
          req,
          res,
          {
            db,
            pathName,
            method:
              req.method,
            readBody,
            ok,
            fail,
            requireUser,
          },
        );

      if (pmsHandled) {
        return;
      }

      /*
      |--------------------------------------------------------------------------
      | FRONTEND WEB
      |--------------------------------------------------------------------------
      |
      | Après toutes les routes API,
      | on tente de servir le frontend.
      |
      | Sur Render, dist/ est créé par :
      |
      | npm install && npm run build
      |
      | En local, si dist n'existe pas,
      | le serveur API continue de
      | fonctionner comme auparavant.
      |
      */

      if (serveWeb(req, res)) {
        return;
      }

      /*
      |--------------------------------------------------------------------------
      | 404 API
      |--------------------------------------------------------------------------
      */

      fail(
        res,
        'Route introuvable.',
        404,
      );
    } catch (error) {
      fail(
        res,
        error instanceof Error
          ? error.message
          : 'Erreur serveur.',
        500,
      );
    }
  };
}

/*
|--------------------------------------------------------------------------
| DÉMARRAGE SERVEUR
|--------------------------------------------------------------------------
*/

async function main() {
  const db =
    await openDatabase();

  const server =
    http.createServer(
      createRequestHandler(db),
    );

  server.listen(
    PORT,
    '0.0.0.0',
    () => {
      console.log(
        `MyHotel API MySQL prête sur http://localhost:${PORT}`,
      );
    },
  );
}

if (
  require.main === module
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createRequestHandler,
  openDatabase,
};