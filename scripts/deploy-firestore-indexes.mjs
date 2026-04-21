/**
 * Deploy firestore.indexes.json via the Firestore REST API using the Firebase
 * Admin service-account credentials from .env.local.
 *
 * Firebase CLI's `firebase deploy --only firestore:indexes` requires an
 * interactive login (or a CI token from `firebase login:ci`), neither of
 * which we have in this environment. The REST API accepts a standard
 * OAuth2 access token minted from the service-account private key, which
 * the Admin SDK already has.
 *
 * Usage: node scripts/deploy-firestore-indexes.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(projectRoot, '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv();
const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
if (!projectId) throw new Error('FIREBASE_ADMIN_PROJECT_ID missing');

const credentials = {
  type: 'service_account',
  project_id: projectId,
  client_email: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

const auth = new GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/datastore'],
});
const client = await auth.getClient();
const token = (await client.getAccessToken()).token;
if (!token) throw new Error('failed to mint access token');

const indexesFile = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'firestore.indexes.json'), 'utf8'),
);

async function listIndexes(collectionGroup) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/${collectionGroup}/indexes`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`listIndexes failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.indexes ?? [];
}

/**
 * Same-signature check: two indexes are "the same" if they target the same
 * collection group, same queryScope, and the same ordered list of
 * (fieldPath, order|arrayConfig).
 */
function indexKey(idx) {
  const fields = (idx.fields ?? []).map((f) => {
    const path = f.fieldPath;
    const suffix = f.order ? `:${f.order}` : f.arrayConfig ? `:arr:${f.arrayConfig}` : '';
    return path + suffix;
  }).join(',');
  return `${idx.queryScope ?? 'COLLECTION'}|${fields}`;
}

async function deployOne(def) {
  const collectionGroup = def.collectionGroup;
  // Firestore doesn't include __name__ in user-declared fields but adds it
  // implicitly at the end of each composite index. Existing indexes returned
  // by the API include it — strip for comparison.
  const existing = await listIndexes(collectionGroup);
  const normalize = (i) => ({
    queryScope: i.queryScope ?? 'COLLECTION',
    fields: (i.fields ?? []).filter((f) => f.fieldPath !== '__name__'),
  });
  const wantKey = indexKey({ queryScope: def.queryScope ?? 'COLLECTION', fields: def.fields });
  const match = existing.find((i) => indexKey(normalize(i)) === wantKey);
  if (match) {
    console.log(`  ✓ already exists (${match.state}) — ${match.name.split('/').pop()}`);
    return { skipped: true, state: match.state };
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/${collectionGroup}/indexes`;
  const body = {
    queryScope: def.queryScope ?? 'COLLECTION',
    fields: def.fields,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`create failed (${res.status}): ${JSON.stringify(data)}`);
  }
  console.log(`  → submitted, operation: ${data.name}`);
  return { submitted: true, operation: data.name };
}

console.log(`Deploying ${indexesFile.indexes.length} indexes to ${projectId}...\n`);
for (const idx of indexesFile.indexes) {
  const fieldSummary = idx.fields.map((f) => f.fieldPath).join(', ');
  console.log(`${idx.collectionGroup}: (${fieldSummary})`);
  try {
    await deployOne(idx);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}
console.log('\nDone. New indexes build asynchronously — they show as "CREATING" in the Firebase console and flip to "READY" when complete (usually a minute or two).');
