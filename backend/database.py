from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sensia.db")

# Optimisation du pool de connexions
engine_kwargs = {
    "pool_pre_ping": True,
}

if "sqlite" in DATABASE_URL:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    engine_kwargs["poolclass"] = StaticPool
    # StaticPool ne prend pas pool_size / max_overflow
    engine_kwargs.pop("pool_pre_ping", None)
else:
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["pool_recycle"] = 1800

engine = create_engine(DATABASE_URL, **engine_kwargs)


# Activer le WAL mode + optimisations SQLite pour Apple Silicon
# Le M5 Pro dispose d'une mémoire unifiée rapide → on en profite au max
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-32000")   # 32 Mo de cache (mémoire unifiée M5)
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA mmap_size=268435456")  # 256 Mo mmap — I/O ultra-rapide ARM64
        cursor.execute("PRAGMA page_size=4096")       # Aligné sur les pages mémoire ARM64
        cursor.execute("PRAGMA wal_autocheckpoint=100")  # Checkpoint fréquent = lecture rapide
        cursor.execute("PRAGMA busy_timeout=5000")    # Évite les locks en multi-workers
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
