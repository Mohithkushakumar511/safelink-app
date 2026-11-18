import asyncio
import sys
import httpx

BASE_URL = "http://127.0.0.1:8001"
LAN_URL = "http://192.168.1.6:8001"

async def test_all():
    print(f"Testing SafeLink API on {BASE_URL} and {LAN_URL}...")
    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1. Health check on localhost
        r = await client.get(f"{BASE_URL}/health")
        assert r.status_code == 200, f"/health failed: {r.status_code}"
        health = r.json()
        print(f"  [PASS] GET /health (Localhost): {health}")

        # 2. Health check on LAN IP
        r = await client.get(f"{LAN_URL}/health")
        assert r.status_code == 200, f"/health (LAN) failed: {r.status_code}"
        print(f"  [PASS] GET /health (LAN 192.168.1.6): {r.json()}")

        # 3. Login test
        login_payload = {
            "email": "mohith@safelink.org",
            "password": "SafeLink123!"
        }
        r = await client.post(f"{BASE_URL}/auth/login", json=login_payload)
        assert r.status_code == 200, f"/auth/login failed: {r.status_code} {r.text}"
        login_data = r.json()
        token = login_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f"  [PASS] POST /auth/login: User authenticated successfully.")

        # 4. Auth Me test
        r = await client.get(f"{BASE_URL}/auth/me", headers=headers)
        assert r.status_code == 200, f"/auth/me failed: {r.status_code}"
        print(f"  [PASS] GET /auth/me: User profile fetched ({r.json()['name']}).")

        # 5. Contacts API test
        r = await client.get(f"{BASE_URL}/contacts", headers=headers)
        assert r.status_code == 200, f"/contacts failed: {r.status_code}"
        contacts = r.json()
        print(f"  [PASS] GET /contacts: {len(contacts)} contacts found.")

        # 6. Location Update test
        loc_payload = {
            "latitude": 12.806216,
            "longitude": 74.878172,
            "accuracy": 5.0,
            "speed": 0.0
        }
        r = await client.post(f"{BASE_URL}/location/update", json=loc_payload, headers=headers)
        assert r.status_code == 200, f"/location/update failed: {r.status_code}"
        print(f"  [PASS] POST /location/update: GPS coordinates ingested.")

        # 7. SOS History test
        r = await client.get(f"{BASE_URL}/sos/history", headers=headers)
        assert r.status_code == 200, f"/sos/history failed: {r.status_code}"
        history = r.json()
        print(f"  [PASS] GET /sos/history: {len(history)} incident records.")

        # 8. Admin Analytics test (Mohith is an admin as well)
        admin_login = {
            "email": "admin@safelink.org",
            "password": "AdminSafeLink123!"
        }
        r = await client.post(f"{BASE_URL}/auth/login", json=admin_login)
        assert r.status_code == 200, f"Admin login failed: {r.status_code}"
        admin_token = r.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        r = await client.get(f"{BASE_URL}/admin/analytics?range_days=7", headers=admin_headers)
        assert r.status_code == 200, f"/admin/analytics failed: {r.status_code}"
        analytics = r.json()
        print(f"  [PASS] GET /admin/analytics: Total incidents: {analytics['total_incidents']}, Avg Resolution: {analytics['avg_resolution_time_seconds']}s")

    print("\nALL BACKEND API VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_all())
