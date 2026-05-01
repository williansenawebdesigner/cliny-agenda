import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

let cachedDb: Firestore | null = null;

function readConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_API_KEY;
  const appId = process.env.FIREBASE_APP_ID;
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID;
  const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID;

  if (!projectId || !apiKey || !appId || !authDomain) {
    throw new Error(
      'Missing Firebase env vars (FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_AUTH_DOMAIN are required)'
    );
  }

  return {
    projectId,
    apiKey,
    appId,
    authDomain,
    storageBucket,
    messagingSenderId,
    firestoreDatabaseId,
  };
}

export function getDb(): Firestore {
  if (cachedDb) return cachedDb;

  const config = readConfig();
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  cachedDb = config.firestoreDatabaseId
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);

  return cachedDb;
}
