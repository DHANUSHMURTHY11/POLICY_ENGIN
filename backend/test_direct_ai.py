"""Test the exact AI structure generation via the Ollama provider directly."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

async def main():
    from app.ai.providers.ollama_provider import OllamaProvider
    
    provider = OllamaProvider()
    
    # Simple structure prompt (much shorter than the test_flow.py one)
    system_prompt = """You are a policy structure generator. Return a JSON object with:
{
  "sections": [
    {
      "title": "section name",
      "order": 1,
      "fields": [
        {"name": "field name", "type": "text", "required": true, "description": "desc"}
      ]
    }
  ]
}"""

    user_prompt = "Create a car loan policy with eligibility criteria and loan parameters."

    print("Calling OllamaProvider.generate_json...")
    try:
        result = await provider.generate_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
        print(f"SUCCESS! Latency: {result.latency_ms:.0f}ms")
        print(f"Tokens: prompt={result.prompt_tokens}, completion={result.completion_tokens}")
        import json
        print(f"Data: {json.dumps(result.data, indent=2)[:500]}")
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")

asyncio.run(main())
