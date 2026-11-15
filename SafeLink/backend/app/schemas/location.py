from typing import Optional
from pydantic import BaseModel, Field

class LocationUpdateRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    accuracy: Optional[float] = None
    altitude: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None
    address: Optional[str] = None
    is_live_sharing: Optional[bool] = False

class LocationResponse(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    address: Optional[str] = None
    google_maps_url: str
    timestamp: str
    is_live_sharing: bool
