"""
Legacy auth router — kept for backward compatibility only.
The production auth flow is in app/routers/auth.py.
This file is NOT registered in main.py.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from pydantic import BaseModel

from app.db.session import get_db
from app.models.user import User
from app.models.enums import OTPPurpose
from app.core.config import settings
from app.core.security import verify_password, create_access_token, get_password_hash
# FIXED: OTP model no longer has a raw `code` field — it stores only `hashed_code`.
# All OTP creation/verification must go through auth_service.
from app.services import auth_service

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# --- SCHEMAS ---
class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    contact_number: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str


class EmailSchema(BaseModel):
    email: str


class ResetPasswordSchema(BaseModel):
    email: str
    otp_code: str
    new_password: str


# --- ENDPOINTS ---
@router.post("/register", response_model=dict)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        contact_number=user_data.contact_number,
        role="citizen",
        reputation_score=100,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"message": "User registered successfully", "user_id": new_user.id}


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "id": user.id}
    )
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}


@router.post("/forgot-password")
async def forgot_password(data: EmailSchema, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # FIXED: auth_service.create_otp hashes the code before saving to DB.
    # It returns the raw code so we can display it (mock email).
    otp_code = await auth_service.create_otp(
        db, data.email, OTPPurpose.password_reset, user.id
    )

    print(f"==========================================")
    print(f" [MOCK EMAIL] OTP for {data.email}: {otp_code}")
    print(f"==========================================")

    return {"message": "OTP sent to email (Check server console for code)"}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordSchema, db: AsyncSession = Depends(get_db)):
    # FIXED: auth_service.verify_otp compares against hashed_code in DB.
    # Old code used OTP.code == data.otp_code — that field no longer exists.
    try:
        await auth_service.verify_otp(
            db, data.email, data.otp_code, OTPPurpose.password_reset
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    return {"message": "Password updated successfully. You can now login."}


# --- DEPENDENCY: Get Current User ---
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user