import os
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Barrier
from unittest import TestCase, skipUnless
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from postgres_test_db import postgres_test_engine

from app.api.v1 import contractor, projects, repair_tracking, reports, users
from app.db.base import Base
from app.models.comment import Comment
from app.models.enums import ProjectStatus, ReportStatus, UserRole
from app.models.media_attachment import MediaAttachment
from app.models.notification import Notification
from app.models.project import Project
from app.models.project_update import ProjectUpdate
from app.models.repair_review import RepairReview
from app.models.report import Report
from app.models.user import User


POSTGRES_TEST_URL = os.getenv("REPAIR_TEST_POSTGRES_URL")


class RepairWorkflowTest(TestCase):
    def make_engine(self):
        if POSTGRES_TEST_URL and self._testMethodName == "test_approval_and_withdrawal_race":
            return postgres_test_engine(POSTGRES_TEST_URL, self.addCleanup)

        engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys = ON")

        return engine

    def setUp(self):
        engine = self.make_engine()
        self.addCleanup(engine.dispose)
        self.engine = engine
        Base.metadata.create_all(engine)
        self.role = UserRole.admin
        self.user_id = 1
        with Session(engine) as db:
            for user_id, role in enumerate((UserRole.superadmin, UserRole.citizen, UserRole.contractor, UserRole.contractor), 1):
                db.add(User(id=user_id, email=f"{user_id}@example.com", full_name=f"User {user_id}",
                            hashed_password="unused", role=role))
            db.flush()
            db.add_all(Report(id=i, owner_id=2, latitude=14.66, longitude=120.96, status=ReportStatus.IN_PROGRESS)
                       for i in (1, 2))
            db.flush()
            db.add(Project(id=1, report_id=2, contractor_id=3, status=ProjectStatus.IN_PROGRESS))
            db.commit()

        async def test_db():
            with Session(engine, expire_on_commit=False) as db:
                class DB:
                    def __getattr__(self, name):
                        member = getattr(db, name)
                        if name in {"execute", "get", "scalar", "scalars", "commit", "flush", "refresh", "delete"}:
                            return AsyncMock(wraps=member)
                        return member
                yield DB()

        def current_user():
            return User(id=self.user_id, role=self.role)

        def admin():
            if self.role not in (UserRole.admin, UserRole.superadmin):
                raise HTTPException(403)
            return current_user()

        def superadmin():
            if self.role != UserRole.superadmin:
                raise HTTPException(403)
            return current_user()

        def assigned_contractor():
            if self.role != UserRole.contractor:
                raise HTTPException(403)
            return current_user()

        app = FastAPI()
        for router in (reports.router, projects.router, contractor.router, users.router, repair_tracking.router):
            app.include_router(router)
        app.dependency_overrides.update({
            reports.get_db: test_db,
            reports.get_current_user: current_user,
            reports.require_admin: admin,
            users.require_superadmin: superadmin,
            contractor.require_contractor: assigned_contractor,
            reports.check_maintenance_mode: lambda: None,
        })
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.upload = self.enterContext(patch("app.services.repair_service.upload_report_file",
                                              side_effect=lambda data, path, mime: f"https://proof.test/{path}"))
        self.enterContext(patch("app.services.repair_service.discard_proof"))
        self.delivered = self.enterContext(patch("app.services.repair_service.deliver_saved_notification"))
        self.enterContext(patch("app.api.v1.contractor._notify_admin"))
        image = BytesIO()
        Image.new("RGB", (32, 32)).save(image, "PNG")
        self.photo = ("photo.png", image.getvalue(), "image/png")

    def submit(self, photo_count=1, contractor_id=3):
        self.role, self.user_id = UserRole.contractor, contractor_id
        return self.client.post("/contractor/projects/1/complete", data={"notes": "Filled the pothole"},
                                files=[("photos", self.photo)] * photo_count)

    def decision(self, attempt_id, decision, **details):
        return self.client.post(f"/projects/1/repair-review/{attempt_id}/decision",
                                json={"decision": decision, **details})

    def test_follow_schedule_approval_and_inspection_retry(self):
        with Session(self.engine) as db:
            db.add(User(id=5, email="follower@example.com", hashed_password="unused", role=UserRole.citizen))
            db.commit()
        self.role, self.user_id = UserRole.citizen, 5
        base = "/repair-tracking/2"
        with Session(self.engine) as db:
            source = db.get(Report, 2)
            source.ai_damage_type = "crack"
            source.status = ReportStatus.PENDING
            db.commit()
        matches = self.client.get("/reports/nearby-duplicates", params={
            "latitude": 14.66, "longitude": 120.96, "damage_types": "crack"}).json()["matches"]
        self.assertEqual([(row["id"], row["own_report"]) for row in matches], [(2, False)])
        for _ in range(2):
            self.assertEqual(self.client.put(base + "/follow").status_code, 200)
        self.assertEqual(self.client.put(base + "/schedule", json={"scheduled_date": None}).status_code, 403)
        self.user_id, self.role = 1, UserRole.admin
        for _ in range(2):
            self.assertEqual(self.client.put(base + "/schedule", json={"scheduled_date": "2099-03-04"}).status_code, 200)
        self.assertEqual(self.client.get("/repair-tracking/schedule").json()[0]["scheduled_date"], "2099-03-04")
        with Session(self.engine) as db:
            db.get(Report, 2).status = ReportStatus.IN_PROGRESS
            db.commit()
        attempt = self.submit().json()
        self.role, self.user_id = UserRole.admin, 1
        self.assertEqual(self.decision(attempt["id"], "approve").status_code, 200)
        self.assertEqual(self.client.post(base + "/inspections", json={"visit_date": "2099-03-06"}).status_code, 200)
        visit = self.client.get(base + "/details").json()["inspections"][0]
        def result():
            return self.client.post(base + f"/inspections/{visit['id']}/result", data={
                "result": "needs_work", "notes": "Surface split"}, files={"photos": self.photo})
        first = result()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json(), result().json())
        followup = first.json()["followup_id"]
        self.assertEqual(self.client.get(f"/repair-tracking/{followup}/details").json()["source_report"], 2)
        self.role, self.user_id = UserRole.citizen, 5
        summary = self.client.get("/repair-tracking/following").json()
        self.assertEqual(len(summary), 1)
        self.assertEqual(len(summary[0]["photos"]), 1)
        self.assertNotIn("owner", summary[0])
        with Session(self.engine) as db:
            self.assertEqual(db.get(Report, 2).status, ReportStatus.RESOLVED)
            self.assertEqual(db.get(Report, followup).status, ReportStatus.VERIFIED)
            titles = list(db.scalars(select(Notification.title).where(Notification.user_id == 5)))
            self.assertCountEqual(titles, ["Repairs underway", "Repair approved", "Repair schedule changed"])
        self.assertEqual(self.client.delete(base + "/follow").status_code, 200)
        self.assertEqual(self.client.get("/repair-tracking/following").json(), [])
        self.role, self.user_id = UserRole.admin, 1
        prior_url = f"/reports/{followup}/prior-repairs"
        self.assertEqual(self.client.get(prior_url).json()[0]["report_id"], 2)
        decision_url = f"/repair-tracking/{followup}/prior/2"
        self.assertEqual(self.client.put(decision_url, json={"decision": "returned"}).status_code, 200)
        self.assertEqual(self.client.get(prior_url).json()[0]["decision"], "returned")
        with patch("app.api.v1.projects.notify_background"):
            project = self.client.post("/projects/", json={"report_id": followup, "contractor_id": 3})
        self.assertEqual(project.status_code, 201, project.text)
        project_id = project.json()["id"]
        self.role, self.user_id = UserRole.contractor, 3
        self.assertEqual(self.client.post(f"/contractor/projects/{project_id}/accept").status_code, 200)
        proof = self.client.post(f"/contractor/projects/{project_id}/complete", data={"notes": "Patched again"},
                                 files={"photos": self.photo})
        self.assertEqual(proof.status_code, 200, proof.text)
        self.role, self.user_id = UserRole.admin, 1
        self.assertEqual(self.client.post(f"/projects/{project_id}/repair-review/{proof.json()['id']}/decision",
                                          json={"decision": "approve"}).status_code, 200)

    def test_manual_close_retries_and_persists_proof_after_reload(self):
        path = "/reports/1/resolve"
        response = self.client.post(path, files={"photo": ("bad.png", b"invalid", "image/png")})
        self.assertEqual(response.status_code, 422)
        with patch("app.services.repair_service.upload_report_file", side_effect=RuntimeError("offline")), self.assertLogs("app.services.repair_service", "ERROR"):
            response = self.client.post(path, data={"note": "Finished"}, files={"photo": self.photo})
            self.assertEqual(response.status_code, 502)
        with Session(self.engine) as db:
            self.assertEqual(db.get(Report, 1).status, ReportStatus.IN_PROGRESS)
            self.assertIsNone(db.scalar(select(Comment)))
        for _ in range(2):
            response = self.client.post(path, data={"note": "Finished"}, files={"photo": self.photo})
            self.assertEqual(response.status_code, 200, response.text)
        self.role, self.user_id = UserRole.citizen, 2
        result = self.client.get("/reports/1").json()
        self.assertEqual(result["status"], "resolved")
        self.assertIsNone(result["image_url"])
        self.assertEqual([item["attachment_type"] for item in result["media_attachments"]], ["completion_proof"])
        self.assertEqual(self.upload.call_count, 1)
        with Session(self.engine) as db:
            self.assertEqual(len(list(db.scalars(select(Comment)))), 1)

    def test_retake_and_approve_latest_attempt(self):
        first = self.submit()
        self.assertEqual(first.status_code, 200, first.text)
        first_id = first.json()["id"]
        self.assertEqual(self.submit().status_code, 409)
        path = "/projects/1/repair-review"
        attempt = self.client.get(path).json()
        self.assertEqual(attempt["id"], first_id)
        photo_path = f"{path}/{first_id}/photos/{attempt['photo_ids'][0]}"
        self.assertEqual(self.client.get(photo_path).content, self.photo[1])
        self.assertEqual(self.decision(first_id, "approve").status_code, 403)
        self.user_id = 4
        self.assertEqual(self.client.get(photo_path).status_code, 403)
        self.role, self.user_id = UserRole.citizen, 2
        self.assertEqual(self.client.get(path).status_code, 403)
        self.assertEqual(self.client.get(photo_path).status_code, 403)
        report = self.client.get("/reports/2").json()
        self.assertEqual(report["status"], "in_progress")
        self.assertEqual(report["media_attachments"], [])

        self.role, self.user_id = UserRole.admin, 1
        self.assertEqual(self.client.get("/reports?awaiting_repair_review=true").json()["total"], 1)
        self.assertEqual(self.client.post("/reports/2/resolve").status_code, 409)
        self.assertEqual(self.client.patch("/reports/2", json={"status": "resolved"}).status_code, 409)
        self.assertEqual(self.client.put("/reports/2/decline", json={"reason": "cancel"}).status_code, 409)
        for url in ("/projects/1", "/projects/1/status"):
            self.assertEqual(self.client.put(url, json={"completion_percentage": 100}).status_code, 409)
        self.assertEqual(self.decision(first_id, "request_retake", reason=" ").status_code, 422)
        self.assertEqual(self.decision(first_id, "request_retake", reason="Show the entire repair.").status_code, 200)
        self.assertEqual(self.client.get("/reports?awaiting_repair_review=true").json()["total"], 0)
        self.role, self.user_id = UserRole.contractor, 3
        self.assertEqual(self.client.get(path).json()["reason"], "Show the entire repair.")
        second = self.submit(photo_count=2)
        self.assertEqual(second.status_code, 200, second.text)
        second_id = second.json()["id"]
        self.role, self.user_id = UserRole.admin, 1
        self.assertEqual(self.decision(first_id, "approve").status_code, 409)
        with patch("app.services.repair_service.upload_report_file", side_effect=RuntimeError("offline")), self.assertLogs("app.services.repair_service", "ERROR"):
            self.assertEqual(self.decision(second_id, "approve").status_code, 502)
        self.assertEqual(self.client.get(path).json()["status"], "pending")
        self.assertEqual(self.decision(second_id, "approve").status_code, 200)
        self.assertEqual(self.decision(second_id, "approve").status_code, 409)
        self.assertEqual(self.client.get("/reports?awaiting_repair_review=true").json()["total"], 0)
        self.role, self.user_id = UserRole.citizen, 2
        approved = self.client.get("/reports/2").json()
        self.assertEqual(approved["status"], "resolved")
        self.assertEqual([item["attachment_type"] for item in approved["media_attachments"]], ["completion_proof"] * 2)
        with Session(self.engine) as db:
            self.assertEqual(db.get(Project, 1).status, ProjectStatus.COMPLETED)
            self.assertEqual(db.get(Report, 2).status, ReportStatus.RESOLVED)
            self.assertEqual(db.get(RepairReview, first_id).status, "retake_requested")
            self.assertEqual(len(list(db.scalars(select(MediaAttachment)))), 2)
            resident_notifications = list(db.scalars(select(Notification).where(Notification.user_id == 2)))
            self.assertEqual([notice.title for notice in resident_notifications], ["Your report has been resolved"])
            self.assertEqual(sum(call.args[0].user_id == 2 for call in self.delivered.await_args_list), 1)

    def test_withdraw_after_deleting_contractor(self):
        first = self.submit()
        self.assertEqual(first.status_code, 200, first.text)
        first_id = first.json()["id"]
        self.role, self.user_id = UserRole.admin, 1
        retake_reason = "Show the repair from both lanes."
        self.assertEqual(self.decision(first_id, "request_retake", reason=retake_reason).status_code, 200)

        submitted = self.submit()
        self.assertEqual(submitted.status_code, 200, submitted.text)
        attempt_id = submitted.json()["id"]
        self.assertEqual(self.decision(attempt_id, "withdraw_and_reassign",
                                      reason="Reassign", contractor_id=4).status_code, 403)

        self.role, self.user_id = UserRole.superadmin, 1
        with Session(self.engine) as db:
            contractor_public_id = db.get(User, 3).public_id
        deleted = self.client.delete(f"/users/{contractor_public_id}")
        self.assertEqual(deleted.status_code, 204, deleted.text)
        with Session(self.engine) as db:
            self.assertIsNone(db.get(User, 3))
            self.assertIsNone(db.scalar(select(Notification).where(Notification.user_id == 3)))
            self.assertIsNone(db.get(RepairReview, attempt_id).contractor_id)
            self.assertIsNone(db.get(Project, 1).contractor_id)

        queue = "/reports?awaiting_repair_review=true"
        review_path = "/projects/1/repair-review"
        self.assertEqual(self.client.get(queue).json()["total"], 1)
        review = self.client.get(review_path).json()
        self.assertFalse(review["can_approve_or_retake"])
        photo_path = f"{review_path}/{attempt_id}/photos/{review['photo_ids'][0]}"
        self.assertEqual(self.client.get(photo_path).content, self.photo[1])
        self.assertEqual(self.decision(attempt_id, "approve").status_code, 409)
        self.assertEqual(self.decision(attempt_id, "request_retake", reason="Retake").status_code, 409)
        self.assertEqual(self.client.post("/reports/2/resolve").status_code, 409)
        self.assertEqual(self.client.patch("/reports/2", json={"status": "resolved"}).status_code, 409)
        for url in ("/projects/1", "/projects/1/status"):
            self.assertEqual(self.client.put(url, json={"status": "completed"}).status_code, 409)
        self.assertEqual(self.client.patch("/projects/1/assign", json={"contractor_id": 4}).status_code, 409)

        for payload, expected in (({"reason": " ", "contractor_id": 4}, 422),
                                  ({"reason": "Reassign"}, 422),
                                  ({"reason": "Reassign", "contractor_id": 2}, 400),
                                  ({"reason": "Reassign", "contractor_id": 999}, 404)):
            self.assertEqual(self.decision(attempt_id, "withdraw_and_reassign", **payload).status_code, expected)
        with Session(self.engine) as db:
            db.get(User, 4).is_active = False
            db.commit()
        details = {"reason": "Original contractor left", "contractor_id": 4}
        self.assertEqual(self.decision(attempt_id, "withdraw_and_reassign", **details).status_code, 400)
        self.assertEqual(self.client.get(queue).json()["total"], 1)
        with Session(self.engine) as db:
            db.get(User, 4).is_active = True
            db.commit()

        withdrawn = self.decision(attempt_id, "withdraw_and_reassign", **details)
        self.assertEqual(withdrawn.json(), {"id": attempt_id, "status": "withdrawn"})
        self.assertEqual(self.decision(attempt_id, "withdraw_and_reassign", **details).status_code, 409)
        self.assertEqual(self.client.get(queue).json()["total"], 0)
        self.assertEqual(self.client.get(photo_path).content, self.photo[1])
        with Session(self.engine) as db:
            project = db.get(Project, 1)
            self.assertEqual((project.status, project.contractor_id, project.completion_percentage),
                             (ProjectStatus.SCHEDULED, 4, 0))
            self.assertEqual(db.get(Report, 2).status, ReportStatus.IN_PROGRESS)
            audit = db.scalar(select(ProjectUpdate).where(ProjectUpdate.new_contractor_id == 4))
            self.assertEqual(audit.changed_by_id, 1)
            self.assertIn(details["reason"], audit.note)
            self.assertEqual(db.get(RepairReview, attempt_id).reason, details["reason"])
            self.assertIsNone(db.scalar(select(MediaAttachment)))
            self.assertEqual(sum(call.args[0].user_id == 4 for call in self.delivered.await_args_list), 1)

        self.role, self.user_id = UserRole.contractor, 4
        accepted = self.client.post("/contractor/projects/1/accept")
        self.assertEqual(accepted.status_code, 200, accepted.text)
        second = self.submit(contractor_id=4)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertNotEqual(second.json()["id"], attempt_id)
        self.role, self.user_id = UserRole.admin, 1
        self.assertEqual(self.client.get(photo_path).content, self.photo[1])
        self.assertEqual(self.decision(attempt_id, "approve").status_code, 409)
        history = self.client.get(f"{review_path}/history").json()["attempts"]
        self.assertEqual([(item["id"], item["status"], item["reason"]) for item in history],
                         [(attempt_id, "withdrawn", details["reason"]), (first_id, "retake_requested", retake_reason)])
        for item in history:
            self.assertTrue(item["created_at"] and item["decided_at"])
            self.assertNotIn("can_approve_or_retake", item)
            photo = self.client.get(f"{review_path}/{item['id']}/photos/{item['photo_ids'][0]}")
            self.assertEqual(photo.content, self.photo[1])

    def test_repair_history_pages_and_access(self):
        path = "/projects/1/repair-review/history"
        empty = {"attempts": [], "next_before_id": None}
        self.assertEqual(self.client.get(path).json(), empty)
        self.assertEqual(self.client.get("/projects/999/repair-review/history").status_code, 404)
        with Session(self.engine) as db:
            db.add(Project(id=2, report_id=1))
            db.flush()
            db.add_all(RepairReview(id=i, project_id=1, status="withdrawn", notes="Older attempt")
                       for i in range(1, 13))
            db.add(RepairReview(id=13, project_id=1, status="pending", notes="Latest"))
            db.add(RepairReview(id=14, project_id=2, status="approved", notes="Other project"))
            db.commit()

        first = self.client.get(path).json()
        first_ids = [item["id"] for item in first["attempts"]]
        self.assertEqual(first_ids, list(range(12, 2, -1)))
        self.assertEqual(first["next_before_id"], 3)
        second = self.client.get(path, params={"before_id": first["next_before_id"]}).json()
        self.assertEqual([item["id"] for item in second["attempts"]], [2, 1])
        self.assertIsNone(second["next_before_id"])
        self.assertEqual(self.client.get(path, params={"before_id": 1}).json(), empty)
        self.assertEqual(self.client.get(path, params={"before_id": 0}).status_code, 422)
        for self.role, self.user_id in ((UserRole.citizen, 2), (UserRole.contractor, 3)):
            self.assertEqual(self.client.get(path).status_code, 403)

    @skipUnless(POSTGRES_TEST_URL, "Set REPAIR_TEST_POSTGRES_URL to an isolated PostgreSQL test database.")
    def test_approval_and_withdrawal_race(self):
        submitted = self.submit()
        self.assertEqual(submitted.status_code, 200, submitted.text)
        attempt_id = submitted.json()["id"]
        self.role, self.user_id = UserRole.admin, 1
        start = Barrier(2, timeout=10)

        def decide(decision, **details):
            start.wait()
            return self.decision(attempt_id, decision, **details)

        with ThreadPoolExecutor(max_workers=2) as pool:
            approval = pool.submit(decide, "approve")
            withdrawal = pool.submit(decide, "withdraw_and_reassign", reason="Replace crew", contractor_id=4)
            results = [approval.result(timeout=30), withdrawal.result(timeout=30)]
        self.assertEqual(sorted(result.status_code for result in results), [200, 409])
        with Session(self.engine) as db:
            review = db.get(RepairReview, attempt_id)
            project = db.get(Project, 1)
            report = db.get(Report, 2)
            expected = ((ProjectStatus.COMPLETED, ReportStatus.RESOLVED, 3) if review.status == "approved"
                        else (ProjectStatus.SCHEDULED, ReportStatus.IN_PROGRESS, 4))
            self.assertEqual((project.status, report.status, project.contractor_id), expected)
            self.assertEqual(len(list(db.scalars(select(ProjectUpdate)))), 1)
