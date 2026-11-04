import { initializeApp, cert, applicationDefault, getApps, App } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

let firebaseApp: App | null = null;
let messagingInstance: Messaging | null = null;

if (getApps().length === 0) {
  try {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      // Direct JSON string (ideal for Render/Cloud environment variables)
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = cert(serviceAccount);
    } else {
      // Local file path
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
      const resolvedPath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.resolve(process.cwd(), serviceAccountPath);

      if (fs.existsSync(resolvedPath)) {
        credential = cert(resolvedPath);
      } else {
        console.warn(`[Firebase] Service account file not found at ${resolvedPath}. Falling back to applicationDefault.`);
        credential = applicationDefault();
      }
    }

    firebaseApp = initializeApp({
      credential,
    });
    messagingInstance = getMessaging(firebaseApp);
    console.log('🔥 Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
  }
} else {
  firebaseApp = getApps()[0];
  messagingInstance = getMessaging(firebaseApp);
}

export const app = firebaseApp;
export const messaging = messagingInstance;
export default firebaseApp;
