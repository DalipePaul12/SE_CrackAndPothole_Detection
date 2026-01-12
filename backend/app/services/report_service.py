
from sqlalchemy.orm import Session
import asyncio
from backend.app.services import ai_service, duplicate_service, credibility_service

class ReportService:
    
    async def create_report(self, db: Session, report_data: dict, user_id: int):
        """
        Main logic for creating a report:
        1. AI Analysis
        2. Duplicate Check
        3. Fake Detection
        4. Credibility Scoring
        5. Save to DB
        """
        
        # 1. AI Analysis (Advisory)
        ai_result = await ai_service.analyze_image(report_data['image_path'])
        
        # 2. Fake Image Check
        fake_check = await ai_service.detect_fake_image(report_data['image_path'])
        
        # 3. Duplicate Detection
        dup_result = duplicate_service.check_duplicate(
            db, 
            report_data['latitude'], 
            report_data['longitude']
        )
        
        # 4. Calculate Credibility Score
        # Assume user_trust_score is 0.8 for now (fetch from user table later)
        cred_score = credibility_service.calculate_score(
            ai_confidence=ai_result['confidence'],
            user_trust_score=0.8, 
            is_duplicate=dup_result['is_duplicate'],
            is_fake_media=fake_check['is_fake']
        )

        # 5. Prepare Data for Saving
        new_report_data = {
            **report_data,
            "user_id": user_id,
            "damage_type": ai_result['damage_type'],  # AI Suggested
            "severity": ai_result['severity'],        # AI Suggested
            "credibility_score": cred_score,
            "is_duplicate": dup_result['is_duplicate'],
            "is_flagged_fake": fake_check['is_fake'],
            "status": "pending_validation" # Default status
        }

        # 6. Save to DB (Pseudo-code)
        # new_report = Report(**new_report_data)
        # db.add(new_report)
        # db.commit()
        # db.refresh(new_report)
        
        print(f"✅ Report Processed! Score: {cred_score}")
        return new_report_data # Return created object

report_service = ReportService()
