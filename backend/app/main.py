from fastapi import FastAPI
from app.api.v1 import auth, users, reports, projects, analytics

app = FastAPI(
    title="Road Defect Detection API",
    version="0.1.0"
)

# REGISTER ROUTERS
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
