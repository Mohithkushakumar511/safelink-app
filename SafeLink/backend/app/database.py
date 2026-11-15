import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from bson import ObjectId
from app.config import settings

logger = logging.getLogger("safelink.database")

class DatabaseManager:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    is_connected: bool = False

    # In-memory resilient storage for environments where MongoDB is starting or unavailable
    _fallback_store: Dict[str, Dict[str, Dict[str, Any]]] = {
        "users": {},
        "emergency_contacts": {},
        "sos_alerts": {},
        "location_history": {},
    }

    async def connect(self):
        """Connect to MongoDB and initialize collections and indexes."""
        try:
            self.client = AsyncIOMotorClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=2000
            )
            # Test ping
            await self.client.admin.command('ping')
            self.db = self.client[settings.DATABASE_NAME]
            self.is_connected = True
            logger.info(f"Connected to MongoDB at {settings.MONGODB_URI} (db: {settings.DATABASE_NAME})")

            # Create Indexes
            await self._create_indexes()
        except Exception as e:
            self.is_connected = False
            logger.warning(
                f"Could not connect to MongoDB server ({e}). "
                f"Operating in resilient in-memory storage mode for local development."
            )

        # Provision Demo Accounts
        from app.services.init_db import provision_demo_accounts
        await provision_demo_accounts(self)

    async def _create_indexes(self):
        """Ensure standard query indexes exist in MongoDB."""
        if not self.is_connected or self.db is None:
            return
        try:
            await self.db.users.create_index("email", unique=True)
            await self.db.emergency_contacts.create_index([("user_id", 1), ("is_default", 1)])
            await self.db.sos_alerts.create_index([("user_id", 1), ("timestamp", -1)])
            await self.db.sos_alerts.create_index([("status", 1)])
            await self.db.location_history.create_index([("user_id", 1), ("timestamp", -1)])
            logger.info("MongoDB collections and query indexes verified.")
        except Exception as idx_err:
            logger.warning(f"Notice while verifying indexes: {idx_err}")

    async def close(self):
        """Close MongoDB connection gracefully."""
        if self.client:
            self.client.close()
            logger.info("MongoDB connection closed.")

    @property
    def users(self):
        return MongoCollectionWrapper(
            self.db.users if self.is_connected and self.db is not None else None,
            "users",
            self._fallback_store["users"]
        )

    @property
    def emergency_contacts(self):
        return MongoCollectionWrapper(
            self.db.emergency_contacts if self.is_connected and self.db is not None else None,
            "emergency_contacts",
            self._fallback_store["emergency_contacts"]
        )

    @property
    def sos_alerts(self):
        return MongoCollectionWrapper(
            self.db.sos_alerts if self.is_connected and self.db is not None else None,
            "sos_alerts",
            self._fallback_store["sos_alerts"]
        )

    @property
    def location_history(self):
        return MongoCollectionWrapper(
            self.db.location_history if self.is_connected and self.db is not None else None,
            "location_history",
            self._fallback_store["location_history"]
        )


class MongoCollectionWrapper:
    """
    Unified MongoDB / In-memory wrapper.
    Seamlessly passes queries to Motor AsyncIOMotorCollection when connected,
    or queries the local memory store with matching semantics when offline.
    """
    def __init__(self, real_collection, name: str, fallback_dict: dict):
        self.real = real_collection
        self.name = name
        self.fallback = fallback_dict

    def _matches(self, item: dict, query: dict) -> bool:
        for k, v in query.items():
            if k == "$or" and isinstance(v, list):
                if not any(self._matches(item, sub_q) for sub_q in v):
                    return False
            elif k in ("_id", "id"):
                item_id = str(item.get("id") or item.get("_id"))
                target_id = str(v)
                if item_id != target_id:
                    return False
            elif item.get(k) != v:
                return False
        return True

    async def find_one(self, query: dict) -> Optional[dict]:
        if self.real is not None:
            # Handle ObjectId conversion if querying _id with 24-char hex string
            real_query = dict(query)
            if "_id" in real_query and isinstance(real_query["_id"], str) and ObjectId.is_valid(real_query["_id"]):
                real_query = {"$or": [{"_id": ObjectId(real_query["_id"])}, {"_id": real_query["_id"]}, {"id": real_query["_id"]}]}
            elif "id" in real_query:
                real_query = {"$or": [{"id": real_query["id"]}, {"_id": real_query["id"]}]}

            doc = await self.real.find_one(real_query)
            if doc:
                doc = dict(doc)
                doc["_id"] = str(doc["_id"])
                if "id" not in doc:
                    doc["id"] = doc["_id"]
            return doc

        # In-memory fallback
        for item in self.fallback.values():
            if self._matches(item, query):
                res = dict(item)
                res["_id"] = str(res.get("_id") or res.get("id"))
                if "id" not in res:
                    res["id"] = res["_id"]
                return res
        return None

    async def find(self, query: dict, sort=None, limit: int = 0) -> List[dict]:
        if self.real is not None:
            cursor = self.real.find(query)
            if sort:
                cursor = cursor.sort(sort)
            if limit > 0:
                cursor = cursor.limit(limit)
            results = []
            async for doc in cursor:
                d = dict(doc)
                d["_id"] = str(d["_id"])
                if "id" not in d:
                    d["id"] = d["_id"]
                results.append(d)
            return results

        # In-memory fallback
        results = [dict(item) for item in self.fallback.values() if self._matches(item, query)]
        for r in results:
            r["_id"] = str(r.get("_id") or r.get("id"))
            if "id" not in r:
                r["id"] = r["_id"]

        if sort:
            sort_field = sort[0][0] if isinstance(sort, list) else sort
            reverse = sort[0][1] == -1 if isinstance(sort, list) else False
            results.sort(key=lambda x: str(x.get(sort_field, '')), reverse=reverse)

        if limit > 0:
            results = results[:limit]

        return results

    async def insert_one(self, document: dict):
        doc_copy = dict(document)
        doc_id = doc_copy.get("id") or doc_copy.get("_id")
        if not doc_id:
            doc_id = str(ObjectId())
            doc_copy["id"] = doc_id
        doc_copy["_id"] = doc_id
        doc_copy["id"] = str(doc_id)

        if self.real is not None:
            # Keep string id for consistency across both storage engines
            await self.real.insert_one(doc_copy)
            return type("Result", (), {"inserted_id": doc_id})

        self.fallback[str(doc_id)] = doc_copy
        return type("Result", (), {"inserted_id": doc_id})

    async def update_one(self, query: dict, update: dict):
        if self.real is not None:
            real_query = dict(query)
            if "_id" in real_query and isinstance(real_query["_id"], str) and ObjectId.is_valid(real_query["_id"]):
                real_query = {"$or": [{"_id": ObjectId(real_query["_id"])}, {"_id": real_query["_id"]}, {"id": real_query["_id"]}]}
            return await self.real.update_one(real_query, update)

        doc = await self.find_one(query)
        if doc:
            doc_id = str(doc.get("id") or doc.get("_id"))
            if "$set" in update:
                self.fallback[doc_id].update(update["$set"])
            return type("Result", (), {"modified_count": 1})
        return type("Result", (), {"modified_count": 0})

    async def update_many(self, query: dict, update: dict):
        if self.real is not None:
            return await self.real.update_many(query, update)

        count = 0
        docs = await self.find(query)
        for d in docs:
            doc_id = str(d.get("id") or d.get("_id"))
            if "$set" in update:
                self.fallback[doc_id].update(update["$set"])
                count += 1
        return type("Result", (), {"modified_count": count})

    async def delete_one(self, query: dict):
        if self.real is not None:
            real_query = dict(query)
            if "_id" in real_query and isinstance(real_query["_id"], str) and ObjectId.is_valid(real_query["_id"]):
                real_query = {"$or": [{"_id": ObjectId(real_query["_id"])}, {"_id": real_query["_id"]}, {"id": real_query["_id"]}]}
            return await self.real.delete_one(real_query)

        doc = await self.find_one(query)
        if doc:
            doc_id = str(doc.get("id") or doc.get("_id"))
            self.fallback.pop(doc_id, None)
            return type("Result", (), {"deleted_count": 1})
        return type("Result", (), {"deleted_count": 0})

    async def count_documents(self, query: dict) -> int:
        if self.real is not None:
            return await self.real.count_documents(query)
        items = await self.find(query)
        return len(items)


db_manager = DatabaseManager()
