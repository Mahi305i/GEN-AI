
import traceback

from fastapi import (
    APIRouter,
    UploadFile,
    File,
    HTTPException,
    Depends
)

from app.services.document_service import (
    process_and_store_pdf,
    get_user_notes,
    delete_user_note
)

from app.routes.auth import get_current_user
from app.models.user import User


router = APIRouter(
    prefix="/api/notes",
    tags=["Notes"]
)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ==========================================
# 1. UPLOAD PDF
# ==========================================

@router.post("/upload")
async def upload_notes(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed"
        )

    pdf_bytes = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if len(pdf_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="PDF exceeds the 10 MB upload limit"
        )

    if not pdf_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400,
            detail="Invalid PDF file"
        )

    try:
        result = process_and_store_pdf(
            pdf_bytes=pdf_bytes,
            filename=file.filename,
            user_id=current_user.id
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )

    except Exception:
        print("\n========== PDF PROCESSING ERROR ==========")
        traceback.print_exc()
        print("===========================================\n")

        raise HTTPException(
            status_code=500,
            detail="Failed to process PDF. Check backend terminal."
        )


# ==========================================
# 2. GET ALL USER STUDY MATERIALS
# ==========================================

@router.get("/")
async def list_notes(
    current_user: User = Depends(get_current_user)
):

    try:
        notes = get_user_notes(current_user.id)

        return {
            "total": len(notes),
            "notes": notes
        }

    except Exception:
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve study materials"
        )


# ==========================================
# 3. DELETE A STUDY MATERIAL
# ==========================================

@router.delete("/{note_id}")
async def remove_note(
    note_id: str,
    current_user: User = Depends(get_current_user)
):

    try:
        deleted = delete_user_note(
            note_id=note_id,
            user_id=current_user.id
        )

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Study material not found"
            )

        return {
            "message": "Study material deleted successfully",
            "note_id": note_id
        }

    except HTTPException:
        raise

    except Exception:
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to delete study material"
        )
