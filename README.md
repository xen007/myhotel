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

### 3. Commandes de build / démarrage

- Install : `npm install`
- Build : `npm run build`
- Start : `npm run serve` (équivalent : `node server/index.js`)
- Node : `20` ou plus

L’API sert aussi le dossier `dist/` généré par le build.

### 4. Variables d’environnement

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
