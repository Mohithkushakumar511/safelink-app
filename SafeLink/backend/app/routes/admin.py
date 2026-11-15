from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.schemas.admin import AdminDashboardStats, AdminUserResponse
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
        recent_incidents=recent_incidents
    )

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
