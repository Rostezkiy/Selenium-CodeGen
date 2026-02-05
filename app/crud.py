from sqlalchemy.orm import Session
from . import models
from datetime import datetime

def get_license_by_key(db: Session, key: str):
    return db.query(models.License).filter(models.License.key == key).first()

def is_license_valid(license: models.License):
    if not license:
        return False
    if not license.is_active:
        return False
    if license.expires_at < datetime.utcnow():
        return False
    return True