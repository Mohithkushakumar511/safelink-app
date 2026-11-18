from typing import List, Optional
from pydantic import BaseModel
from app.schemas.sos import SOSIncidentResponse

class AdminDashboardStats(BaseModel):
    total_users: int
    total_incidents: int
    active_incidents: int
    cancelled_incidents: int
    resolved_incidents: int
    offline_incidents_count: Optional[int] = 0
    offline_synced_count: Optional[int] = 0
    recent_incidents: List[SOSIncidentResponse]

class AdminUserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    status: str
    created_at: str
    phone_number: Optional[str] = None

class EscalationLevelStats(BaseModel):
    level_1_acknowledged: int = 0
    level_2_escalated: int = 0
    level_3_escalated: int = 0
    ladder_exhausted: int = 0

class EmergencyResponseAnalyticsResponse(BaseModel):
    total_incidents: int
    active_incidents: int
    resolved_incidents: int
    cancelled_incidents: int
    avg_acknowledgement_time_seconds: Optional[float] = None
    avg_resolution_time_seconds: Optional[float] = None
    escalation_stats: EscalationLevelStats
    total_notification_attempts: int
    successful_notifications: int
    failed_notifications: int
    direct_online_incidents: int
    offline_created_incidents: int
    offline_sync_recovery_rate: float
    time_range_label: str = "All Time"
