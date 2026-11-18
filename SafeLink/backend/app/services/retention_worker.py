import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from app.database import db_manager

logger = logging.getLogger("safelink.retention")

RETENTION_PERIOD_HOURS = 48
CHECK_INTERVAL_SECONDS = 60

RECORDINGS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "recordings"

_retention_task: Optional[asyncio.Task] = None
_is_running: bool = False

def compute_retention_info(doc: dict, now: Optional[datetime] = None) -> Tuple[Optional[str], Optional[float]]:
    """
    Computes 48-hour retention expiration and hours remaining.
    STRICT RULE: Only resolved or cancelled incidents have a retention expiration.
    Active incidents NEVER expire or auto-delete, regardless of age.
    """
    status = doc.get("status")
    if status not in ("RESOLVED", "CANCELLED"):
        return None, None

    conclusion_iso = doc.get("resolved_at") or doc.get("cancelled_at")
    if not conclusion_iso:
        return None, None

    try:
        conclusion_dt = datetime.fromisoformat(conclusion_iso.replace("Z", "+00:00"))
        if conclusion_dt.tzinfo is None:
            conclusion_dt = conclusion_dt.replace(tzinfo=timezone.utc)

        expires_at = conclusion_dt + timedelta(hours=RETENTION_PERIOD_HOURS)
        now_dt = now or datetime.now(timezone.utc)

        seconds_remaining = (expires_at - now_dt).total_seconds()
        hours_remaining = max(0.0, round(seconds_remaining / 3600.0, 1))

        return expires_at.isoformat(), hours_remaining
    except Exception as e:
        logger.warning(f"[Retention] Error computing expiration for incident {doc.get('id')}: {e}")
        return None, None

async def purge_incident_records(incident: dict) -> bool:
    """
    Permanently and completely purges an incident and all its linked records:
    1. Location history breadcrumbs
    2. Voice recordings stored on filesystem
    3. The emergency alert document itself
    CRITICAL SAFETY CHECK: Refuses to delete active incidents under any circumstance.
    """
    status = incident.get("status")
    incident_id = incident.get("id") or incident.get("_id")
    incident_code = incident.get("incident_id") or incident_id

    if status == "ACTIVE":
        logger.error(
            f"[Retention Security] Refusing to delete active emergency incident {incident_code}!"
        )
        return False

    try:
        # 1. Delete associated location history records without leaving orphans
        loc_res = await db_manager.location_history.delete_many({
            "$or": [
                {"incident_id": str(incident_code)},
                {"incident_id": str(incident_id)},
            ]
        })
        deleted_loc_count = getattr(loc_res, "deleted_count", 0)

        # 2. Delete voice recording files on filesystem if attached
        if RECORDINGS_DIR.exists():
            safe_name = str(incident_code).replace(":", "_").replace("/", "_")
            for ext in ["m4a", "mp4", "aac", "wav", "3gp"]:
                audio_file = RECORDINGS_DIR / f"{safe_name}.{ext}"
                if audio_file.exists():
                    try:
                        audio_file.unlink()
                        logger.info(f"[Retention] Removed voice recording: {audio_file.name}")
                    except Exception as f_err:
                        logger.warning(f"[Retention] Could not remove audio file {audio_file}: {f_err}")

        # 3. Permanently remove the incident from sos_alerts
        alert_res = await db_manager.sos_alerts.delete_one({"id": str(incident_id)})
        deleted_alert_count = getattr(alert_res, "deleted_count", 0)

        logger.info(
            f"[Retention] Successfully purged 48h-expired incident #{incident_code} "
            f"(Status: {status}, Location breadcrumbs purged: {deleted_loc_count}, Alerts purged: {deleted_alert_count})"
        )
        return True
    except Exception as err:
        logger.error(f"[Retention] Failed to purge incident {incident_code}: {err}", exc_info=True)
        return False

async def cleanup_expired_incidents() -> int:
    """
    Scans for resolved and cancelled incidents older than 48 hours and purges them.
    Active incidents are strictly filtered out and preserved.
    """
    now = datetime.now(timezone.utc)
    purged_count = 0

    try:
        # Retrieve candidate concluded incidents only
        concluded_incidents = await db_manager.sos_alerts.find({
            "status": {"$in": ["RESOLVED", "CANCELLED"]}
        })

        for incident in concluded_incidents:
            # Redundant safety check: verify not active
            if incident.get("status") not in ("RESOLVED", "CANCELLED"):
                continue

            expires_at_iso, hours_remaining = compute_retention_info(incident, now=now)
            if not expires_at_iso:
                continue

            # If hours_remaining == 0 and now >= expires_at, window has expired
            expires_at = datetime.fromisoformat(expires_at_iso.replace("Z", "+00:00"))
            if now >= expires_at:
                success = await purge_incident_records(incident)
                if success:
                    purged_count += 1

    except Exception as e:
        logger.error(f"[Retention] Cleanup cycle error: {e}", exc_info=True)

    return purged_count

async def run_retention_worker():
    """
    Scheduled background worker. Runs on backend launch and repeats every 60 seconds.
    """
    global _is_running
    _is_running = True
    logger.info("SafeLink 48-Hour Data Retention Worker started.")

    # Immediate pass upon startup (handles overdue incidents after restart)
    try:
        initial_purged = await cleanup_expired_incidents()
        if initial_purged > 0:
            logger.info(f"[Retention Startup] Cleaned up {initial_purged} overdue concluded incidents.")
    except Exception as e:
        logger.error(f"[Retention Startup] Initial sweep error: {e}")

    while _is_running:
        try:
            await cleanup_expired_incidents()
        except Exception as e:
            logger.error(f"[Retention Worker] Loop cycle error: {e}")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)

def start_retention_task() -> asyncio.Task:
    global _retention_task
    if _retention_task is None or _retention_task.done():
        _retention_task = asyncio.create_task(run_retention_worker())
    return _retention_task

def stop_retention_task():
    global _is_running, _retention_task
    _is_running = False
    if _retention_task and not _retention_task.done():
        _retention_task.cancel()
        logger.info("SafeLink 48-Hour Data Retention Worker stopped.")
