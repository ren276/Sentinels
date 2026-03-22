import asyncio
import asyncpg
import os
import traceback
from dotenv import load_dotenv

load_dotenv()
url = os.getenv('DATABASE_URL')
# Pydantic settings parsing for postgresql+asyncpg://
if url and url.startswith("postgresql+asyncpg://"):
    url = url.replace("postgresql+asyncpg://", "postgresql://")

print(f'Testing: {url.replace("helosandy123", "***")}')

async def run():
    try:
        conn = await asyncpg.connect(url)
        print('Connection SUCCESS!')
        await conn.close()
    except Exception as e:
        traceback.print_exc()

asyncio.run(run())
