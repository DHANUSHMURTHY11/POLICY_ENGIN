import traceback
import sys

try:
    from app.main import app
    print("SUCCESS")
except Exception as e:
    with open("error.txt", "w", encoding="utf-8") as f:
        f.write(traceback.format_exc())
    print("WROTE ERROR")
