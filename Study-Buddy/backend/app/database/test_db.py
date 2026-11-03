
from sqlalchemy import text
from app.database.connection import engine

try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT version()"))
        print("PostgreSQL Connected Successfully!")
        print(result.scalar())

except Exception as error:
    print("Database Connection Failed!")
    print(error)
