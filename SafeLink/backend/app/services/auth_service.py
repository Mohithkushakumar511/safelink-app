import datetime
import logging
from typing import Optional, Dict, Any
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from app.config import settings

logger = logging.getLogger("safelink.auth")

# Initialize Argon2 Password Hasher
ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16
)

def hash_password(plain_password: str) -> str:
    """Hash a plaintext password securely using Argon2."""
    if not plain_password:
        raise ValueError("Password cannot be empty")
    return ph.hash(plain_password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against an Argon2 hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError):
        return False
    except Exception as e:
        logger.warning(f"Unexpected password verification exception: {e}")
        return False

def create_access_token(data: Dict[str, Any], expires_delta: Optional[datetime.timedelta] = None) -> str:
    """Generate a signed JWT access token containing subject, role, and expiration."""
    to_encode = data.copy()
    now = datetime.datetime.now(datetime.timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": now,
        "iss": "safelink-api"
    })
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and cryptographically verify a JWT access token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer="safelink-api"
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token decoding failed: Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Token decoding failed: Invalid token ({e})")
        return None
