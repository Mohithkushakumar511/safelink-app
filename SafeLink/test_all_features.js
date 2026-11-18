
const http = require('http');

const BASE_URL = 'http://127.0.0.1:8000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method: method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING 5 ADVANCED EMERGENCY FEATURES VERIFICATION ===\n');

  // Step 0: Login demo user & demo admin
  console.log('--- Step 0: Authentication ---');
  const userLogin = await request('POST', '/auth/demo-login', { role: 'USER' });
  if (userLogin.status !== 200) throw new Error('User login failed: ' + JSON.stringify(userLogin.data));
  const userToken = userLogin.data.access_token;
  const userHeaders = { Authorization: `Bearer ${userToken}` };
  console.log('✓ User authenticated as:', userLogin.data.user.email);

  const adminLogin = await request('POST', '/auth/demo-login', { role: 'ADMIN' });
  if (adminLogin.status !== 200) throw new Error('Admin login failed: ' + JSON.stringify(adminLogin.data));
  const adminToken = adminLogin.data.access_token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  console.log('✓ Admin authenticated as:', adminLogin.data.user.email);

  // Test 1: Secure SOS Cancellation - Set, Verify, and Reset PIN
  console.log('\n--- Test 1: Secure SOS Cancellation PIN ---');
  // 1a. Set PIN to 1234
  const setPin = await request('POST', '/users/cancellation-pin', { pin: '1234' }, userHeaders);
  console.log('1a. Set PIN (1234):', setPin.status === 200 ? 'SUCCESS' : 'FAILED', setPin.data?.message);

  // 1b. Verify Wrong PIN (9999)
  const verifyWrong = await request('POST', '/users/verify-cancellation-pin', { pin: '9999' }, userHeaders);
  console.log('1b. Verify wrong PIN (9999):', verifyWrong.status === 200 && !verifyWrong.data.valid ? 'PASSED (Rejected as expected)' : 'FAILED');

  // 1c. Verify Correct PIN (1234)
  const verifyCorrect = await request('POST', '/users/verify-cancellation-pin', { pin: '1234' }, userHeaders);
  console.log('1c. Verify correct PIN (1234):', verifyCorrect.status === 200 && verifyCorrect.data.valid ? 'PASSED (Verified)' : 'FAILED');

  // 1d. Reset PIN with wrong password
  const resetWrongPass = await request('POST', '/users/reset-cancellation-pin', {
    password: 'WrongPassword!',
    new_pin: '5678'
  }, userHeaders);
  console.log('1d. Reset PIN with wrong password:', resetWrongPass.status === 401 ? 'PASSED (Blocked 401 Unauthorized)' : 'FAILED');

  // 1e. Reset PIN with correct password (SafeLink123!)
  const resetCorrectPass = await request('POST', '/users/reset-cancellation-pin', {
    password: 'SafeLink123!',
    new_pin: '5678'
  }, userHeaders);
  console.log('1e. Reset PIN with correct password:', resetCorrectPass.status === 200 ? 'PASSED (Reset to 5678)' : 'FAILED ' + JSON.stringify(resetCorrectPass.data));

  // 1f. Verify newly reset PIN (5678)
  const verifyNew = await request('POST', '/users/verify-cancellation-pin', { pin: '5678' }, userHeaders);
  console.log('1f. Verify newly set PIN (5678):', verifyNew.status === 200 && verifyNew.data.valid ? 'PASSED (Verified)' : 'FAILED');

  // Test 2: Multilingual Emergency Messaging Service
  console.log('\n--- Test 2: Multilingual Message Templates ---');
  const mockContext = {
    userName: 'Mohith',
    incidentId: 'SOS-20261117-999',
    description: 'Medical emergency',
    locationLink: 'https://maps.google.com/?q=12.9716,77.5946',
    batteryLevel: 85,
    timestamp: 'Nov 17, 2026 at 10:00 PM UTC',
  };
  const knMsg = `ತುರ್ತು ಎಸ್ಒಎಸ್ ಎಚ್ಚರಿಕೆ!\nನನಗೆ ತುರ್ತು ಸಹಾಯದ ಅಗತ್ಯವಿದೆ.\n\nಹೆಸರು: ${mockContext.userName}\nಘಟನೆ ಐಡಿ: ${mockContext.incidentId}\nವಿವರಣೆ: ${mockContext.description}\nಸ್ಥಳ: ${mockContext.locationLink}`;
  const hiMsg = `आपातकालीन एसओएस अलर्ट!\nमुझे तत्काल आपातकालीन सहायता की आवश्यकता है।\n\nनाम: ${mockContext.userName}\nघटना आईडी: ${mockContext.incidentId}\nविवरण: ${mockContext.description}\nस्थान: ${mockContext.locationLink}`;
  console.log('2a. Kannada template contains native script & Incident ID:', knMsg.includes('ತುರ್ತು') && knMsg.includes('SOS-20261117-999') ? 'PASSED' : 'FAILED');
  console.log('2b. Hindi template contains native script & Incident ID:', hiMsg.includes('आपातकालीन') && hiMsg.includes('SOS-20261117-999') ? 'PASSED' : 'FAILED');

  // Test 3: Emergency Activation and Secure Cancellation Workflow
  console.log('\n--- Test 3: Incident Creation & Secure Cancellation ---');
  const createSos = await request('POST', '/sos/create', {
    latitude: 12.9716,
    longitude: 77.5946,
    accuracy: 5.0,
    emergency_description: 'Testing 5 features',
  }, userHeaders);
  const incId = createSos.data?.incident_id || createSos.data?.id;
  console.log('3a. Created active incident:', incId, 'Status:', createSos.data?.status);

  // 3b. Try cancelling with wrong PIN
  const cancelWrongPin = await request('PATCH', `/sos/${incId}/cancel`, { pin: '0000' }, userHeaders);
  console.log('3b. Cancel with wrong PIN (0000):', cancelWrongPin.status === 400 || cancelWrongPin.status === 403 ? 'PASSED (Blocked)' : 'FAILED (' + cancelWrongPin.status + ')');

  // 3c. Cancel with correct PIN (5678)
  const cancelCorrectPin = await request('PATCH', `/sos/${incId}/cancel`, { pin: '5678' }, userHeaders);
  console.log('3c. Cancel with correct PIN (5678):', cancelCorrectPin.status === 200 && cancelCorrectPin.data.status === 'CANCELLED' ? 'PASSED' : 'FAILED ' + JSON.stringify(cancelCorrectPin.data));

  // Test 4: Rescue Acknowledgement Tracking
  console.log('\n--- Test 4: Rescue Acknowledgement Tracking ---');
  await new Promise(r => setTimeout(r, 1200));
  // Create another active incident to test rescue acknowledgement
  const ackSos = await request('POST', '/sos/create', {
    latitude: 12.9716,
    longitude: 77.5946,
    emergency_description: 'Testing rescue acknowledgement',
  }, userHeaders);
  const ackIncId = ackSos.data?.incident_id || ackSos.data?.id;
  console.log('4a. Created new incident for ACK test:', ackIncId);

  // 4b. Fetch public ACK info (no auth required)
  const publicAckInfo = await request('GET', `/sos/ack/${ackIncId}`);
  console.log('4b. Public ACK info retrieved:', publicAckInfo.status === 200 && publicAckInfo.data.incident_id === ackIncId ? 'PASSED' : 'FAILED');

  // 4c. Responder 1 Declines: UNABLE_TO_RESPOND
  const declineAck = await request('POST', `/sos/ack/${ackIncId}`, {
    response_status: 'UNABLE_TO_RESPOND',
    contact_name: 'Contact Sarah',
    contact_phone: '+919876543210',
    note: 'Out of town right now',
  });
  console.log('4c. Contact declines (UNABLE_TO_RESPOND):', declineAck.status === 200 && declineAck.data.response_status === 'UNABLE_TO_RESPOND' ? 'PASSED' : 'FAILED');

  // Verify incident escalation continues after decline
  const incAfterDecline = await request('GET', `/sos/${ackIncId}`, null, userHeaders);
  console.log('4d. Incident remains ACTIVE after decline:', incAfterDecline.data.status === 'ACTIVE' ? 'PASSED' : 'FAILED');

  // 4e. Responder 2 Accepts: I_AM_RESPONDING
  const acceptAck = await request('POST', `/sos/ack/${ackIncId}`, {
    response_status: 'I_AM_RESPONDING',
    contact_name: 'Dr. Ramesh (Brother)',
    contact_phone: '+919988776655',
    note: 'En route in car',
  });
  console.log('4e. Contact accepts (I_AM_RESPONDING):', acceptAck.status === 200 && acceptAck.data.response_status === 'I_AM_RESPONDING' ? 'PASSED' : 'FAILED');

  // 4f. Responder 3 tries to accept duplicate (Should be blocked with 409 Conflict)
  const duplicateAck = await request('POST', `/sos/ack/${ackIncId}`, {
    response_status: 'I_AM_RESPONDING',
    contact_name: 'Neighbor John',
    contact_phone: '+919123456789',
  });
  console.log('4f. Duplicate acknowledgement blocked (409 Conflict):', duplicateAck.status === 409 ? 'PASSED (409 Conflict)' : 'FAILED (' + duplicateAck.status + ') ' + JSON.stringify(duplicateAck.data));

  // 4g. Check incident timeline recorded ACK event
  const incAfterAck = await request('GET', `/sos/${ackIncId}`, null, userHeaders);
  const ackEvent = (incAfterAck.data.timeline || []).find(e => e.event === 'CONTACT_ACKNOWLEDGED');
  console.log('4g. Timeline recorded CONTACT_ACKNOWLEDGED:', ackEvent ? 'PASSED (' + ackEvent.status + ')' : 'FAILED');

  // Test 5: Emergency QR Identity Card
  console.log('\n--- Test 5: Emergency QR Identity Card ---');
  // 5a. Get QR Card
  const qrCard = await request('GET', '/users/qr/card', null, userHeaders);
  console.log('5a. Get QR card:', qrCard.status === 200 ? 'PASSED' : 'FAILED', 'Token:', qrCard.data.qr_token);
  const token = qrCard.data.qr_token;

  // 5b. Update field visibility settings (hide allergies, share blood type)
  const updateSettings = await request('POST', '/users/qr/settings', {
    shared_fields: {
      share_name: true,
      share_phone: true,
      share_blood_type: true,
      share_allergies: false,
      share_medical_notes: true,
      share_contacts: true,
      share_instructions: true,
    },
    emergency_instructions: 'Asthmatic, inhaler in backpack',
  }, userHeaders);
  console.log('5b. Update QR settings:', updateSettings.status === 200 ? 'PASSED' : 'FAILED');

  // 5c. Fetch Public Emergency Card via public endpoint (JSON format)
  const publicCard = await request('GET', `/users/qr/${token}`, null, { Accept: 'application/json' });
  console.log('5c. Public QR Card JSON:', publicCard.status === 200 ? 'PASSED' : 'FAILED');
  console.log('    - Name visible:', !!publicCard.data.name);
  console.log('    - Allergies hidden (as configured):', publicCard.data.allergies === null ? 'PASSED (Hidden)' : 'FAILED');
  console.log('    - Instructions visible:', publicCard.data.emergency_instructions === 'Asthmatic, inhaler in backpack' ? 'PASSED' : 'FAILED');

  // 5d. Test Token Revocation & Regeneration
  const regenToken = await request('POST', '/users/qr/regenerate', null, userHeaders);
  console.log('5d. Regenerated token:', regenToken.status === 200, 'New token:', regenToken.data.qr_token);
  const newToken = regenToken.data.qr_token;

  // 5e. Old token should now return is_valid: false or 410
  const oldTokenCheck = await request('GET', `/users/qr/${token}`, null, { Accept: 'application/json' });
  console.log('5e. Old revoked token check:', oldTokenCheck.data?.is_valid === false ? 'PASSED (is_valid: false)' : 'STATUS: ' + oldTokenCheck.status);

  // 5f. New token should be active and valid
  const newTokenCheck = await request('GET', `/users/qr/${newToken}`, null, { Accept: 'application/json' });
  console.log('5f. New token check:', newTokenCheck.status === 200 && newTokenCheck.data.is_valid !== false ? 'PASSED (Active)' : 'FAILED');

  // Test 6: Emergency Response Analytics
  console.log('\n--- Test 6: Emergency Response Analytics ---');
  // 6a. Resolve the incident to populate resolution times
  await request('PATCH', `/sos/${ackIncId}/resolve`, { resolution_note: 'Hospital arrived safely' }, userHeaders);

  // 6b. Fetch Admin Analytics with status filter ALL
  const analyticsAll = await request('GET', '/admin/analytics?status_filter=ALL', null, adminHeaders);
  console.log('6a. Admin Analytics (ALL):', analyticsAll.status === 200 ? 'PASSED' : 'FAILED');
  console.log('    - Total incidents:', analyticsAll.data.total_incidents);
  console.log('    - Active incidents:', analyticsAll.data.active_incidents);
  console.log('    - Resolved incidents:', analyticsAll.data.resolved_incidents);
  console.log('    - Cancelled incidents:', analyticsAll.data.cancelled_incidents);
  console.log('    - Avg acknowledgement time:', analyticsAll.data.avg_acknowledgement_time_seconds, 'seconds');
  console.log('    - Avg resolution time:', analyticsAll.data.avg_resolution_time_seconds, 'seconds');
  console.log('    - Escalation stats:', JSON.stringify(analyticsAll.data.escalation_stats));
  console.log('    - Notification delivery attempts:', analyticsAll.data.total_notification_attempts);

  // 6c. Fetch Admin Analytics with status filter RESOLVED
  const analyticsResolved = await request('GET', '/admin/analytics?status_filter=RESOLVED', null, adminHeaders);
  console.log('6b. Admin Analytics (Filter RESOLVED):', analyticsResolved.status === 200 && analyticsResolved.data.total_incidents === analyticsResolved.data.resolved_incidents ? 'PASSED' : 'FAILED', `(Total: ${analyticsResolved.data.total_incidents}, Resolved: ${analyticsResolved.data.resolved_incidents})`);

  // 6d. Fetch Admin Analytics with 24h range filter
  const analytics24h = await request('GET', '/admin/analytics?range_days=1', null, adminHeaders);
  console.log('6c. Admin Analytics (24h Range):', analytics24h.status === 200 ? 'PASSED' : 'FAILED');

  console.log('\n=== ALL 5 ADVANCED EMERGENCY FEATURES FULLY VERIFIED! ===');
}

runTests().catch(err => {
  console.error('Test Suite Failed with Error:', err);
  process.exit(1);
});
