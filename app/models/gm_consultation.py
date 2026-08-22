# app/models/gm_consultation.py
from sqlalchemy import Column, Integer, String, Text, ForeignKey

from app.models.base import TimeStampedModel


class GMConsultation(TimeStampedModel):
    __tablename__ = "gm_consultations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    status = Column(String(20), default="processing", nullable=False, index=True)
    error_message = Column(Text, nullable=True)
