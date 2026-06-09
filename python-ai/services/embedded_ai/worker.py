import asyncio
import hashlib
import json
import logging
from typing import Dict, List

logger = logging.getLogger(__name__)


def encode_text(model, text: str) -> List[float]:
    return model.encode(text).tolist()


def encode_batch(model, texts: List[str]) -> List[List[float]]:
    return model.encode(texts).tolist()


class EmbeddingWorker:
    def __init__(self, model, redis_client, mysql_pool, vector_store, executor):
        self.model = model
        self.redis_client = redis_client
        self.mysql_pool = mysql_pool
        self.vector_store = vector_store
        self.pool = executor

    async def process_batch(self, items: List[Dict]) -> None:
        if not items:
            return

        texts = [item["text"] for item in items]
        loop = asyncio.get_event_loop()
        embeddings: List[List[float]] = await loop.run_in_executor(
            self.pool, encode_batch, self.model, texts
        )

        redis_pipe = self.redis_client.pipeline()
        mysql_conn = await self.mysql_pool.acquire()

        try:
            async with mysql_conn.cursor() as cursor:
                await mysql_conn.begin()

                for item, emb in zip(items, embeddings):
                    text_hash = hashlib.md5(item["text"].encode()).hexdigest()
                    redis_pipe.setex(f"embed:text:{text_hash}", 86400, json.dumps(emb))

                    if item["type"] == "user":
                        await self.vector_store.store_user_vector(item["id"], emb)
                        await cursor.execute(
                            """
                            INSERT INTO user_embeddings_meta (user_id, profile_text, embedding_version, last_updated)
                            VALUES (%s, %s, %s, NOW())
                            ON DUPLICATE KEY UPDATE
                                profile_text = VALUES(profile_text),
                                embedding_version = VALUES(embedding_version),
                                last_updated = NOW()
                            """,
                            (item["id"], item["text"], "v1"),
                        )
                    else:
                        await self.vector_store.store_content_vector(
                            item["id"], item["type"], emb
                        )
                        await cursor.execute(
                            """
                            INSERT INTO content_embeddings_meta (content_id, content_type, text, embedding_version, created_at)
                            VALUES (%s, %s, %s, %s, NOW())
                            """,
                            (item["id"], item["type"], item["text"], "v1"),
                        )

                await mysql_conn.commit()
                await redis_pipe.execute()
                logger.info("Batch processed %d items", len(items))

        except Exception as exc:
            await mysql_conn.rollback()
            logger.error("Batch failed, rolled back: %s", exc)
            raise
        finally:
            self.mysql_pool.release(mysql_conn)
