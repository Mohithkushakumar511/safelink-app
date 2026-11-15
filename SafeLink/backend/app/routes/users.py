from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from app.schemas.user import UserProfileResponse, UserUpdateRequest
from app.dependencies import get_current_user
from app.database import db_manager
from app.routes.auth import format_user_profile

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(current_user: dict = Depends(get_current_user)):
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

    # Never allow updating role via profile update!
    await db_manager.users.update_one({"id": user_id}, {"$set": updates})
    updated = await db_manager.users.find_one({"id": user_id})
    return format_user_profile(updated or {**current_user, **updates})
