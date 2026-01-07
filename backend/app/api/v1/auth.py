
import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from pydantic import BaseModel
from app.db.session import get_db
from app.models.user import User
from app.models.otp import OTP 
from app.core.security import verify_password, create_access_token, get_password_hash
router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
# --- SCHEMAS (Data Validation) ---
class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    contact_number: str | None = None
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
#  NEW SCHEMAS FOR OTP
class EmailSchema(BaseModel):
    email: str
class ResetPasswordSchema(BaseModel):
    email: str
    otp_code: str
    new_password: str
# --- ENDPOINTS ---
@router.post("/register", response_model=dict)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # 1. Check if email exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # 2. Hash Password & Create User
    hashed_pw = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_pw,
        full_name=user_data.full_name,
        contact_number=user_data.contact_number,
        role="citizen", 
        reputation_score=100
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User registered successfully", "user_id": new_user.id}
@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. Find User
    user = db.query(User).filter(User.email == form_data.username).first()
    
    # 2. Validate Password
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 3. Create Token
    access_token = create_access_token(data={"sub": user.email, "role": user.role, "id": user.id})
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}

@router.post("/forgot-password")
def forgot_password(data: EmailSchema, db: Session = Depends(get_db)):
    """
    1. Checks if email exists.
    2. Generates a 6-digit OTP.
    3. Prints OTP to server logs (Mock Email).
    """
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Generate 6-digit OTP
    otp_code = str(random.randint(100000, 999999))
    expiration = datetime.utcnow() + timedelta(minutes=5) 
    # Save to DB
    new_otp = OTP(email=data.email, code=otp_code, expires_at=expiration)
    db.add(new_otp)
    db.commit()

    print(f"==========================================")
    print(f" [MOCK EMAIL] OTP for {data.email}: {otp_code}")
    print(f"==========================================")
    
    return {"message": "OTP sent to email (Check server console for code)"}
@router.post("/reset-password")
def reset_password(data: ResetPasswordSchema, db: Session = Depends(get_db)):
    """
    Verifies the OTP and updates the user's password.
    """
    # 1. Find a Valid OTP
    otp_record = db.query(OTP).filter(
        OTP.email == data.email,
        OTP.code == data.otp_code,
        OTP.is_used == False,
        OTP.expires_at > datetime.utcnow() # Must not be expired
    ).first()
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    # 2. Find User
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # 3. Change Password
    user.hashed_password = get_password_hash(data.new_password)
    
    # 4. Mark OTP as used (One-time use only)
    otp_record.is_used = True
    
    db.commit()
    return {"message": "Password updated successfully. You can now login."}
# --- DEPENDENCY: Get Current User ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
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
        
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

