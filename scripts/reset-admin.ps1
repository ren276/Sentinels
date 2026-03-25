$env:PYTHONPATH = "e:\Sentinels\backend"
cd e:\Sentinels\backend

$pythonCode = @"
import asyncio
from api.database import AsyncSessionLocal
from sqlalchemy import text

async def reset():
    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE username = 'admin'"))
        
        await db.commit()
    print('Admin account reset successfully.')

if __name__ == '__main__':
    asyncio.run(reset())
"@

$pythonCode | Out-File -FilePath "reset_admin_tmp.py" -Encoding utf8
poetry run python reset_admin_tmp.py
Remove-Item "reset_admin_tmp.py"
