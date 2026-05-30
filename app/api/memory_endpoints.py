# -*- coding: utf-8 -*-
"""记忆星标 API —— 冻结/解冻记忆衰减"""
import math
import os
from datetime import datetime as _dt, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import MEM_DIR, get_decay_score, get_now
from app.core.constants import MEMORY_SUMMARY_FILE
from app.utils.fs_lock import safe_json_read, atomic_json_write

router = APIRouter(prefix="/api/memory", tags=["memory"])

MAX_STARRED = 30


class StarRequest(BaseModel):
    item_index: int
    action: str  # "star" or "unstar"


@router.post("/star")
async def toggle_star(req: StarRequest):
    summary_file = os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE)
    mem_data = await safe_json_read(summary_file, {"items": []})
    items = mem_data.get("items", [])

    if req.item_index < 0 or req.item_index >= len(items):
        raise HTTPException(status_code=400, detail="item_index 越界")

    item = items[req.item_index]

    if req.action == "star":
        starred_count = sum(1 for it in items if it.get("starred") is True)
        if starred_count >= MAX_STARRED:
            raise HTTPException(status_code=400, detail=f"星标记忆已达上限 {MAX_STARRED} 条")

        item["starred"] = True
        item["frozen_score"] = get_decay_score(item)

    elif req.action == "unstar":
        imp = max(1, min(10, float(item.get("importance", 5))))
        frozen_score = float(item.get("frozen_score", imp))
        half_life = 24.0 * (2.0 ** ((imp - 1.0) / 2.0))

        try:
            ratio = frozen_score / imp
            if ratio > 0:
                hours_elapsed = -half_life * math.log2(ratio)
            else:
                hours_elapsed = half_life * 10
        except (ValueError, ZeroDivisionError):
            hours_elapsed = half_life * 10

        new_time = _dt.now() - timedelta(hours=hours_elapsed)
        item["time"] = new_time.strftime("%Y-%m-%d %H:%M:%S")
        item.pop("starred", None)
        item.pop("frozen_score", None)

    else:
        raise HTTPException(status_code=400, detail="action 必须为 star 或 unstar")

    await atomic_json_write(summary_file, mem_data)
    return {"success": True, "item": item}
