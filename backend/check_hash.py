import asyncio
from sqlalchemy import text
from api.database import AsyncSessionLocal
from api.security import verify_password, hash_password

async def check():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT hashed_password FROM users WHERE username = 'admin'"))
        hashed = res.scalar()
        
        matches = verify_password('Sentinel#2026!Admin', hashed)
        print(f"Direct verify: {matches}")
        
        # Test hash and verify directly
        h = hash_password('Sentinel#2026!Admin')
        m = verify_password('Sentinel#2026!Admin', h)
        print(f"Self verify: {m}")

if __name__ == "__main__":
    asyncio.run(check())
