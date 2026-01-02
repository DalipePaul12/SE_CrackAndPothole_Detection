from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
# 👇 ITO ANG TAMA: config.py ang kinukuhaan natin
from app.core.config import settings

print("🔧 Initializing database engine...")

# 1. CREATE ENGINE
# Ito ang nagbubukas ng connection papunta sa Supabase/PostgreSQL
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True # Importante: Auto-reconnect pag naputol ang connection
)

# 2. TEST CONNECTION
# Para malaman mo agad sa terminal kung may error bago pa tumakbo ang app
try:
    with engine.connect() as conn:
        print("✅ Database connection SUCCESSFUL")
except Exception as e:
    print("❌ Database connection FAILED")
    print(f"Error: {e}")

# 3. SESSION FACTORY
# Ito ang gumagawa ng "temporary transaction" bawat request
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# 4. DEPENDENCY (GET_DB)
# Ito ang ginagamit sa API endpoints para kumuha ng database access
# Importante ang 'yield' at 'close' para hindi mag-leak ang memory
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()