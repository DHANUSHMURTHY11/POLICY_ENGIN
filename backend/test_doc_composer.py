import asyncio
import os
import uuid
import uuid
import sys

from sqlalchemy.ext.asyncio import AsyncSession
from app.database.postgresql import AsyncSessionLocal
from app.database.mongodb import policy_documents_collection
from app.policy.models import PolicyMetadata
from app.document.service import generate_pdf

async def run_test():
    policy_id = str(uuid.uuid4())
    
    structure = {
        "header": {
            "title": "Home Loan Policy 2026",
            "organization": "BaikalSphere Bank",
            "effective_date": "2026-03-01",
            "expiry_date": "2027-03-01"
        },
        "version_control": [
            {"version_number": 1, "created_at": "2026-02-26", "created_by": "John Doe", "change_summary": "Initial draft"}
        ],
        "sections": [
            {
                "heading": "Eligibility Criteria",
                "content": "",
                "tone": "formal",
                "communication_style": "policy_circular",
                "subsections": [
                    {
                        "title": "Credit Score Requirements",
                        "fields": [
                            {"field_name": "Minimum CIBIL Score", "field_type": "number", "validation_rules": {"min": 700}, "notes": "Subject to risk exception"},
                            {"field_name": "Maximum DTI", "field_type": "percentage", "validation_rules": {"max": 0.50}}
                        ]
                    }
                ]
            }
        ],
        "annexures": []
    }
    
    db: AsyncSession = AsyncSessionLocal()
    try:
        # Create dummy approved policy
        pol = PolicyMetadata(
            id=uuid.UUID(policy_id),
            name="Test Home Loan",
            status="approved"
        )
        db.add(pol)
        await db.commit()
        
        # Insert structure into MongoDB
        coll = policy_documents_collection()
        await coll.insert_one({
            "policy_id": policy_id,
            "version": 1,
            "document_structure": structure,
            "created_at": "2026-02-26"
        })
        
        print(f"Set up policy {policy_id}. Triggering PDF generation...")
        pdf_path = await generate_pdf(db, policy_id, "Test_Home_Loan")
        print(f"SUCCESS! PDF Generated at: {pdf_path}")
        
    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(run_test())
