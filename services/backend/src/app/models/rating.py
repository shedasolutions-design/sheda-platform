from sqlalchemy import String, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from app.models.user import BaseUser, Agent
from datetime import datetime
from app.models.user import utc_now


class Rating(Base):
    __tablename__ = "rating"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rater_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    ratee_id: Mapped[int] = mapped_column(ForeignKey("agent.id"), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)

    rater: Mapped["BaseUser"] = relationship("BaseUser", foreign_keys=[rater_id])
    ratee: Mapped["Agent"] = relationship("Agent", foreign_keys=[ratee_id])
