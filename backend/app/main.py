import os
import json  
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

# 2. API ROUTER IMPORTS (Disabled )
# from app.api.v1 import auth, users, reports, projects, analytics, notifications 

# 3. CREATE TABLES 
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Road Defect Detection API",
    version="0.1.0"
)

# 4. STATIC FILES
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# 5. CORS 
origins_str = os.getenv("BACKEND_CORS_ORIGINS")

if origins_str:
    try:
        origins = json.loads(origins_str)
    except json.JSONDecodeError:
        print("Error format on .env BACKEND_CORS_ORIGINS. Using default localhost.")
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

# 6. REGISTER ROUTERS (Disabled muna)
# app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
# app.include_router(users.router, prefix="/api/v1/users", tags=["Users"]) 
# app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
# app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
# app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"]) 
# app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"]) 

@app.get("/")
def read_root():
    return {
        "status": "active", 
        "message": "Tables creation attempt complete. Check Supabase!",
        "cors_origins": origins # Para makita mo sa browser kung tama ang settings
    }