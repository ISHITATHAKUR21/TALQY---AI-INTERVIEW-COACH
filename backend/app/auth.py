import hashlib
import os
import secrets
import smtplib
from email.message import EmailMessage
from typing import Annotated, Literal

import jwt
from cryptography.exceptions import InvalidKey
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .db import transaction, uid, now

router = APIRouter(prefix="/api")
KEY = os.environ["JWT_SECRET"]
if len(KEY) < 32:
    raise RuntimeError("JWT_SECRET must have at least 32 characters")
Email = Annotated[str, Field(max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")]
Password = Annotated[str, Field(min_length=10, max_length=256)]
Name = Annotated[str, Field(min_length=1, max_length=100)]
Experience = Literal["Fresher", "Entry Level", "Intermediate", "Experienced"]


class Credentials(BaseModel):
    email: Email
    password: Annotated[str, Field(min_length=1, max_length=256)]
    remember: bool = False


class Register(BaseModel):
    email: Email
    name: Name
    password: Password
    confirm_password: Password


class Identity(BaseModel):
    name: Name
    role: Annotated[str, Field(max_length=120)] = ""
    experience: Experience = "Fresher"


class Secret(BaseModel):
    current: str


class Change(Secret):
    password: Password


class Forgot(BaseModel):
    email: Email


class Reset(BaseModel):
    token: Annotated[str, Field(min_length=32, max_length=256)]
    password: Password


def hash_password(value):
    return Argon2id(
        salt=os.urandom(16), length=32, iterations=3, lanes=2, memory_cost=65536
    ).derive_phc_encoded(value.encode())


def matches(encoded, value):
    try:
        Argon2id.verify_phc_encoded(value.encode(), encoded)
        return True
    except InvalidKey:
        return False


def public(user):
    return {k: user[k] for k in ("id", "name", "email", "role", "experience")}


def issue(db, response, user, remember):
    lifetime = (30 if remember else 1) * 86400
    sid = uid()
    expiry = now() + lifetime
    db.execute("INSERT INTO sessions VALUES(?,?,?)", sid, user["id"], expiry)
    token = jwt.encode(
        {"sub": user["id"], "jti": sid, "exp": expiry}, KEY, algorithm="HS256"
    )
    response.set_cookie(
        "talqy",
        token,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "true").lower() == "true",
        samesite="strict",
        max_age=lifetime if remember else None,
        path="/",
    )
    return public(user)


def current(request: Request):
    try:
        claims = jwt.decode(
            request.cookies.get("talqy", ""),
            KEY,
            algorithms=["HS256"],
            options={"require": ["exp", "jti", "sub"]},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Please sign in.")
    with transaction() as db:
        row = db.one(
            "SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.id=? AND users.id=? AND expires>?",
            claims["jti"],
            claims["sub"],
            now(),
        )
    if not row:
        raise HTTPException(401, "Session expired. Please sign in.")
    row["sid"] = claims["jti"]
    return row


@router.post("/auth/register", status_code=201)
def register(data: Register, response: Response):
    if data.password != data.confirm_password or not data.name.strip():
        raise HTTPException(422, "Check your full name and password confirmation.")
    ident = uid()
    with transaction() as db:
        created = db.execute(
            "INSERT INTO users(id,email,name,password) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING",
            ident,
            data.email.lower(),
            data.name.strip(),
            hash_password(data.password),
        )
        if not created.rowcount:
            raise HTTPException(409, "This email is already registered.")
        return issue(
            db, response, db.one("SELECT * FROM users WHERE id=?", ident), False
        )


@router.post("/auth/login")
def login(data: Credentials, response: Response):
    with transaction() as db:
        user = db.one("SELECT * FROM users WHERE email=?", data.email.lower())
        if not user or not matches(user["password"], data.password):
            raise HTTPException(401, "Email or password is incorrect.")
        return issue(db, response, user, data.remember)


@router.get("/auth/me")
@router.get("/profile")
def me(user=Depends(current)):
    return public(user)


@router.post("/auth/logout")
def logout(response: Response, user=Depends(current)):
    with transaction() as db:
        db.execute("DELETE FROM sessions WHERE id=?", user["sid"])
    response.delete_cookie("talqy")
    return {"ok": True}


@router.put("/profile")
def profile(data: Identity, user=Depends(current)):
    if not data.name.strip():
        raise HTTPException(422, "Enter your full name.")
    with transaction() as db:
        db.execute(
            "UPDATE users SET name=?,role=?,experience=? WHERE id=?",
            data.name.strip(),
            data.role,
            data.experience,
            user["id"],
        )
        return public(db.one("SELECT * FROM users WHERE id=?", user["id"]))


@router.post("/profile/password")
def password(data: Change, response: Response, user=Depends(current)):
    if not matches(user["password"], data.current):
        raise HTTPException(403, "Current password is incorrect.")
    with transaction() as db:
        db.execute(
            "UPDATE users SET password=? WHERE id=?",
            hash_password(data.password),
            user["id"],
        )
        db.execute("DELETE FROM sessions WHERE user_id=?", user["id"])
        db.execute("DELETE FROM resets WHERE user_id=?", user["id"])
        return issue(db, response, user, False)


@router.delete("/profile")
def delete_profile(data: Secret, response: Response, user=Depends(current)):
    if not matches(user["password"], data.current):
        raise HTTPException(403, "Current password is incorrect.")
    with transaction() as db:
        db.execute("DELETE FROM users WHERE id=?", user["id"])
    response.delete_cookie("talqy")
    return {"ok": True}


@router.post("/auth/forgot")
def forgot(data: Forgot):
    host = os.getenv("SMTP_HOST")
    if not host:
        raise HTTPException(503, "Password reset email is not configured.")
    with transaction() as db:
        user = db.one("SELECT id FROM users WHERE email=?", data.email.lower())
        if user:
            token = secrets.token_urlsafe(32)
            db.execute(
                "DELETE FROM resets WHERE user_id=? OR expires<?", user["id"], now()
            )
            db.execute(
                "INSERT INTO resets VALUES(?,?,?)",
                hashlib.sha256(token.encode()).hexdigest(),
                user["id"],
                now() + 900,
            )
            message = EmailMessage()
            message["From"] = os.getenv("SMTP_FROM", "coach@talqy.local")
            message["To"] = data.email
            message["Subject"] = "Reset your TALQY password"
            message.set_content(
                "This link expires in 15 minutes.\n"
                + os.environ["APP_ORIGIN"]
                + "/reset?token="
                + token
            )
            try:
                with smtplib.SMTP(
                    host, int(os.getenv("SMTP_PORT", "587")), timeout=10
                ) as mail:
                    if os.getenv("SMTP_TLS", "true") == "true":
                        mail.starttls()
                    if os.getenv("SMTP_USER"):
                        mail.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
                    mail.send_message(message)
            except OSError:
                raise HTTPException(503, "Reset email service unavailable.")
    return {"message": "If the email is registered, a reset link has been sent."}


@router.post("/auth/reset")
def reset(data: Reset):
    with transaction() as db:
        token = db.one(
            "DELETE FROM resets WHERE id=? AND expires>? RETURNING user_id",
            hashlib.sha256(data.token.encode()).hexdigest(),
            now(),
        )
        if not token:
            raise HTTPException(400, "Reset link is invalid or expired.")
        db.execute(
            "UPDATE users SET password=? WHERE id=?",
            hash_password(data.password),
            token["user_id"],
        )
        db.execute("DELETE FROM sessions WHERE user_id=?", token["user_id"])
    return {"ok": True}
