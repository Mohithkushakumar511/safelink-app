import asyncio
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.schemas.sos import SOSCreateRequest, SOSIncidentResponse
from app.schemas.admin import AdminDashboardStats
from app.services.retention_worker import compute_retention_info, RETENTION_PERIOD_HOURS

def test_schemas():
    print("--- [TEST 1] Testing Pydantic Schemas for Offline Connectivity ---")
    req = SOSCreateRequest(
        latitude=12.9716,
        longitude=77.5946,
        accuracy=8.5,
        address="Bangalore Central",
        custom_note="Offline SOS test",
        offline_incident_id="OFFLINE-SOS-1700000000000",
        activated_at="2026-11-17T15:00:00+00:00",
        created_offline=True,
        retry_count=3,
        connectivity_method="OFFLINE_SMS"
    )
    assert req.offline_incident_id == "OFFLINE-SOS-1700000000000"
    assert req.created_offline is True
    assert req.retry_count == 3
    print("✓ SOSCreateRequest schema validated successfully.")

    stats = AdminDashboardStats(
        total_users=5,
        total_incidents=10,
        active_incidents=1,
        cancelled_incidents=3,
        resolved_incidents=6,
        offline_incidents_count=4,
        offline_synced_count=4,
        recent_incidents=[]
    )
    assert stats.offline_incidents_count == 4
    assert stats.offline_synced_count == 4
    print("✓ AdminDashboardStats with offline counters validated successfully.")

def test_retention_logic():
    print("\n--- [TEST 2] Testing 48-Hour Retention Logic ---")
    now = datetime.now(timezone.utc)

    # 1. Active incident older than 72 hours MUST NEVER expire
    active_old = {
        "id": "inc_active_old",
        "status": "ACTIVE",
        "activated_at": (now - timedelta(hours=72)).isoformat(),
        "timestamp": (now - timedelta(hours=72)).isoformat(),
        "resolved_at": None,
        "cancelled_at": None,
    }
    exp_at, hrs_rem = compute_retention_info(active_old, now)
    assert exp_at is None, "Active incidents must have no expiration"
    assert hrs_rem is None, "Active incidents must have no retention hours remaining"
    print("✓ Active incident older than 72 hours: Expiration is None (NEVER deleted while ACTIVE).")

    # 2. Resolved incident resolved 2 hours ago: must have ~46 hours remaining
    resolved_fresh = {
        "id": "inc_res_fresh",
        "status": "RESOLVED",
        "activated_at": (now - timedelta(hours=10)).isoformat(),
        "resolved_at": (now - timedelta(hours=2)).isoformat(),
    }
    exp_at, hrs_rem = compute_retention_info(resolved_fresh, now)
    assert exp_at is not None
    assert 45.0 <= hrs_rem <= 46.5, f"Expected ~46h remaining, got {hrs_rem}"
    print(f"✓ Resolved incident concluded 2h ago: {hrs_rem}h retention remaining.")

    # 3. Resolved incident resolved 49 hours ago: expired
    resolved_overdue = {
        "id": "inc_res_overdue",
        "status": "RESOLVED",
        "activated_at": (now - timedelta(hours=60)).isoformat(),
        "resolved_at": (now - timedelta(hours=49)).isoformat(),
    }
    exp_at, hrs_rem = compute_retention_info(resolved_overdue, now)
    assert hrs_rem == 0.0, "Expected 0.0 hours remaining for overdue incident"
    print("✓ Resolved incident concluded 49h ago: Correctly identified as expired (0.0h remaining).")

    # 4. Cancelled incident cancelled 1 hour ago: must have ~47 hours remaining
    cancelled_fresh = {
        "id": "inc_canc_fresh",
        "status": "CANCELLED",
        "activated_at": (now - timedelta(hours=2)).isoformat(),
        "cancelled_at": (now - timedelta(hours=1)).isoformat(),
    }
    exp_at, hrs_rem = compute_retention_info(cancelled_fresh, now)
    assert 46.5 <= hrs_rem <= 47.5, f"Expected ~47h remaining, got {hrs_rem}"
    print(f"✓ Cancelled incident cancelled 1h ago: {hrs_rem}h retention remaining.")

async def test_offline_incident_flow():
    print("\n--- [TEST 3] Testing Offline Incident Formatting & Timelines ---")
    from app.routes.sos import format_incident

    now_iso = datetime.now(timezone.utc).isoformat()
    offline_doc = {
        "_id": "test_offline_obj_id",
        "id": "test_offline_obj_id",
        "incident_id": "SOS-20261117-153000",
        "offline_incident_id": "OFFLINE-SOS-1700000000000",
        "created_offline": True,
        "offline_synced_at": now_iso,
        "retry_count": 2,
        "connectivity_status": "OFFLINE_SYNCED",
        "user_id": "user123",
        "user_name": "Test User",
        "status": "ACTIVE",
        "activated_at": "2026-11-17T15:00:00+00:00",
        "timestamp": "2026-11-17T15:00:00+00:00",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "accuracy": 12.0,
        "timeline": [
            {
                "id": "evt1",
                "incident_id": "SOS-20261117-153000",
                "event": "SOS_ACTIVATED",
                "title": "SOS Activated (Offline Mode)",
                "description": "Triggered offline, dispatched via SMS.",
                "timestamp": "2026-11-17T15:00:00+00:00",
                "status": "Sent"
            },
            {
                "id": "evt2",
                "incident_id": "SOS-20261117-153000",
                "event": "OFFLINE_SYNCED",
                "title": "Cloud Synchronization Established",
                "description": "Synced after 2 attempts.",
                "timestamp": now_iso,
                "status": "Sent"
            }
        ]
    }

    formatted = format_incident(offline_doc)
    assert formatted["created_offline"] is True
    assert formatted["offline_incident_id"] == "OFFLINE-SOS-1700000000000"
    assert formatted["connectivity_status"] == "OFFLINE_SYNCED"
    assert formatted["retry_count"] == 2
    assert formatted["activated_at"] == "2026-11-17T15:00:00+00:00"
    assert len(formatted["timeline"]) == 2
    print("✓ Offline incident formatting preserved original activation timestamp and offline metadata.")

if __name__ == "__main__":
    test_schemas()
    test_retention_logic()
    asyncio.run(test_offline_incident_flow())
    print("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!")
