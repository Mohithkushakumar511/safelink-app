from typing import Optional
from pydantic import BaseModel, EmailStr

class UserProfileResponse(BaseModel):
    id: str
    email: EmailStr
    name: str
    display_name: str
    phone_number: Optional[str] = None
    role: str = "USER"
    status: str = "ACTIVE"
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    medical_notes: Optional[str] = None
    existing_conditions: Optional[str] = None
    medications: Optional[str] = None
    share_medical_with_sos: Optional[bool] = False
    created_at: str
    updated_at: Optional[str] = None

class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    medical_notes: Optional[str] = None
    existing_conditions: Optional[str] = None
    medications: Optional[str] = None
    share_medical_with_sos: Optional[bool] = None
