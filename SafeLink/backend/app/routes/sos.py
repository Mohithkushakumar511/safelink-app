import os
import base64
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import FileResponse
from bson import ObjectId
from app.schemas.sos import (
    SOSCreateRequest,
    SOSIncidentResponse,
    SOSCancelRequest,
    SOSResolveRequest,
    LocationUpdatePayload,
    MessageStatusUpdatePayload,
    VoiceUploadPayload
)
from app.dependencies import get_current_user
from app.database import db_manager

router = APIRouter(prefix="/sos", tags=["SOS Emergency"])

RECORDINGS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "recordings"
os.makedirs(RECORDINGS_DIR, exist_ok=True)

def save_voice_file(incident_code: str, audio_b64: str, ext: str = "m4a") -> str:
    try:
        clean_b64 = audio_b64
        if "," in clean_b64:
            clean_b64 = clean_b64.split(",", 1)[1]
        data = base64.b64decode(clean_b64)
        safe_name = incident_code.replace(":", "_").replace("/", "_")
        file_path = RECORDINGS_DIR / f"{safe_name}.{ext}"
        with open(file_path, "wb") as f:
            f.write(data)
        return str(file_path)
    except Exception as e:
        print(f"[SOS Voice] Error writing voice recording: {e}")
        return ""

def format_incident(doc: dict) -> dict:
    activated = doc.get("activated_at") or doc.get("timestamp") or datetime.now(timezone.utc).isoformat()
    resolved = doc.get("resolved_at")
    cancelled = doc.get("cancelled_at")

    # Compute duration in seconds
    duration = 0
    try:
        start_dt = datetime.fromisoformat(activated.replace("Z", "+00:00"))
        end_iso = resolved or cancelled
        if end_iso:
            end_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        else:
            end_dt = datetime.now(timezone.utc)
        duration = max(0, int((end_dt - start_dt).total_seconds()))
    except Exception:
        duration = 0

    init_loc = doc.get("initial_location") or {
        "latitude": doc.get("latitude", 0.0),
        "longitude": doc.get("longitude", 0.0),
        "accuracy": doc.get("accuracy"),
        "address": doc.get("address"),
        "timestamp": activated
    }

    latest_loc = doc.get("latest_location") or {
        "latitude": doc.get("latitude", 0.0),
        "longitude": doc.get("longitude", 0.0),
        "accuracy": doc.get("accuracy"),
        "address": doc.get("address"),
        "timestamp": doc.get("last_location_update") or activated
    }

    loc_history = doc.get("location_history") or [init_loc]
    incident_code = str(doc.get("incident_id") or doc.get("id") or doc.get("_id"))

    # Recipient & messaging dispatch information
    recipient_info = doc.get("recipient_info") or {
        "recipient_contact_id": doc.get("default_contact_id"),
        "recipient_name": doc.get("primary_contact_name", "Emergency Responder"),
        "recipient_phone": doc.get("primary_contact_phone"),
        "message_content": doc.get("emergency_message", ""),
        "sending_method": doc.get("sending_method", "SMS"),
        "submitted_at": activated,
        "sending_status": doc.get("sending_status", "SUBMITTED"),
        "delivery_confirmation": doc.get("delivery_confirmation", "UNCONFIRMED_CLIENT_SMS (Native SMS Composer Invoked)")
    }

    # Timeline of incident lifecycle events
    timeline = doc.get("timeline") or [
        {
            "event": "SOS_ACTIVATED",
            "title": "Emergency SOS Triggered",
            "description": f"Incident initiated by {doc.get('user_name', 'User')}",
            "timestamp": activated,
            "icon": "alert-circle"
        },
        {
            "event": "LOCATION_CAPTURED",
            "title": "Initial GPS Coordinates Recorded",
            "description": f"Latitude: {init_loc.get('latitude', 0.0):.5f}, Longitude: {init_loc.get('longitude', 0.0):.5f}",
            "timestamp": activated,
            "icon": "pin"
        },
        {
            "event": "RECIPIENT_DISPATCHED",
            "title": f"Dispatched to {recipient_info.get('recipient_name')}",
            "description": f"Target: {recipient_info.get('recipient_phone')} via {recipient_info.get('sending_method', 'SMS')}",
            "timestamp": recipient_info.get("submitted_at") or activated,
            "icon": "paper-plane"
        }
    ]

    has_voice = bool(doc.get("has_voice_recording") or doc.get("voice_recording_url"))
    voice_url = doc.get("voice_recording_url")
    if has_voice and not voice_url:
        voice_url = f"/sos/{incident_code}/voice"

    return {
        "id": str(doc.get("id") or doc.get("_id")),
        "incident_id": incident_code,
        "user_id": str(doc.get("user_id")),
        "user_name": doc.get("user_name", "SafeLink User"),
        "user_phone": doc.get("user_phone"),
        "activated_at": activated,
        "timestamp": activated,
        "status": doc.get("status", "ACTIVE"),
        "status_details": doc.get("status_details", "Emergency incident active"),
        "default_contact_id": doc.get("default_contact_id"),
        "primary_contact_name": doc.get("primary_contact_name", "Emergency Responder"),
        "primary_contact_phone": doc.get("primary_contact_phone"),
        "latitude": doc.get("latitude", latest_loc.get("latitude", 0.0)),
        "longitude": doc.get("longitude", latest_loc.get("longitude", 0.0)),
        "accuracy": doc.get("accuracy", latest_loc.get("accuracy")),
        "address": doc.get("address", latest_loc.get("address")),
        "google_maps_url": doc.get("google_maps_url", f"https://maps.google.com/?q={latest_loc.get('latitude', 0.0):.6f},{latest_loc.get('longitude', 0.0):.6f}"),
        "emergency_message": doc.get("emergency_message", ""),
        "emergency_description": doc.get("emergency_description") or doc.get("custom_note"),
        "voice_recording_url": voice_url,
        "voice_recording_duration_seconds": doc.get("voice_recording_duration_seconds"),
        "has_voice_recording": has_voice,
        "battery_level": doc.get("battery_level"),
        "battery_status": doc.get("battery_status"),
        "medical_info": doc.get("medical_info"),
        "recipient_info": recipient_info,
        "timeline": timeline,
        "initial_location": init_loc,
        "latest_location": latest_loc,
        "last_location_update": doc.get("last_location_update") or activated,
        "location_history": loc_history,
        "duration_seconds": duration,
        "cancelled_at": cancelled,
        "cancellation_reason": doc.get("cancellation_reason"),
        "resolved_at": resolved,
        "resolution_note": doc.get("resolution_note"),
    }

@router.post("/create", response_model=SOSIncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_sos(
    payload: SOSCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    user_name = current_user.get("name") or current_user.get("display_name", "Mohith")
    user_phone = current_user.get("phone_number")

    # Prevent duplicate active incidents: check if an active incident already exists
    existing_active = await db_manager.sos_alerts.find_one({
        "user_id": user_id,
        "status": "ACTIVE"
    })
    if existing_active:
        return format_incident(existing_active)

    now = datetime.now(timezone.utc)
    now_str = now.isoformat()
    incident_code = f"SOS-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}"
    incident_id = str(ObjectId())

    # Retrieve user's default emergency contact
    default_contact = await db_manager.emergency_contacts.find_one({
        "user_id": user_id,
        "is_default": True
    })
    if not default_contact:
        contacts = await db_manager.emergency_contacts.find({"user_id": user_id}, limit=1)
        if contacts:
            default_contact = contacts[0]

    contact_id = default_contact["id"] if default_contact else None
    contact_name = default_contact["name"] if default_contact else "Emergency Services"
    contact_phone = default_contact["phone"] if default_contact else "911"

    gmaps_url = f"https://maps.google.com/?q={payload.latitude:.6f},{payload.longitude:.6f}"
    emergency_desc = payload.emergency_description or payload.custom_note

    emergency_msg = (
        f"EMERGENCY SOS ALERT!\n\n"
        f"I need emergency assistance.\n\n"
        f"Name: {user_name}\n"
        f"Incident ID: {incident_code}\n"
        f"Time: {now.strftime('%b %d, %Y at %I:%M %p UTC')}\n"
    )
    if emergency_desc and emergency_desc.strip():
        emergency_msg += f"Description: {emergency_desc.strip()}\n"
    emergency_msg += f"Location: {gmaps_url}\n\n"
    emergency_msg += f"Please contact me immediately."

    status_details = f"Emergency SOS initiated at {now.strftime('%H:%M:%S UTC')}. Active high-priority alert."

    initial_point = {
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "address": payload.address,
        "timestamp": now_str
    }

    # Handle optional voice note attachment
    voice_file_path = None
    voice_url = None
    has_voice = False
    if payload.voice_base64:
        voice_file_path = save_voice_file(incident_code, payload.voice_base64)
        if voice_file_path:
            voice_url = f"/sos/{incident_code}/voice"
            has_voice = True

    recipient_info = {
        "recipient_contact_id": contact_id,
        "recipient_name": contact_name,
        "recipient_phone": contact_phone,
        "message_content": emergency_msg,
        "sending_method": payload.sending_method or "SMS",
        "submitted_at": now_str,
        "sending_status": "SUBMITTED",
        "delivery_confirmation": "UNCONFIRMED_CLIENT_SMS (Native SMS Composer Invoked)"
    }

    timeline = [
        {
            "event": "SOS_ACTIVATED",
            "title": "Emergency SOS Triggered",
            "description": f"Incident initiated by {user_name} with priority dispatch.",
            "timestamp": now_str,
            "icon": "alert-circle"
        }
    ]

    if payload.countdown_seconds:
        timeline.append({
            "event": "COUNTDOWN_COMPLETED",
            "title": "SOS Verification Countdown Completed",
            "description": f"Elapsed {payload.countdown_seconds}s countdown without cancellation.",
            "timestamp": now_str,
            "icon": "timer"
        })

    timeline.extend([
        {
            "event": "LOCATION_CAPTURED",
            "title": "Initial GPS Coordinates Recorded",
            "description": f"Lat: {payload.latitude:.5f}, Lng: {payload.longitude:.5f} ({payload.address or 'GPS Coords'})",
            "timestamp": now_str,
            "icon": "pin"
        },
        {
            "event": "RECIPIENT_DISPATCHED",
            "title": f"Dispatched to {contact_name}",
            "description": f"Target: {contact_phone} via {payload.sending_method or 'SMS'}",
            "timestamp": now_str,
            "icon": "paper-plane"
        }
    ])

    if payload.battery_level is not None:
        timeline.append({
            "event": "BATTERY_RECORDED",
            "title": f"Device Battery: {int(payload.battery_level)}%",
            "description": f"Status: {payload.battery_status or 'Active Monitoring'}",
            "timestamp": now_str,
            "icon": "battery-charging"
        })

    # Optional Medical Profile Attachment (Feature 9)
    medical_info = None
    if current_user.get("share_medical_with_sos"):
        medical_info = {
            "blood_type": current_user.get("blood_type"),
            "allergies": current_user.get("allergies"),
            "existing_conditions": current_user.get("existing_conditions"),
            "medications": current_user.get("medications"),
            "medical_notes": current_user.get("medical_notes"),
        }
        timeline.append({
            "event": "MEDICAL_PROFILE_ATTACHED",
            "title": "Emergency Medical Profile Attached",
            "description": f"Blood: {medical_info.get('blood_type') or 'N/A'}, Allergies: {medical_info.get('allergies') or 'None listed'}",
            "timestamp": now_str,
            "icon": "medkit"
        })

    if emergency_desc and emergency_desc.strip():
        timeline.append({
            "event": "DESCRIPTION_LOGGED",
            "title": "Emergency Description Attached",
            "description": f'"{emergency_desc.strip()}"',
            "timestamp": now_str,
            "icon": "document-text"
        })

    if has_voice:
        timeline.append({
            "event": "VOICE_ATTACHED",
            "title": "Voice Emergency Message Attached",
            "description": f"Audio recorded ({payload.voice_duration_seconds or 0}s duration).",
            "timestamp": now_str,
            "icon": "mic"
        })

    incident_doc = {
        "_id": incident_id,
        "id": incident_id,
        "incident_id": incident_code,
        "user_id": user_id,
        "user_name": user_name,
        "user_phone": user_phone,
        "activated_at": now_str,
        "timestamp": now_str,
        "status": "ACTIVE",
        "status_details": status_details,
        "default_contact_id": contact_id,
        "primary_contact_name": contact_name,
        "primary_contact_phone": contact_phone,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "address": payload.address,
        "google_maps_url": gmaps_url,
        "emergency_message": emergency_msg,
        "emergency_description": emergency_desc,
        "voice_recording_url": voice_url,
        "voice_recording_duration_seconds": payload.voice_duration_seconds,
        "has_voice_recording": has_voice,
        "battery_level": payload.battery_level,
        "battery_status": payload.battery_status,
        "medical_info": medical_info,
        "recipient_info": recipient_info,
        "timeline": timeline,
        "initial_location": initial_point,
        "latest_location": initial_point,
        "last_location_update": now_str,
        "location_history": [initial_point],
        "cancelled_at": None,
        "cancellation_reason": None,
        "resolved_at": None,
        "resolution_note": None,
    }

    await db_manager.sos_alerts.insert_one(incident_doc)

    # Save to location history log
    await db_manager.location_history.insert_one({
        "_id": str(ObjectId()),
        "user_id": user_id,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "address": payload.address,
        "google_maps_url": gmaps_url,
        "is_live_sharing": True,
        "is_emergency": True,
        "incident_id": incident_code,
        "timestamp": now_str,
    })

    return format_incident(incident_doc)

@router.get("/active", response_model=Optional[SOSIncidentResponse])
async def get_active_incident(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    active = await db_manager.sos_alerts.find_one({
        "user_id": user_id,
        "status": "ACTIVE"
    })
    if not active:
        return None
    return format_incident(active)

@router.get("/history", response_model=List[SOSIncidentResponse])
async def get_sos_history(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {} if is_admin else {"user_id": user_id}
    alerts = await db_manager.sos_alerts.find(
        query,
        sort=[("activated_at", -1), ("timestamp", -1)]
    )
    return [format_incident(a) for a in alerts]

@router.post("/{incident_id}/location", response_model=SOSIncidentResponse)
@router.put("/{incident_id}/location", response_model=SOSIncidentResponse)
async def update_incident_location(
    incident_id: str,
    payload: LocationUpdatePayload,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active incident not found."
        )

    if alert.get("status") != "ACTIVE":
        # Do not accept tracking updates for resolved/cancelled incidents
        return format_incident(alert)

    now_str = datetime.now(timezone.utc).isoformat()
    gmaps_url = f"https://maps.google.com/?q={payload.latitude:.6f},{payload.longitude:.6f}"
    new_point = {
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "address": payload.address,
        "timestamp": now_str
    }

    target_id = alert["id"]
    timeline = alert.get("timeline") or []
    timeline.append({
        "event": "LOCATION_UPDATE",
        "title": "GPS Telemetry Updated",
        "description": f"Lat: {payload.latitude:.5f}, Lng: {payload.longitude:.5f} (Acc: ±{round(payload.accuracy or 10)}m)",
        "timestamp": now_str,
        "icon": "navigate"
    })

    updates = {
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "address": payload.address,
        "google_maps_url": gmaps_url,
        "latest_location": new_point,
        "last_location_update": now_str,
    }

    if payload.battery_level is not None:
        updates["battery_level"] = payload.battery_level
        updates["battery_status"] = payload.battery_status
        timeline.append({
            "event": "BATTERY_UPDATE",
            "title": f"Battery Level: {int(payload.battery_level)}%",
            "description": f"Status: {payload.battery_status or 'Active'}",
            "timestamp": now_str,
            "icon": "battery-charging"
        })

    updates["timeline"] = timeline

    # Append to location_history
    history = alert.get("location_history") or []
    history.append(new_point)
    updates["location_history"] = history

    await db_manager.sos_alerts.update_one({"id": target_id}, {"$set": updates})

    # Log to location_history table
    await db_manager.location_history.insert_one({
        "_id": str(ObjectId()),
        "user_id": user_id,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "address": payload.address,
        "google_maps_url": gmaps_url,
        "is_live_sharing": True,
        "is_emergency": True,
        "incident_id": alert.get("incident_id"),
        "timestamp": now_str,
    })

    updated = await db_manager.sos_alerts.find_one({"id": target_id})
    return format_incident(updated or {**alert, **updates})

@router.get("/{incident_id}/locations", response_model=List[Dict[str, Any]])
async def get_incident_locations(
    incident_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found."
        )

    return alert.get("location_history") or []

@router.post("/{incident_id}/message-status", response_model=SOSIncidentResponse)
async def update_message_status(
    incident_id: str,
    payload: MessageStatusUpdatePayload,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found."
        )

    now_str = datetime.now(timezone.utc).isoformat()
    existing_rec = alert.get("recipient_info") or {}

    updated_rec = {
        "recipient_contact_id": payload.recipient_contact_id or existing_rec.get("recipient_contact_id") or alert.get("default_contact_id"),
        "recipient_name": payload.recipient_name or existing_rec.get("recipient_name") or alert.get("primary_contact_name"),
        "recipient_phone": payload.recipient_phone or existing_rec.get("recipient_phone") or alert.get("primary_contact_phone"),
        "message_content": payload.message_content or existing_rec.get("message_content") or alert.get("emergency_message"),
        "sending_method": payload.sending_method or existing_rec.get("sending_method", "SMS"),
        "submitted_at": payload.submitted_at or existing_rec.get("submitted_at") or now_str,
        "sending_status": payload.sending_status or "SUBMITTED",
        "delivery_confirmation": payload.delivery_confirmation or existing_rec.get("delivery_confirmation", "UNCONFIRMED_CLIENT_SMS")
    }

    # Append timeline entry
    timeline = alert.get("timeline") or []
    timeline.append({
        "event": "MESSAGE_STATUS_UPDATE",
        "title": f"Dispatch Status: {updated_rec['sending_status']}",
        "description": f"Via {updated_rec['sending_method']} to {updated_rec['recipient_name']} ({updated_rec['delivery_confirmation']})",
        "timestamp": now_str,
        "icon": "chatbubble-ellipses"
    })

    updates = {
        "recipient_info": updated_rec,
        "timeline": timeline,
    }
    await db_manager.sos_alerts.update_one({"id": alert["id"]}, {"$set": updates})
    updated = await db_manager.sos_alerts.find_one({"id": alert["id"]})
    return format_incident(updated)

@router.post("/{incident_id}/voice", response_model=SOSIncidentResponse)
async def upload_voice_recording(
    incident_id: str,
    payload: VoiceUploadPayload,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found."
        )

    incident_code = alert.get("incident_id") or incident_id
    file_path = save_voice_file(incident_code, payload.audio_base64, payload.file_extension or "m4a")
    if not file_path:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save voice recording audio file on server."
        )

    now_str = datetime.now(timezone.utc).isoformat()
    timeline = alert.get("timeline") or []
    timeline.append({
        "event": "VOICE_ATTACHED",
        "title": "Voice Emergency Message Attached",
        "description": f"Voice audio note saved ({payload.duration_seconds or 0}s duration).",
        "timestamp": now_str,
        "icon": "mic"
    })

    updates = {
        "voice_recording_url": f"/sos/{incident_code}/voice",
        "voice_recording_duration_seconds": payload.duration_seconds,
        "has_voice_recording": True,
        "timeline": timeline,
    }
    await db_manager.sos_alerts.update_one({"id": alert["id"]}, {"$set": updates})
    updated = await db_manager.sos_alerts.find_one({"id": alert["id"]})
    return format_incident(updated)

@router.get("/{incident_id}/voice")
async def get_voice_recording(
    incident_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found or unauthorized."
        )

    incident_code = alert.get("incident_id") or incident_id
    safe_name = incident_code.replace(":", "_").replace("/", "_")

    file_path = None
    for ext in ["m4a", "mp4", "aac", "wav", "3gp"]:
        candidate = RECORDINGS_DIR / f"{safe_name}.{ext}"
        if candidate.exists():
            file_path = candidate
            break

    if not file_path or not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice recording audio file not found on server."
        )

    return FileResponse(
        path=str(file_path),
        media_type="audio/m4a",
        filename=f"safelink_emergency_voice_{safe_name}.m4a"
    )

@router.get("/{incident_id}", response_model=SOSIncidentResponse)
@router.get("/{incident_id}/status", response_model=SOSIncidentResponse)
@router.post("/{incident_id}/status", response_model=SOSIncidentResponse)
async def get_sos_incident(
    incident_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident record not found."
        )
    return format_incident(alert)

@router.patch("/{incident_id}/cancel", response_model=SOSIncidentResponse)
@router.post("/{incident_id}/cancel", response_model=SOSIncidentResponse)
async def cancel_sos_incident(
    incident_id: str,
    payload: SOSCancelRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    now_str = datetime.now(timezone.utc).isoformat()
    reason = payload.reason or "False alarm / Accidental activation"
    status_details = f"SOS Cancelled by user. Reason: {reason}"

    if not alert:
        target_id = incident_id
        doc = {
            "_id": target_id,
            "id": target_id,
            "incident_id": incident_id,
            "user_id": user_id,
            "user_name": current_user.get("name") or "Mohith",
            "activated_at": now_str,
            "timestamp": now_str,
            "status": "CANCELLED",
            "status_details": status_details,
            "latitude": 0.0,
            "longitude": 0.0,
            "google_maps_url": "https://maps.google.com",
            "emergency_message": "Incident cancelled.",
            "cancelled_at": now_str,
            "cancellation_reason": reason,
        }
        await db_manager.sos_alerts.insert_one(doc)
        return format_incident(doc)

    target_id = alert["id"]
    timeline = alert.get("timeline") or []
    timeline.append({
        "event": "SOS_CANCELLED",
        "title": "Incident Cancelled",
        "description": f"Cancelled by user. Reason: {reason}",
        "timestamp": now_str,
        "icon": "close-circle"
    })
    updates = {
        "status": "CANCELLED",
        "status_details": status_details,
        "cancelled_at": now_str,
        "cancellation_reason": reason,
        "timeline": timeline,
    }
    await db_manager.sos_alerts.update_one({"id": target_id}, {"$set": updates})
    updated = await db_manager.sos_alerts.find_one({"id": target_id})
    return format_incident(updated or {**alert, **updates})

@router.patch("/{incident_id}/resolve", response_model=SOSIncidentResponse)
@router.post("/{incident_id}/resolve", response_model=SOSIncidentResponse)
async def resolve_sos_incident(
    incident_id: str,
    payload: SOSResolveRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    is_admin = current_user.get("role") == "ADMIN"

    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    now_str = datetime.now(timezone.utc).isoformat()
    note = payload.resolution_note or "Situation safely resolved"
    status_details = f"SOS safely resolved. Note: {note}"

    if not alert:
        target_id = incident_id
        doc = {
            "_id": target_id,
            "id": target_id,
            "incident_id": incident_id,
            "user_id": user_id,
            "user_name": current_user.get("name") or "Mohith",
            "activated_at": now_str,
            "timestamp": now_str,
            "status": "RESOLVED",
            "status_details": status_details,
            "latitude": 0.0,
            "longitude": 0.0,
            "google_maps_url": "https://maps.google.com",
            "emergency_message": "Incident resolved.",
            "resolved_at": now_str,
            "resolution_note": note,
        }
        await db_manager.sos_alerts.insert_one(doc)
        return format_incident(doc)

    target_id = alert["id"]
    timeline = alert.get("timeline") or []
    timeline.append({
        "event": "SOS_RESOLVED",
        "title": "Incident Safely Resolved",
        "description": f"Marked resolved. Note: {note}",
        "timestamp": now_str,
        "icon": "checkmark-circle"
    })
    updates = {
        "status": "RESOLVED",
        "status_details": status_details,
        "resolved_at": now_str,
        "resolution_note": note,
        "timeline": timeline,
    }
    await db_manager.sos_alerts.update_one({"id": target_id}, {"$set": updates})
    updated = await db_manager.sos_alerts.find_one({"id": target_id})
    return format_incident(updated or {**alert, **updates})
