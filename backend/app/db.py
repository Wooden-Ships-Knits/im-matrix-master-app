"""Connection pool and the transaction helper.

Every write goes through `transaction()`: a style is saved completely or not
at all (flow.md §3).
"""
from contextlib import contextmanager

from psycopg_pool import ConnectionPool

from .settings import settings

pool = ConnectionPool(kwargs=settings.conninfo, min_size=1, max_size=10, open=False)


@contextmanager
def transaction():
    with pool.connection() as conn:
        with conn.transaction():
            yield conn


def ping() -> bool:
    """True if the database answers."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            return cur.fetchone()[0] == 1
