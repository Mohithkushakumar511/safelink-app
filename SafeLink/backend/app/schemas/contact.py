from typing import Optional, List
from pydantic import BaseModel, Field

class ContactCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=3, max_length=25)
    relationship: Optional[str] = Field("Emergency Responder", max_length=50)
    is_default: Optional[bool] = False
    priority: Optional[int] = Field(1, ge=1, le=10, description="Escalation priority: 1 = Primary, 2 = Secondary, 3 = Tertiary")

class ContactUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    relationship: Optional[str] = None
    is_default: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=1, le=10)

class ContactPriorityItem(BaseModel):
    id: str
    priority: int = Field(..., ge=1, le=10)

class ContactReorderRequest(BaseModel):
    orders: List[ContactPriorityItem]

class EscalationSettingsPayload(BaseModel):
    auto_escalation_enabled: bool = True
    escalation_timeout_seconds: int = Field(120, ge=30, le=600, description="Timeout in seconds before escalating to next contact")

class ContactResponse(BaseModel):
    id: str
    user_id: str
    name: str
    phone: str
    relationship: str
    is_default: bool
    priority: int = 1
    created_at: str
    updated_at: Optional[str] = None
