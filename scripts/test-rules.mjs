// Comprehensive Firebase Security Rules Test Suite for SafeNest
// Tests all 16 security constraints directly against Firebase Realtime Database rules
import { Buffer } from 'node:buffer';

const DB_HOST = '127.0.0.1';
const DB_PORT = 9000;
const PROJECT_ID = 'safenest-98008';
const NS = 'safenest-98008-default-rtdb';
const BASE_URL = `http://${DB_HOST}:${DB_PORT}`;

// Helper to make REST calls to Realtime Database Emulator
function createMockToken(uid) {
  if (!uid) return null;
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    user_id: uid,
    sub: uid,
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    auth_time: Math.floor(Date.now() / 1000),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  return `${header}.${payload}.`;
}

async function dbRequest({ path, method = 'GET', data = null, uid = null }) {
  let url = `${BASE_URL}${path}.json?ns=${NS}`;
  const token = createMockToken(uid);
  if (token) {
    url += `&auth=${token}`;
  }

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data !== null) {
    options.body = JSON.stringify(data);
  }

  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Empty body
  }
  return { status: res.status, ok: res.ok, body };
}

const results = [];

function assertTest(name, passed, details) {
  results.push({ name, passed, details });
  console.log(`${passed ? '✅ PASS' : '❌ FAIL'}: ${name}`);
  if (!passed && details) {
    console.log(`   Details: ${JSON.stringify(details)}`);
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   SAFENEST FIREBASE SECURITY RULES VERIFICATION TEST   ');
  console.log('======================================================\n');

  const OWNER_UID = 'user_victim_123';
  const ATTACKER_UID = 'user_attacker_456';
  const SHARE_ID = 'sn_test_share_secure_128bit';

  const validSessionData = {
    id: SHARE_ID,
    userId: OWNER_UID,
    userName: 'Victim User',
    status: 'active',
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 10,
    speed: 1.5,
    heading: 90,
    altitude: 15,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  // -----------------------------------------------------------------
  // 1. UNAUTHENTICATED SESSION CREATION
  // -----------------------------------------------------------------
  console.log('\n[GROUP 1: Session Creation & Anonymous Auth Security]');

  const resUnauthCreate = await dbRequest({
    path: `/live_locations/${SHARE_ID}`,
    method: 'PUT',
    data: validSessionData,
    uid: null, // No auth
  });
  assertTest(
    '1. Unauthenticated creation must be REJECTED',
    resUnauthCreate.status === 401 || (resUnauthCreate.body && resUnauthCreate.body.error === 'Permission denied'),
    resUnauthCreate
  );

  // -----------------------------------------------------------------
  // 2. CREATION WITH LITERAL "anonymous" USER ID
  // -----------------------------------------------------------------
  const resAnonLiteralCreate = await dbRequest({
    path: `/live_locations/${SHARE_ID}`,
    method: 'PUT',
    data: { ...validSessionData, userId: 'anonymous' },
    uid: OWNER_UID,
  });
  assertTest(
    '2. Creation with literal userId "anonymous" must be REJECTED',
    resAnonLiteralCreate.status === 401 || (resAnonLiteralCreate.body && resAnonLiteralCreate.body.error === 'Permission denied'),
    resAnonLiteralCreate
  );

  // -----------------------------------------------------------------
  // 3. CREATION WITH MISMATCHED USER ID (Attacker claims to be Owner)
  // -----------------------------------------------------------------
  const resMismatchedCreate = await dbRequest({
    path: `/live_locations/${SHARE_ID}`,
    method: 'PUT',
    data: validSessionData, // userId is OWNER_UID
    uid: ATTACKER_UID,     // auth.uid is ATTACKER_UID
  });
  assertTest(
    '3. Creation with mismatched userId (auth.uid != newData.userId) must be REJECTED',
    resMismatchedCreate.status === 401 || (resMismatchedCreate.body && resMismatchedCreate.body.error === 'Permission denied'),
    resMismatchedCreate
  );

  // -----------------------------------------------------------------
  // 4. AUTHORIZED CREATION BY AUTHENTICATED OWNER
  // -----------------------------------------------------------------
  const resValidCreate = await dbRequest({
    path: `/live_locations/${SHARE_ID}`,
    method: 'PUT',
    data: validSessionData,
    uid: OWNER_UID,
  });
  assertTest(
    '4. Authorized creation by authenticated owner must be ALLOWED',
    resValidCreate.ok && resValidCreate.status === 200,
    resValidCreate
  );

  // -----------------------------------------------------------------
  // 5. PUBLIC BROWSER-BASED READING VIA BEARER SHARE ID
  // -----------------------------------------------------------------
  console.log('\n[GROUP 2: Bearer URL Reading & Access Control]');

  const resPublicReadActive = await dbRequest({
    path: `/live_locations/${SHARE_ID}`,
    method: 'GET',
    uid: null, // Public read (unauthenticated emergency contact in browser)
  });
  assertTest(
    '5. Public browser read of active session via bearer share ID must be ALLOWED',
    resPublicReadActive.ok && resPublicReadActive.body && resPublicReadActive.body.latitude === 37.7749,
    resPublicReadActive
  );

  // -----------------------------------------------------------------
  // 6. UNAUTHORIZED MODIFICATION BY DIFFERENT USER (ATTACKER)
  // -----------------------------------------------------------------
  console.log('\n[GROUP 3: Session Modification & Tampering Security]');

  const resAttackerModify = await dbRequest({
    path: `/live_locations/${SHARE_ID}/latitude`,
    method: 'PUT',
    data: 0.0,
    uid: ATTACKER_UID, // Attacker trying to hijack location
  });
  assertTest(
    '6. Modification by different user (attacker) must be REJECTED',
    resAttackerModify.status === 401 || (resAttackerModify.body && resAttackerModify.body.error === 'Permission denied'),
    resAttackerModify
  );

  // -----------------------------------------------------------------
  // 7. UNAUTHORIZED MODIFICATION WITHOUT AUTH
  // -----------------------------------------------------------------
  const resUnauthModify = await dbRequest({
    path: `/live_locations/${SHARE_ID}/latitude`,
    method: 'PUT',
    data: 12.34,
    uid: null,
  });
  assertTest(
    '7. Modification without auth must be REJECTED',
    resUnauthModify.status === 401 || (resUnauthModify.body && resUnauthModify.body.error === 'Permission denied'),
    resUnauthModify
  );

  // -----------------------------------------------------------------
  // 8. AUTHORIZED TELEMETRY UPDATE BY SESSION OWNER
  // -----------------------------------------------------------------
  const resOwnerUpdate = await dbRequest({
    path: `/live_locations/${SHARE_ID}`,
    method: 'PATCH',
    data: {
      latitude: 37.7750,
      longitude: -122.4195,
      updatedAt: Date.now(),
    },
    uid: OWNER_UID,
  });
  assertTest(
    '8. Telemetry update by session owner must be ALLOWED',
    resOwnerUpdate.ok && resOwnerUpdate.status === 200,
    resOwnerUpdate
  );

  // -----------------------------------------------------------------
  // 9. UNAUTHORIZED REVOCATION BY ATTACKER
  // -----------------------------------------------------------------
  console.log('\n[GROUP 4: Revocation & Post-Revocation Data Privacy]');

  const resAttackerRevoke = await dbRequest({
    path: `/live_locations/${SHARE_ID}/status`,
    method: 'PUT',
    data: 'revoked',
    uid: ATTACKER_UID,
  });
  assertTest(
    '9. Revocation attempt by unauthorized attacker must be REJECTED',
    resAttackerRevoke.status === 401 || (resAttackerRevoke.body && resAttackerRevoke.body.error === 'Permission denied'),
    resAttackerRevoke
  );

  // -----------------------------------------------------------------
  // 10. AUTHORIZED REVOCATION BY SESSION OWNER
  // -----------------------------------------------------------------
  const resOwnerRevoke = await dbRequest({
    path: `/live_locations/${SHARE_ID}`,
    method: 'PATCH',
    data: {
      status: 'revoked',
      latitude: 0,
      longitude: 0,
      accuracy: null,
      updatedAt: Date.now(),
    },
    uid: OWNER_UID,
  });
  assertTest(
    '10. Revocation & telemetry purge by session owner must be ALLOWED',
    resOwnerRevoke.ok && resOwnerRevoke.status === 200,
    resOwnerRevoke
  );

  // -----------------------------------------------------------------
  // 11. POST-REVOCATION MODIFICATION ATTEMPT (EVEN BY OWNER)
  // -----------------------------------------------------------------
  const resPostRevokeModify = await dbRequest({
    path: `/live_locations/${SHARE_ID}/status`,
    method: 'PUT',
    data: 'active',
    uid: OWNER_UID, // Owner trying to resurrect revoked session
  });
  assertTest(
    '11. Modification of a revoked session must be permanently REJECTED',
    resPostRevokeModify.status === 401 || (resPostRevokeModify.body && resPostRevokeModify.body.error === 'Permission denied'),
    resPostRevokeModify
  );

  // -----------------------------------------------------------------
  // 12. POST-REVOCATION READ ATTEMPT (DO NOT EXPOSE LOCATION DATA)
  // -----------------------------------------------------------------
  const resPostRevokeRead = await dbRequest({
    path: `/live_locations/${SHARE_ID}`,
    method: 'GET',
    uid: null, // Browser viewer or anyone
  });
  assertTest(
    '12. Reading a revoked session must be REJECTED (Permission Denied)',
    resPostRevokeRead.status === 401 || (resPostRevokeRead.body && resPostRevokeRead.body.error === 'Permission denied'),
    resPostRevokeRead
  );

  // -----------------------------------------------------------------
  // 13. PRIVATE USER DATA ISOLATION (/users/$uid)
  // -----------------------------------------------------------------
  console.log('\n[GROUP 5: Private User Data Isolation (/users/$uid)]');

  // Owner writes their contacts
  const resOwnerWriteContacts = await dbRequest({
    path: `/users/${OWNER_UID}/contacts`,
    method: 'PUT',
    data: [{ id: '1', name: 'Mom', phone: '+1234567890' }],
    uid: OWNER_UID,
  });
  assertTest(
    '13. Owner writing private contacts to /users/$uid must be ALLOWED',
    resOwnerWriteContacts.ok && resOwnerWriteContacts.status === 200,
    resOwnerWriteContacts
  );

  // Attacker tries to read owner's contacts
  const resAttackerReadContacts = await dbRequest({
    path: `/users/${OWNER_UID}/contacts`,
    method: 'GET',
    uid: ATTACKER_UID,
  });
  assertTest(
    '14. Attacker reading owner private contacts must be REJECTED',
    resAttackerReadContacts.status === 401 || (resAttackerReadContacts.body && resAttackerReadContacts.body.error === 'Permission denied'),
    resAttackerReadContacts
  );

  // Attacker tries to modify owner's safety timer
  const resAttackerWriteTimer = await dbRequest({
    path: `/users/${OWNER_UID}/safety_timer`,
    method: 'PUT',
    data: { status: 'cancelled' },
    uid: ATTACKER_UID,
  });
  assertTest(
    '15. Attacker modifying owner safety timer must be REJECTED',
    resAttackerWriteTimer.status === 401 || (resAttackerWriteTimer.body && resAttackerWriteTimer.body.error === 'Permission denied'),
    resAttackerWriteTimer
  );

  // Unauthenticated user tries to read /users
  const resUnauthReadUsers = await dbRequest({
    path: `/users/${OWNER_UID}`,
    method: 'GET',
    uid: null,
  });
  assertTest(
    '16. Unauthenticated read of private /users data must be REJECTED',
    resUnauthReadUsers.status === 401 || (resUnauthReadUsers.body && resUnauthReadUsers.body.error === 'Permission denied'),
    resUnauthReadUsers
  );

  console.log('\n======================================================');
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${results.length - passedCount}`);
  console.log('======================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
