#!/usr/bin/env python3
"""Готовит публичную версию «только просмотр» для GitHub Pages.

Что делает:
  1. Собирает интерфейс в режиме static (npm run build:static).
  2. Копирует сборку в папку docs/ в корне репозитория.
  3. Делает снимок базы (люди, связи, подписи, воспоминания) в docs/family.json
     и копирует нужные фотографии в docs/photos/. Удалённое в снимок не попадает.

ВНИМАНИЕ: всё, что попадает в docs/, становится видно любому, у кого есть ссылка.

Запуск из папки family-tree:
    python3 publish_static.py            # данные из ./data
    DATA_DIR=/путь/к/data python3 publish_static.py
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "web")
DATA_DIR = os.path.abspath(os.environ.get("DATA_DIR", os.path.join(BASE, "data")))
DOCS = os.path.abspath(os.path.join(BASE, "..", "docs"))


def snapshot():
    db = sqlite3.connect(os.path.join(DATA_DIR, "family.db"))
    db.row_factory = sqlite3.Row
    people = [dict(r) for r in db.execute("SELECT * FROM people WHERE deleted=0 ORDER BY created_at")]
    alive = {p["id"] for p in people}
    for p in people:
        p.pop("deleted", None)
    relations = [dict(r) for r in db.execute("SELECT id, a, b, type FROM relations WHERE deleted=0 ORDER BY created_at")
                 if r["a"] in alive and r["b"] in alive]
    photos = [dict(r) for r in db.execute("SELECT id, person_id, file, caption, kind, created_at FROM photos WHERE deleted=0 ORDER BY created_at")
              if r["person_id"] in alive]
    memories = [dict(r) for r in db.execute("SELECT id, person_id, text, author, created_at FROM memories WHERE deleted=0 ORDER BY created_at")
                if r["person_id"] in alive]
    return {"format": "nasl-family/1", "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "people": people, "relations": relations, "photos": photos, "memories": memories}


def main():
    print("1/3 Сборка публичной версии…")
    subprocess.run(["npm", "run", "build:static"], cwd=WEB, check=True)

    print("2/3 Копирование сборки в docs/…")
    if os.path.isdir(DOCS):
        shutil.rmtree(DOCS)
    shutil.copytree(os.path.join(WEB, "dist-static"), DOCS)
    open(os.path.join(DOCS, ".nojekyll"), "w").close()  # чтобы GitHub Pages отдавал файлы как есть

    print("3/3 Снимок данных…")
    data = snapshot()
    with open(os.path.join(DOCS, "family.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(DOCS, "photos"), exist_ok=True)
    copied = 0
    for ph in data["photos"]:
        src = os.path.join(DATA_DIR, "photos", ph["file"])
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(DOCS, "photos", ph["file"]))
            copied += 1
    print(f"Готово: людей {len(data['people'])}, связей {len(data['relations'])}, файлов {copied}, воспоминаний {len(data['memories'])}.")
    print(f"Публичная версия лежит в {DOCS}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        sys.exit("Сборка не удалась — смотрите сообщения выше.")
