import asyncio
from app.ai.conversation import start_or_continue_chat
from app.ai.conversation_schemas import ChatMessageRequest

async def test_direct():
    print("Testing Normalization...")
    req1 = ChatMessageRequest(message="create a bike policy")
    resp1 = await start_or_continue_chat(req1)
    print(f"Phase 1 Phase: {resp1.phase}")
    print(f"Phase 1 AI: {resp1.ai_response}")
    
    session_id = resp1.session_id
    
    print("\nTesting Context Reset...")
    req2 = ChatMessageRequest(session_id=session_id, message="actually create a health lone")
    resp2 = await start_or_continue_chat(req2)
    print(f"Phase 2 Phase: {resp2.phase}")
    print(f"Phase 2 AI: {resp2.ai_response}")

if __name__ == "__main__":
    asyncio.run(test_direct())
