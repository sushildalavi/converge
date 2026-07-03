from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base


def _test_database_url() -> str:
    explicit = os.getenv("TEST_DATABASE_URL", "").strip()
    if explicit:
        return explicit

    base = settings.database_url
    if base.endswith("/converge"):
        return base.rsplit("/", 1)[0] + "/converge_test"
    return base + "_test"

def _admin_database_url() -> str:
    explicit = os.getenv("TEST_ADMIN_DATABASE_URL", "").strip()
    if explicit:
        return explicit

    url = make_url(settings.database_url)
    return url.set(database="postgres").render_as_string(hide_password=False)


@pytest.fixture(scope="session")
def test_db_url() -> str:
    return _test_database_url()


@pytest.fixture(scope="session", autouse=True)
def _create_test_db(test_db_url: str):
    admin_url = _admin_database_url()
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    db_name = test_db_url.rsplit("/", 1)[1]
    with admin_engine.connect() as conn:
        exists = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": db_name}).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    admin_engine.dispose()

    engine = create_engine(test_db_url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db(test_db_url: str):
    engine = create_engine(test_db_url)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        # cleanup tables for next test
        for table in reversed(Base.metadata.sorted_tables):
            session.execute(table.delete())
        session.commit()
        session.close()
        engine.dispose()
