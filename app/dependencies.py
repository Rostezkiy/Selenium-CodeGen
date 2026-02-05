from fastapi import Header, Depends, HTTPException, status
from sqlalchemy.orm import Session
from . import crud, models
from .database import SessionLocal


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_valid_license(
        authorization: str = Header(...), db: Session = Depends(get_db)
):
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication scheme",
        )

    license_key = authorization.split(" ")[1]
    license_obj = crud.get_license_by_key(db, key=license_key)

    if not crud.is_license_valid(license_obj):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired license key",
        )
    return license_obj