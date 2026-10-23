#!/usr/bin/env python3
"""Семейное древо: небольшой сервер без внешних зависимостей (нужен только Python 3.8+).

Запуск:
    FAMILY_CODE="ваш-семейный-код" python3 server.py

База данных и фотографии хранятся в папке data/ рядом с этим файлом
(или в папке из переменной окружения DATA_DIR). Для резервной копии
достаточно скопировать эту папку.
"""
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import traceback
import uuid
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
WEB_DIR = os.path.join(BASE_DIR, "web", "dist")
DATA_DIR = os.path.abspath(os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data")))
PHOTO_DIR = os.path.join(DATA_DIR, "photos")
FAMILY_CODE = os.environ.get("FAMILY_CODE", "").strip()
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
# Включайте, только если сайт стоит за прокси (Render, Railway, nginx),
# иначе адрес посетителя можно подделать заголовком.
TRUST_PROXY = os.environ.get("TRUST_PROXY") == "1"

MAX_PHOTO_BYTES = 15 * 1024 * 1024
MAX_JSON_BYTES = 64 * 1024
LOGIN_ATTEMPTS = 20
LOGIN_WINDOW = 15 * 60

PERSON_FIELDS = {
    "last_name": 100,
    "first_name": 100,
    "middle_name": 100,
    "maiden_name": 100,
    "gender": 1,
    "birth_date": 40,
    "birth_place": 200,
    "death_date": 40,
    "death_place": 200,
    "bio": 10000,
    "notes": 5000,
}
FIELD_LABELS = {
    "last_name": "фамилия",
    "first_name": "имя",
    "middle_name": "отчество",
    "maiden_name": "девичья фамилия",
    "gender": "пол",
    "birth_date": "дата рождения",
    "birth_place": "место рождения",
    "death_date": "дата смерти",
    "death_place": "место смерти",
    "bio": "биография",
    "notes": "заметки",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    last_name TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    middle_name TEXT NOT NULL DEFAULT '',
    maiden_name TEXT NOT NULL DEFAULT '',
    gender TEXT NOT NULL DEFAULT '',
    birth_date TEXT NOT NULL DEFAULT '',
    birth_place TEXT NOT NULL DEFAULT '',
    death_date TEXT NOT NULL DEFAULT '',
    death_place TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS relations (
    id TEXT PRIMARY KEY,
    a TEXT NOT NULL,
    b TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('parent', 'spouse')),
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    file TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    text TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    who TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    before TEXT,
    after TEXT,
    reverted_by INTEGER
);
"""

os.makedirs(PHOTO_DIR, exist_ok=True)


def _load_secret():
    path = os.path.join(DATA_DIR, "secret.key")
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write(secrets.token_hex(32))
    with open(path) as f:
        return f.read().strip().encode()


SECRET = _load_secret()

db = sqlite3.connect(os.path.join(DATA_DIR, "family.db"), check_same_thread=False)
db.row_factory = sqlite3.Row
db.execute("PRAGMA journal_mode=WAL")
db.executescript(SCHEMA)
if "notes" not in {r["name"] for r in db.execute("PRAGMA table_info(people)")}:
    # заметки для своих: откуда сведения, что уточнить
    db.execute("ALTER TABLE people ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
if "kind" not in {r["name"] for r in db.execute("PRAGMA table_info(photos)")}:
    # photo — фотография, document — скан или PDF семейного документа
    db.execute("ALTER TABLE photos ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo'")
db.commit()
TABLES = {
    t: {row["name"] for row in db.execute(f"PRAGMA table_info({t})")}
    for t in ("people", "relations", "photos", "memories")
}
lock = threading.Lock()
login_failures = {}

IMAGE_TYPES = {"jpg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf"}
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
}
SECURITY_HEADERS = [
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "no-referrer"),
    ("X-Robots-Tag", "noindex, nofollow"),
    (
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' blob: data:; "
        "style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
        "script-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ),
]


class ApiError(Exception):
    """status — HTTP-код; code — машинный код для перевода в интерфейсе; params — подстановки."""

    def __init__(self, status, message, code="error", **params):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code
        self.params = params


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def new_id():
    return uuid.uuid4().hex


def get_row(table, row_id):
    row = db.execute(f"SELECT * FROM {table} WHERE id=?", (row_id,)).fetchone()
    return dict(row) if row else None


def person_name(p):
    if not p:
        return "?"
    name = " ".join(x for x in (p["first_name"], p["last_name"]) if x)
    return name or "Без имени"


def alive_person(pid):
    p = get_row("people", pid)
    if not p or p["deleted"]:
        raise ApiError(404, "Человек не найден. Возможно, его только что удалили — обновите страницу.", "person_not_found")
    return p


def log(who, action, table, entity_id, summary, before, after):
    dump = lambda v: json.dumps(v, ensure_ascii=False) if v is not None else None
    cur = db.execute(
        "INSERT INTO history (at, who, action, entity, entity_id, summary, before, after) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (now(), who, action, table, entity_id, summary, dump(before), dump(after)),
    )
    return cur.lastrowid


def clean_person(data):
    if not isinstance(data, dict):
        raise ApiError(400, "Неверные данные", "bad_request")
    out = {}
    for key, limit in PERSON_FIELDS.items():
        if key not in data:
            continue
        value = data[key]
        if value is None:
            value = ""
        if not isinstance(value, str):
            raise ApiError(400, f"Неверное значение: {FIELD_LABELS[key]}", "bad_field", field=key)
        value = value.strip()
        if len(value) > limit:
            raise ApiError(400, f"Слишком длинное значение: {FIELD_LABELS[key]}", "too_long", field=key)
        if key == "gender" and value not in ("", "m", "f"):
            raise ApiError(400, "Неверное значение: пол", "bad_request")
        out[key] = value
    return out


def descendants(pid):
    seen, stack = set(), [pid]
    while stack:
        cur = stack.pop()
        for row in db.execute("SELECT b FROM relations WHERE deleted=0 AND type='parent' AND a=?", (cur,)):
            if row["b"] not in seen:
                seen.add(row["b"])
                stack.append(row["b"])
    return seen


def siblings(pid):
    rows = db.execute(
        "SELECT DISTINCT c.b FROM relations p JOIN relations c ON c.a = p.a "
        "WHERE p.deleted=0 AND c.deleted=0 AND p.type='parent' AND c.type='parent' AND p.b=? AND c.b<>?",
        (pid, pid),
    )
    return {r["b"] for r in rows}


def add_relation(who, a, b, rel_type):
    if rel_type not in ("parent", "spouse"):
        raise ApiError(400, "Неизвестный вид связи", "bad_request")
    if a == b:
        raise ApiError(400, "Нельзя связать человека с самим собой", "self_link")
    pa, pb = alive_person(a), alive_person(b)
    if rel_type == "spouse":
        dup = db.execute(
            "SELECT 1 FROM relations WHERE deleted=0 AND type='spouse' AND ((a=? AND b=?) OR (a=? AND b=?))",
            (a, b, b, a),
        ).fetchone()
        if dup:
            raise ApiError(409, "Эти люди уже указаны как супруги", "spouse_exists")
        if a in descendants(b) or b in descendants(a) or siblings(a) & {b}:
            raise ApiError(400, "Близкие кровные родственники не могут быть указаны как супруги", "spouse_is_relative")
        summary = f"Связь: {person_name(pa)} и {person_name(pb)} — супруги"
    else:
        dup = db.execute(
            "SELECT 1 FROM relations WHERE deleted=0 AND type='parent' AND a=? AND b=?", (a, b)
        ).fetchone()
        if dup:
            raise ApiError(409, "Такая связь уже есть", "relation_exists")
        spouses = db.execute(
            "SELECT 1 FROM relations WHERE deleted=0 AND type='spouse' AND ((a=? AND b=?) OR (a=? AND b=?))",
            (a, b, b, a),
        ).fetchone()
        if spouses:
            raise ApiError(400, "Супруги не могут быть родителем и ребёнком друг для друга", "parent_is_spouse")
        if a in descendants(b):
            raise ApiError(400, "Так не получится: человек оказался бы своим собственным предком", "cycle")
        count = db.execute(
            "SELECT COUNT(*) FROM relations r JOIN people p ON p.id = r.a "
            "WHERE r.deleted=0 AND r.type='parent' AND r.b=? AND p.deleted=0",
            (b,),
        ).fetchone()[0]
        if count >= 2:
            raise ApiError(400, f"У человека «{person_name(pb)}» уже указаны двое родителей", "two_parents", name=person_name(pb))
        summary = f"Связь: {person_name(pa)} — родитель для {person_name(pb)}"
    rid = new_id()
    db.execute(
        "INSERT INTO relations (id, a, b, type, created_at) VALUES (?, ?, ?, ?, ?)",
        (rid, a, b, rel_type, now()),
    )
    after = get_row("relations", rid)
    log(who, "create", "relations", rid, summary, None, after)
    return after


def detect_image(data):
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:5] == b"%PDF-":
        return "pdf"
    return None


# ---------- API ----------

def api_session(req):
    return {"authed": req.is_authed(), "codeRequired": bool(FAMILY_CODE)}


def api_login(req):
    if not FAMILY_CODE:
        return {"ok": True}
    ip = req.client_ip()
    t = time.time()
    recent = [x for x in login_failures.get(ip, []) if t - x < LOGIN_WINDOW]
    if len(recent) >= LOGIN_ATTEMPTS:
        raise ApiError(429, "Слишком много попыток. Подождите 15 минут и попробуйте снова.", "too_many_attempts")
    code = str(req.json().get("code", "")).strip()
    if not hmac.compare_digest(code.encode(), FAMILY_CODE.encode()):
        recent.append(t)
        login_failures[ip] = recent
        raise ApiError(403, "Код не подошёл. Проверьте его и попробуйте ещё раз.", "bad_code")
    login_failures.pop(ip, None)
    req.out_headers.append(("Set-Cookie", req.cookie(auth_token(), 400 * 86400)))
    return {"ok": True}


def api_logout(req):
    req.out_headers.append(("Set-Cookie", req.cookie("", 0)))
    return {"ok": True}


def api_tree(req):
    people = [dict(r) for r in db.execute("SELECT * FROM people WHERE deleted=0 ORDER BY created_at")]
    alive = {p["id"] for p in people}
    relations = [
        dict(r)
        for r in db.execute("SELECT id, a, b, type FROM relations WHERE deleted=0 ORDER BY created_at")
        if r["a"] in alive and r["b"] in alive
    ]
    photos = [
        dict(r)
        for r in db.execute(
            "SELECT id, person_id, file, caption, kind, created_at FROM photos WHERE deleted=0 ORDER BY created_at"
        )
        if r["person_id"] in alive
    ]
    memories = [
        dict(r)
        for r in db.execute(
            "SELECT id, person_id, text, author, created_at FROM memories WHERE deleted=0 ORDER BY created_at"
        )
        if r["person_id"] in alive
    ]
    return {"people": people, "relations": relations, "photos": photos, "memories": memories}


def api_create_person(req):
    data = req.json()
    fields = clean_person(data.get("person") or {})
    link = data.get("link")
    if link is not None:
        if not isinstance(link, dict) or link.get("as") not in ("parent", "child", "spouse"):
            raise ApiError(400, "Неверная связь", "bad_request")
        alive_person(str(link.get("to", "")))
    pid = new_id()
    ts = now()
    row = {k: fields.get(k, "") for k in PERSON_FIELDS}
    cols = ", ".join(row)
    db.execute(
        f"INSERT INTO people (id, {cols}, created_at, updated_at) VALUES (?, {', '.join('?' * len(row))}, ?, ?)",
        (pid, *row.values(), ts, ts),
    )
    after = get_row("people", pid)
    log(req.who, "create", "people", pid, f"Добавлен(а) в древо: {person_name(after)}", None, after)
    if link is not None:
        target = link["to"]
        if link["as"] == "parent":
            add_relation(req.who, pid, target, "parent")
        elif link["as"] == "child":
            add_relation(req.who, target, pid, "parent")
        else:
            add_relation(req.who, target, pid, "spouse")
    return after


def api_update_person(req, pid):
    before = alive_person(pid)
    fields = clean_person(req.json())
    changed = {k: v for k, v in fields.items() if before[k] != v}
    if not changed:
        return before
    sets = ", ".join(f"{k}=?" for k in changed)
    db.execute(f"UPDATE people SET {sets}, updated_at=? WHERE id=?", (*changed.values(), now(), pid))
    after = get_row("people", pid)
    labels = ", ".join(FIELD_LABELS[k] for k in changed)
    log(req.who, "update", "people", pid, f"Изменены данные: {person_name(after)} ({labels})", before, after)
    return after


def api_delete_person(req, pid):
    before = alive_person(pid)
    db.execute("UPDATE people SET deleted=1, updated_at=? WHERE id=?", (now(), pid))
    after = get_row("people", pid)
    log(req.who, "delete", "people", pid, f"Удалён(а) из древа: {person_name(before)}", before, after)


def api_add_photo(req, pid):
    person = alive_person(pid)
    data = req.body
    if not data:
        raise ApiError(400, "Файл пустой", "empty_file")
    ext = detect_image(data)
    if not ext:
        raise ApiError(415, "Это не похоже на фотографию или документ. Подойдут JPG, PNG, GIF, WebP или PDF.", "not_image")
    caption = unquote(req.headers.get("X-Caption", "")).strip()[:300]
    kind = "document" if ext == "pdf" or req.headers.get("X-Kind") == "document" else "photo"
    photo_id = new_id()
    file_name = f"{photo_id}.{ext}"
    with open(os.path.join(PHOTO_DIR, file_name), "wb") as f:
        f.write(data)
    db.execute(
        "INSERT INTO photos (id, person_id, file, caption, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (photo_id, pid, file_name, caption, kind, now()),
    )
    after = get_row("photos", photo_id)
    what = "документ" if kind == "document" else "фото"
    log(req.who, "create", "photos", photo_id, f"Добавлен {what}: {person_name(person)}", None, after)
    return after


def _alive_photo(photo_id):
    ph = get_row("photos", photo_id)
    if not ph or ph["deleted"]:
        raise ApiError(404, "Фото не найдено", "photo_not_found")
    return ph


def api_update_photo(req, photo_id):
    before = _alive_photo(photo_id)
    caption = req.json().get("caption", "")
    if not isinstance(caption, str):
        raise ApiError(400, "Неверная подпись", "bad_request")
    caption = caption.strip()[:300]
    if caption == before["caption"]:
        return before
    db.execute("UPDATE photos SET caption=? WHERE id=?", (caption, photo_id))
    after = get_row("photos", photo_id)
    person = get_row("people", before["person_id"])
    log(req.who, "update", "photos", photo_id, f"Изменена подпись к фото: {person_name(person)}", before, after)
    return after


def api_delete_photo(req, photo_id):
    before = _alive_photo(photo_id)
    db.execute("UPDATE photos SET deleted=1 WHERE id=?", (photo_id,))
    after = get_row("photos", photo_id)
    person = get_row("people", before["person_id"])
    log(req.who, "delete", "photos", photo_id, f"Удалено фото: {person_name(person)}", before, after)


def api_add_memory(req, pid):
    person = alive_person(pid)
    text = req.json().get("text", "")
    if not isinstance(text, str) or not text.strip():
        raise ApiError(400, "Напишите текст воспоминания", "empty_memory")
    text = text.strip()
    if len(text) > 5000:
        raise ApiError(400, "Слишком длинное воспоминание", "too_long", field="memory")
    mid = new_id()
    db.execute(
        "INSERT INTO memories (id, person_id, text, author, created_at) VALUES (?, ?, ?, ?, ?)",
        (mid, pid, text, req.who, now()),
    )
    after = get_row("memories", mid)
    log(req.who, "create", "memories", mid, f"Добавлено воспоминание: {person_name(person)}", None, after)
    return after


def api_delete_memory(req, mid):
    before = get_row("memories", mid)
    if not before or before["deleted"]:
        raise ApiError(404, "Воспоминание не найдено", "not_found")
    db.execute("UPDATE memories SET deleted=1 WHERE id=?", (mid,))
    after = get_row("memories", mid)
    person = get_row("people", before["person_id"])
    log(req.who, "delete", "memories", mid, f"Удалено воспоминание: {person_name(person)}", before, after)


def api_create_relation(req):
    data = req.json()
    return add_relation(req.who, str(data.get("a", "")), str(data.get("b", "")), data.get("type"))


def api_delete_relation(req, rid):
    before = get_row("relations", rid)
    if not before or before["deleted"]:
        raise ApiError(404, "Связь не найдена", "relation_not_found")
    db.execute("UPDATE relations SET deleted=1 WHERE id=?", (rid,))
    after = get_row("relations", rid)
    a, b = person_name(get_row("people", before["a"])), person_name(get_row("people", before["b"]))
    kind = "супруги" if before["type"] == "spouse" else "родитель и ребёнок"
    log(req.who, "delete", "relations", rid, f"Убрана связь: {a} и {b} ({kind})", before, after)


def page_export(req):
    """Резервная копия древа в JSON (формат описан в README). Файлы фото лежат в папке photos."""
    with lock:
        data = api_tree(req)
    data = {"format": "nasl-family/1", "exported_at": now(), **data}
    body = json.dumps(data, ensure_ascii=False, indent=2).encode()
    req.send_bytes(200, body, "application/json; charset=utf-8", [
        ("Content-Disposition", 'attachment; filename="nasl-family.json"'),
        ("Cache-Control", "no-store"),
    ])


def api_history(req):
    rows = db.execute(
        "SELECT id, at, who, action, entity, summary, reverted_by FROM history ORDER BY id DESC LIMIT 300"
    )
    return [dict(r) for r in rows]


def api_revert(req, hid):
    entry = db.execute("SELECT * FROM history WHERE id=?", (int(hid),)).fetchone()
    if not entry:
        raise ApiError(404, "Запись не найдена", "entry_not_found")
    if entry["action"] == "revert":
        raise ApiError(400, "Отмену отменить нельзя. Просто внесите правку заново.", "revert_revert")
    if entry["reverted_by"]:
        raise ApiError(409, "Эта правка уже отменена", "already_reverted")
    table, eid = entry["entity"], entry["entity_id"]
    if table not in TABLES:
        raise ApiError(400, "Эту правку нельзя отменить", "cannot_revert")
    current = get_row(table, eid)
    if current is None:
        raise ApiError(404, "Запись не найдена", "entry_not_found")
    before = json.loads(entry["before"]) if entry["before"] else None
    after_then = json.loads(entry["after"]) if entry["after"] else {}
    if before is None:
        db.execute(f"UPDATE {table} SET deleted=1 WHERE id=?", (eid,))
    else:
        # Возвращаем только те поля, которые меняла эта правка, чтобы не затереть более поздние.
        cols = [c for c in before if c in TABLES[table] and c not in ("id", "updated_at") and before[c] != after_then.get(c)]
        if cols:
            db.execute(
                f"UPDATE {table} SET {', '.join(c + '=?' for c in cols)} WHERE id=?",
                (*[before[c] for c in cols], eid),
            )
    after = get_row(table, eid)
    revert_id = log(req.who, "revert", table, eid, "Отменено: " + entry["summary"], current, after)
    db.execute("UPDATE history SET reverted_by=? WHERE id=?", (revert_id, entry["id"]))
    return {"ok": True}


# ---------- Страницы и файлы ----------

def page_index(req):
    web_index = os.path.join(WEB_DIR, "index.html")
    if os.path.isfile(web_index):
        req.send_file(web_index, STATIC_TYPES[".html"], "no-cache")
    else:
        page_classic(req)


def page_classic(req):
    req.send_file(os.path.join(STATIC_DIR, "index.html"), STATIC_TYPES[".html"], "no-cache")


def page_web_asset(req, name):
    path = os.path.join(WEB_DIR, "assets", name)
    ctype = STATIC_TYPES.get(os.path.splitext(name)[1])
    if name.startswith(".") or not ctype or not os.path.isfile(path):
        raise ApiError(404, "Не найдено", "not_found")
    # Имена файлов сборки содержат хеш, поэтому их можно кешировать надолго.
    req.send_file(path, ctype, "public, max-age=31536000, immutable")


def page_web_public(req, name):
    path = os.path.join(WEB_DIR, name)
    ctype = STATIC_TYPES.get(os.path.splitext(name)[1])
    if name.startswith(".") or not ctype or not os.path.isfile(path):
        raise ApiError(404, "Не найдено", "not_found")
    req.send_file(path, ctype, "no-cache")


def page_robots(req):
    req.send_bytes(200, b"User-agent: *\nDisallow: /\n", "text/plain; charset=utf-8")


def page_static(req, name):
    path = os.path.join(STATIC_DIR, name)
    ctype = STATIC_TYPES.get(os.path.splitext(name)[1])
    if name.startswith(".") or not ctype or not os.path.isfile(path):
        raise ApiError(404, "Не найдено", "not_found")
    req.send_file(path, ctype, "no-cache")


def page_photo(req, name):
    path = os.path.join(PHOTO_DIR, name)
    if not os.path.isfile(path):
        raise ApiError(404, "Фото не найдено", "photo_not_found")
    req.send_file(path, IMAGE_TYPES[name.rsplit(".", 1)[1]], "private, max-age=31536000, immutable")


def auth_token():
    return hmac.new(SECRET, ("v1:" + FAMILY_CODE).encode(), "sha256").hexdigest()


HEX = r"([0-9a-f]{32})"
ROUTES = [
    # метод, путь, обработчик, нужен ли код, максимальный размер тела запроса
    ("GET", r"/", page_index, False, 0),
    ("GET", r"/classic/?", page_classic, False, 0),
    ("GET", r"/assets/([\w.-]+)", page_web_asset, False, 0),
    ("GET", r"/([\w-]+\.(?:svg|png|ico))", page_web_public, False, 0),
    ("GET", r"/robots\.txt", page_robots, False, 0),
    ("GET", r"/static/([\w.-]+)", page_static, False, 0),
    ("GET", r"/photos/([0-9a-f]{32}\.(?:jpg|png|gif|webp|pdf))", page_photo, True, 0),
    ("GET", r"/api/session", api_session, False, 0),
    ("POST", r"/api/login", api_login, False, MAX_JSON_BYTES),
    ("POST", r"/api/logout", api_logout, False, 0),
    ("GET", r"/api/tree", api_tree, True, 0),
    ("POST", r"/api/people", api_create_person, True, MAX_JSON_BYTES),
    ("PATCH", rf"/api/people/{HEX}", api_update_person, True, MAX_JSON_BYTES),
    ("DELETE", rf"/api/people/{HEX}", api_delete_person, True, 0),
    ("POST", rf"/api/people/{HEX}/photos", api_add_photo, True, MAX_PHOTO_BYTES),
    ("PATCH", rf"/api/photos/{HEX}", api_update_photo, True, MAX_JSON_BYTES),
    ("DELETE", rf"/api/photos/{HEX}", api_delete_photo, True, 0),
    ("POST", rf"/api/people/{HEX}/memories", api_add_memory, True, MAX_JSON_BYTES),
    ("DELETE", rf"/api/memories/{HEX}", api_delete_memory, True, 0),
    ("POST", r"/api/relations", api_create_relation, True, MAX_JSON_BYTES),
    ("DELETE", rf"/api/relations/{HEX}", api_delete_relation, True, 0),
    ("GET", r"/api/history", api_history, True, 0),
    ("GET", r"/api/export", page_export, True, 0),
    ("POST", r"/api/history/(\d+)/revert", api_revert, True, 0),
]
ROUTES = [(m, re.compile(p), fn, auth, size) for m, p, fn, auth, size in ROUTES]


class Handler(BaseHTTPRequestHandler):
    server_version = "FamilyTree/1.0"

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PATCH(self):
        self.dispatch("PATCH")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    def dispatch(self, method):
        path = urlparse(self.path).path
        self.out_headers = []
        self.body = b""
        for m, rx, fn, need_auth, max_body in ROUTES:
            if m != method:
                continue
            match = rx.fullmatch(path)
            if not match:
                continue
            try:
                if need_auth and not self.is_authed():
                    raise ApiError(401, "Нужно ввести семейный код", "auth_required")
                self.body = self.read_body(max_body)
                if fn.__name__.startswith("api_"):
                    with lock:
                        try:
                            result = fn(self, *match.groups())
                            db.commit()
                        except BaseException:
                            db.rollback()
                            raise
                    self.send_json(200, {"ok": True} if result is None else result)
                else:
                    fn(self, *match.groups())
            except ApiError as e:
                self.send_json(e.status, {"error": e.message, "code": e.code, "params": e.params})
            except Exception:
                traceback.print_exc()
                self.send_json(500, {"error": "Что-то пошло не так на сервере. Попробуйте ещё раз.", "code": "server_error"})
            return
        self.send_json(404, {"error": "Не найдено"})

    # --- запрос ---

    def read_body(self, limit):
        length = int(self.headers.get("Content-Length") or 0)
        if not limit or not length:
            return b""
        if length > limit:
            if limit == MAX_PHOTO_BYTES:
                raise ApiError(413, "Фото слишком большое (больше 15 МБ)", "too_large")
            raise ApiError(413, "Слишком большой запрос", "too_large")
        return self.rfile.read(length)

    def json(self):
        try:
            data = json.loads(self.body or b"{}")
        except ValueError:
            raise ApiError(400, "Неверный запрос", "bad_request")
        if not isinstance(data, dict):
            raise ApiError(400, "Неверный запрос", "bad_request")
        return data

    @property
    def who(self):
        return unquote(self.headers.get("X-Who", "")).strip()[:60]

    def client_ip(self):
        if TRUST_PROXY and self.headers.get("X-Forwarded-For"):
            return self.headers["X-Forwarded-For"].split(",")[0].strip()
        return self.client_address[0]

    def is_authed(self):
        if not FAMILY_CODE:
            return True
        jar = cookies.SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
        except cookies.CookieError:
            return False
        return "ft" in jar and hmac.compare_digest(jar["ft"].value, auth_token())

    def cookie(self, value, max_age):
        parts = [f"ft={value}", "Path=/", f"Max-Age={max_age}", "HttpOnly", "SameSite=Lax"]
        if self.headers.get("X-Forwarded-Proto") == "https":
            parts.append("Secure")
        return "; ".join(parts)

    # --- ответ ---

    def send_json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_bytes(status, data, "application/json; charset=utf-8", [("Cache-Control", "no-store")])

    def send_file(self, path, ctype, cache):
        with open(path, "rb") as f:
            data = f.read()
        self.send_bytes(200, data, ctype, [("Cache-Control", cache)])

    def send_bytes(self, status, data, ctype, extra=()):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for name, value in [*SECURITY_HEADERS, *self.out_headers, *extra]:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)


def main():
    if not FAMILY_CODE:
        print("ВНИМАНИЕ: семейный код не задан (FAMILY_CODE) — сайт открыт для всех, у кого есть адрес.")
    print(f"Семейное древо: http://localhost:{PORT}  (данные в {DATA_DIR})")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
