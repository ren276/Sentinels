
import asyncio
from api.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text('SELECT count(*) FROM anomalies'))
        print(f'Anomalies: {result.scalar()}')
        result = await session.execute(text('SELECT count(*) FROM metrics'))
        print(f'Metrics: {result.scalar()}')
        result = await session.execute(text('SELECT count(*) FROM incidents'))
        print(f'Incidents: {result.scalar()}')

if __name__ == "__main__":
    asyncio.run(check())
