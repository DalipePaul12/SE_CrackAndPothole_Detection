"""Exercise the reports HTTP route against an isolated, in-memory database."""
from datetime import datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1 import reports
from app.db.base import Base
from app.models.report import Report


class ReportSearchTest(TestCase):
    @classmethod
    def setUpClass(cls):
        engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
        cls.addClassCleanup(engine.dispose)
        Base.metadata.create_all(engine)
        cls.now = datetime.now(timezone.utc)
        with Session(engine) as db:
            for i in range(1, 61):
                db.add(Report(
                    id=i, latitude=14.66, longitude=120.96,
                    barangay={1: "Tanong", 2: "Tugatog"}.get(i, "Catmon"),
                    street_name="Mabini Street" if i <= 2 else None,
                    ai_damage_type="pothole", ai_severity="critical" if i == 2 else "non_critical",
                    created_at=cls.now - timedelta(hours=100 if i == 1 else 61 - i),
                ))
            db.commit()

        async def test_db():
            with Session(engine) as db:
                yield AsyncMock(execute=AsyncMock(wraps=db.execute))

        app = FastAPI()
        app.include_router(reports.router)
        app.dependency_overrides[reports.get_db] = test_db
        app.dependency_overrides[reports.get_current_user] = lambda: object()
        app.dependency_overrides[reports.check_maintenance_mode] = lambda: None
        cls.client = TestClient(app)
        cls.addClassCleanup(cls.client.close)

    def ids(self, **params):
        response = self.client.get("/reports", params={"page_size": 25, **params})
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        return [row["id"] for row in data["results"]], data["total"]

    def test_locations_and_ids_across_pages(self):
        self.assertIn(1, self.ids(page=3)[0])
        self.assertEqual(self.ids(search="  MABINI "), ([2, 1], 2))
        self.assertEqual(self.ids(search="mabini", barangay="Tañong"), ([1], 1))
        self.assertEqual(self.ids(search="TUGA"), ([2], 1))
        for term in ("#001", "rpt-00001", "TAÑONG"):
            self.assertEqual(self.ids(search=term), ([1], 1))
        self.assertIn(42, self.ids(search="42")[0])
        self.assertEqual(self.ids(search="%"), ([], 0))

    def test_priority_dates_and_combined_filters(self):
        self.assertEqual(self.ids(sort_by="priority", sort_dir="asc", page_size=2), ([2, 1], 60))
        start = self.now - timedelta(hours=59)
        params = dict(search="mabini", barangay="Tugatog", status="pending",
                      damage_type="pothole", severity="critical")
        self.assertEqual(self.ids(**params, created_from=start.isoformat()), ([2], 1))
        self.assertEqual(self.ids(**params, created_before=start.isoformat()), ([], 0))

    def test_page_and_export_order(self):
        for col in ("created_at", "status", "severity", "priority"):
            params = dict(barangay="Catmon", sort_by=col, sort_dir="desc")
            pages = [self.ids(**params, page=p)[0] for p in (1, 2, 3)]
            all_ids, total = self.ids(**params, page_size=100)
            self.assertEqual(total, 58)
            self.assertEqual(sum(pages, []), all_ids)
            self.assertEqual(len(set(all_ids)), total)

    def test_invalid_query(self):
        for params in ({"sort_by": "unknown"}, {"sort_dir": "sideways"},
                       {"created_from": self.now.isoformat(), "created_before": self.now.isoformat()}):
            self.assertEqual(self.client.get("/reports", params=params).status_code, 422)
