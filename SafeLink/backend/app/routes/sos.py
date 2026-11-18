import os
import base64
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
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
    VoiceUploadPayload,
    TimelineEventCreate,
    TimelineSyncPayload,
    ContactAcknowledgementRequest,
    EscalationStatusResponse
)
from app.dependencies import get_current_user
from app.database import db_manager
from app.services.auth_service import verify_password
from app.services.escalation_worker import (
    generate_event_id,
    calculate_seconds_remaining,
    build_initial_escalation
)
from app.services.retention_worker import compute_retention_info

router = APIRouter(prefix="/sos", tags=["SOS Emergency"])
logger = logging.getLogger("safelink.sos")

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
        logger.error(f"[SOS Voice] Error writing voice recording: {e}")
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

    # Escalation state computation
    raw_escalation = doc.get("escalation")
    escalation_data = None
    if raw_escalation:
        escalation_data = dict(raw_escalation)
        next_at = escalation_data.get("next_escalation_at")
        if next_at and escalation_data.get("status") == "WAITING_ACK":
            escalation_data["seconds_remaining"] = calculate_seconds_remaining(next_at)
        else:
            escalation_data["seconds_remaining"] = None

    # Timeline of incident lifecycle events with normalized IDs and statuses
    raw_timeline = doc.get("timeline") or []
    if not raw_timeline:
        raw_timeline = [
            {
                "id": generate_event_id(),
                "incident_id": incident_code,
                "event": "SOS_ACTIVATED",
                "title": "Emergency SOS Triggered",
                "description": f"Incident initiated by {doc.get('user_name', 'User')}",
                "timestamp": activated,
                "status": "Sent",
                "icon": "alert-circle"
            },
            {
                "id": generate_event_id(),
                "incident_id": incident_code,
                "event": "LOCATION_CAPTURED",
                "title": "Initial GPS Coordinates Recorded",
                "description": f"Latitude: {init_loc.get('latitude', 0.0):.5f}, Longitude: {init_loc.get('longitude', 0.0):.5f}",
                "timestamp": activated,
                "status": "Sent",
                "latitude": init_loc.get("latitude"),
                "longitude": init_loc.get("longitude"),
                "accuracy": init_loc.get("accuracy"),
                "icon": "pin"
            },
            {
                "id": generate_event_id(),
                "incident_id": incident_code,
                "event": "RECIPIENT_DISPATCHED",
                "title": f"Dispatched to {recipient_info.get('recipient_name')}",
                "description": f"Target: {recipient_info.get('recipient_phone')} via {recipient_info.get('sending_method', 'SMS')}",
                "timestamp": recipient_info.get("submitted_at") or activated,
                "status": "Attempted",
                "icon": "paper-plane"
            }
        ]

    cleaned_timeline = []
    for item in raw_timeline:
        entry = dict(item)
        if "id" not in entry:
            entry["id"] = generate_event_id()
        if "incident_id" not in entry:
            entry["incident_id"] = incident_code
        if "status" not in entry:
            evt_name = entry.get("event", "")
            if "CANCEL" in evt_name or "RESOLV" in evt_name:
                entry["status"] = "Resolved"
            elif "ACK" in evt_name:
                entry["status"] = "Acknowledged"
            elif "ESCALAT" in evt_name:
                entry["status"] = "Escalated"
            elif "NOTIF" in evt_name or "DISPATCH" in evt_name or "INITIAT" in evt_name:
                entry["status"] = "Attempted"
            elif "CAPTURED" in evt_name or "RECORDED" in evt_name or "ACTIVATED" in evt_name or "SENT" in evt_name:
                entry["status"] = "Sent"
            elif "FAIL" in evt_name or "REJECT" in evt_name:
                entry["status"] = "Failed"
            else:
                entry["status"] = "Pending"
        cleaned_timeline.append(entry)

    cleaned_timeline.sort(key=lambda x: str(x.get("timestamp", "")))

    has_voice = bool(doc.get("has_voice_recording") or doc.get("voice_recording_url"))
    voice_url = doc.get("voice_recording_url")
    if has_voice and not voice_url:
        voice_url = f"/sos/{incident_code}/voice"

    retention_expires_at, retention_hours_remaining = compute_retention_info(doc)

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
        "timeline": cleaned_timeline,
        "escalation": escalation_data,
        "initial_location": init_loc,
        "latest_location": latest_loc,
        "last_location_update": doc.get("last_location_update") or activated,
        "location_history": loc_history,
        "duration_seconds": duration,
        "cancelled_at": cancelled,
        "cancellation_reason": doc.get("cancellation_reason"),
        "resolved_at": resolved,
        "resolution_note": doc.get("resolution_note"),
        "retention_expires_at": retention_expires_at,
        "retention_hours_remaining": retention_hours_remaining,
        "created_offline": bool(doc.get("created_offline", False)),
        "offline_incident_id": doc.get("offline_incident_id"),
        "offline_synced_at": doc.get("offline_synced_at"),
        "retry_count": doc.get("retry_count", 0),
        "connectivity_status": doc.get("connectivity_status") or ("OFFLINE_SYNCED" if doc.get("created_offline") else "ONLINE_DIRECT"),
        "accepted_rescue": doc.get("accepted_rescue"),
        "cancellation_pin_required": bool(doc.get("cancellation_pin_required", False)),
    }

@router.post("/create", response_model=SOSIncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_sos(
    payload: SOSCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    user_name = current_user.get("name") or current_user.get("display_name", "Mohith")
    user_phone = current_user.get("phone_number")

    # Idempotent deduplication for offline synced events: check if offline_incident_id already registered
    if payload.offline_incident_id:
        existing_offline = await db_manager.sos_alerts.find_one({
            "$or": [
                {"offline_incident_id": payload.offline_incident_id},
                {"incident_id": payload.offline_incident_id}
            ]
        })
        if existing_offline:
            logger.info(f"[SOS Create] Idempotency hit: returning existing incident for offline ID {payload.offline_incident_id}")
            return format_incident(existing_offline)

    # Prevent duplicate active incidents: check if an active incident already exists
    existing_active = await db_manager.sos_alerts.find_one({
        "user_id": user_id,
        "status": "ACTIVE"
    })
    if existing_active:
        if payload.offline_incident_id:
            await db_manager.sos_alerts.update_one(
                {"_id": existing_active["_id"]},
                {"$set": {
                    "offline_incident_id": payload.offline_incident_id,
                    "created_offline": True,
                    "offline_synced_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        return format_incident(existing_active)

    now = datetime.now(timezone.utc)
    now_str = now.isoformat()
    # Preserve original activation timestamp if initiated offline
    activated_str = payload.activated_at or now_str
    base_code = f"SOS-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}"
    existing_code = await db_manager.sos_alerts.find_one({"incident_id": base_code})
    incident_code = f"{base_code}-{secrets.token_hex(2).upper()}" if existing_code else base_code
    incident_id = str(ObjectId())

    # Retrieve user's configured emergency contacts in priority order
    contacts = await db_manager.emergency_contacts.find(
        {"user_id": user_id},
        sort=[("priority", 1), ("is_default", -1), ("created_at", 1)]
    )

    first_contact = contacts[0] if contacts else None
    contact_id = first_contact["id"] if first_contact else None
    contact_name = first_contact["name"] if first_contact else "Emergency Services"
    contact_phone = first_contact["phone"] if first_contact else "911"

    # Build initial automatic escalation ladder state
    escalation = build_initial_escalation(contacts, current_user, now)

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

    # Chronological Emergency Event Timeline recording real events
    timeline = [
        {
            "id": generate_event_id(),
            "incident_id": incident_code,
            "event": "SOS_ACTIVATED",
            "title": "Emergency SOS Triggered" + (" (Offline Mode)" if payload.created_offline else ""),
            "description": f"Incident initiated by {user_name}" + (" while offline. Telemetry dispatched via SMS and queued for cloud sync." if payload.created_offline else "."),
            "timestamp": activated_str,
            "status": "Sent",
            "icon": "alert-circle"
        },
        {
            "id": generate_event_id(),
            "incident_id": incident_code,
            "event": "EMERGENCY_ID_GENERATED",
            "title": f"Emergency ID Generated: {incident_code}",
            "description": "Unique incident tracking code established.",
            "timestamp": activated_str,
            "status": "Sent",
            "icon": "finger-print"
        },
        {
            "id": generate_event_id(),
            "incident_id": incident_code,
            "event": "GPS_LOCATION_ACQUIRED",
            "title": "GPS Location Acquired",
            "description": f"Lat: {payload.latitude:.5f}, Lng: {payload.longitude:.5f} (Acc: ±{round(payload.accuracy or 10)}m)",
            "timestamp": activated_str,
            "status": "Sent",
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "accuracy": payload.accuracy,
            "icon": "pin"
        },
        {
            "id": generate_event_id(),
            "incident_id": incident_code,
            "event": "ALERT_TRANSMISSION_INITIATED",
            "title": "Alert Transmission Initiated",
            "description": f"Initiated alert dispatch via {payload.sending_method or 'SMS'}.",
            "timestamp": activated_str,
            "status": "Attempted",
            "icon": "send"
        }
    ]

    if payload.created_offline:
        timeline.append({
            "id": generate_event_id(),
            "incident_id": incident_code,
            "event": "OFFLINE_SYNCED",
            "title": "Cloud Synchronization Established",
            "description": f"Incident successfully synchronized to SafeLink Cloud after {payload.retry_count or 1} attempt(s).",
            "timestamp": now_str,
            "status": "Sent",
            "icon": "cloud-done"
        })

    if first_contact:
        timeline.append({
            "id": generate_event_id(),
            "incident_id": incident_code,
            "event": "NOTIFICATION_ATTEMPTED",
            "title": f"Contact Notified (Level 1): {contact_name}",
            "description": f"Priority 1 notification dispatched to {contact_phone}. Escalation timer running ({escalation.get('timeout_seconds', 120)}s timeout).",
            "timestamp": now_str,
            "status": "Attempted",
            "contact_id": contact_id,
            "contact_name": contact_name,
            "contact_phone": contact_phone,
            "escalation_level": 1,
            "icon": "paper-plane"
        })

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
        "offline_incident_id": payload.offline_incident_id,
        "created_offline": bool(payload.created_offline),
        "offline_synced_at": now_str if payload.created_offline else None,
        "retry_count": payload.retry_count or 0,
        "connectivity_status": "OFFLINE_SYNCED" if payload.created_offline else "ONLINE_DIRECT",
        "user_id": user_id,
        "user_name": user_name,
        "user_phone": user_phone,
        "activated_at": activated_str,
        "timestamp": activated_str,
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
        "escalation": escalation,
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

    query = {
        "$or": [
            {"incident_id": incident_id},
            {"incident_code": incident_id},
            {"id": incident_id},
            {"_id": incident_id},
            {"offline_incident_id": incident_id},
        ]
    }
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

    # Cancellation PIN verification if configured on user profile
    pin_hash = current_user.get("cancellation_pin_hash")
    if pin_hash and not is_admin:
        if not payload.pin and not payload.password_bypass:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cancellation PIN or account password bypass is required to cancel this active emergency."
            )
        if payload.pin:
            if not verify_password(payload.pin, pin_hash):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid emergency cancellation PIN. Please enter your valid 4-6 digit PIN."
                )
        elif payload.password_bypass:
            if not verify_password(payload.password_bypass, current_user.get("password_hash", "")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid account password for PIN bypass."
                )

    query = {
        "$or": [
            {"incident_id": incident_id},
            {"incident_code": incident_id},
            {"id": incident_id},
            {"_id": incident_id},
            {"offline_incident_id": incident_id},
        ]
    }
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    now_str = datetime.now(timezone.utc).isoformat()
    reason = payload.reason or "False alarm / Accidental activation"
    status_details = f"SOS Cancelled by user. Reason: {reason}"
    retention_expires_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()

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
            "retention_expires_at": retention_expires_at,
            "escalation": {
                "status": "CANCELLED",
                "level": 1,
                "next_escalation_at": None,
                "seconds_remaining": None
            },
            "timeline": [{
                "id": generate_event_id(),
                "incident_id": incident_id,
                "event": "SOS_CANCELLED",
                "title": "Incident Cancelled",
                "description": f"Cancelled by user. Reason: {reason}",
                "timestamp": now_str,
                "status": "Resolved",
                "icon": "close-circle"
            }]
        }
        await db_manager.sos_alerts.insert_one(doc)
        return format_incident(doc)

    target_id = alert["id"]
    timeline = alert.get("timeline") or []
    timeline.append({
        "id": generate_event_id(),
        "incident_id": alert.get("incident_id", incident_id),
        "event": "SOS_CANCELLED",
        "title": "Incident Cancelled",
        "description": f"Cancelled by user. Reason: {reason}",
        "timestamp": now_str,
        "status": "Resolved",
        "icon": "close-circle"
    })
    escalation = alert.get("escalation") or {}
    escalation["status"] = "CANCELLED"
    escalation["next_escalation_at"] = None
    escalation["seconds_remaining"] = None

    updates = {
        "status": "CANCELLED",
        "status_details": status_details,
        "cancelled_at": now_str,
        "cancellation_reason": reason,
        "retention_expires_at": retention_expires_at,
        "timeline": timeline,
        "escalation": escalation,
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

    query = {
        "$or": [
            {"incident_id": incident_id},
            {"incident_code": incident_id},
            {"id": incident_id},
            {"_id": incident_id},
            {"offline_incident_id": incident_id},
        ]
    }
    if not is_admin:
        query["user_id"] = user_id

    alert = await db_manager.sos_alerts.find_one(query)
    now_str = datetime.now(timezone.utc).isoformat()
    note = payload.resolution_note or "Situation safely resolved"
    status_details = f"SOS safely resolved. Note: {note}"
    retention_expires_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()

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
            "retention_expires_at": retention_expires_at,
            "timeline": [{
                "id": generate_event_id(),
                "incident_id": incident_id,
                "event": "SOS_RESOLVED",
                "title": "Incident Safely Resolved",
                "description": f"Marked resolved. Note: {note}",
                "timestamp": now_str,
                "status": "Resolved",
                "icon": "checkmark-circle"
            }],
            "escalation": {
                "status": "RESOLVED",
                "level": 1,
                "attempts": 1,
                "timeout_seconds": 120,
                "next_escalation_at": None,
                "seconds_remaining": None
            }
        }
        await db_manager.sos_alerts.insert_one(doc)
        return format_incident(doc)

    target_id = alert["id"]
    timeline = alert.get("timeline") or []
    timeline.append({
        "id": generate_event_id(),
        "incident_id": alert.get("incident_id", incident_id),
        "event": "SOS_RESOLVED",
        "title": "Incident Safely Resolved",
        "description": f"Marked resolved. Note: {note}",
        "timestamp": now_str,
        "status": "Resolved",
        "icon": "checkmark-circle"
    })
    escalation = alert.get("escalation") or {}
    escalation["status"] = "RESOLVED"
    escalation["next_escalation_at"] = None
    escalation["seconds_remaining"] = None

    updates = {
        "status": "RESOLVED",
        "status_details": status_details,
        "resolved_at": now_str,
        "resolution_note": note,
        "retention_expires_at": retention_expires_at,
        "timeline": timeline,
        "escalation": escalation,
    }
    await db_manager.sos_alerts.update_one({"id": target_id}, {"$set": updates})
    updated = await db_manager.sos_alerts.find_one({"id": target_id})
    return format_incident(updated or {**alert, **updates})

# Emergency Event Timeline APIs
@router.get("/{incident_id}/timeline", response_model=List[Dict[str, Any]])
async def get_incident_timeline(
    incident_id: str,
    current_user: dict = Depends(get_current_user)
):
    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if current_user.get("role") != "ADMIN":
        query["user_id"] = current_user["id"]

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")
    formatted = format_incident(alert)
    return formatted.get("timeline") or []

@router.post("/{incident_id}/timeline", response_model=SOSIncidentResponse)
async def append_timeline_event(
    incident_id: str,
    payload: TimelineEventCreate,
    current_user: dict = Depends(get_current_user)
):
    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if current_user.get("role") != "ADMIN":
        query["user_id"] = current_user["id"]

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    event_id = payload.id or generate_event_id()
    timeline = alert.get("timeline") or []

    # Idempotency check: avoid duplicate event IDs
    if any(item.get("id") == event_id for item in timeline):
        return format_incident(alert)

    now_str = payload.timestamp or datetime.now(timezone.utc).isoformat()
    new_event = {
        "id": event_id,
        "incident_id": alert.get("incident_id", incident_id),
        "event": payload.event,
        "title": payload.title,
        "description": payload.description,
        "timestamp": now_str,
        "status": payload.status or "Pending",
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "contact_id": payload.contact_id,
        "contact_name": payload.contact_name,
        "contact_phone": payload.contact_phone,
        "escalation_level": payload.escalation_level,
        "icon": payload.icon or "alert-circle"
    }
    timeline.append(new_event)
    timeline.sort(key=lambda x: str(x.get("timestamp", "")))

    await db_manager.sos_alerts.update_one({"id": alert["id"]}, {"$set": {"timeline": timeline}})
    updated = await db_manager.sos_alerts.find_one({"id": alert["id"]})
    return format_incident(updated or alert)

@router.post("/{incident_id}/timeline/sync", response_model=SOSIncidentResponse)
async def sync_timeline_events(
    incident_id: str,
    payload: TimelineSyncPayload,
    current_user: dict = Depends(get_current_user)
):
    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if current_user.get("role") != "ADMIN":
        query["user_id"] = current_user["id"]

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    timeline = alert.get("timeline") or []
    existing_ids = {item.get("id") for item in timeline if item.get("id")}
    added = False

    for evt in payload.events:
        evt_id = evt.id or generate_event_id()
        if evt_id in existing_ids:
            continue
        existing_ids.add(evt_id)
        new_event = {
            "id": evt_id,
            "incident_id": alert.get("incident_id", incident_id),
            "event": evt.event,
            "title": evt.title,
            "description": evt.description,
            "timestamp": evt.timestamp or datetime.now(timezone.utc).isoformat(),
            "status": evt.status or "Pending",
            "latitude": evt.latitude,
            "longitude": evt.longitude,
            "accuracy": evt.accuracy,
            "contact_id": evt.contact_id,
            "contact_name": evt.contact_name,
            "contact_phone": evt.contact_phone,
            "escalation_level": evt.escalation_level,
            "icon": evt.icon or "alert-circle"
        }
        timeline.append(new_event)
        added = True

    if added:
        timeline.sort(key=lambda x: str(x.get("timestamp", "")))
        await db_manager.sos_alerts.update_one({"id": alert["id"]}, {"$set": {"timeline": timeline}})
        alert = await db_manager.sos_alerts.find_one({"id": alert["id"]}) or alert

    return format_incident(alert)

# Automatic Escalation & Acknowledgement APIs
@router.get("/{incident_id}/escalation", response_model=EscalationStatusResponse)
async def get_incident_escalation(
    incident_id: str,
    current_user: dict = Depends(get_current_user)
):
    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    if current_user.get("role") != "ADMIN":
        query["user_id"] = current_user["id"]

    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    formatted = format_incident(alert)
    esc = formatted.get("escalation")
    if not esc:
        return EscalationStatusResponse(
            level=1,
            status="DISABLED",
            current_contact_id=alert.get("default_contact_id"),
            current_contact_name=alert.get("primary_contact_name"),
            current_contact_phone=alert.get("primary_contact_phone"),
            attempts=1,
            timeout_seconds=120,
            auto_escalation_enabled=False
        )
    return EscalationStatusResponse(**esc)

@router.post("/{incident_id}/acknowledge", response_model=SOSIncidentResponse)
async def acknowledge_incident(
    incident_id: str,
    payload: ContactAcknowledgementRequest,
    current_user: dict = Depends(get_current_user)
):
    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    now_str = datetime.now(timezone.utc).isoformat()
    escalation = alert.get("escalation") or {}
    timeline = alert.get("timeline") or []
    contact_name = payload.contact_name or current_user.get("name") or "Emergency Contact"

    if payload.response_status in ("I_AM_RESPONDING", "ACKNOWLEDGED"):
        escalation["status"] = "ACKNOWLEDGED"
        escalation["next_escalation_at"] = None
        escalation["seconds_remaining"] = None
        escalation["acknowledged_by"] = {
            "contact_id": payload.contact_id or current_user.get("id"),
            "contact_name": contact_name,
            "contact_phone": payload.contact_phone or current_user.get("phone_number"),
            "response_status": payload.response_status,
            "note": payload.note,
            "timestamp": now_str
        }

        timeline.append({
            "id": generate_event_id(),
            "incident_id": alert.get("incident_id", incident_id),
            "event": "CONTACT_ACKNOWLEDGED",
            "title": f"Contact Acknowledged: {contact_name}",
            "description": f"Responder {contact_name} responded: '{payload.response_status}'. Automatic escalation stopped.",
            "timestamp": now_str,
            "status": "Acknowledged",
            "contact_id": payload.contact_id,
            "contact_name": contact_name,
            "icon": "shield-checkmark"
        })

    elif payload.response_status == "UNABLE_TO_RESPOND":
        # Contact rejected or unable to respond; trigger immediate next escalation
        timeline.append({
            "id": generate_event_id(),
            "incident_id": alert.get("incident_id", incident_id),
            "event": "CONTACT_REJECTED",
            "title": f"Unable to Respond: {contact_name}",
            "description": f"Contact {contact_name} indicated unable to respond. Escalating immediately to next contact.",
            "timestamp": now_str,
            "status": "Failed",
            "contact_id": payload.contact_id,
            "contact_name": contact_name,
            "icon": "alert-circle"
        })

        # Advance to next contact immediately
        contacts = await db_manager.emergency_contacts.find(
            {"user_id": alert.get("user_id")},
            sort=[("priority", 1), ("is_default", -1), ("created_at", 1)]
        )
        current_lvl = escalation.get("level", 1)
        next_lvl = current_lvl + 1
        timeout_sec = escalation.get("timeout_seconds", 120)

        if len(contacts) >= next_lvl:
            next_c = contacts[next_lvl - 1]
            has_more = len(contacts) > next_lvl
            escalation["level"] = next_lvl
            escalation["current_contact_id"] = next_c.get("id")
            escalation["current_contact_name"] = next_c.get("name")
            escalation["current_contact_phone"] = next_c.get("phone")
            escalation["attempts"] = escalation.get("attempts", 1) + 1
            escalation["next_escalation_at"] = (datetime.now(timezone.utc) + timedelta(seconds=timeout_sec)).isoformat() if has_more else None

            timeline.append({
                "id": generate_event_id(),
                "incident_id": alert.get("incident_id", incident_id),
                "event": "ESCALATION_INITIATED",
                "title": f"Escalated to Level {next_lvl}",
                "description": f"Immediate escalation triggered after rejection by {contact_name}.",
                "timestamp": now_str,
                "status": "Escalated",
                "escalation_level": next_lvl,
                "icon": "trending-up"
            })
            timeline.append({
                "id": generate_event_id(),
                "incident_id": alert.get("incident_id", incident_id),
                "event": "ADDITIONAL_CONTACT_NOTIFIED",
                "title": f"Contact Notified: {next_c.get('name')}",
                "description": f"Level {next_lvl} alert sent to {next_c.get('phone')} (Priority {next_c.get('priority', next_lvl)}).",
                "timestamp": now_str,
                "status": "Attempted",
                "contact_id": next_c.get("id"),
                "contact_name": next_c.get("name"),
                "contact_phone": next_c.get("phone"),
                "escalation_level": next_lvl,
                "icon": "paper-plane"
            })
        else:
            escalation["status"] = "EXHAUSTED"
            escalation["next_escalation_at"] = None

    timeline.sort(key=lambda x: str(x.get("timestamp", "")))
    match_q = {"$or": [{"_id": alert["_id"]}, {"id": alert.get("id", "")}]} if "_id" in alert else {"id": alert.get("id", "")}
    await db_manager.sos_alerts.update_one(
        match_q,
        {"$set": {
            "escalation": escalation,
            "timeline": timeline,
            "accepted_rescue": escalation.get("acknowledged_by"),
            "primary_contact_name": escalation.get("current_contact_name"),
            "primary_contact_phone": escalation.get("current_contact_phone"),
        }}
    )
    updated = await db_manager.sos_alerts.find_one({"id": alert["id"]})
    return format_incident(updated or alert)

# Public Responder Portal (SMS Link)
@router.get("/ack/{incident_id}")
async def public_responder_view(incident_id: str):
    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Emergency incident record not found.")

    formatted = format_incident(alert)
    return {
        "incident_id": formatted["incident_id"],
        "user_name": formatted["user_name"],
        "user_phone": formatted.get("user_phone"),
        "status": formatted["status"],
        "activated_at": formatted["activated_at"],
        "latitude": formatted["latitude"],
        "longitude": formatted["longitude"],
        "address": formatted.get("address"),
        "google_maps_url": formatted["google_maps_url"],
        "emergency_message": formatted["emergency_message"],
        "escalation": formatted.get("escalation"),
        "timeline": formatted.get("timeline"),
    }

@router.post("/ack/{incident_id}")
async def public_responder_post_ack(incident_id: str, payload: ContactAcknowledgementRequest):
    query = {"$or": [{"incident_id": incident_id}, {"id": incident_id}, {"_id": incident_id}]}
    alert = await db_manager.sos_alerts.find_one(query)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Emergency incident record not found.")

    now_str = datetime.now(timezone.utc).isoformat()
    escalation = alert.get("escalation") or {}
    timeline = alert.get("timeline") or []
    contact_name = payload.contact_name or "External Responder"

    # Prevent duplicate positive acknowledgements
    if escalation.get("status") == "ACKNOWLEDGED" and payload.response_status in ("I_AM_RESPONDING", "ACCEPTED_RESPONSIBILITY", "ACKNOWLEDGED"):
        existing_ack = escalation.get("acknowledged_by", {})
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Emergency is already acknowledged by {existing_ack.get('contact_name', 'another responder')}."
        )

    if payload.response_status in ("I_AM_RESPONDING", "ACCEPTED_RESPONSIBILITY", "ACKNOWLEDGED"):
        escalation["status"] = "ACKNOWLEDGED"
        escalation["next_escalation_at"] = None
        escalation["seconds_remaining"] = None
        escalation["acknowledged_by"] = {
            "contact_id": payload.contact_id,
            "contact_name": contact_name,
            "contact_phone": payload.contact_phone,
            "response_status": payload.response_status,
            "note": payload.note,
            "timestamp": now_str
        }

        timeline.append({
            "id": generate_event_id(),
            "incident_id": alert.get("incident_id", incident_id),
            "event": "CONTACT_ACKNOWLEDGED",
            "title": f"Contact Acknowledged: {contact_name}",
            "description": f"Emergency responder {contact_name} responded: '{payload.response_status}'. Escalation stopped.",
            "timestamp": now_str,
            "status": "Acknowledged",
            "contact_id": payload.contact_id,
            "contact_name": contact_name,
            "icon": "shield-checkmark"
        })

    elif payload.response_status in ("UNABLE_TO_RESPOND", "UNABLE_TO_HELP"):
        timeline.append({
            "id": generate_event_id(),
            "incident_id": alert.get("incident_id", incident_id),
            "event": "CONTACT_REJECTED",
            "title": f"Unable to Respond: {contact_name}",
            "description": f"Responder {contact_name} indicated unable to assist. Escalating immediately to next contact.",
            "timestamp": now_str,
            "status": "Failed",
            "contact_id": payload.contact_id,
            "contact_name": contact_name,
            "icon": "alert-circle"
        })

        # Advance to next contact immediately
        contacts = await db_manager.emergency_contacts.find(
            {"user_id": alert.get("user_id")},
            sort=[("priority", 1), ("is_default", -1), ("created_at", 1)]
        )
        current_lvl = escalation.get("level", 1)
        next_lvl = current_lvl + 1
        timeout_sec = escalation.get("timeout_seconds", 120)

        if len(contacts) >= next_lvl:
            next_c = contacts[next_lvl - 1]
            has_more = len(contacts) > next_lvl
            escalation["level"] = next_lvl
            escalation["current_contact_id"] = next_c.get("id")
            escalation["current_contact_name"] = next_c.get("name")
            escalation["current_contact_phone"] = next_c.get("phone")
            escalation["attempts"] = escalation.get("attempts", 1) + 1
            escalation["next_escalation_at"] = (datetime.now(timezone.utc) + timedelta(seconds=timeout_sec)).isoformat() if has_more else None

            timeline.append({
                "id": generate_event_id(),
                "incident_id": alert.get("incident_id", incident_id),
                "event": "ESCALATION_INITIATED",
                "title": f"Escalated to Level {next_lvl}",
                "description": f"Immediate escalation triggered after rejection by {contact_name}.",
                "timestamp": now_str,
                "status": "Escalated",
                "escalation_level": next_lvl,
                "icon": "trending-up"
            })
            timeline.append({
                "id": generate_event_id(),
                "incident_id": alert.get("incident_id", incident_id),
                "event": "ADDITIONAL_CONTACT_NOTIFIED",
                "title": f"Contact Notified: {next_c.get('name')}",
                "description": f"Level {next_lvl} alert sent to {next_c.get('phone')} (Priority {next_c.get('priority', next_lvl)}).",
                "timestamp": now_str,
                "status": "Attempted",
                "contact_id": next_c.get("id"),
                "contact_name": next_c.get("name"),
                "contact_phone": next_c.get("phone"),
                "escalation_level": next_lvl,
                "icon": "paper-plane"
            })
        else:
            escalation["status"] = "EXHAUSTED"
            escalation["next_escalation_at"] = None

    timeline.sort(key=lambda x: str(x.get("timestamp", "")))
    match_q = {"$or": [{"_id": alert["_id"]}, {"id": alert.get("id", "")}]} if "_id" in alert else {"id": alert.get("id", "")}
    await db_manager.sos_alerts.update_one(
        match_q,
        {"$set": {
            "escalation": escalation,
            "timeline": timeline,
            "accepted_rescue": escalation.get("acknowledged_by"),
            "primary_contact_name": escalation.get("current_contact_name"),
            "primary_contact_phone": escalation.get("current_contact_phone"),
        }}
    )
    return {"status": "success", "response_status": payload.response_status, "message": "Acknowledgement recorded successfully."}
