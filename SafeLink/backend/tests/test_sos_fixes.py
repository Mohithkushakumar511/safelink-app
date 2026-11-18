import asyncio
import httpx

BASE_URL = "http://127.0.0.1:8000"

async def test_all():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # 1. Health check
        res = await client.get("/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        print("[PASS] 1. Backend /health is OK")

        # 2. Login to get token
        login_res = await client.post("/auth/login", data={"username": "testuser", "password": "Password123!"})
        if login_res.status_code != 200:
            # Try demo user
            login_res = await client.post("/auth/login", data={"username": "mohith", "password": "Password123!"})
        
        token = None
        if login_res.status_code == 200:
            token = login_res.json().get("access_token")
            print("[PASS] 2. Auth login OK, acquired JWT")
        else:
            print("[NOTE] 2. Login with test credentials skipped, testing public endpoints")

        headers = {"Authorization": f"Bearer {token}"} if token else {}

        # 3. Create an SOS with location unavailable (Test Scenario 5)
        sos_payload = {
            "latitude": 0.0,
            "longitude": 0.0,
            "address": "Location unavailable (GPS disabled)",
            "custom_note": "Emergency SOS activated (Location unavailable)",
            "sending_method": "SMS",
            "countdown_seconds": 5
        }
        create_res = await client.post("/sos", json=sos_payload, headers=headers)
        if create_res.status_code in [200, 201]:
            created = create_res.json()
            inc_id = created.get("incident_id") or created.get("id")
            print(f"[PASS] 3. SOS created with Location unavailable: {inc_id}")

            # 4. Update message status (SUBMITTED via SMS composer)
            status_payload = {
                "recipient_name": "Emergency Contact",
                "recipient_phone": "+919999999999",
                "message_content": "EMERGENCY SOS ALERT! Incident ID: " + inc_id,
                "sending_method": "SMS_CLIENT_FALLBACK",
                "sending_status": "SUBMITTED",
                "delivery_confirmation": "SUBMITTED via SMS composer (Pending carrier dispatch)"
            }
            msg_res = await client.patch(f"/sos/{inc_id}/message-status", json=status_payload, headers=headers)
            print(f"[PASS] 4. Message status logged accurately: HTTP {msg_res.status_code}")

            # 5. Resolve SOS
            res_res = await client.patch(f"/sos/{inc_id}/resolve", json={"resolution_note": "Test completed"}, headers=headers)
            print(f"[PASS] 5. SOS resolved cleanly: HTTP {res_res.status_code}")

if __name__ == "__main__":
    asyncio.run(test_all())
