import asyncio
from sqlalchemy import text
from api.database import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT username, role, is_active FROM users"))
        users = res.all()
        for u in users:
            print(f"User: {u[0]}, Role: {u[1]}, Active: {u[2]}")

if __name__ == "__main__":
    asyncio.run(check())
