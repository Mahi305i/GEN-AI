
import traceback

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.routes.auth import get_current_user
from app.models.user import User
from app.services.quiz_service import generate_quiz


router = APIRouter(
    prefix="/api/quiz",
    tags=["AI Quiz Generator"]
)


class QuizRequest(BaseModel):

    note_id: str = Field(
        ...,
        min_length=1
    )

    number_of_questions: int = Field(
        default=5,
        ge=5,
        le=15
    )


@router.post("/generate")
def create_quiz(
    request: QuizRequest,
    current_user: User = Depends(get_current_user)
):

    if request.number_of_questions not in [5, 10, 15]:
        raise HTTPException(
            status_code=400,
            detail="Choose 5, 10, or 15 questions."
        )

    try:
        return generate_quiz(
            note_id=request.note_id,
            user_id=current_user.id,
            number_of_questions=request.number_of_questions
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )

    except Exception:
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to generate quiz. Check backend terminal."
        )
