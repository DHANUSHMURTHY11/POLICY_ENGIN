"""Quick speed test for qwen2.5:3b vs 7b."""
import requests
import time

BASE = "http://localhost:11434"
MODEL = "qwen2.5:3b"

print(f"Testing model: {MODEL}")
print("=" * 50)

# Test 1: Simple JSON
t1 = time.time()
r = requests.post(f"{BASE}/api/generate", json={
    "model": MODEL,
    "prompt": "Return a JSON object with a title field set to Car Loan Policy",
    "stream": False,
    "options": {"num_predict": 100}
}, timeout=300)
t2 = time.time()
d = r.json()
print(f"\nTest 1 (simple JSON): {t2-t1:.1f}s")
print(f"  Tokens: {d.get('eval_count', '?')}")
print(f"  Response: {d.get('response', '')[:200]}")

# Test 2: Via OpenAI-compat /v1 API
from openai import OpenAI
client = OpenAI(base_url=f"{BASE}/v1", api_key="ollama")
t1 = time.time()
resp = client.chat.completions.create(
    model=MODEL,
    messages=[
        {"role": "system", "content": "Return only valid JSON. No explanations."},
        {"role": "user", "content": "Create a JSON with title and 3 sections for a loan policy"},
    ],
    temperature=0.1,
    max_tokens=200,
)
t2 = time.time()
print(f"\nTest 2 (OpenAI-compat): {t2-t1:.1f}s")
print(f"  Tokens: {resp.usage.completion_tokens if resp.usage else '?'}")
print(f"  Response: {resp.choices[0].message.content[:200]}")

print("\n" + "=" * 50)
print("DONE")
