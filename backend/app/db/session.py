from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.settings import settings

print("🔧 Initializing database engine...")

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True
)

# Test connection ONCE at startup
try:
    with engine.connect() as conn:
        print("✅ Database connection SUCCESSFUL")
except Exception as e:
    print("❌ Database connection FAILED")
    print(e)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
