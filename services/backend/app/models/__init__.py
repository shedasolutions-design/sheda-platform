# Models package for the project
# Re-export all model classes for easier imports
from .user import BaseUser, Client, Agent, Admin
from .property import (
    Property,
    PropertyImage,
    Appointment,
    AgentAvailability,
    Contract,
    AccountInfo,
    PaymentConfirmation,
)
from .chat import ChatMessage
from .rating import Rating
from .collection import (
    CollectionProfile,
    CollectionChainRecord,
    CollectionProject,
    CollectionProjectImage,
    CollectionDocument,
    CollectionPhase,
    CollectionPhaseUpdate,
    CollectionUnit,
)
from .transaction import (
    WalletMapping,
    DeviceToken,
    TransactionRecord,
    TransactionNotification,
    TransactionAuditLog,
    MintedPropertyDraft,
)

__all__ = [
    "BaseUser",
    "Client",
    "Agent",
    "Admin",
    "Property",
    "PropertyImage",
    "Appointment",
    "AgentAvailability",
    "Contract",
    "AccountInfo",
    "PaymentConfirmation",
    "AccountInfo",
    "PaymentConfirmation",
    "ChatMessage",
    "Rating",
    "WalletMapping",
    "DeviceToken",
    "TransactionRecord",
    "TransactionNotification",
    "TransactionAuditLog",
    "MintedPropertyDraft",
    "CollectionProfile",
    "CollectionChainRecord",
    "CollectionProject",
    "CollectionProjectImage",
    "CollectionDocument",
    "CollectionPhase",
    "CollectionPhaseUpdate",
    "CollectionUnit",
]
