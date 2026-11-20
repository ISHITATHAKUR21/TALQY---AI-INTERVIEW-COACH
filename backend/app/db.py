import os
import time
import uuid
from contextlib import contextmanager
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session
from .models import Base

url = os.getenv("DATABASE_URL", "sqlite:///talqy.db")
if url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(url, pool_pre_ping=True)
if engine.dialect.name == "sqlite":

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")


def uid():
    return uuid.uuid4().hex


def now():
    return int(time.time())


class Store:
    def __init__(self, session):
        self.session = session

    def execute(self, sql, *args):
        parts = sql.split("?")
        if len(parts) != len(args) + 1:
            raise ValueError("Parameter count mismatch")
        statement = parts[0] + "".join(f":p{i}" + p for i, p in enumerate(parts[1:]))
        return self.session.execute(
            text(statement), {f"p{i}": v for i, v in enumerate(args)}
        )

    def one(self, sql, *args):
        row = self.execute(sql, *args).mappings().first()
        return dict(row) if row else None

    def all(self, sql, *args):
        return [dict(row) for row in self.execute(sql, *args).mappings()]


@contextmanager
def transaction():
    with Session(engine) as session, session.begin():
        yield Store(session)


def setup():
    Base.metadata.create_all(engine)
