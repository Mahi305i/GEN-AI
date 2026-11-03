
from app.database.connection import Base, engine

# Import models so SQLAlchemy registers them
from app.models.user import User

def create_tables():
    Base.metadata.create_all(bind=engine)

    print("Database tables created successfully!")

    print("Available tables:")
    for table in Base.metadata.tables:
        print("-", table)


if __name__ == "__main__":
    create_tables()
