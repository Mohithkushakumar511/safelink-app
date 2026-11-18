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
    offline_incident_id: Optional[str] = None
    activated_at: Optional[str] = None
    created_offline: Optional[bool] = False
    retry_count: Optional[int] = 0
    connectivity_method: Optional[str] = None
    offline_synced_at: Optional[str] = None
    connectivity_status: Optional[str] = None

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
    pin: Optional[str] = None
    password_bypass: Optional[str] = None

class SOSResolveRequest(BaseModel):
    resolution_note: Optional[str] = Field("Situation safely resolved", max_length=200)

class TimelineEvent(BaseModel):
    id: str
    incident_id: Optional[str] = None
    event: str
    title: str
    description: str
    timestamp: str
    status: Literal["Pending", "Attempted", "Sent", "Acknowledged", "Failed", "Escalated", "Resolved"] = "Pending"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    contact_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    escalation_level: Optional[int] = None
    icon: Optional[str] = "alert-circle"

class TimelineEventCreate(BaseModel):
    id: Optional[str] = None
    incident_id: Optional[str] = None
    event: str
    title: str
    description: str
    timestamp: Optional[str] = None
    status: Optional[Literal["Pending", "Attempted", "Sent", "Acknowledged", "Failed", "Escalated", "Resolved"]] = "Pending"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    contact_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    escalation_level: Optional[int] = None
    icon: Optional[str] = None

class TimelineSyncPayload(BaseModel):
    events: List[TimelineEventCreate]

class ContactAcknowledgementRequest(BaseModel):
    contact_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    token: Optional[str] = None
    response_status: Literal["ACCEPTED_RESPONSIBILITY", "UNABLE_TO_HELP", "I_AM_RESPONDING", "UNABLE_TO_RESPOND", "ACKNOWLEDGED"] = "ACCEPTED_RESPONSIBILITY"
    note: Optional[str] = Field(None, max_length=200)

class EscalationStatusResponse(BaseModel):
    level: int = 1
    status: Literal["WAITING_ACK", "ACKNOWLEDGED", "EXHAUSTED", "CANCELLED", "RESOLVED", "DISABLED"] = "WAITING_ACK"
    current_contact_id: Optional[str] = None
    current_contact_name: Optional[str] = None
    current_contact_phone: Optional[str] = None
    attempts: int = 1
    timeout_seconds: int = 120
    next_escalation_at: Optional[str] = None
    seconds_remaining: Optional[int] = None
    acknowledged_by: Optional[Dict[str, Any]] = None
    auto_escalation_enabled: bool = True

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
    offline_incident_id: Optional[str] = None
    activated_at: Optional[str] = None
    created_offline: Optional[bool] = False
    retry_count: Optional[int] = 0
    connectivity_method: Optional[str] = None
    offline_synced_at: Optional[str] = None
    connectivity_status: Optional[str] = None
    medical_info: Optional[Dict[str, Any]] = None
    recipient_info: Optional[Dict[str, Any]] = None
    timeline: Optional[List[Dict[str, Any]]] = None
    escalation: Optional[EscalationStatusResponse] = None
    initial_location: Optional[Dict[str, Any]] = None
    latest_location: Optional[Dict[str, Any]] = None
    last_location_update: Optional[str] = None
    location_history: Optional[List[Dict[str, Any]]] = None
    duration_seconds: Optional[int] = None
    retention_expires_at: Optional[str] = None
    retention_hours_remaining: Optional[float] = None
    accepted_rescue: Optional[Dict[str, Any]] = None
    cancellation_pin_required: Optional[bool] = False
