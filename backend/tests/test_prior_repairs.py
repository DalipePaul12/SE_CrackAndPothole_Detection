from datetime import datetime, timedelta, timezone
from math import degrees
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import AsyncMock

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from postgres_test_db import postgres_test_engine

from app.api.v1 import reports
from app.db.base import Base
from app.models.enums import DamageType, MediaType, ProjectStatus, ReportStatus, UserRole
from app.models.media_attachment import MediaAttachment
from app.models.project import Project
from app.models.report import Report


class PriorRepairsTest(TestCase):
    @classmethod
    def setUpClass(cls):
        postgres_url = os.getenv("REPAIR_TEST_POSTGRES_URL")
        engine = (postgres_test_engine(postgres_url, cls.addClassCleanup) if postgres_url
                  else create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}))
        cls.addClassCleanup(engine.dispose)
        Base.metadata.create_all(engine)
        now = datetime.now(timezone.utc)
        old = now - timedelta(days=10)
        recent = now - timedelta(days=1)
        with Session(engine) as db:
            def report(report_id, distance, **changes):
                values = dict(id=report_id, latitude=14.66 + degrees(distance / 6_371_000), longitude=120.96,
                              ai_damage_type=DamageType.pothole, created_at=old, status=ReportStatus.RESOLVED)
                db.add(Report(**(values | changes)))

            report(1, 0, status=ReportStatus.PENDING, created_at=now, street_name="Mabini")
            report(2, 15, ai_damage_type=DamageType.crack, secondary_damage=DamageType.pothole)
            report(3, 5)
            report(4, 5)
            report(5, 4, ai_damage_type=DamageType.crack)
            report(6, 15.01)
            report(7, 0)
            report(8, 0)  # Resolved without a dated repair.
            report(9, 12, status=ReportStatus.PENDING, created_at=now + timedelta(hours=1), street_name="Mabini")
            report(10, 0, status=ReportStatus.PENDING, created_at=now, longitude=121.1)
            report(11, 15.01, longitude=121.1)
            db.flush()

            for repair_id, date in ((2, recent), (3, old), (5, recent), (6, recent),
                                    (7, now + timedelta(days=1)), (11, recent)):
                db.add(Project(report_id=repair_id, status=ProjectStatus.COMPLETED, actual_completion_date=date))
            for repair_id, kind, date in ((3, "completion_proof", recent), (4, "completion_proof", recent),
                                          (4, "submission", now + timedelta(days=1)), (8, "submission", recent)):
                db.add(MediaAttachment(report_id=repair_id, file_url=f"/{repair_id}-{kind}.jpg",
                                       media_type=MediaType.image, attachment_type=kind, created_at=date))
            db.commit()

        async def test_db():
            with Session(engine) as db:
                yield AsyncMock(execute=AsyncMock(wraps=db.execute))

        def current_user(role: UserRole = UserRole.admin):
            return SimpleNamespace(id=1, role=role)

        def admin(role: UserRole = UserRole.admin):
            if role not in (UserRole.admin, UserRole.superadmin):
                raise HTTPException(403)
            return current_user(role)

        app = FastAPI()
        app.include_router(reports.router)
        app.dependency_overrides.update({
            reports.get_db: test_db, reports.get_current_user: current_user,
            reports.require_admin: admin, reports.check_maintenance_mode: lambda: None,
        })
        cls.client = TestClient(app)
        cls.addClassCleanup(cls.client.close)
        cls.old = old

    def test_prior_repair_distance_dates_photos_and_status(self):
        response = self.client.get("/reports/1/prior-repairs")
        self.assertEqual(response.status_code, 200, response.text)
        repairs = response.json()
        self.assertEqual([repair["report_id"] for repair in repairs], [4, 3, 2])
        self.assertEqual([repair["distance_meters"] for repair in repairs], [5, 5, 15])
        self.assertEqual(repairs[1]["repaired_at"][:10], self.old.date().isoformat())
        self.assertEqual([photo["file_url"] for photo in repairs[0]["repair_photos"]], ["/4-completion_proof.jpg"])
        self.assertEqual(repairs[2]["repair_photos"], [])
        self.assertEqual(self.client.get("/reports/1").json()["status"], "pending")
        self.assertEqual(self.client.get("/reports/10/prior-repairs").json(), [])
        self.assertEqual(self.client.get("/reports/999/prior-repairs").status_code, 404)

    def test_badges_filter_and_export_pagination_agree(self):
        plain = self.client.get("/reports", params={"status": "pending"}).json()
        self.assertTrue(all("possible_repeat_damage" not in row for row in plain["results"]))
        annotated = self.client.get("/reports", params={"status": "pending", "include_repeat_damage": True}).json()
        self.assertEqual({row["id"]: row["possible_repeat_damage"] for row in annotated["results"]},
                         {9: True, 1: True, 10: False})
        query = {"status": "pending", "search": "Mabini", "possible_repeat_damage": True}
        pages = [self.client.get("/reports", params=query | {"page_size": 1, "page": page}).json()
                 for page in (1, 2)]
        exported = self.client.get("/reports", params=query | {"page_size": 100}).json()
        self.assertEqual([page["total"] for page in pages], [2, 2])
        self.assertEqual([page["results"][0]["id"] for page in pages], [row["id"] for row in exported["results"]])
        self.assertTrue(all(row["possible_repeat_damage"] for row in exported["results"]))

    def test_repeat_damage_data_is_admin_only(self):
        for role in (UserRole.citizen, UserRole.contractor):
            for flag in ("include_repeat_damage", "possible_repeat_damage"):
                response = self.client.get("/reports", params={flag: True, "role": role.value})
                self.assertEqual(response.status_code, 403)
            response = self.client.get("/reports/1/prior-repairs", params={"role": role.value})
            self.assertEqual(response.status_code, 403)
import os
