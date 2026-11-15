from typing import List, Optional
from pydantic import BaseModel
from app.schemas.user import UserProfileResponse
from app.schemas.sos import SOSIncidentResponse

class AdminDashboardStats(BaseModel):
    total_users: int
    total_incidents: int
    active_incidents: int
    cancelled_incidents: int
    resolved_incidents: int
    recent_incidents: List[SOSIncidentResponse]

class AdminUserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    status: str
    created_at: str
    phone_number: Optional[str] = None
