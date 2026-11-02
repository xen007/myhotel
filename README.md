# MyHotel

Application hôtelière Expo (web + mobile) avec API MySQL.

## Comptes de démonstration

Mot de passe : `password123`

| Rôle | E-mail |
| --- | --- |
| Réception | `receptioniste@gmail.com` |
| Gérant | `gerant@gmail.com` |
| Entretien | `entretien@gmail.com` |
| Gouvernante | `gouvernante@gmail.com` |
| Propriétaire | `proprietaire@gmail.com` |
Restaurant
Ibrahim Traoré
`restaurant@gmail.com`
Client
Awa Diabaté
`awa.client@gmail.com`

## Développement local

```bash
npm install
npm run api
npx expo start --web
```

L’API écoute sur `http://localhost:3847`.

## GitHub

Dépôt : [https://github.com/MAKUI237/myhotel](https://github.com/MAKUI237/myhotel)

## Hébergement Hostinger (déploiement Git)

L’application est un site Expo web + une API Node/MySQL. Sur Hostinger, utilisez un **hébergement Node.js** (Web Hosting + Node, ou VPS), pas un simple hébergement PHP.

### 1. Base MySQL Hostinger

Créez une base MySQL dans hPanel, puis notez hôte, port, utilisateur, mot de passe et nom de base.

### 2. Branchez GitHub

Dans hPanel → **Git** (ou **Node.js** → Git) :

- Dépôt : `https://github.com/MAKUI237/myhotel.git`
- Branche : `main`

Chaque push sur `main` peut redéployer le site.

### 3. Réglages du déploiement Git Hostinger

Dans les paramètres du site Git (`*.hostingersite.com`) :

- Install : `npm install`
- Build : `npm run build`
- **Dossier de sortie (output directory) : `dist`**
- Node : `20` ou plus

Si Hostinger propose un type **Node.js** (recommandé pour l’API) :

- Start : `npm run serve`

Sans Node, le site statique s’affiche mais **l’API et MySQL ne tournent pas**.

L’erreur `No output directory found after build` signifie que le champ « dossier de sortie » n’est pas `dist` (ou `build`). Le build crée `dist/`, `build/` et `out/`.

### 4. Faut-il une base de données ?

**Oui**, si vous voulez l’application complète (connexion, chambres, restaurant). Créez une base MySQL dans hPanel, puis renseignez `MYSQL_URL`. Sans base, le site vitrine peut s’afficher, mais l’espace hôtel ne fonctionnera pas.

```
MYSQL_URL=mysql://USER:PASSWORD@HOST:3306/NOM_BASE
MYHOTEL_MYSQL_SSL=1
MYHOTEL_MYSQL_SKIP_CREATE=1
PORT=3000
```

`PORT` doit correspondre au port Node indiqué par Hostinger. La base `myhotel` (ou le nom choisi) doit déjà exister.

### 5. Domaine

Pointez le domaine vers l’application Node. En production, le front appelle `/api` sur le même origine (`getApiBaseUrl`).

## Hébergement Railway

Le service Railway doit suivre la branche `main` de [MAKUI237/myhotel](https://github.com/MAKUI237/myhotel). `railway.toml` construit le site (`npm run build`) puis démarre `node server/index.js`.

Variables :

- `MYSQL_URL` = `mysql://USER:PASSWORD@HOST:3306/myhotel`
- `MYHOTEL_MYSQL_SSL` = `1` si MySQL exige SSL
