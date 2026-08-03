# app/models/base.py
from datetime import datetime
from sqlalchemy import Column, DateTime
from app.core.database import Base

class TimeStampedModel(Base):
    __abstract__ = True
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
