import logging
from datetime import datetime, timezone
from app.config import settings
from app.services.auth_service import hash_password

logger = logging.getLogger("safelink.init_db")

async def provision_demo_accounts(db_manager):
    """
    Secure backend initialization script to provision distinct USER and ADMIN accounts.
    Both accounts have separate unique database IDs, roles, and hashed credentials.
    """
    now_str = datetime.now(timezone.utc).isoformat()

    # 1. Provision ADMIN account
    admin_email = settings.ADMIN_DEMO_EMAIL.lower().strip()
    existing_admin = await db_manager.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_id = "user_admin_demo_01"
        admin_doc = {
            "_id": admin_id,
            "id": admin_id,
            "name": settings.ADMIN_DEMO_NAME,
            "display_name": settings.ADMIN_DEMO_NAME,
            "email": admin_email,
            "password_hash": hash_password(settings.ADMIN_DEMO_PASSWORD),
            "phone_number": "+15550000001",
            "role": "ADMIN",
            "status": "ACTIVE",
            "blood_type": "O+",
            "allergies": "None",
            "medical_notes": "Administrator Account",
            "created_at": now_str,
            "updated_at": now_str,
        }
        await db_manager.users.insert_one(admin_doc)
        logger.info(f"Provisioned ADMIN demo account: {admin_email} (ID: {admin_id})")

    # 2. Provision USER account (Mohith)
    user_email = settings.USER_DEMO_EMAIL.lower().strip()
    existing_user = await db_manager.users.find_one({"email": user_email})
    if not existing_user:
        user_id = "user_mohith_demo_01"
        user_doc = {
            "_id": user_id,
            "id": user_id,
            "name": settings.USER_DEMO_NAME,
            "display_name": settings.USER_DEMO_NAME,
            "email": user_email,
            "password_hash": hash_password(settings.USER_DEMO_PASSWORD),
            "phone_number": "+15550199000",
            "role": "USER",
            "status": "ACTIVE",
            "blood_type": "O+",
            "allergies": "None recorded",
            "medical_notes": "Emergency Safeguard Active",
            "created_at": now_str,
            "updated_at": now_str,
        }
        await db_manager.users.insert_one(user_doc)
        logger.info(f"Provisioned USER demo account: {user_email} (ID: {user_id})")

        # Provision a default emergency contact for User Demo
        contact_id = "contact_guardian_demo_01"
        contact_doc = {
            "_id": contact_id,
            "id": contact_id,
            "user_id": user_id,
            "name": "Sarah Connor (Guardian)",
            "phone": "+15550123456",
            "relationship": "Family / Guardian",
            "is_default": True,
            "created_at": now_str,
            "updated_at": now_str,
        }
        await db_manager.emergency_contacts.insert_one(contact_doc)
        logger.info("Provisioned initial default emergency contact for User Demo.")
