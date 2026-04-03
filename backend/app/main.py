import os
import json  
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv 

load_dotenv()

# 1. DATABASE IMPORTS 
from app.db.base import Base
from app.db.session import engine

# Import Models
from app.models.user import User
from app.models.report import Report
from app.models.project import Project
from app.models.comment import Comment
from app.models.audit_log import AuditLog
from app.models.otp import OTP
from app.models.notification import Notification

# 2. API ROUTER IMPORTS
from app.api.v1 import auth, users, reports, projects, analytics, notifications 

# 3. LIFESPAN - CREATE TABLES ON STARTUP
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Tables created successfully")
    except Exception as e:
        print(f"⚠️ Could not create tables: {e}")
    yield

# 4. FASTAPI APP
app = FastAPI(
    title="Road Defect Detection API",
    version="0.1.0",
    lifespan=lifespan
)

# 5. STATIC FILES
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# 6. CORS 
origins_str = os.getenv("BACKEND_CORS_ORIGINS")

if origins_str:
    try:
        origins = json.loads(origins_str)
    except json.JSONDecodeError:
        print("⚠️ Error format on .env BACKEND_CORS_ORIGINS. Using default localhost.")
        origins = ["http://localhost:3000"]
else:
    origins = ["http://localhost:3000"]

print(f"Allowed Origins: {origins}") 

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

# 7. REGISTER ROUTERS
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"]) 
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"]) 
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"]) 

# 8. ROOT ENDPOINT
@app.get("/")
def read_root():
    return {
        "status": "active", 
        "message": "Road Defect Detection API is running!",
        "cors_origins": origins
    }