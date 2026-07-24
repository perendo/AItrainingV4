from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import TimeStampedModel


class ProcessingTask(TimeStampedModel):
    __tablename__ = "processing_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    status = Column(String(20), default="pending", nullable=False)  # pending, processing, completed, failed

    processed = Column(Integer, default=0, nullable=False)
    skipped_duplicate = Column(Integer, default=0, nullable=False)
    skipped_not_user = Column(Integer, default=0, nullable=False)
    errors_found = Column(Integer, default=0, nullable=False)

    error_message = Column(Text, nullable=True)

    user = relationship("User", back_populates="tasks")
