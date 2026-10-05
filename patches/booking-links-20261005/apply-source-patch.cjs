const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] || '/app';
const file = path.join(root, 'packages/crm/src/lib/billing/anonymous-workspace.ts');
let source = fs.readFileSync(file, 'utf8');
const old = 'book: `${publicOrigin}/book`,';
if (source.split(old).length - 1 !== 2 || source.includes('./public-booking-url')) {
  throw new Error('Unexpected booking URL source; review upstream before applying');
}
source = 'import { buildPublicBookingUrl } from "./public-booking-url";\n' + source;
source = source.split(old).join('book: buildPublicBookingUrl(slug, baseDomain),');
fs.writeFileSync(file, source);
console.log('Patched flat and structured public booking URL generators');
