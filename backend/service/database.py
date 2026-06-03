from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

# Use with the Supabase SESSION pooler (port 5432) or the direct connection.
engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    future=True,
)

# If you use the TRANSACTION pooler (port 6543), comment out the engine above
# and use this one instead:
# from sqlalchemy.pool import NullPool
# engine = create_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool, future=True)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
