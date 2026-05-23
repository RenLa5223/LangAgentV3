# -*- coding: utf-8 -*-
"""
本地记忆检索引擎 (RAG) —— 基于 Bi-gram 与 BM25 算法，无外部依赖。
"""
import os
import math
import time
import uuid
import re as _rag_skip_re
from app.core.config import ARCHIVE_DIR
from app.core.constants import (
    ARCHIVE_DB_FILE as _ARCHIVE_DB_FILENAME,
    INVERTED_INDEX_FILE as _INVERTED_INDEX_FILENAME,
    RAG_SEARCH_TOP_K, RAG_SEARCH_THRESHOLD,
    BM25_K1, BM25_B, BM25_IDF_FLOOR,
)
from app.utils.fs_lock import safe_json_read, atomic_json_write

ARCHIVE_DB_FILE = os.path.join(ARCHIVE_DIR, _ARCHIVE_DB_FILENAME)
INDEX_FILE = os.path.join(ARCHIVE_DIR, _INVERTED_INDEX_FILENAME)

os.makedirs(ARCHIVE_DIR, exist_ok=True)


def _tokenize_tf(text: str) -> dict:
    """中文 Bi-gram 双字滑动窗口分词"""
    text = text.lower()
    tokens = {}
    for i in range(len(text) - 1):
        tk = text[i:i + 2]
        if tk.strip():
            tokens[tk] = tokens.get(tk, 0) + 1
    for char in text:
        if char.strip():
            tokens[char] = tokens.get(char, 0) + 1
    return tokens


async def add_to_archive(messages: list):
    """将过期的对话区块打包存入 RAG 归档并建索引"""
    if not messages:
        return
    filtered = [
        m for m in messages
        if not _rag_skip_re.match(r'^\[img:(?:[a-f0-9]+\.(?:jpg|png)|none)\]$', m.get('content', ''))
    ]
    if not filtered:
        return
    chunk_text = "\n".join([f"{m.get('role', 'unknown')}: {m.get('content', '')}" for m in filtered])
    if not chunk_text.strip():
        return
    doc_id = str(uuid.uuid4().hex)
    timestamp = messages[-1].get("time", time.strftime("%Y-%m-%d %H:%M:%S"))

    # 1. 存入长文本 DB
    db = await safe_json_read(ARCHIVE_DB_FILE, [])
    db.append({"id": doc_id, "time": timestamp, "content": chunk_text})
    await atomic_json_write(ARCHIVE_DB_FILE, db)

    # 2. 更新倒排索引库
    idx = await safe_json_read(INDEX_FILE, {"inv": {}, "dl": {}, "avg_dl": 0.0, "N": 0})
    tf_dict = _tokenize_tf(chunk_text)
    doc_len = sum(tf_dict.values())

    if doc_len == 0:
        return
    idx["dl"][doc_id] = doc_len
    idx["N"] += 1
    idx["avg_dl"] = (idx["avg_dl"] * (idx["N"] - 1) + doc_len) / idx["N"]

    for term, count in tf_dict.items():
        if term not in idx["inv"]:
            idx["inv"][term] = {}
        idx["inv"][term][doc_id] = count

    await atomic_json_write(INDEX_FILE, idx)


async def search(query: str, top_k: int = RAG_SEARCH_TOP_K, threshold: float = RAG_SEARCH_THRESHOLD) -> list:
    """BM25 检索历史记忆区块"""
    if not query:
        return []
    db = await safe_json_read(ARCHIVE_DB_FILE, [])
    idx = await safe_json_read(INDEX_FILE, {})

    if not db or not idx.get("N"):
        return []

    q_tf = _tokenize_tf(query)
    scores = {}
    k1, b, N, avg_dl = BM25_K1, BM25_B, idx["N"], idx["avg_dl"]

    for term in q_tf.keys():
        if term not in idx["inv"]:
            continue
        doc_dict = idx["inv"][term]
        n_q = len(doc_dict)
        idf = math.log((N - n_q + 0.5) / (n_q + 0.5) + 1.0)
        if idf < 0.01:
            idf = 0.01

        for doc_id, freq in doc_dict.items():
            dl = idx["dl"].get(doc_id, avg_dl)
            tf_term = freq * (k1 + 1) / (freq + k1 * (1 - b + b * (dl / avg_dl)))
            scores[doc_id] = scores.get(doc_id, 0.0) + idf * tf_term

    sorted_docs = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    db_map = {item["id"]: item for item in db}
    results = []
    for doc_id, score in sorted_docs[:top_k]:
        if score >= threshold and doc_id in db_map:
            results.append(db_map[doc_id])

    return results


def _sync_rebuild_index():
    """
    同步重建整个倒排索引库。
    由 RAG 队列消费者在独立线程池中调用，确保同一时间只有一个重建任务执行。
    """
    from app.utils.logging import logger
    import json as _json

    # 读 DB 快照 (同步直接读，不经过锁注册表，因为已在单线程消费者上下文中)
    db = []
    if os.path.exists(ARCHIVE_DB_FILE):
        with open(ARCHIVE_DB_FILE, 'r', encoding='utf-8') as f:
            try:
                db = _json.load(f)
            except Exception:
                db = []

    # CPU 密集计算：词法分析 + 倒排索引构建
    idx = {"inv": {}, "dl": {}, "avg_dl": 0.0, "N": 0}
    for doc in db:
        doc_id = doc.get("id", "")
        chunk_text = doc.get("content", "")
        tf_dict = _tokenize_tf(chunk_text)
        doc_len = sum(tf_dict.values())
        if doc_len == 0:
            continue
        idx["dl"][doc_id] = doc_len
        idx["N"] += 1
        idx["avg_dl"] = (idx["avg_dl"] * (idx["N"] - 1) + doc_len) / idx["N"]
        for term, count in tf_dict.items():
            if term not in idx["inv"]:
                idx["inv"][term] = {}
            idx["inv"][term][doc_id] = count

    # 写入索引文件（原子写入）
    tmp_path = INDEX_FILE + ".tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        _json.dump(idx, f, ensure_ascii=False, indent=2)
    if os.path.exists(tmp_path):
        os.replace(tmp_path, INDEX_FILE)

    logger.info(f"[RAG引擎] 索引已重组，当前容量: {idx['N']} 块")
