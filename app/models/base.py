# app/models/base.py
from app.core.database import Base
from sqlalchemy import Column, DateTime
from datetime import datetime

class TimeStampedModel(Base):
    __abstract__ = True
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)