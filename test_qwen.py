import asyncio
import httpx
import json

async def test_chat():
    url = "http://localhost:8000/api/ai/chat"
    payload = {
        "message": "create a bike policy"
    }
    headers = {"Content-Type": "application/json"}
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json=payload, headers=headers)
        
        print(f"Status: {response.status_code}")
        print(json.dumps(response.json(), indent=2))

if __name__ == "__main__":
    asyncio.run(test_chat())
