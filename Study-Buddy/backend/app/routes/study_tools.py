
import traceback

from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)

from pydantic import BaseModel, Field

from app.routes.auth import get_current_user
from app.models.user import User

from app.services.study_tools_service import summarize_document


router = APIRouter(
    prefix="/api/study-tools",
    tags=["AI Study Tools"]
)


class SummaryRequest(BaseModel):
    note_id: str = Field(
        ...,
        min_length=1
    )


@router.post("/summarize")
def generate_summary(
    request: SummaryRequest,
    current_user: User = Depends(get_current_user)
):

    try:
        result = summarize_document(
            note_id=request.note_id,
            user_id=current_user.id
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc)
        )

    except Exception:
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to generate summary. Check backend terminal."
        )
