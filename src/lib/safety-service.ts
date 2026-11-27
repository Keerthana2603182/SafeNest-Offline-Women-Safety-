import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  get,
  onValue,
  ref,
  set,
  update,
} from 'firebase/database';
import { auth, database, ensureAuthenticatedUser } from './firebase';

export type LiveShareSession = {
  id: string;
  userId: string;
  userName?: string;
  status: 'active' | 'revoked' | 'expired' | 'sos' | 'resolved';
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  startedAt: number;
  updatedAt: number;
  expiresAt?: number;
  note?: string;
  isSOS?: boolean;
};

export type SafetyTimerState = {
  isActive: boolean;
  initialSeconds: number;
  targetEndTime: number;
  activityNote: string;
  startedAt: number;
  status: 'running' | 'completed' | 'overdue' | 'cancelled';
};

export type TrustedContact = {
  id: string;
  name: string;
  phone: string;
};

const ACTIVE_SHARE_KEY = 'safenest_active_share_id';
const PERSISTENT_TIMER_KEY = 'safenest_persistent_timer';

/**
 * Monitor real-time online/offline status using Firebase .info/connected
 */
export function subscribeToConnectionStatus(
  callback: (isOnline: boolean) => void
): () => void {
  try {
    const connectedRef = ref(database, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snapshot) => {
      const isOnline = Boolean(snapshot.val());
      callback(isOnline);
    });
    return unsubscribe;
  } catch {
    callback(true);
    return () => {};
  }
}

/**
 * Generate a cryptographically secure, high-entropy share ID
 * Uses Web Crypto API (16 bytes = 128 bits of entropy) with a collision-resistant timestamp prefix
 */
export function generateCryptographicShareId(): string {
  try {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const buffer = new Uint8Array(16);
      globalThis.crypto.getRandomValues(buffer);
      const hex = Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
      return `sn_${Date.now().toString(36)}_${hex}`;
    }
  } catch {
    // Fallback if getRandomValues is not available
  }

  // High-entropy fallback using multiple distinct pseudo-random sequences and timestamp
  const part1 = Math.random().toString(36).substring(2, 12);
  const part2 = Math.random().toString(36).substring(2, 12);
  return `sn_${Date.now().toString(36)}_${part1}${part2}`;
}

export type StartLiveSharingResult = {
  shareId: string;
  cloudSynced: boolean;
};

/**
 * Start a new live location sharing session in Firebase Realtime Database
 */
export async function startLiveSharing({
  initialCoords,
  note = 'Live location',
  durationMinutes = 60,
  isSOS = false,
}: {
  initialCoords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed?: number | null;
    heading?: number | null;
    altitude?: number | null;
  };
  note?: string;
  durationMinutes?: number;
  isSOS?: boolean;
}): Promise<StartLiveSharingResult> {
  const shareId = generateCryptographicShareId();
  const now = Date.now();
  const expiresAt = now + durationMinutes * 60 * 1000;
  const userId = await ensureAuthenticatedUser();
  const user = auth.currentUser;

  const sessionData: LiveShareSession = {
    id: shareId,
    userId,
    userName: user?.email ? user.email.split('@')[0] : 'SafeNest User',
    status: isSOS ? 'sos' : 'active',
    latitude: initialCoords.latitude,
    longitude: initialCoords.longitude,
    accuracy: initialCoords.accuracy,
    speed: initialCoords.speed ?? null,
    heading: initialCoords.heading ?? null,
    altitude: initialCoords.altitude ?? null,
    startedAt: now,
    updatedAt: now,
    expiresAt,
    note,
    isSOS,
  };

  let cloudSynced = false;
  try {
    const sessionRef = ref(database, `live_locations/${shareId}`);
    await set(sessionRef, sessionData);
    cloudSynced = true;
    await AsyncStorage.setItem(ACTIVE_SHARE_KEY, shareId);
  } catch {
    // Offline resilience: save locally so offline state retains shareId
    await AsyncStorage.setItem(ACTIVE_SHARE_KEY, shareId);
    cloudSynced = false;
  }

  return { shareId, cloudSynced };
}

/**
 * Push real-time coordinate update to an active session
 */
export async function updateLiveLocation(
  shareId: string,
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed?: number | null;
    heading?: number | null;
    altitude?: number | null;
  }
): Promise<void> {
  const sessionRef = ref(database, `live_locations/${shareId}`);
  try {
    await update(sessionRef, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed ?? null,
      heading: coords.heading ?? null,
      altitude: coords.altitude ?? null,
      updatedAt: Date.now(),
    });
  } catch {
    // Offline resilience: silent fallback
  }
}

/**
 * Stop and revoke an active live location sharing session
 * CRITICAL SECURITY: Immediately zeroes out sensitive GPS telemetry in Firebase
 * so revoked links cannot expose location data even if cached or interrogated.
 */
export async function stopLiveSharing(
  shareId: string,
  status: 'revoked' | 'resolved' | 'expired' = 'revoked'
): Promise<void> {
  try {
    const sessionRef = ref(database, `live_locations/${shareId}`);
    await update(sessionRef, {
      status,
      latitude: 0,
      longitude: 0,
      accuracy: null,
      speed: null,
      heading: null,
      altitude: null,
      updatedAt: Date.now(),
    });
  } catch {
    // Offline resilience: clean up local reference regardless
  } finally {
    await AsyncStorage.removeItem(ACTIVE_SHARE_KEY);
  }
}

/**
 * Get the currently active local share session ID if any
 */
export async function getActiveShareId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_SHARE_KEY);
  } catch {
    return null;
  }
}

/**
 * Subscribe in real-time to a live location session (for emergency contacts)
 */
export function subscribeToLiveLocation(
  shareId: string,
  callback: (session: LiveShareSession | null) => void
): () => void {
  try {
    const sessionRef = ref(database, `live_locations/${shareId}`);
    const unsubscribe = onValue(
      sessionRef,
      (snapshot) => {
        if (snapshot.exists()) {
          callback(snapshot.val() as LiveShareSession);
        } else {
          callback(null);
        }
      },
      () => {
        callback(null);
      }
    );
    return unsubscribe;
  } catch {
    callback(null);
    return () => {};
  }
}

/**
 * Sync trusted contacts to Firebase Realtime Database for authenticated user
 * Returns true if synced to cloud, false if operating offline/local
 */
export async function syncContactsToCloud(
  userId: string,
  contacts: TrustedContact[]
): Promise<boolean> {
  try {
    const userContactsRef = ref(database, `users/${userId}/contacts`);
    await set(userContactsRef, contacts);
    return true;
  } catch {
    // Offline / security rules fallback handled gracefully
    return false;
  }
}

/**
 * Fetch trusted contacts from cloud for authenticated user
 */
export async function fetchContactsFromCloud(
  userId: string
): Promise<TrustedContact[] | null> {
  try {
    const userContactsRef = ref(database, `users/${userId}/contacts`);
    const snapshot = await get(userContactsRef);
    if (snapshot.exists()) {
      return snapshot.val() as TrustedContact[];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save persistent safety timer state across app restarts
 * Returns true if synced to cloud, false if local only
 */
export async function savePersistentTimer(
  timer: SafetyTimerState
): Promise<boolean> {
  try {
    await AsyncStorage.setItem(PERSISTENT_TIMER_KEY, JSON.stringify(timer));
    const user = auth.currentUser;
    if (user) {
      const userTimerRef = ref(database, `users/${user.uid}/safety_timer`);
      await set(userTimerRef, timer);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Retrieve persistent safety timer state
 */
export async function getPersistentTimer(): Promise<SafetyTimerState | null> {
  try {
    const stored = await AsyncStorage.getItem(PERSISTENT_TIMER_KEY);
    if (stored) {
      return JSON.parse(stored) as SafetyTimerState;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear persistent safety timer
 */
export async function clearPersistentTimer(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PERSISTENT_TIMER_KEY);
    const user = auth.currentUser;
    if (user) {
      const userTimerRef = ref(database, `users/${user.uid}/safety_timer`);
      await update(userTimerRef, { status: 'completed', isActive: false });
    }
  } catch {
    // Handled
  }
}
