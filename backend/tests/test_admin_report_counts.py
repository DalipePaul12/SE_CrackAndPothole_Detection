import os
from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import AsyncMock, patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from postgres_test_db import postgres_test_engine

from app.api.v1 import analytics, reports
from app.db.base import Base
from app.models.admin_settings import AdminSettings
from app.models.enums import ReportStatus, SeverityLevel, UserRole
from app.models.report import Report
from app.services import report_sla


class AdminReportCountsTest(TestCase):
    def setUp(self):
        self.postgres_url = os.getenv("REPAIR_TEST_POSTGRES_URL")
        self.engine = (postgres_test_engine(self.postgres_url, self.addCleanup) if self.postgres_url
                       else create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}))
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.now = datetime(2026, 11, 21, 4, tzinfo=timezone.utc)
        self.role = UserRole.admin

        async def test_db():
            with Session(self.engine) as db:
                yield AsyncMock(execute=AsyncMock(wraps=db.execute))

        def current_user():
            return SimpleNamespace(id=1, role=self.role)

        def admin():
            if self.role != UserRole.admin:
                raise HTTPException(403)
            return current_user()

        app = FastAPI()
        app.include_router(reports.router)
        app.include_router(analytics.router)
        app.dependency_overrides.update({
            reports.get_db: test_db, reports.get_current_user: current_user,
            reports.require_admin: admin, reports.check_maintenance_mode: lambda: None,
            analytics._require_staff: admin,
        })
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        for module in (reports, report_sla):
            clock = self.enterContext(patch.object(module, "datetime", wraps=datetime))
            clock.now.side_effect = lambda tz: self.now.astimezone(tz)

    def report(self, report_id, status, age=100, **fields):
        return Report(id=report_id, status=status, latitude=14.66, longitude=120.96,
                      created_at=self.now - timedelta(hours=age), **fields)

    def test_summary_and_manila_midnight(self):
        midnight = datetime(2026, 11, 20, 16, tzinfo=timezone.utc)
        with Session(self.engine) as db:
            db.add_all([
                self.report(1, ReportStatus.PENDING, ai_severity=SeverityLevel.critical),
                self.report(2, ReportStatus.IN_PROGRESS),
                self.report(3, ReportStatus.RESOLVED, resolved_at=midnight),
                self.report(4, ReportStatus.RESOLVED, resolved_at=midnight - timedelta(seconds=1)),
                self.report(5, ReportStatus.RESOLVED, updated_at=self.now),
                self.report(6, ReportStatus.RESOLVED, resolved_at=midnight + timedelta(days=1)),
            ])
            db.commit()
        expected = {"total": 6, "critical": 1, "pending": 1, "in_progress": 1, "resolved_today": 1}
        for page in (1, 2):
            self.assertEqual(self.client.get("/reports", params={"page": page, "page_size": 1}).json()["total"], 6)
            self.assertEqual(self.client.get("/reports/admin-summary").json(), expected)
        self.assertEqual(self.client.get("/reports", params={"status": "pending"}).json()["total"], 1)
        self.assertEqual(self.client.get("/reports/admin-summary").json(), expected)
        self.role = UserRole.citizen
        self.assertEqual(self.client.get("/reports/admin-summary").status_code, 403)

    def test_resolution_timestamp_survives_edits_and_clears_on_reopen(self):
        with Session(self.engine, expire_on_commit=False) as db:
            row = self.report(1, ReportStatus.PENDING)
            db.add(row)
            db.commit()
            row.status = ReportStatus.RESOLVED
            db.commit()
            first = row.resolved_at
            self.assertIsNotNone(first)
            row.description = "Updated after closure."
            row.status = ReportStatus.RESOLVED
            db.commit()
            self.assertEqual(row.resolved_at, first)
            row.status = ReportStatus.IN_PROGRESS
            db.commit()
            self.assertIsNone(row.resolved_at)
            row.status = ReportStatus.RESOLVED
            db.commit()
            self.assertGreaterEqual(row.resolved_at, first)

    def test_live_dashboard_counts_share_paged_sla_filter(self):
        with Session(self.engine) as db:
            db.add_all([
                self.report(1, ReportStatus.PENDING, age=24),
                self.report(2, ReportStatus.IN_PROGRESS, age=72),
                self.report(3, ReportStatus.VERIFIED, age=23.99),
                self.report(4, ReportStatus.CANCELLED),
                self.report(5, ReportStatus.REJECTED),
                self.report(6, ReportStatus.COMPLETED),
                self.report(7, ReportStatus.DECLINED),
                self.report(8, ReportStatus.RESOLVED),
                self.report(9, ReportStatus.ASSIGNED, age=40),
                AdminSettings(id=1, response_time_hours=24, escalate_after_hours=72),
            ])
            db.commit()

        def matching(page_size):
            return self.client.get("/reports", params={"past_sla": True, "page_size": page_size}).json()

        def counts():
            return [self.client.get(f"/analytics/{endpoint}").json()["data"]["overdue_count"]
                    for endpoint in ("priority-flags", "sla-stats")]

        with patch.object(analytics, "_cache_get", AsyncMock(return_value={"overdue_count": 99})):
            self.assertEqual(counts(), [3, 3])
            self.assertEqual(matching(1)["total"], 3)
            self.assertEqual({row["id"]: row["sla_status"] for row in matching(100)["results"]},
                             {1: "overdue", 2: "escalated", 9: "overdue"})
            with Session(self.engine) as db:
                settings = db.get(AdminSettings, 1)
                settings.response_time_hours = 48
                settings.escalate_after_hours = 40
                db.commit()
            self.assertEqual(counts(), [2, 2])
            self.assertEqual({row["id"]: row["sla_status"] for row in matching(100)["results"]},
                             {2: "escalated", 9: "escalated"})
        self.role = UserRole.contractor
        self.assertEqual(self.client.get("/reports?past_sla=true").status_code, 403)

    def test_migration_backfills_only_confirmed_closures(self):
        path = Path(__file__).resolve().parents[1] / "alembic/versions/c6ba09d251e4_track_report_resolution.py"
        spec = spec_from_file_location("track_report_resolution", path)
        migration = module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = (postgres_test_engine(self.postgres_url, self.addCleanup) if self.postgres_url
                  else create_engine("sqlite://"))
        self.addCleanup(engine.dispose)
        with engine.begin() as db:
            db.exec_driver_sql("CREATE TABLE reports (id INTEGER PRIMARY KEY, status TEXT NOT NULL)")
            date_type = "TIMESTAMP WITH TIME ZONE" if self.postgres_url else "TEXT"
            db.exec_driver_sql(f"CREATE TABLE projects (report_id INTEGER, status TEXT, actual_completion_date {date_type})")
            db.exec_driver_sql("INSERT INTO reports VALUES (1, 'RESOLVED'), (2, 'RESOLVED'), (3, 'PENDING')")
            db.exec_driver_sql("INSERT INTO projects VALUES (1, 'COMPLETED', '2026-11-21 01:00:00+00'), "
                               "(2, 'IN_PROGRESS', '2026-11-21 01:00:00+00'), (3, 'COMPLETED', '2026-11-21 01:00:00+00')")
            with Operations.context(MigrationContext.configure(db)):
                migration.upgrade()
            expected = datetime(2026, 11, 21, 1, tzinfo=timezone.utc) if self.postgres_url else "2026-11-21 01:00:00+00"
            self.assertEqual(db.exec_driver_sql("SELECT resolved_at FROM reports ORDER BY id").scalars().all(),
                             [expected, None, None])

    def test_repair_tracking_upgrade_preserves_existing_project(self):
        path = Path(__file__).resolve().parents[1] / "alembic/versions/dd418f620a87_repair_tracking.py"
        spec = spec_from_file_location("repair_tracking_migration", path)
        migration = module_from_spec(spec)
        spec.loader.exec_module(migration)
        from app.models.project import Project
        with Session(self.engine) as session:
            session.add(self.report(42, ReportStatus.RESOLVED))
            session.flush()
            session.add(Project(id=7, report_id=42))
            session.commit()
        with self.engine.begin() as db, Operations.context(MigrationContext.configure(db)):
            migration.downgrade()
            migration.upgrade()
            self.assertEqual(db.exec_driver_sql("SELECT report_id, scheduled_date FROM projects").one(), (42, None))
            self.assertEqual(db.exec_driver_sql("SELECT count(*) FROM report_follows").scalar(), 0)
