from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.core.security import hash_password

router = APIRouter()

@router.post("/")
def create_user(email: str, password: str, db: Session = Depends(get_db)):
    hashed = hash_password(password)

    user = User(
        email=email,
        password=hashed
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"message": "User created"}
