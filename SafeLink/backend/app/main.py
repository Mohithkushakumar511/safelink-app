import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import db_manager

# Import Routers
from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.contacts import router as contacts_router
from app.routes.location import router as location_router
from app.routes.sos import router as sos_router
from app.routes.admin import router as admin_router

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("safelink.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB & provision initial demo accounts
    logger.info("Starting SafeLink Backend Server...")
    await db_manager.connect()
    yield
    # Shutdown: Close DB connections
    logger.info("Shutting down SafeLink Backend Server...")
    await db_manager.close()

app = FastAPI(
    title="SafeLink Emergency API",
    description="Backend API for SafeLink Emergency Contact & Live Location Sharing Application",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include All Feature Routers (Support both direct /path and /api/path)
for r in [auth_router, users_router, contacts_router, location_router, sos_router, admin_router]:
    app.include_router(r)
    app.include_router(r, prefix="/api")

@app.get("/", tags=["Health"])
@app.get("/api", tags=["Health"])
async def root():
    return {
        "app": "SafeLink Emergency API",
        "status": "online",
        "version": "1.0.0",
        "database_connected": db_manager.is_connected,
        "docs": "/docs"
    }

@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "database": "mongodb" if db_manager.is_connected else "in-memory-resilient",
        "environment": "production" if settings.SECRET_KEY != "safelink_super_secure_jwt_secret_key_2026_production_grade" else "development"
    }
