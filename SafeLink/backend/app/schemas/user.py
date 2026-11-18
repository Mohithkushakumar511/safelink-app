from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr, Field

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
    auto_escalation_enabled: Optional[bool] = True
    escalation_timeout_seconds: Optional[int] = 120
    cancellation_pin_set: Optional[bool] = False
    qr_token: Optional[str] = None
    qr_shared_fields: Optional[Dict[str, bool]] = None
    language_preference: Optional[str] = "en"
    emergency_instructions: Optional[str] = None
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
    auto_escalation_enabled: Optional[bool] = None
    escalation_timeout_seconds: Optional[int] = None
    language_preference: Optional[str] = None
    emergency_instructions: Optional[str] = None

class SetCancellationPinRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6, description="4 to 6 digit security PIN")
    password: Optional[str] = None

class VerifyCancellationPinRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6)

class ResetCancellationPinRequest(BaseModel):
    password: str = Field(..., min_length=1, description="Account password required for verification")
    new_pin: str = Field(..., min_length=4, max_length=6, description="4 to 6 digit new security PIN")

class QRSettingsUpdateRequest(BaseModel):
    shared_fields: Dict[str, bool]
    emergency_instructions: Optional[str] = None

class PublicEmergencyCardResponse(BaseModel):
    is_valid: bool
    name: Optional[str] = None
    phone_number: Optional[str] = None
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    existing_conditions: Optional[str] = None
    medications: Optional[str] = None
    medical_notes: Optional[str] = None
    emergency_instructions: Optional[str] = None
    emergency_contacts: Optional[List[Dict[str, Any]]] = None
    card_generated_at: Optional[str] = None
    revoked_notice: Optional[str] = None
