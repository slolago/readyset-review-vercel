/**
 * Backfill `commentCount` on every pre-v2.0 asset document.
 *
 * Phase 63 denormalized comment count onto asset docs with live
 * `FieldValue.increment(±1)` on create/delete. Assets uploaded before
 * that change have `commentCount` undefined — their grid badges read
 * as 0 until a comment mutation flips the counter. This script scans
 * every asset, counts its top-level comments (excludes replies via
 * `parentId === null`), and writes the count in a single batched pass.
 *
 * Safe to re-run — only writes when the stored value differs. Soft-
 * deleted comments are excluded (matches the list-endpoint contract).
 *
 * Usage: node scripts/backfill-comment-count.mjs
 */

import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Firebase admin credentials missing from .env.local');
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

console.log(`Scanning assets in ${projectId}...`);
const assetsSnap = await db.collection('assets').get();
console.log(`  ${assetsSnap.size} asset docs`);

const commentsSnap = await db.collection('comments').get();
console.log(`  ${commentsSnap.size} comment docs\n`);

// Build assetId → topLevelCount (exclude soft-deleted comments + replies)
const counts = new Map();
for (const doc of commentsSnap.docs) {
  const c = doc.data();
  if (c.deletedAt) continue;
  if (c.parentId) continue; // replies don't count toward badge
  counts.set(c.assetId, (counts.get(c.assetId) ?? 0) + 1);
}

let toUpdate = 0;
let already = 0;
const BATCH_SIZE = 500; // Firestore batch limit
let batch = db.batch();
let batched = 0;

for (const doc of assetsSnap.docs) {
  const want = counts.get(doc.id) ?? 0;
  const have = doc.data().commentCount;
  if (have === want) {
    already++;
    continue;
  }
  batch.update(doc.ref, { commentCount: want });
  batched++;
  toUpdate++;
  if (batched >= BATCH_SIZE) {
    await batch.commit();
    console.log(`  committed batch of ${batched}`);
    batch = db.batch();
    batched = 0;
  }
}
if (batched > 0) {
  await batch.commit();
  console.log(`  committed final batch of ${batched}`);
}

console.log(`\nDone. Updated ${toUpdate} assets; ${already} already had the correct count.`);
console.log(`\nTotal top-level comments across the project: ${Array.from(counts.values()).reduce((a, b) => a + b, 0)}`);

await admin.app().delete();
