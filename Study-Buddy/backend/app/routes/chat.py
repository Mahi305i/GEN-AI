
import traceback

from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)

from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.routes.auth import get_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message

from app.services.rag_service import generate_rag_answer


router = APIRouter(
    prefix="/api/chat",
    tags=["AI Chat"]
)


# ==========================================
# REQUEST SCHEMA
# ==========================================

class ChatRequest(BaseModel):

    question: str = Field(
        ...,
        min_length=2,
        max_length=2000
    )

    conversation_id: int | None = None


# ==========================================
# 1. ASK QUESTION AND SAVE CHAT
# ==========================================

@router.post("/ask")
def ask_question(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    try:
        conversation = None

        # Check whether this is an existing conversation
        if request.conversation_id is not None:

            conversation = db.query(Conversation).filter(
                Conversation.id == request.conversation_id,
                Conversation.user_id == current_user.id
            ).first()

            if not conversation:
                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found"
                )

        # Generate the RAG answer
        result = generate_rag_answer(
            question=request.question,
            user_id=current_user.id
        )

        answer = result["answer"]

        # Create a new conversation if required
        if conversation is None:

            conversation = Conversation(
                user_id=current_user.id,
                title=request.question[:80]
            )

            db.add(conversation)
            db.flush()

        # Save the user's question
        user_message = Message(
            conversation_id=conversation.id,
            role="user",
            content=request.question
        )

        # Save Gemini's response
        assistant_message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content=answer
        )

        db.add(user_message)
        db.add(assistant_message)

        conversation.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(conversation)

        # Preserve the existing RAG response fields
        result["conversation_id"] = conversation.id

        return result

    except HTTPException:
        db.rollback()
        raise

    except ValueError as exc:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )

    except Exception:
        db.rollback()
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to generate and save answer. Check backend terminal."
        )


# ==========================================
# 2. GET ALL USER CONVERSATIONS
# ==========================================

@router.get("/history")
def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    try:
        conversations = (
            db.query(Conversation)
            .filter(
                Conversation.user_id == current_user.id
            )
            .order_by(
                Conversation.updated_at.desc()
            )
            .all()
        )

        return {
            "total": len(conversations),
            "conversations": [
                {
                    "id": conversation.id,
                    "title": conversation.title,
                    "created_at": conversation.created_at,
                    "updated_at": conversation.updated_at,
                    "message_count": len(conversation.messages)
                }
                for conversation in conversations
            ]
        }

    except Exception:
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve chat history"
        )


# ==========================================
# 3. GET INDIVIDUAL CONVERSATION
# ==========================================

@router.get("/history/{conversation_id}")
def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    try:
        conversation = db.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id
        ).first()

        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found"
            )

        return {
            "id": conversation.id,
            "title": conversation.title,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
            "messages": [
                {
                    "id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "created_at": message.created_at
                }
                for message in conversation.messages
            ]
        }

    except HTTPException:
        raise

    except Exception:
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve conversation"
        )


# ==========================================
# 4. DELETE CONVERSATION
# ==========================================

@router.delete("/history/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    try:
        conversation = db.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id
        ).first()

        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found"
            )

        db.delete(conversation)
        db.commit()

        return {
            "message": "Conversation deleted successfully",
            "conversation_id": conversation_id
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to delete conversation"
        )
