"""Relational models. A turn is an aggregate with one question, answer and evaluation."""

from sqlalchemy import ForeignKey, UniqueConstraint, Index, LargeBinary, BigInteger
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    password: Mapped[str]
    role: Mapped[str] = mapped_column(server_default="")
    experience: Mapped[str] = mapped_column(server_default="Fresher")


def owner():
    return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class LoginSession(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = owner()
    expires: Mapped[int] = mapped_column(BigInteger)


class PasswordReset(Base):
    __tablename__ = "resets"
    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = owner()
    expires: Mapped[int] = mapped_column(BigInteger)


class Document(Base):
    __tablename__ = "docs"
    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = owner()
    kind: Mapped[str]
    name: Mapped[str]
    body: Mapped[str]
    original: Mapped[bytes] = mapped_column(LargeBinary)
    created: Mapped[int] = mapped_column(BigInteger)


class Analysis(Base):
    __tablename__ = "analyses"
    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = owner()
    resume: Mapped[str] = mapped_column(ForeignKey("docs.id", ondelete="CASCADE"))
    jd: Mapped[str] = mapped_column(ForeignKey("docs.id", ondelete="CASCADE"))
    data: Mapped[str]
    created: Mapped[int] = mapped_column(BigInteger)


class Interview(Base):
    __tablename__ = "interviews"
    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = owner()
    context: Mapped[str]
    config: Mapped[str]
    started: Mapped[int] = mapped_column(BigInteger)
    ended: Mapped[int | None] = mapped_column(BigInteger)
    revision: Mapped[int] = mapped_column(server_default="0")


class Turn(Base):
    __tablename__ = "turns"
    __table_args__ = (UniqueConstraint("interview_id", "position"),)
    id: Mapped[str] = mapped_column(primary_key=True)
    interview_id: Mapped[str] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE")
    )
    position: Mapped[int]
    question: Mapped[str]
    answer: Mapped[str | None]
    evaluation: Mapped[str | None]
    delivery: Mapped[str | None]


class Recording(Base):
    __tablename__ = "recordings"
    id: Mapped[str] = mapped_column(primary_key=True)
    turn_id: Mapped[str] = mapped_column(
        ForeignKey("turns.id", ondelete="CASCADE"), index=True
    )
    transcript: Mapped[str]
    metrics: Mapped[str]
