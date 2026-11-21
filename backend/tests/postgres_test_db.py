"""Isolate PostgreSQL tests from other database schemas."""
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema


def postgres_test_engine(database_url, add_cleanup):
    url = make_url(database_url).set(drivername="postgresql+psycopg2")
    schema = f"repair_test_{uuid4().hex}"
    control = create_engine(url)
    add_cleanup(control.dispose)
    with control.begin() as db:
        db.execute(CreateSchema(schema))

    def drop_test_schema():
        with control.begin() as db:
            db.execute(DropSchema(schema, cascade=True))

    add_cleanup(drop_test_schema)
    return create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
