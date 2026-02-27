import asyncio
import uuid
from app.database.postgresql import AsyncSessionLocal
from app.document.service import generate_word, generate_pdf

async def test_gen():
    pid = "45cfe755-e448-460d-88f2-36b5227e83d9" # An ID from the audit json
    async with AsyncSessionLocal() as db:
        print("Testing word generation...")
        try:
            res = await generate_word(db, pid, "Test_Doc")
            print("Word output:", res)
        except Exception as e:
            import traceback
            traceback.print_exc()
        
        print("Testing PDF generation...")
        try:
            res = await generate_pdf(db, pid, "Test_PDF")
            print("PDF output:", res)
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_gen())
