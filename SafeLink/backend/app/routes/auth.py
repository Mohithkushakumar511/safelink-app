from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from app.schemas.auth import UserRegisterRequest, UserLoginRequest, DemoLoginRequest, TokenResponse
from app.schemas.user import UserProfileResponse
from app.services.auth_service import hash_password, verify_password, create_access_token
from app.dependencies import get_current_user
from app.database import db_manager
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])

def format_user_profile(doc: dict) -> dict:
    u_id = str(doc.get("id") or doc.get("_id"))
    default_shared_fields = {
        "share_name": True,
        "share_phone": True,
        "share_blood_type": True,
        "share_allergies": True,
        "share_medical_notes": True,
        "share_contacts": True,
        "share_instructions": True,
    }
    return {
        "id": u_id,
        "email": doc["email"],
        "name": doc.get("name") or doc.get("display_name", "SafeLink User"),
        "display_name": doc.get("display_name") or doc.get("name", "SafeLink User"),
        "phone_number": doc.get("phone_number"),
        "role": doc.get("role", "USER"),
        "status": doc.get("status", "ACTIVE"),
        "blood_type": doc.get("blood_type"),
        "allergies": doc.get("allergies"),
        "medical_notes": doc.get("medical_notes"),
        "existing_conditions": doc.get("existing_conditions"),
        "medications": doc.get("medications"),
        "share_medical_with_sos": doc.get("share_medical_with_sos", False),
        "auto_escalation_enabled": doc.get("auto_escalation_enabled", True),
        "escalation_timeout_seconds": doc.get("escalation_timeout_seconds", 120),
        "cancellation_pin_set": bool(doc.get("cancellation_pin_hash")),
        "qr_token": doc.get("qr_token"),
        "qr_shared_fields": doc.get("qr_shared_fields") or default_shared_fields,
        "language_preference": doc.get("language_preference", "en"),
        "emergency_instructions": doc.get("emergency_instructions"),
        "created_at": doc.get("created_at", datetime.now(timezone.utc).isoformat()),
        "updated_at": doc.get("updated_at"),
    }

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest):
    email = payload.email.lower().strip()
    existing = await db_manager.users.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    user_id = str(ObjectId())
    now_str = datetime.now(timezone.utc).isoformat()
    hashed_pwd = hash_password(payload.password)

    # Strictly enforce USER role on self-registration
    new_user = {
        "_id": user_id,
        "id": user_id,
        "email": email,
        "name": payload.name.strip(),
        "display_name": payload.name.strip(),
        "password_hash": hashed_pwd,
        "phone_number": payload.phone_number,
        "blood_type": payload.blood_type,
        "allergies": payload.allergies,
        "role": "USER",
        "status": "ACTIVE",
        "created_at": now_str,
        "updated_at": now_str,
    }
    await db_manager.users.insert_one(new_user)

    # Issue JWT token
    token = create_access_token({"sub": user_id, "email": email, "role": "USER"})
    profile = format_user_profile(new_user)
    return TokenResponse(access_token=token, token_type="bearer", user=profile)

@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLoginRequest):
    email = payload.email.lower().strip()
    user = await db_manager.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if user.get("status") == "SUSPENDED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended by an administrator."
        )

    user_id = str(user.get("id") or user.get("_id"))
    role = user.get("role", "USER")
    token = create_access_token({"sub": user_id, "email": email, "role": role})
    profile = format_user_profile(user)
    return TokenResponse(access_token=token, token_type="bearer", user=profile)

@router.post("/demo-login", response_model=TokenResponse)
async def demo_login(payload: DemoLoginRequest = DemoLoginRequest(role="USER")):
    """
    Issues real, cryptographically signed JWT access tokens for User Demo (Mohith)
    and Admin Demo (Mohith). Never returns mock tokens or bypasses authentication.
    """
    target_role = payload.role.upper()
    if target_role == "ADMIN":
        target_email = settings.ADMIN_DEMO_EMAIL.lower().strip()
        target_name = settings.ADMIN_DEMO_NAME
        target_pwd = settings.ADMIN_DEMO_PASSWORD
    else:
        target_email = settings.USER_DEMO_EMAIL.lower().strip()
        target_name = settings.USER_DEMO_NAME
        target_pwd = settings.USER_DEMO_PASSWORD

    user = await db_manager.users.find_one({"email": target_email})
    if not user:
        # Auto-provision if missing
        now_str = datetime.now(timezone.utc).isoformat()
        user_id = f"user_{target_role.lower()}_demo_01"
        user = {
            "_id": user_id,
            "id": user_id,
            "email": target_email,
            "name": target_name,
            "display_name": target_name,
            "password_hash": hash_password(target_pwd),
            "phone_number": "+15550199000",
            "role": target_role,
            "status": "ACTIVE",
            "created_at": now_str,
            "updated_at": now_str,
        }
        await db_manager.users.insert_one(user)

    user_id = str(user.get("id") or user.get("_id"))
    user_role = user.get("role", target_role)
    token = create_access_token({"sub": user_id, "email": target_email, "role": user_role})
    profile = format_user_profile(user)
    return TokenResponse(access_token=token, token_type="bearer", user=profile)

@router.get("/me", response_model=UserProfileResponse)
async def get_auth_me(current_user: dict = Depends(get_current_user)):
    return format_user_profile(current_user)
