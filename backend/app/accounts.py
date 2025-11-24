from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from passlib.context import CryptContext

from .contracts import LoginRequest, User, UserCreate
from .file_lock import FileLock
from .settings import settings

ACCOUNTS_DIR = settings.data_dir / "accounts"
ACCOUNTS_DIR.mkdir(parents=True, exist_ok=True)
USERS_PATH = ACCOUNTS_DIR / "users.json"
SESSIONS_PATH = ACCOUNTS_DIR / "sessions.json"
SESSION_TTL = timedelta(days=7)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


class AccountStore:
    def __init__(self) -> None:
        self.users: dict[str, dict[str, Any]] = {}
        self.sessions: dict[str, dict[str, Any]] = {}
        self._load_users()
        self._load_sessions()

    # -------- filesystem helpers --------
    def _read_store(self, path: Path, default: dict[str, Any]) -> dict[str, Any]:
        with FileLock(path, timeout=5.0):
            if not path.exists():
                return default.copy()
            try:
                return json.loads(path.read_text(encoding="utf-8") or "{}")
            except json.JSONDecodeError:
                return default.copy()

    def _write_store(self, path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(path, timeout=5.0):
            path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )

    def _now(self) -> datetime:
        return datetime.utcnow()

    # -------- internal helpers --------
    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    def _load_users(self) -> None:
        payload = self._read_store(USERS_PATH, {"users": {}})
        self.users = payload.get("users", {})

    def _persist_users(self) -> None:
        self._write_store(USERS_PATH, {"users": self.users})

    def _load_sessions(self) -> None:
        payload = self._read_store(SESSIONS_PATH, {"sessions": {}})
        raw_sessions = payload.get("sessions", {})
        now = self._now()
        for token, meta in raw_sessions.items():
            if not isinstance(meta, dict):
                continue
            expires_at = meta.get("expires_at")
            if not expires_at:
                continue
            try:
                expiry = datetime.fromisoformat(expires_at)
            except ValueError:
                continue
            if expiry <= now:
                continue
            user_id = meta.get("user_id")
            if not user_id:
                continue
            self.sessions[token] = {"user_id": user_id, "expires_at": expiry}
        self._persist_sessions()

    def _persist_sessions(self) -> None:
        now = self._now()
        serialized = {}
        for token, meta in self.sessions.items():
            expiry = meta.get("expires_at")
            if isinstance(expiry, datetime) and expiry > now:
                serialized[token] = {
                    "user_id": meta.get("user_id"),
                    "expires_at": expiry.isoformat(timespec="seconds"),
                }
        self._write_store(SESSIONS_PATH, {"sessions": serialized})

    def _prune_sessions(self) -> None:
        now = self._now()
        expired: list[str] = []
        for token, meta in self.sessions.items():
            expiry = meta.get("expires_at")
            if isinstance(expiry, str):
                try:
                    expiry_dt = datetime.fromisoformat(expiry)
                except ValueError:
                    expiry_dt = now - timedelta(seconds=1)
            else:
                expiry_dt = expiry
            if not isinstance(expiry_dt, datetime) or expiry_dt <= now:
                expired.append(token)
        for token in expired:
            self.sessions.pop(token, None)
        if expired:
            self._persist_sessions()

    def _user_from_record(self, record: dict[str, Any]) -> User:
        data = {
            k: v
            for k, v in record.items()
            if k not in {"otp_code", "otp_expires_at", "password_hash"}
        }
        return User(**data)

    def _get_user_by_email(self, email: str) -> tuple[str, dict[str, Any]]:
        for uid, record in self.users.items():
            if record.get("email") == email:
                return uid, record
        raise HTTPException(404, "User not found")

    def _issue_session(self, user_id: str) -> str:
        token = secrets.token_hex(20)
        expires_at = self._now() + SESSION_TTL
        self.sessions[token] = {"user_id": user_id, "expires_at": expires_at}
        self._persist_sessions()
        return token

    def reset(self) -> None:
        self.users = {}
        self.sessions = {}
        for path in (USERS_PATH, SESSIONS_PATH):
            if path.exists():
                path.unlink()

    # -------- public API --------
    def create_user(self, payload: UserCreate) -> tuple[User, str]:
        email = self._normalize_email(payload.email)
        try:
            self._get_user_by_email(email)
        except HTTPException:
            pass
        else:
            raise HTTPException(409, "User already exists")

        now = datetime.utcnow()
        user_id = str(uuid4())
        record = {
            "id": user_id,
            "name": payload.name,
            "email": email,
            "phone": payload.phone,
            "verified_email": False,
            "verified_phone": False,
            "created_at": _iso(now),
            "updated_at": _iso(now),
            "password_hash": pwd_context.hash(payload.password),
        }
        self.users[user_id] = record
        self._persist_users()
        token = self._issue_session(user_id)
        return self._user_from_record(record), token

    def verify_login(self, payload: LoginRequest) -> tuple[User, str]:
        email = self._normalize_email(payload.email)
        user_id, record = self._get_user_by_email(email)
        password_hash = record.get("password_hash")
        if not password_hash or not pwd_context.verify(payload.password, password_hash):
            raise HTTPException(401, "Invalid credentials")
        record["verified_email"] = True
        record["updated_at"] = _iso(self._now())
        self.users[user_id] = record
        self._persist_users()
        token = self._issue_session(user_id)
        return self._user_from_record(record), token

    def update_user(
        self, user_id: str, *, name: str | None = None, phone: str | None = None
    ) -> User:
        if user_id not in self.users:
            raise HTTPException(404, "User not found")
        if name:
            self.users[user_id]["name"] = name
        if phone:
            self.users[user_id]["phone"] = phone
            self.users[user_id]["updated_at"] = _iso(self._now())
        self._persist_users()
        return self._user_from_record(self.users[user_id])

    def get_user(self, token: str) -> User:
        self._prune_sessions()
        session = self.sessions.get(token)
        if not session:
            raise HTTPException(401, "Invalid session")
        user_id = session["user_id"]
        record = self.users.get(user_id)
        if not record:
            raise HTTPException(404, "User not found")
        return self._user_from_record(record)

    def list_users(self) -> list[User]:
        return [self._user_from_record(record) for record in self.users.values()]


ACCOUNTS = AccountStore()
