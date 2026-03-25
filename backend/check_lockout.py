import asyncio
from sqlalchemy import text
from api.database import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT username, failed_login_attempts, locked_until FROM users WHERE username = 'admin'"))
        users = res.all()
        for u in users:
            print(f"User: {u[0]}, Failed Attempts: {u[1]}, Locked Until: {u[2]}")

if __name__ == "__main__":
    asyncio.run(check())
