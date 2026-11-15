from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from app.schemas.contact import ContactCreateRequest, ContactUpdateRequest, ContactResponse
from app.dependencies import get_current_user
from app.database import db_manager

router = APIRouter(prefix="/contacts", tags=["Emergency Contacts"])

def format_contact(doc: dict) -> dict:
    return {
        "id": str(doc.get("id") or doc.get("_id")),
        "user_id": str(doc.get("user_id")),
        "name": doc["name"],
        "phone": doc["phone"],
        "relationship": doc.get("relationship", "Emergency Responder"),
        "is_default": bool(doc.get("is_default", False)),
        "created_at": doc.get("created_at", datetime.now(timezone.utc).isoformat()),
        "updated_at": doc.get("updated_at"),
    }

@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    contact_id = str(ObjectId())
    now_str = datetime.now(timezone.utc).isoformat()

    # Check if this is the user's first contact; if so, make default automatically
    existing_count = await db_manager.emergency_contacts.count_documents({"user_id": user_id})
    is_default = payload.is_default or (existing_count == 0)

    if is_default:
        # Clear default flag on existing contacts
        await db_manager.emergency_contacts.update_many(
            {"user_id": user_id},
            {"$set": {"is_default": False}}
        )

    contact_doc = {
        "_id": contact_id,
        "id": contact_id,
        "user_id": user_id,
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "relationship": payload.relationship or "Emergency Responder",
        "is_default": is_default,
        "created_at": now_str,
        "updated_at": now_str,
    }

    await db_manager.emergency_contacts.insert_one(contact_doc)
    return format_contact(contact_doc)

@router.get("", response_model=List[ContactResponse])
async def list_contacts(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    contacts = await db_manager.emergency_contacts.find(
        {"user_id": user_id},
        sort=[("is_default", -1), ("created_at", 1)]
    )
    return [format_contact(c) for c in contacts]

@router.get("/default", response_model=Optional[ContactResponse])
async def get_default_contact(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    contact = await db_manager.emergency_contacts.find_one({
        "user_id": user_id,
        "is_default": True
    })
    if not contact:
        contacts = await db_manager.emergency_contacts.find({"user_id": user_id}, limit=1)
        if contacts:
            contact = contacts[0]
    if not contact:
        return None
    return format_contact(contact)

@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: str,
    payload: ContactUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    contact = await db_manager.emergency_contacts.find_one({
        "id": contact_id,
        "user_id": user_id
    })
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency contact not found."
        )

    now_str = datetime.now(timezone.utc).isoformat()
    updates = {"updated_at": now_str}

    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()
    if payload.relationship is not None:
        updates["relationship"] = payload.relationship.strip()
    if payload.is_default is True:
        await db_manager.emergency_contacts.update_many(
            {"user_id": user_id},
            {"$set": {"is_default": False}}
        )
        updates["is_default"] = True
    elif payload.is_default is False:
        updates["is_default"] = False

    await db_manager.emergency_contacts.update_one({"id": contact_id}, {"$set": updates})
    updated = await db_manager.emergency_contacts.find_one({"id": contact_id})
    return format_contact(updated or {**contact, **updates})

@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    contact = await db_manager.emergency_contacts.find_one({
        "id": contact_id,
        "user_id": user_id
    })
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency contact not found."
        )

    was_default = contact.get("is_default", False)
    await db_manager.emergency_contacts.delete_one({"id": contact_id})

    # If the default was deleted, promote the oldest remaining contact as default
    if was_default:
        remaining = await db_manager.emergency_contacts.find(
            {"user_id": user_id},
            sort=[("created_at", 1)],
            limit=1
        )
        if remaining:
            first_id = remaining[0]["id"]
            await db_manager.emergency_contacts.update_one(
                {"id": first_id},
                {"$set": {"is_default": True}}
            )

@router.patch("/{contact_id}/default", response_model=ContactResponse)
async def set_default_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    contact = await db_manager.emergency_contacts.find_one({
        "id": contact_id,
        "user_id": user_id
    })
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency contact not found."
        )

    # Clear previous defaults
    await db_manager.emergency_contacts.update_many(
        {"user_id": user_id},
        {"$set": {"is_default": False}}
    )

    # Set new default
    now_str = datetime.now(timezone.utc).isoformat()
    await db_manager.emergency_contacts.update_one(
        {"id": contact_id},
        {"$set": {"is_default": True, "updated_at": now_str}}
    )

    updated = await db_manager.emergency_contacts.find_one({"id": contact_id})
    return format_contact(updated)
