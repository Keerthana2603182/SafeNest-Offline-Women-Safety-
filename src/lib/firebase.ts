import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  signInAnonymously,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCu6YSyg7sO2YWyJsvR5JuaMRkcGNmDAgo",
  authDomain: "safenest-98008.firebaseapp.com",
  databaseURL: "https://safenest-98008-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "safenest-98008",
  storageBucket: "safenest-98008.firebasestorage.app",
  messagingSenderId: "520262707892",
  appId: "1:520262707892:web:03dcd6cb316c9d066d85e1"
};

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

let auth: Auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

/**
 * Ensures the client has an active authenticated session.
 * For users without a registered email account, Firebase Anonymous Authentication
 * is automatically initialized, binding session ownership to a real, cryptographically secure auth.uid.
 */
export async function ensureAuthenticatedUser(): Promise<string> {
  const existingUser = auth.currentUser;
  if (existingUser) {
    return existingUser.uid;
  }
  try {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (err) {
    const fallbackUser = auth.currentUser;
    if (fallbackUser) {
      return (fallbackUser as { uid: string }).uid;
    }
    throw err;
  }
}

export { auth };
export const database = getDatabase(app);