import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

// Support both standard Vite environment variables and fallback to the local applet config
const metaEnv = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || appletConfig.appId,
  firestoreDatabaseId: metaEnv.VITE_FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId || (appletConfig as any).firestoreDatabaseId
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

// Prevent uploads from hanging infinitely on permission or network blocks by limiting retry duration
try {
  storage.maxUploadRetryTime = 15000;    // 15 seconds max upload retry
  storage.maxOperationRetryTime = 15000; // 15 seconds max operation retry
} catch (e) {
  console.warn("Failed to set storage retry limits:", e);
}

// Connection test
async function testConnection() {
  try {
    const testDoc = await getDocFromServer(doc(db, 'test', 'connection'));
    if (testDoc.exists()) {
      console.log("Firebase connected successfully.");
    }
  } catch (error) {
    // Only log real errors, ignore missing doc
    if (error instanceof Error && !error.message.includes('not-found')) {
      console.warn("Firebase connection status:", error.message);
    }
  }
}
testConnection();
