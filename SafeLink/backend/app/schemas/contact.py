from typing import Optional
from pydantic import BaseModel, Field

class ContactCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=3, max_length=25)
    relationship: Optional[str] = Field("Emergency Responder", max_length=50)
    is_default: Optional[bool] = False

class ContactUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    relationship: Optional[str] = None
    is_default: Optional[bool] = None

class ContactResponse(BaseModel):
    id: str
    user_id: str
    name: str
    phone: str
    relationship: str
    is_default: bool
    created_at: str
    updated_at: Optional[str] = None
