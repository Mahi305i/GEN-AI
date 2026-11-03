
import os
import time
import logging

from app.services.document_service import (
    collection,
    gemini_client
)

from google.genai import errors


# ==========================================
# 1. GEMINI CONFIGURATION
# ==========================================

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
)

GEMINI_FALLBACK_MODEL = os.getenv(
    "GEMINI_FALLBACK_MODEL",
    "gemini-2.5-flash-lite"
)

MAX_RETRIES = 3
RETRY_DELAY = 2

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ==========================================
# 2. GEMINI GENERATION WITH RETRIES
# ==========================================

def generate_with_retry(prompt: str):
    """
    Generate Gemini content with automatic retries.
    If the primary model remains unavailable,
    try the configured fallback model.
    """

    models_to_try = [GEMINI_MODEL]

    if GEMINI_FALLBACK_MODEL and (
        GEMINI_FALLBACK_MODEL != GEMINI_MODEL
    ):
        models_to_try.append(GEMINI_FALLBACK_MODEL)

    last_error = None

    for model_name in models_to_try:

        logger.info(
            "Trying Gemini model: %s",
            model_name
        )

        for attempt in range(MAX_RETRIES):

            try:
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )

                if response.text and response.text.strip():
                    logger.info(
                        "Gemini generation successful using %s",
                        model_name
                    )
                    return response

                raise ValueError(
                    "Gemini returned an empty response."
                )

            except errors.APIError as exc:

                last_error = exc

                status_code = getattr(
                    exc,
                    "code",
                    None
                )

                if status_code is None:
                    status_code = getattr(
                        exc,
                        "status_code",
                        None
                    )

                retryable_codes = [
                    429, 500, 502, 503, 504
                ]

                if status_code not in retryable_codes:
                    raise

                if attempt < MAX_RETRIES - 1:

                    wait_time = RETRY_DELAY * (2 ** attempt)

                    logger.warning(
                        "%s returned HTTP %s. "
                        "Retrying in %s seconds. Attempt %s/%s",
                        model_name,
                        status_code,
                        wait_time,
                        attempt + 1,
                        MAX_RETRIES
                    )

                    time.sleep(wait_time)

            except ValueError:
                raise

            except Exception as exc:
                last_error = exc
                logger.exception(
                    "Unexpected Gemini generation error"
                )
                raise

        logger.warning(
            "Model %s failed after all retries.",
            model_name
        )

    raise RuntimeError(
        "Gemini generation failed with all configured models. "
        f"Last error: {last_error}"
    )


# ==========================================
# 3. SUMMARIZE DOCUMENT
# ==========================================

def summarize_document(
    note_id: str,
    user_id: int
) -> dict:
    """
    Retrieve all chunks belonging to the user's PDF
    and generate a structured summary using Gemini.
    """

    # Step 1: Retrieve only this user's document chunks

    results = collection.get(
        where={
            "$and": [
                {"note_id": note_id},
                {"user_id": str(user_id)}
            ]
        },
        include=[
            "documents",
            "metadatas"
        ]
    )

    documents = results.get("documents") or []
    metadatas = results.get("metadatas") or []

    if not documents:
        raise ValueError(
            "Document not found or it contains no stored text."
        )

    if len(documents) != len(metadatas):
        raise ValueError(
            "Document metadata does not match stored chunks."
        )

    # Step 2: Sort chunks into original order

    chunks = sorted(
        zip(documents, metadatas),
        key=lambda item: item[1].get(
            "chunk_index",
            0
        )
    )

    filename = chunks[0][1].get(
        "filename",
        "Study Material"
    )

    logger.info(
        "Generating summary for %s (%s chunks)",
        filename,
        len(chunks)
    )

    # Step 3: Summarize chunks in batches

    batch_size = 8
    partial_summaries = []

    for start in range(0, len(chunks), batch_size):

        batch = chunks[start:start + batch_size]

        batch_text = "\n\n".join(
            document for document, metadata in batch
        )

        prompt = f"""
You are an academic study assistant.

Summarize the following section of a college study document.

Instructions:
- Use only information present in the supplied text.
- Preserve important technical terms and definitions.
- Explain difficult concepts in clear student-friendly language.
- Include important facts, formulas and examples when present.
- Do not invent missing information.
- Avoid repeating the same points.

Document: {filename}

Document section:
{batch_text}

Write a concise but informative section summary.
"""

        logger.info(
            "Summarizing batch %s",
            (start // batch_size) + 1
        )

        response = generate_with_retry(prompt)

        partial_summaries.append(
            response.text.strip()
        )

    # Step 4: Combine partial summaries

    combined_text = "\n\n".join(
        partial_summaries
    )

    final_prompt = f"""
You are an expert college study assistant.

Create a well-organized study summary from the section
summaries below.

Document: {filename}

Follow this structure:

# Document Summary

## 1. Overview
Explain the main subject of the document.

## 2. Important Topics
Explain the major topics covered.

## 3. Key Concepts and Definitions
List important concepts and their meanings.

## 4. Important Facts and Formulas
Include relevant facts, equations or formulas
only when they appear in the supplied material.

## 5. Quick Revision Points
Provide concise bullet points for exam preparation.

## 6. Conclusion
Give a short concluding summary.

Important rules:
- Use only the information in the supplied summaries.
- Do not invent facts or formulas.
- If a section has no relevant information, state that
  it is not covered in the provided material.
- Use clear, student-friendly language.

Section summaries:

{combined_text}
"""

    # Step 5: Generate final summary

    final_response = generate_with_retry(
        final_prompt
    )

    # Step 6: Return result

    return {
        "note_id": note_id,
        "filename": filename,
        "total_chunks": len(chunks),
        "summary": final_response.text.strip(),
        "status": "success"
    }
