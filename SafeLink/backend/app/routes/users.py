import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse
from app.schemas.user import (
    UserProfileResponse,
    UserUpdateRequest,
    SetCancellationPinRequest,
    VerifyCancellationPinRequest,
    ResetCancellationPinRequest,
    QRSettingsUpdateRequest,
    PublicEmergencyCardResponse,
)
from app.dependencies import get_current_user
from app.database import db_manager
from app.routes.auth import format_user_profile
from app.services.auth_service import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    # Ensure user has a QR token generated
    if not current_user.get("qr_token"):
        new_token = secrets.token_urlsafe(16)
        await db_manager.users.update_one({"id": user_id}, {"$set": {"qr_token": new_token}})
        current_user["qr_token"] = new_token
    return format_user_profile(current_user)

@router.put("/me", response_model=UserProfileResponse)
async def update_my_profile(
    payload: UserUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    now_str = datetime.now(timezone.utc).isoformat()
    updates = {"updated_at": now_str}

    if payload.name is not None:
        updates["name"] = payload.name.strip()
        updates["display_name"] = payload.name.strip()
    if payload.phone_number is not None:
        updates["phone_number"] = payload.phone_number.strip()
    if payload.blood_type is not None:
        updates["blood_type"] = payload.blood_type.strip()
    if payload.allergies is not None:
        updates["allergies"] = payload.allergies.strip()
    if payload.medical_notes is not None:
        updates["medical_notes"] = payload.medical_notes.strip()
    if payload.existing_conditions is not None:
        updates["existing_conditions"] = payload.existing_conditions.strip()
    if payload.medications is not None:
        updates["medications"] = payload.medications.strip()
    if payload.share_medical_with_sos is not None:
        updates["share_medical_with_sos"] = bool(payload.share_medical_with_sos)
    if payload.auto_escalation_enabled is not None:
        updates["auto_escalation_enabled"] = bool(payload.auto_escalation_enabled)
    if payload.escalation_timeout_seconds is not None:
        updates["escalation_timeout_seconds"] = max(30, min(600, payload.escalation_timeout_seconds))
    if payload.language_preference is not None:
        if payload.language_preference in ("en", "kn", "hi"):
            updates["language_preference"] = payload.language_preference
    if payload.emergency_instructions is not None:
        updates["emergency_instructions"] = payload.emergency_instructions.strip()

    await db_manager.users.update_one({"id": user_id}, {"$set": updates})
    updated = await db_manager.users.find_one({"id": user_id})
    return format_user_profile(updated or {**current_user, **updates})

# SOS Cancellation PIN Management
@router.post("/cancellation-pin")
async def set_cancellation_pin(
    payload: SetCancellationPinRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Sets or updates the user's SOS Cancellation PIN.
    PIN is securely hashed with Argon2 and NEVER stored in plaintext.
    """
    pin = payload.pin.strip()
    if not pin.isdigit() or len(pin) < 4 or len(pin) > 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cancellation PIN must be 4 to 6 numeric digits."
        )

    # If user already has a PIN and provides a password, verify password
    has_existing = bool(current_user.get("cancellation_pin_hash"))
    if has_existing and payload.password:
        if not verify_password(payload.password, current_user.get("password_hash", "")):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect account password. PIN update rejected."
            )

    hashed_pin = hash_password(pin)
    now_str = datetime.now(timezone.utc).isoformat()
    await db_manager.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "cancellation_pin_hash": hashed_pin,
            "cancellation_pin_updated_at": now_str
        }}
    )
    return {
        "success": True,
        "message": "SOS Cancellation PIN successfully configured and secured.",
        "cancellation_pin_set": True
    }

@router.post("/verify-cancellation-pin")
async def verify_cancellation_pin(
    payload: VerifyCancellationPinRequest,
    current_user: dict = Depends(get_current_user)
):
    """Verifies whether the submitted PIN matches the user's configured PIN."""
    pin_hash = current_user.get("cancellation_pin_hash")
    if not pin_hash:
        return {"valid": True, "pin_configured": False}

    is_valid = verify_password(payload.pin.strip(), pin_hash)
    return {"valid": is_valid, "pin_configured": True}

@router.post("/reset-cancellation-pin")
async def reset_cancellation_pin(
    payload: ResetCancellationPinRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Safe PIN recovery process requiring account password authentication.
    Allows user to recover access if they forgot their cancellation PIN.
    """
    if not verify_password(payload.password, current_user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect account password. PIN reset authorization failed."
        )

    new_pin = payload.new_pin.strip()
    if not new_pin.isdigit() or len(new_pin) < 4 or len(new_pin) > 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New PIN must be 4 to 6 numeric digits."
        )

    hashed_pin = hash_password(new_pin)
    now_str = datetime.now(timezone.utc).isoformat()
    await db_manager.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "cancellation_pin_hash": hashed_pin,
            "cancellation_pin_updated_at": now_str
        }}
    )
    return {
        "success": True,
        "message": "SOS Cancellation PIN has been securely reset.",
        "cancellation_pin_set": True
    }

# Emergency QR Identity Card
@router.get("/qr/card")
async def get_my_qr_card(current_user: dict = Depends(get_current_user)):
    """Returns the current user's Emergency QR Identity Card and approved fields."""
    user_id = current_user["id"]
    qr_token = current_user.get("qr_token")
    if not qr_token:
        qr_token = secrets.token_urlsafe(16)
        await db_manager.users.update_one({"id": user_id}, {"$set": {"qr_token": qr_token}})
        current_user["qr_token"] = qr_token

    # Fetch emergency contacts
    contacts = await db_manager.emergency_contacts.find(
        {"user_id": user_id},
        sort=[("priority", 1)]
    )

    shared = current_user.get("qr_shared_fields") or {
        "share_name": True,
        "share_phone": True,
        "share_blood_type": True,
        "share_allergies": True,
        "share_medical_notes": True,
        "share_contacts": True,
        "share_instructions": True,
    }

    return {
        "qr_token": qr_token,
        "public_url": f"/users/qr/{qr_token}",
        "name": current_user.get("name") or current_user.get("display_name"),
        "phone_number": current_user.get("phone_number"),
        "blood_type": current_user.get("blood_type"),
        "allergies": current_user.get("allergies"),
        "existing_conditions": current_user.get("existing_conditions"),
        "medications": current_user.get("medications"),
        "medical_notes": current_user.get("medical_notes"),
        "emergency_instructions": current_user.get("emergency_instructions"),
        "emergency_contacts": [
            {
                "name": c.get("name"),
                "phone": c.get("phone"),
                "relationship": c.get("relationship", "Emergency Contact"),
                "priority": c.get("priority", 1)
            }
            for c in contacts
        ],
        "shared_fields": shared,
    }

@router.post("/qr/settings")
async def update_qr_settings(
    payload: QRSettingsUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Allows user to choose which fields to share on their emergency QR card."""
    user_id = current_user["id"]
    updates = {"qr_shared_fields": payload.shared_fields}
    if payload.emergency_instructions is not None:
        updates["emergency_instructions"] = payload.emergency_instructions.strip()

    await db_manager.users.update_one({"id": user_id}, {"$set": updates})
    return {"success": True, "message": "Emergency QR Card permissions updated."}

@router.post("/qr/regenerate")
async def regenerate_qr_token(current_user: dict = Depends(get_current_user)):
    """
    Revokes the current QR code token and establishes a new unguessable token.
    Any previously printed or cached QR code will immediately stop working.
    """
    user_id = current_user["id"]
    old_token = current_user.get("qr_token")
    new_token = secrets.token_urlsafe(16)
    now_str = datetime.now(timezone.utc).isoformat()

    # Track revoked tokens in a blacklist collection to guarantee non-reuse
    if old_token:
        await db_manager.revoked_tokens.insert_one({
            "token": old_token,
            "user_id": user_id,
            "revoked_at": now_str
        })

    await db_manager.users.update_one(
        {"id": user_id},
        {"$set": {"qr_token": new_token, "qr_token_regenerated_at": now_str}}
    )

    return {
        "success": True,
        "message": "Previous QR code revoked. New Emergency QR Code generated.",
        "qr_token": new_token,
        "public_url": f"/users/qr/{new_token}"
    }

# Public Emergency QR Scanner Endpoint (Unauthenticated - First Responders)
@router.get("/qr/{token}")
async def view_public_emergency_card(token: str, request: Request):
    """
    Public responder endpoint for emergency personnel scanning the physical QR card.
    Strictly returns ONLY the information explicitly approved by the user.
    Never exposes passwords, tokens, emails, or unshared medical history.
    """
    wants_html = "text/html" in request.headers.get("accept", "")

    # Check if token is revoked
    is_revoked = await db_manager.revoked_tokens.find_one({"token": token})
    if is_revoked:
        if wants_html:
            return HTMLResponse(
                """<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SafeLink Emergency Card - Revoked</title>
<style>
body { background: #0A1128; color: #fff; font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
.card { background: #0F1C3F; border: 2px solid #EF4444; border-radius: 16px; padding: 24px; max-width: 420px; text-align: center; }
h2 { color: #EF4444; margin-top: 0; }
p { color: #94A3B8; font-size: 14px; line-height: 1.5; }
</style></head>
<body>
<div class="card">
  <h2>QR CODE REVOKED</h2>
  <p>This Emergency QR Identity Card has been revoked by the cardholder and is no longer valid.</p>
</div>
</body></html>""",
                status_code=410
            )
        return PublicEmergencyCardResponse(
            is_valid=False,
            revoked_notice="This Emergency QR Code has been revoked by the cardholder and is no longer valid."
        )

    user = await db_manager.users.find_one({"qr_token": token})
    if not user:
        if wants_html:
            return HTMLResponse(
                """<!DOCTYPE html><html><body style="background:#0A1128;color:#fff;font-family:sans-serif;text-align:center;padding:40px;">
<h2>Emergency Card Not Found</h2><p style="color:#94A3B8;">The requested emergency QR code does not exist or has expired.</p></body></html>""",
                status_code=404
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency QR Card not found or has expired."
        )

    shared = user.get("qr_shared_fields") or {}
    contacts_data = None
    if shared.get("share_contacts", True):
        user_contacts = await db_manager.emergency_contacts.find(
            {"user_id": user["id"]},
            sort=[("priority", 1)]
        )
        contacts_data = [
            {
                "name": c.get("name"),
                "phone": c.get("phone"),
                "relationship": c.get("relationship", "Emergency Contact"),
                "priority": c.get("priority", 1)
            }
            for c in user_contacts
        ]

    card_data = PublicEmergencyCardResponse(
        is_valid=True,
        name=user.get("name") or user.get("display_name") if shared.get("share_name", True) else None,
        phone_number=user.get("phone_number") if shared.get("share_phone", True) else None,
        blood_type=user.get("blood_type") if shared.get("share_blood_type", True) else None,
        allergies=user.get("allergies") if shared.get("share_allergies", True) else None,
        existing_conditions=user.get("existing_conditions") if shared.get("share_medical_notes", True) else None,
        medications=user.get("medications") if shared.get("share_medical_notes", True) else None,
        medical_notes=user.get("medical_notes") if shared.get("share_medical_notes", True) else None,
        emergency_instructions=user.get("emergency_instructions") if shared.get("share_instructions", True) else None,
        emergency_contacts=contacts_data,
        card_generated_at=datetime.now(timezone.utc).isoformat()
    )

    if wants_html:
        contacts_html = ""
        if card_data.emergency_contacts:
            for c in card_data.emergency_contacts:
                clean_p = ''.join(ch for ch in c.phone if ch.isdigit() or ch == '+')
                contacts_html += f"""
<div style="background:#1E293B;border-radius:10px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
  <div>
    <div style="font-weight:700;color:#F8FAFC;">{c.name}</div>
    <div style="font-size:12px;color:#94A3B8;">{c.relationship} • {c.phone}</div>
  </div>
  <a href="tel:{clean_p}" style="background:#10B981;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-weight:700;font-size:13px;">CALL</a>
</div>"""

        return HTMLResponse(f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SafeLink Emergency Medical ID</title>
<style>
body {{ background: #0A1128; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 16px; display: flex; justify-content: center; }}
.card {{ background: #0F1C3F; border: 1.5px solid #DC2626; border-radius: 18px; max-width: 440px; width: 100%; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
.badge {{ background: #DC2626; color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; }}
.section-title {{ font-size: 12px; color: #94A3B8; text-transform: uppercase; font-weight: 700; margin-top: 16px; margin-bottom: 6px; }}
.pill {{ background: #1E293B; padding: 8px 12px; border-radius: 8px; font-size: 14px; color: #E2E8F0; margin-bottom: 6px; }}
</style></head>
<body>
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1E293B;padding-bottom:12px;">
    <div>
      <span class="badge">EMERGENCY MEDICAL ID</span>
      <h2 style="margin:8px 0 0 0;color:#FFFFFF;font-size:22px;">{card_data.name or "SafeLink Cardholder"}</h2>
      {f'<p style="margin:2px 0 0 0;color:#94A3B8;font-size:13px;">{card_data.phone_number}</p>' if card_data.phone_number else ''}
    </div>
    {f'<div style="background:#EF4444;color:#fff;border-radius:12px;padding:8px 14px;text-align:center;"><div style="font-size:10px;font-weight:700;">BLOOD</div><div style="font-size:18px;font-weight:900;">{card_data.blood_type}</div></div>' if card_data.blood_type else ''}
  </div>

  {f'<div class="section-title">Allergies</div><div class="pill" style="border-left:3px solid #EF4444;">{card_data.allergies}</div>' if card_data.allergies else ''}
  {f'<div class="section-title">Existing Conditions</div><div class="pill">{card_data.existing_conditions}</div>' if card_data.existing_conditions else ''}
  {f'<div class="section-title">Medications</div><div class="pill">{card_data.medications}</div>' if card_data.medications else ''}
  {f'<div class="section-title">Medical Notes</div><div class="pill">{card_data.medical_notes}</div>' if card_data.medical_notes else ''}
  {f'<div class="section-title">Emergency Instructions</div><div class="pill" style="background:#1B2A4A;border:1px dashed #3B82F6;">{card_data.emergency_instructions}</div>' if card_data.emergency_instructions else ''}

  <div class="section-title">Emergency Contacts (Call Immediately)</div>
  {contacts_html if contacts_html else '<p style="color:#64748B;font-size:13px;">No public contacts authorized.</p>'}

  <div style="text-align:center;margin-top:20px;border-top:1px solid #1E293B;padding-top:10px;color:#64748B;font-size:11px;">
    Verified Emergency Information • Powered by SafeLink
  </div>
</div>
</body></html>""")

    return card_data
