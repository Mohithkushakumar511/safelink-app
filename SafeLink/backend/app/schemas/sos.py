from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

class LocationUpdatePayload(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    address: Optional[str] = None
    battery_level: Optional[float] = None
    battery_status: Optional[str] = None

class SOSCreateRequest(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    address: Optional[str] = None
    custom_note: Optional[str] = None
    emergency_description: Optional[str] = None
    sending_method: Optional[str] = "SMS"
    voice_base64: Optional[str] = None
    voice_duration_seconds: Optional[int] = None
    countdown_seconds: Optional[int] = None
    battery_level: Optional[float] = None
    battery_status: Optional[str] = None

class MessageStatusUpdatePayload(BaseModel):
    recipient_contact_id: Optional[str] = None
    recipient_name: Optional[str] = None
    recipient_phone: Optional[str] = None
    message_content: Optional[str] = None
    sending_method: Optional[str] = "SMS"
    sending_status: Optional[str] = "SUBMITTED"
    delivery_confirmation: Optional[str] = "UNCONFIRMED_CLIENT_SMS"
    submitted_at: Optional[str] = None

class VoiceUploadPayload(BaseModel):
    audio_base64: str
    file_extension: Optional[str] = "m4a"
    duration_seconds: Optional[int] = None

class SOSCancelRequest(BaseModel):
    reason: Optional[str] = Field("False alarm / Accidental activation", max_length=200)

class SOSResolveRequest(BaseModel):
    resolution_note: Optional[str] = Field("Situation safely resolved", max_length=200)

class SOSIncidentResponse(BaseModel):
    id: str
    incident_id: str
    user_id: str
    user_name: str
    user_phone: Optional[str] = None
    status: Literal["ACTIVE", "CANCELLED", "RESOLVED"]
    status_details: str
    activated_at: str
    timestamp: str
    resolved_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    cancellation_reason: Optional[str] = None
    resolution_note: Optional[str] = None
    default_contact_id: Optional[str] = None
    primary_contact_name: Optional[str] = None
    primary_contact_phone: Optional[str] = None
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    address: Optional[str] = None
    google_maps_url: str
    emergency_message: str
    emergency_description: Optional[str] = None
    voice_recording_url: Optional[str] = None
    voice_recording_duration_seconds: Optional[int] = None
    has_voice_recording: Optional[bool] = False
    battery_level: Optional[float] = None
    battery_status: Optional[str] = None
    medical_info: Optional[Dict[str, Any]] = None
    recipient_info: Optional[Dict[str, Any]] = None
    timeline: Optional[List[Dict[str, Any]]] = None
    initial_location: Optional[Dict[str, Any]] = None
    latest_location: Optional[Dict[str, Any]] = None
    last_location_update: Optional[str] = None
    location_history: Optional[List[Dict[str, Any]]] = None
    duration_seconds: Optional[int] = None
