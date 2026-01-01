from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import random
from datetime import datetime, timedelta

from app.db.session import get_db
from app.core.security import create_access_token, verify_password
from app.models.user import User

router = APIRouter()

otp_store = {}

def generate_otp():
    return str(random.randint(100000, 999999))

def save_otp(user_id: int, otp: str):
    otp_store[user_id] = {
        "otp": otp,
        "expires": datetime.utcnow() + timedelta(minutes=5)
    }

def verify_saved_otp(user_id: int, otp: str):
    data = otp_store.get(user_id)
    if not data:
        return False
    if datetime.utcnow() > data["expires"]:
        return False
    return data["otp"] == otp


@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    otp = generate_otp()
    save_otp(user.id, otp)

    print(f"OTP for {email}: {otp}")  # demo only

    return {"message": "OTP sent to email"}


@router.post("/verify-otp")
def verify_otp(email: str, otp: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_saved_otp(user.id, otp):
        raise HTTPException(status_code=401, detail="Invalid OTP")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/resend-otp")
def resend_otp(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp = generate_otp()
    save_otp(user.id, otp)

    # TEMP: print OTP (demo only)
    print(f"RESEND OTP for {email}: {otp}")

    return {"message": "OTP resent successfully"}
