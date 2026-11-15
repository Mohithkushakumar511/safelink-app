from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field

class UserRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Full Name")
    email: EmailStr = Field(..., description="Valid Email Address")
    password: str = Field(..., min_length=6, description="Password (at least 6 characters)")
    phone_number: Optional[str] = Field(None, description="Contact phone number")
    blood_type: Optional[str] = Field(None, max_length=5)
    allergies: Optional[str] = Field(None, max_length=200)

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

class DemoLoginRequest(BaseModel):
    role: Literal["USER", "ADMIN"] = "USER"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
