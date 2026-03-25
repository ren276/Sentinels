import asyncio
from sqlalchemy import text
from api.database import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT user_id, action, resource_id, details FROM audit_log WHERE action = 'login_failure' ORDER BY timestamp DESC LIMIT 5"))
        logs = res.all()
        for log in logs:
            print(f"User: {log[2]}, Details: {log[3]}")

if __name__ == "__main__":
    asyncio.run(check())
