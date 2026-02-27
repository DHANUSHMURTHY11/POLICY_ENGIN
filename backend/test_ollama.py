"""Quick integration test: call Ollama via ai_call() and verify JSON response."""
import asyncio
import sys
import time

sys.path.insert(0, ".")


async def main():
    from app.config import settings
    print(f"Provider: {settings.AI_PROVIDER}")
    print(f"Model:    {settings.OLLAMA_MODEL}")
    print(f"Strict:   {settings.AI_STRICT_MODE}")
    print(f"Base URL: {settings.OLLAMA_BASE_URL}")
    print()

    from app.ai.ai_provider import ai_call, get_provider_info

    # Show provider info
    info = get_provider_info()
    print(f"Provider info: {info}")
    print()

    # Test 1: Simple JSON generation (like structure generation)
    print("=" * 50)
    print("TEST 1: Simple JSON generation")
    print("=" * 50)
    start = time.time()
    try:
        result = await ai_call(
            system_prompt="You are a policy structure assistant. Return ONLY valid JSON. Do not include explanations outside JSON.",
            user_prompt='Generate a simple policy structure with 2 sections for a "Travel Expense Policy". Return JSON with keys: title, sections (array of {name, description}).',
        )
        elapsed = time.time() - start
        print(f"  Status:  SUCCESS")
        print(f"  Time:    {elapsed:.1f}s")
        print(f"  Provider: {result.provider}")
        print(f"  Model:   {result.model}")
        print(f"  Tokens:  {result.total_tokens}")
        print(f"  Data type: {type(result.data).__name__}")
        print(f"  Data keys: {list(result.data.keys()) if isinstance(result.data, dict) else 'N/A'}")
        import json
        print(f"  Data:    {json.dumps(result.data, indent=2)[:500]}")
    except Exception as e:
        elapsed = time.time() - start
        print(f"  Status:  FAILED")
        print(f"  Time:    {elapsed:.1f}s")
        print(f"  Error:   {type(e).__name__}: {e}")

    print()

    # Test 2: Chat-style response (like conversation.py)
    print("=" * 50)
    print("TEST 2: Chat collection response")
    print("=" * 50)
    start = time.time()
    try:
        result = await ai_call(
            system_prompt="You are a policy advisor. Collect parameters for a new policy. Return ONLY valid JSON with keys: reply (your response text), collected_params (dict of any params mentioned).",
            user_prompt="I want to create a loan policy for personal loans with a maximum amount of 500000.",
        )
        elapsed = time.time() - start
        print(f"  Status:  SUCCESS")
        print(f"  Time:    {elapsed:.1f}s")
        print(f"  Data keys: {list(result.data.keys()) if isinstance(result.data, dict) else 'N/A'}")
        import json
        print(f"  Data:    {json.dumps(result.data, indent=2)[:500]}")
    except Exception as e:
        elapsed = time.time() - start
        print(f"  Status:  FAILED")
        print(f"  Time:    {elapsed:.1f}s")
        print(f"  Error:   {type(e).__name__}: {e}")


asyncio.run(main())
