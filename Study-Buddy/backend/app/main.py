
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Database configuration
from app.database.connection import Base, engine

# Import models so SQLAlchemy registers them
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message

# API routes
from app.routes.auth import router as auth_router
from app.routes.notes import router as notes_router
from app.routes.chat import router as chat_router
from app.routes.study_tools import router as study_tools_router
from app.routes.quiz import router as quiz_router


# Create database tables
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="Study Buddy API",
    description="RAG Based AI Tutor for College Notes",
    version="1.0.0"
)


# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register API routes exactly once
app.include_router(auth_router)
app.include_router(notes_router)
app.include_router(chat_router)
app.include_router(study_tools_router)
app.include_router(quiz_router)


@app.get("/")
async def root():
    return {
        "message": "Welcome to Study Buddy API",
        "status": "running"
    }


@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "application": "Study Buddy",
        "backend": "FastAPI"
    }
