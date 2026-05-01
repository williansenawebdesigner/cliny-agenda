import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let cachedDb: Firestore | null = null;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Accept either raw JSON or base64-encoded JSON (handy for Vercel UI)
    const text = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(text);
  } catch (err) {
    console.error('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
    return null;
  }
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];

  const serviceAccount = loadServiceAccount();
  const projectId =
    serviceAccount?.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT;

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  // Fallback to ADC (works on GCP/Cloud Run; on Vercel you must set FIREBASE_SERVICE_ACCOUNT)
  return initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

export function getDb(): Firestore {
  if (cachedDb) return cachedDb;

  const app = getAdminApp();
  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID;
  cachedDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  return cachedDb;
}
