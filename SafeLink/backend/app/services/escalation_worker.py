import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from app.database import db_manager

logger = logging.getLogger("safelink.escalation")

_worker_task: Optional[asyncio.Task] = None
_is_running: bool = False

def generate_event_id() -> str:
    return f"evt_{uuid.uuid4().hex[:12]}"

def calculate_seconds_remaining(next_escalation_at: Optional[str]) -> Optional[int]:
    if not next_escalation_at:
        return None
    try:
        target_dt = datetime.fromisoformat(next_escalation_at.replace("Z", "+00:00"))
        now_dt = datetime.now(timezone.utc)
        diff = int((target_dt - now_dt).total_seconds())
        return max(0, diff)
    except Exception:
        return None

def build_initial_escalation(
    contacts: List[Dict[str, Any]],
    user: Dict[str, Any],
    now: datetime
) -> Dict[str, Any]:
    """
    Initializes Level 1 escalation state when an SOS alert is created.
    """
    now_str = now.isoformat()
    auto_enabled = user.get("auto_escalation_enabled", True)
    timeout_sec = user.get("escalation_timeout_seconds", 120)

    if not contacts:
        return {
            "level": 1,
            "status": "DISABLED",
            "current_contact_id": None,
            "current_contact_name": "No Emergency Contacts Configured",
            "current_contact_phone": None,
            "attempts": 0,
            "timeout_seconds": timeout_sec,
            "next_escalation_at": None,
            "seconds_remaining": None,
            "acknowledged_by": None,
            "auto_escalation_enabled": False,
        }

    first_contact = contacts[0]
    next_at = (now + timedelta(seconds=timeout_sec)).isoformat() if auto_enabled and len(contacts) > 1 else None

    return {
        "level": 1,
        "status": "WAITING_ACK" if auto_enabled else "DISABLED",
        "current_contact_id": first_contact.get("id"),
        "current_contact_name": first_contact.get("name"),
        "current_contact_phone": first_contact.get("phone"),
        "attempts": 1,
        "timeout_seconds": timeout_sec,
        "next_escalation_at": next_at,
        "seconds_remaining": timeout_sec if next_at else None,
        "acknowledged_by": None,
        "auto_escalation_enabled": auto_enabled,
    }

async def process_active_escalations():
    """
    Scans all active SOS incidents and advances escalation ladder if acknowledgement timer expired.
    """
    try:
        active_incidents = await db_manager.sos_alerts.find({"status": "ACTIVE"})
        now = datetime.now(timezone.utc)

        for incident in active_incidents:
            escalation = incident.get("escalation")
            if not escalation:
                continue

            if escalation.get("status") != "WAITING_ACK" or not escalation.get("auto_escalation_enabled"):
                continue

            next_escalation_at = escalation.get("next_escalation_at")
            if not next_escalation_at:
                continue

            try:
                target_dt = datetime.fromisoformat(next_escalation_at.replace("Z", "+00:00"))
            except Exception:
                continue

            if now >= target_dt:
                # Timer expired! Advance to next escalation contact
                user_id = incident.get("user_id")
                contacts = await db_manager.emergency_contacts.find(
                    {"user_id": user_id},
                    sort=[("priority", 1), ("is_default", -1), ("created_at", 1)]
                )

                current_level = escalation.get("level", 1)
                next_level = current_level + 1
                timeout_sec = escalation.get("timeout_seconds", 120)

                timeline = incident.get("timeline") or []
                now_str = now.isoformat()
                prev_contact_name = escalation.get("current_contact_name", "Previous Contact")

                # If there is another contact in the priority ladder
                if len(contacts) >= next_level:
                    next_contact = contacts[next_level - 1]
                    has_further_contacts = len(contacts) > next_level
                    new_next_at = (now + timedelta(seconds=timeout_sec)).isoformat() if has_further_contacts else None

                    escalation["level"] = next_level
                    escalation["current_contact_id"] = next_contact.get("id")
                    escalation["current_contact_name"] = next_contact.get("name")
                    escalation["current_contact_phone"] = next_contact.get("phone")
                    escalation["attempts"] = escalation.get("attempts", 1) + 1
                    escalation["next_escalation_at"] = new_next_at
                    escalation["seconds_remaining"] = timeout_sec if new_next_at else None

                    # Timeline: Escalation Initiated
                    timeline.append({
                        "id": generate_event_id(),
                        "incident_id": incident.get("incident_id"),
                        "event": "ESCALATION_INITIATED",
                        "title": f"Escalated to Level {next_level}",
                        "description": (
                            f"No acknowledgement from Level {current_level} ({prev_contact_name}) "
                            f"within {timeout_sec}s timeout. Escalating to Level {next_level}."
                        ),
                        "timestamp": now_str,
                        "status": "Escalated",
                        "escalation_level": next_level,
                        "icon": "trending-up"
                    })

                    # Timeline: Additional Contact Notified
                    timeline.append({
                        "id": generate_event_id(),
                        "incident_id": incident.get("incident_id"),
                        "event": "ADDITIONAL_CONTACT_NOTIFIED",
                        "title": f"Contact Notified: {next_contact.get('name')}",
                        "description": (
                            f"Priority {next_contact.get('priority', next_level)} responder "
                            f"{next_contact.get('name')} ({next_contact.get('phone')}) notified."
                        ),
                        "timestamp": now_str,
                        "status": "Attempted",
                        "contact_id": next_contact.get("id"),
                        "contact_name": next_contact.get("name"),
                        "contact_phone": next_contact.get("phone"),
                        "escalation_level": next_level,
                        "icon": "paper-plane"
                    })

                    logger.info(
                        f"[Escalation Worker] Incident {incident.get('incident_id')} escalated to "
                        f"Level {next_level} ({next_contact.get('name')})"
                    )

                else:
                    # No more contacts in list - ladder exhausted
                    escalation["status"] = "EXHAUSTED"
                    escalation["next_escalation_at"] = None
                    escalation["seconds_remaining"] = None

                    timeline.append({
                        "id": generate_event_id(),
                        "incident_id": incident.get("incident_id"),
                        "event": "ESCALATION_EXHAUSTED",
                        "title": "All Escalation Levels Completed",
                        "description": (
                            f"All {len(contacts)} configured emergency contacts have been notified. "
                            f"SafeLink remains armed awaiting responder acknowledgement."
                        ),
                        "timestamp": now_str,
                        "status": "Failed",
                        "escalation_level": current_level,
                        "icon": "alert-circle"
                    })

                    logger.info(
                        f"[Escalation Worker] Incident {incident.get('incident_id')} escalation exhausted "
                        f"({len(contacts)} contacts notified)."
                    )

                # Persist updates to DB
                await db_manager.sos_alerts.update_one(
                    {"id": incident["id"]},
                    {"$set": {
                        "escalation": escalation,
                        "timeline": timeline,
                        "primary_contact_name": escalation.get("current_contact_name"),
                        "primary_contact_phone": escalation.get("current_contact_phone"),
                    }}
                )

    except Exception as e:
        logger.error(f"[Escalation Worker] Error in check cycle: {e}")

async def run_escalation_worker():
    global _is_running
    _is_running = True
    logger.info("SafeLink Automatic Escalation Worker started.")
    while _is_running:
        try:
            await process_active_escalations()
        except Exception as e:
            logger.error(f"[Escalation Worker] Unexpected loop error: {e}")
        await asyncio.sleep(4)

def start_escalation_task() -> asyncio.Task:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(run_escalation_worker())
    return _worker_task

def stop_escalation_task():
    global _is_running, _worker_task
    _is_running = False
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        logger.info("SafeLink Automatic Escalation Worker stopped.")
