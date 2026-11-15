import logging
from typing import Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from app.services.auth_service import decode_access_token
from app.database import db_manager
from app.config import settings

logger = logging.getLogger("safelink.dependencies")
security_scheme = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> Dict[str, Any]:
    """
    Validate the incoming Bearer JWT token and return the authenticated user document.
    Raises HTTP 401 if missing, invalid, or expired.
    """
    if not credentials or not credentials.credentials:
        logger.warning("[Auth 401] Missing or empty Authorization Bearer token header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()
    payload = decode_access_token(token)

    if not payload:
        logger.warning("[Auth 401] Invalid or expired JWT token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = str(payload.get("sub") or "")
    email = str(payload.get("email") or "").lower().strip()

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token subject is missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Search user by _id, id, ObjectId, or email
    user = await db_manager.users.find_one({"_id": user_id})
    if not user:
        user = await db_manager.users.find_one({"id": user_id})
    if not user and ObjectId.is_valid(user_id):
        try:
            user = await db_manager.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            pass
    if not user and email:
        user = await db_manager.users.find_one({"email": email})

    # Resilient restore for demo accounts if server restarted with fresh in-memory state
    if not user and email in (settings.USER_DEMO_EMAIL.lower(), settings.ADMIN_DEMO_EMAIL.lower()):
        from app.services.init_db import provision_demo_accounts
        await provision_demo_accounts(db_manager)
        user = await db_manager.users.find_one({"email": email})

    if not user:
        logger.warning(f"[Auth 401] User '{user_id}' ({email}) not found in database.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account associated with this token no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.get("status") == "SUSPENDED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended by an administrator.",
        )

    user_doc = dict(user)
    user_doc["id"] = str(user_doc.get("id") or user_doc.get("_id"))
    return user_doc


async def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Enforce ADMIN role authorization.
    Regular users are strictly forbidden with HTTP 403.
    """
    role = current_user.get("role", "USER").upper()
    if role != "ADMIN":
        logger.warning(f"[Auth 403] User '{current_user.get('id')}' with role '{role}' tried to access admin route.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Administrator privileges required.",
        )
    return current_user
