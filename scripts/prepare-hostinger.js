const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const index = path.join(dist, 'index.html');

if (!fs.existsSync(index)) {
  console.error('Build incomplet : dist/index.html est introuvable.');
  process.exit(1);
}

for (const name of ['build', 'out']) {
  const dest = path.join(root, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(dist, dest, { recursive: true });
}

console.log('Hostinger : dossiers dist/, build/ et out/ prêts.');
