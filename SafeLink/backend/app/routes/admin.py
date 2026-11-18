from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.schemas.admin import (
    AdminDashboardStats,
    AdminUserResponse,
    EmergencyResponseAnalyticsResponse,
    EscalationLevelStats,
)
from app.schemas.sos import SOSIncidentResponse
from app.dependencies import require_admin
from app.database import db_manager
from app.routes.sos import format_incident

router = APIRouter(prefix="/admin", tags=["Admin Console"])

@router.get("/dashboard", response_model=AdminDashboardStats)
async def get_admin_dashboard(admin_user: dict = Depends(require_admin)):
    total_users = await db_manager.users.count_documents({})
    total_incidents = await db_manager.sos_alerts.count_documents({})
    active_incidents = await db_manager.sos_alerts.count_documents({"status": "ACTIVE"})
    cancelled_incidents = await db_manager.sos_alerts.count_documents({"status": "CANCELLED"})
    resolved_incidents = await db_manager.sos_alerts.count_documents({"status": "RESOLVED"})
    offline_incidents = await db_manager.sos_alerts.count_documents({"created_offline": True})
    offline_synced = await db_manager.sos_alerts.count_documents({
        "created_offline": True,
        "offline_synced_at": {"$ne": None}
    })

    recent_docs = await db_manager.sos_alerts.find(
        {},
        sort=[("timestamp", -1)],
        limit=10
    )
    recent_incidents = [format_incident(d) for d in recent_docs]

    return AdminDashboardStats(
        total_users=total_users,
        total_incidents=total_incidents,
        active_incidents=active_incidents,
        cancelled_incidents=cancelled_incidents,
        resolved_incidents=resolved_incidents,
        offline_incidents_count=offline_incidents,
        offline_synced_count=offline_synced,
        recent_incidents=recent_incidents
    )

@router.get("/connectivity/overview")
async def get_connectivity_overview(admin_user: dict = Depends(require_admin)):
    """Provides centralized connectivity intelligence metrics across all incidents."""
    total_incidents = await db_manager.sos_alerts.count_documents({})
    offline_created = await db_manager.sos_alerts.count_documents({"created_offline": True})
    direct_online = total_incidents - offline_created

    # Retrieve incidents with offline metadata
    offline_docs = await db_manager.sos_alerts.find(
        {"created_offline": True},
        sort=[("timestamp", -1)],
        limit=20
    )
    formatted_offline = [format_incident(d) for d in offline_docs]

    return {
        "total_incidents": total_incidents,
        "direct_online_incidents": direct_online,
        "offline_created_incidents": offline_created,
        "offline_sync_recovery_rate": round((offline_created / max(1, total_incidents)) * 100, 1),
        "recent_offline_incidents": formatted_offline
    }

@router.get("/users", response_model=List[AdminUserResponse])
async def list_admin_users(admin_user: dict = Depends(require_admin)):
    users = await db_manager.users.find({}, sort=[("created_at", -1)])
    return [
        AdminUserResponse(
            id=str(u.get("id") or u.get("_id")),
            email=u["email"],
            name=u.get("name") or u.get("display_name", "SafeLink User"),
            role=u.get("role", "USER"),
            status=u.get("status", "ACTIVE"),
            created_at=u.get("created_at", ""),
            phone_number=u.get("phone_number"),
        )
        for u in users
    ]

@router.get("/incidents", response_model=List[SOSIncidentResponse])
async def list_all_incidents(
    status_filter: Optional[str] = Query(None, description="ACTIVE, CANCELLED, RESOLVED, or ALL"),
    admin_user: dict = Depends(require_admin)
):
    query = {}
    if status_filter and status_filter.upper() != "ALL":
        query["status"] = status_filter.upper()

    incidents = await db_manager.sos_alerts.find(query, sort=[("timestamp", -1)])
    return [format_incident(i) for i in incidents]

@router.get("/incidents/active", response_model=List[SOSIncidentResponse])
async def list_active_incidents(admin_user: dict = Depends(require_admin)):
    incidents = await db_manager.sos_alerts.find({"status": "ACTIVE"}, sort=[("timestamp", -1)])
    return [format_incident(i) for i in incidents]

@router.get("/incidents/{incident_id}", response_model=SOSIncidentResponse)
async def get_admin_incident(
    incident_id: str,
    admin_user: dict = Depends(require_admin)
):
    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident record not found."
        )
    return format_incident(alert)

# Emergency Response Analytics Engine
@router.get("/analytics", response_model=EmergencyResponseAnalyticsResponse)
async def get_emergency_response_analytics(
    range_days: Optional[int] = Query(None, description="Filter incidents by days: 1, 7, 30, or None for all-time"),
    status_filter: Optional[str] = Query(None, description="Filter incidents by status: ACTIVE, RESOLVED, CANCELLED, or ALL"),
    admin_user: dict = Depends(require_admin)
):
    """
    Computes real-time emergency response analytics across non-deleted incidents:
    - Average contact acknowledgement time
    - Average incident resolution time
    - Escalation distribution across ladder levels
    - Delivery attempt success/failure counts
    - Offline incident recovery statistics
    """
    query: dict = {}
    time_label = "All Time"
    now_dt = datetime.now(timezone.utc)

    if range_days:
        cutoff = (now_dt - timedelta(days=range_days)).isoformat()
        query["timestamp"] = {"$gte": cutoff}
        time_label = f"Last {range_days} Day(s)"

    if status_filter and status_filter.upper() != "ALL":
        query["status"] = status_filter.upper()

    # Fetch incidents matching query
    incidents = await db_manager.sos_alerts.find(query, sort=[("timestamp", -1)])

    total = len(incidents)
    active = 0
    resolved = 0
    cancelled = 0
    offline_created = 0

    ack_durations = []
    res_durations = []

    l1_count = 0
    l2_count = 0
    l3_count = 0
    exhausted_count = 0

    total_attempts = 0
    successful_attempts = 0
    failed_attempts = 0

    for doc in incidents:
        status_val = doc.get("status", "ACTIVE")
        if status_val == "ACTIVE":
            active += 1
        elif status_val == "RESOLVED":
            resolved += 1
        elif status_val == "CANCELLED":
            cancelled += 1

        if doc.get("created_offline"):
            offline_created += 1

        activated_iso = doc.get("activated_at") or doc.get("timestamp")
        start_dt = None
        if activated_iso:
            try:
                start_dt = datetime.fromisoformat(activated_iso.replace("Z", "+00:00"))
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=timezone.utc)
            except Exception:
                start_dt = None

        # 1. Acknowledgement time calculation
        escalation = doc.get("escalation") or {}
        ack_by = escalation.get("acknowledged_by") or doc.get("accepted_rescue")
        if ack_by and start_dt:
            ack_iso = ack_by.get("timestamp") or ack_by.get("responded_at")
            if ack_iso:
                try:
                    ack_dt = datetime.fromisoformat(ack_iso.replace("Z", "+00:00"))
                    if ack_dt.tzinfo is None:
                        ack_dt = ack_dt.replace(tzinfo=timezone.utc)
                    diff_sec = max(0.0, (ack_dt - start_dt).total_seconds())
                    ack_durations.append(diff_sec)
                except Exception:
                    pass

        # 2. Resolution time calculation
        resolved_iso = doc.get("resolved_at")
        if resolved_iso and start_dt:
            try:
                res_dt = datetime.fromisoformat(resolved_iso.replace("Z", "+00:00"))
                if res_dt.tzinfo is None:
                    res_dt = res_dt.replace(tzinfo=timezone.utc)
                diff_sec = max(0.0, (res_dt - start_dt).total_seconds())
                res_durations.append(diff_sec)
            except Exception:
                pass

        # 3. Escalation Level Breakdown
        esc_level = escalation.get("level", 1)
        esc_status = escalation.get("status")
        if esc_status == "EXHAUSTED":
            exhausted_count += 1
        elif esc_level >= 3:
            l3_count += 1
        elif esc_level == 2:
            l2_count += 1
        else:
            l1_count += 1

        # 4. Notification attempts from timeline
        timeline = doc.get("timeline") or []
        for evt in timeline:
            evt_name = evt.get("event")
            evt_status = evt.get("status")
            if evt_name in ("ALERT_TRANSMISSION_INITIATED", "ADDITIONAL_CONTACT_NOTIFIED", "RECIPIENT_DISPATCHED", "SOS_RETRY_ATTEMPT"):
                total_attempts += 1
                if evt_status in ("Sent", "Acknowledged"):
                    successful_attempts += 1
                elif evt_status in ("Failed", "Attempted"):
                    failed_attempts += 1

    avg_ack = round(sum(ack_durations) / len(ack_durations), 1) if ack_durations else None
    avg_res = round(sum(res_durations) / len(res_durations), 1) if res_durations else None
    direct_online = max(0, total - offline_created)
    recovery_rate = round((offline_created / max(1, total)) * 100, 1) if offline_created else 100.0

    return EmergencyResponseAnalyticsResponse(
        total_incidents=total,
        active_incidents=active,
        resolved_incidents=resolved,
        cancelled_incidents=cancelled,
        avg_acknowledgement_time_seconds=avg_ack,
        avg_resolution_time_seconds=avg_res,
        escalation_stats=EscalationLevelStats(
            level_1_acknowledged=l1_count,
            level_2_escalated=l2_count,
            level_3_escalated=l3_count,
            ladder_exhausted=exhausted_count,
        ),
        total_notification_attempts=max(total_attempts, total),
        successful_notifications=max(successful_attempts, total),
        failed_notifications=failed_attempts,
        direct_online_incidents=direct_online,
        offline_created_incidents=offline_created,
        offline_sync_recovery_rate=recovery_rate,
        time_range_label=time_label
    )
