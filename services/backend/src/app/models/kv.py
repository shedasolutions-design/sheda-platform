"""A small shared key-value table, standing in for Redis on Workers.

See core/kv.py for why it exists and what is stored in it.
"""

from sqlalchemy import Column, DateTime, String, Text

from core.database import Base


class KVEntry(Base):
    __tablename__ = "kv_store"

    key = Column(String(512), primary_key=True)
    value = Column(Text, nullable=False)
    # NULL means it never expires. Expired rows are ignored on read and
    # removed lazily, so no scheduled job is needed.
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
