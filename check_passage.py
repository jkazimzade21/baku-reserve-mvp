import asyncio
import logging
import sys
from backend.app.concierge_v2_service import concierge_v2_service
from backend.app.schemas import ConciergeRequest

logging.basicConfig(level=logging.INFO, stream=sys.stdout)


async def run_test():
    print("--- Checking Passage 145 Search ---")
    await concierge_v2_service.startup()

    prompts = [
        "Where can I smoke shisha late night?",
        "Lively lounge with live music and local food",
        "24/7 restaurant with terrace",
    ]

    for prompt in prompts:
        print(f"\n>>> PROMPT: {prompt}")
        req = ConciergeRequest(prompt=prompt)
        try:
            response = await concierge_v2_service.recommend(req, request=None)
            print("Results:")
            found = False
            for i, res in enumerate(response.results):
                print(
                    f"{i+1}. {res.name} ({res.neighborhood}) - {response.explanations.get((res.slug or res.id).lower())}"
                )
                if "Passage 145" in res.name:
                    found = True
            if found:
                print("--> Passage 145 FOUND!")
            else:
                print("--> Passage 145 NOT found in top results.")
        except Exception as e:
            print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(run_test())
