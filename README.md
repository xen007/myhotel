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

## Hébergement Railway

Le service Railway doit suivre la branche `main` de [MAKUI237/myhotel](https://github.com/MAKUI237/myhotel). `railway.toml` construit le site (`npm run build`) puis démarre la même API qu’en local (`node server/index.js`). Cette API sert aussi le site exporté.

Dans les variables du service :

- `MYSQL_URL` = `mysql://USER:PASSWORD@HOST:3306/myhotel`
- `MYHOTEL_MYSQL_SSL` = `1` si MySQL exige SSL

MySQL doit être joignable depuis Internet. La base `myhotel` doit déjà exister si le compte n’a pas le droit de la créer. Chaque push sur `main` redéploie une fois.
