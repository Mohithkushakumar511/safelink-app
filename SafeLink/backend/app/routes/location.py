from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from app.schemas.location import LocationUpdateRequest, LocationResponse
from app.dependencies import get_current_user
from app.database import db_manager

router = APIRouter(prefix="/location", tags=["Location"])

@router.post("/update", response_model=LocationResponse)
async def update_location(
    payload: LocationUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    now_str = datetime.now(timezone.utc).isoformat()
    gmaps_url = f"https://maps.google.com/?q={payload.latitude:.6f},{payload.longitude:.6f}"

    record = {
        "_id": str(ObjectId()),
        "user_id": user_id,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "altitude": payload.altitude,
        "heading": payload.heading,
        "speed": payload.speed,
        "address": payload.address,
        "google_maps_url": gmaps_url,
        "is_live_sharing": payload.is_live_sharing,
        "timestamp": now_str,
    }

    # Record to location history
    await db_manager.location_history.insert_one(record)

    # Update latest location marker on user record for fast retrieval
    await db_manager.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "latest_location": {
                    "latitude": payload.latitude,
                    "longitude": payload.longitude,
                    "accuracy": payload.accuracy,
                    "address": payload.address,
                    "google_maps_url": gmaps_url,
                    "timestamp": now_str,
                    "is_live_sharing": payload.is_live_sharing,
                }
            }
        }
    )

    return LocationResponse(
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy=payload.accuracy,
        address=payload.address,
        google_maps_url=gmaps_url,
        timestamp=now_str,
        is_live_sharing=payload.is_live_sharing or False,
    )

@router.get("/current", response_model=LocationResponse)
async def get_current_location(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    user = await db_manager.users.find_one({"id": user_id})
    latest = user.get("latest_location") if user else None

    if not latest:
        # Check location history
        history = await db_manager.location_history.find(
            {"user_id": user_id},
            sort=[("timestamp", -1)],
            limit=1
        )
        if history:
            latest = history[0]

    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No recorded location found for this user."
        )

    return LocationResponse(
        latitude=latest["latitude"],
        longitude=latest["longitude"],
        accuracy=latest.get("accuracy"),
        address=latest.get("address"),
        google_maps_url=latest.get("google_maps_url", f"https://maps.google.com/?q={latest['latitude']:.6f},{latest['longitude']:.6f}"),
        timestamp=latest.get("timestamp", datetime.now(timezone.utc).isoformat()),
        is_live_sharing=latest.get("is_live_sharing", False),
    )
