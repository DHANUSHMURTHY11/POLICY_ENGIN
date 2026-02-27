"""
MongoDB async connection using Motor.
"""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

client: AsyncIOMotorClient = None
db: AsyncIOMotorDatabase = None


async def connect_mongo():
    """Initialize MongoDB connection."""
    global client, db
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]
    logger.info("MongoDB connected", extra={"event": "db_connect", "db_name": settings.MONGODB_DB_NAME})


async def close_mongo():
    """Close MongoDB connection."""
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed", extra={"event": "db_disconnect"})


def get_mongo_db() -> AsyncIOMotorDatabase:
    """Get MongoDB database instance."""
    return db


# ── Collection accessors ──
def policy_structures_collection():
    return db["policy_structures"]


def ai_generated_collection():
    return db["ai_generated_content"]


def policy_documents_collection():
    return db["policy_documents"]


def chat_sessions_collection():
    return db["chat_sessions"]
