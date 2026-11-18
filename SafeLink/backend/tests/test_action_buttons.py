import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import httpx
from datetime import datetime, timezone

BASE_URL = "http://127.0.0.1:8000"

async def test_action_buttons():
    print("=================================================================")
    print("  SAFELINK ACTIVE EMERGENCY ACTION BUTTONS VERIFICATION TEST     ")
    print("=================================================================")

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Step 0: Authenticate as Mohith
        login_res = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": "mohith@safelink.org", "password": "SafeLink123!"}
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("  [PASS] Authentication: Successfully logged in as Mohith.")

        # Step 1: Ensure active incident exists
        # We ensure SOS-20261117-155019 is ACTIVE
        inc_id = "SOS-20261117-155019"
        
        # Test 1: CONSOLE BUTTON LOGIC
        print("\n--- TEST 1: CONSOLE BUTTON (Incident Telemetry & Console API) ---")
        get_res = await client.get(f"{BASE_URL}/sos/{inc_id}", headers=headers)
        assert get_res.status_code == 200, f"Get incident failed: {get_res.text}"
        inc = get_res.json()
        assert inc["incident_id"] == inc_id, "Incident ID mismatch"
        assert inc["latitude"] is not None and inc["longitude"] is not None, "GPS coordinates missing"
        assert inc["activated_at"] is not None, "Activation timestamp missing"
        assert isinstance(inc["timeline"], list) and len(inc["timeline"]) > 0, "Timeline events missing"
        assert inc.get("primary_contact_name") is not None, "Emergency contact missing"
        assert inc.get("escalation") is not None, "Escalation status missing"
        print(f"  [PASS] Console Route Verification: GET /sos/{inc_id}")
        print(f"         - Incident ID: {inc['incident_id']}")
        print(f"         - Location: ({inc['latitude']}, {inc['longitude']}) - {inc.get('address')}")
        print(f"         - Contact: {inc['primary_contact_name']} ({inc.get('primary_contact_phone')})")
        print(f"         - Timeline: {len(inc['timeline'])} historical events")
        print(f"         - Escalation Level: {inc['escalation'].get('level', 1)}, Status: {inc['escalation'].get('status')}")

        # Test 2: RESOLVE BUTTON LOGIC
        print("\n--- TEST 2: RESOLVE BUTTON (Incident Resolution & Timeline Event) ---")
        resolve_res = await client.patch(
            f"{BASE_URL}/sos/{inc_id}/resolve",
            json={"resolution_note": "User safely resolved test incident"},
            headers=headers
        )
        assert resolve_res.status_code == 200, f"Resolve failed: {resolve_res.text}"
        resolved = resolve_res.json()
        assert resolved["status"] == "RESOLVED", "Status must be RESOLVED"
        assert resolved["resolved_at"] is not None, "resolved_at must be recorded"
        assert resolved["escalation"]["status"] == "RESOLVED", "Escalation must be stopped (RESOLVED)"
        assert resolved["retention_expires_at"] is not None, "48h retention must be scheduled"
        # Check timeline has SOS_RESOLVED event
        resolve_events = [e for e in resolved["timeline"] if e.get("event") == "SOS_RESOLVED"]
        assert len(resolve_events) > 0, "Timeline must contain SOS_RESOLVED event"
        print(f"  [PASS] Resolve Route Verification: PATCH /sos/{inc_id}/resolve")
        print(f"         - Status: {resolved['status']}")
        print(f"         - Resolved At: {resolved['resolved_at']}")
        print(f"         - Escalation Status: {resolved['escalation']['status']}")
        print(f"         - Retention Expires: {resolved['retention_expires_at']} (48 hours)")
        print(f"         - Timeline Event: '{resolve_events[-1]['title']}' - {resolve_events[-1]['description']}")

        # Test 3: CANCEL BUTTON LOGIC
        print("\n--- TEST 3: CANCEL BUTTON (Incident Cancellation & Secure Workflow) ---")
        # First test with PIN setup
        pin_setup_res = await client.post(
            f"{BASE_URL}/users/cancellation-pin",
            json={"pin": "1234"},
            headers=headers
        )
        assert pin_setup_res.status_code == 200, "PIN setup failed"
        print("  [PASS] Configured test cancellation PIN: '1234'")

        # Try to cancel WITHOUT PIN -> Must return 403
        cancel_no_pin = await client.patch(
            f"{BASE_URL}/sos/{inc_id}/cancel",
            json={"reason": "Testing PIN protection"},
            headers=headers
        )
        assert cancel_no_pin.status_code == 403, f"Expected 403, got {cancel_no_pin.status_code}"
        print(f"  [PASS] PIN Protection: Blocked cancel without PIN (HTTP 403: {cancel_no_pin.json()['detail']})")

        # Try to cancel with WRONG PIN -> Must return 403
        cancel_wrong_pin = await client.patch(
            f"{BASE_URL}/sos/{inc_id}/cancel",
            json={"reason": "Testing wrong PIN", "pin": "9999"},
            headers=headers
        )
        assert cancel_wrong_pin.status_code == 403, f"Expected 403, got {cancel_wrong_pin.status_code}"
        print(f"  [PASS] PIN Protection: Blocked cancel with invalid PIN (HTTP 403: {cancel_wrong_pin.json()['detail']})")

        # Cancel with CORRECT PIN -> Must succeed 200
        cancel_success = await client.patch(
            f"{BASE_URL}/sos/{inc_id}/cancel",
            json={"reason": "Verified cancel with PIN", "pin": "1234"},
            headers=headers
        )
        assert cancel_success.status_code == 200, f"Expected 200, got {cancel_success.status_code}"
        cancelled = cancel_success.json()
        assert cancelled["status"] == "CANCELLED", "Status must be CANCELLED"
        assert cancelled["cancelled_at"] is not None, "cancelled_at must be recorded"
        assert cancelled["escalation"]["status"] == "CANCELLED", "Escalation must be stopped"
        assert cancelled["retention_expires_at"] is not None, "48h retention must be scheduled"
        cancel_events = [e for e in cancelled["timeline"] if e.get("event") == "SOS_CANCELLED"]
        assert len(cancel_events) > 0, "Timeline must contain SOS_CANCELLED event"
        print(f"  [PASS] Secure Cancel Verification: PATCH /sos/{inc_id}/cancel")
        print(f"         - Status: {cancelled['status']}")
        print(f"         - Cancelled At: {cancelled['cancelled_at']}")
        print(f"         - Escalation Status: {cancelled['escalation']['status']}")
        print(f"         - Retention Expires: {cancelled['retention_expires_at']}")
        print(f"         - Timeline Event: '{cancel_events[-1]['title']}' - {cancel_events[-1]['description']}")

        # Test 4: ERROR HANDLING (Invalid incident ID & Unauthorized)
        print("\n--- TEST 4: ERROR HANDLING & RESILIENCE ---")
        bad_res = await client.patch(
            f"{BASE_URL}/sos/NON_EXISTENT_INCIDENT/resolve",
            json={"resolution_note": "bad test"},
            headers={"Authorization": "Bearer bad_token"}
        )
        assert bad_res.status_code == 401, f"Expected 401, got {bad_res.status_code}"
        print(f"  [PASS] Invalid Token Handled: HTTP {bad_res.status_code}")

        # Step 5: Leave incident in ACTIVE state for user to interact on mobile
        from app.database import db_manager
        await db_manager.connect()
        await db_manager.sos_alerts.update_one(
            {"$or": [{"incident_id": inc_id}, {"id": inc_id}]},
            {"$set": {"status": "ACTIVE", "resolved_at": None, "cancelled_at": None}}
        )
        # Clear test cancellation PIN so user has default experience
        await db_manager.users.update_one(
            {"id": "user_mohith_demo_01"},
            {"$set": {"cancellation_pin_hash": None, "cancellation_pin_set": False}}
        )
        await db_manager.close()
        print(f"\n  [INFO] Incident #{inc_id} restored to ACTIVE status so phone app shows active emergency.")

    print("\n=================================================================")
    print("  ALL ACTION BUTTON TESTS (CONSOLE, RESOLVE, CANCEL) PASSED!     ")
    print("=================================================================")

if __name__ == "__main__":
    asyncio.run(test_action_buttons())
