
import json
import re

from app.services.document_service import (
    collection,
    gemini_client
)

import os

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
)


def generate_quiz(
    note_id: str,
    user_id: int,
    number_of_questions: int = 5
) -> dict:
    """
    Generate MCQs from a student's uploaded PDF
    using Gemini and ChromaDB.
    """

    # 1. Validate question count
    if number_of_questions not in [5, 10, 15]:
        raise ValueError(
            "Number of questions must be 5, 10, or 15."
        )

    # 2. Retrieve only the selected user's document
    results = collection.get(
        where={
            "$and": [
                {"note_id": note_id},
                {"user_id": str(user_id)}
            ]
        },
        include=["documents", "metadatas"]
    )

    documents = results.get("documents") or []
    metadatas = results.get("metadatas") or []

    if not documents:
        raise ValueError(
            "Document not found or no text is available."
        )

    # 3. Sort chunks in their original order
    chunks = sorted(
        zip(documents, metadatas),
        key=lambda item: item[1].get("chunk_index", 0)
    )

    filename = chunks[0][1].get(
        "filename",
        "Study Material"
    )

    document_text = "\n\n".join(
        document for document, metadata in chunks
    )

    # 4. Ask Gemini to generate structured MCQs
    prompt = f"""
You are an expert college examination question setter.

Generate exactly {number_of_questions} multiple-choice
questions using ONLY the supplied study material.

Document: {filename}

Study material:
{document_text}

Requirements:

1. Each question must have exactly four options.
2. Each question must have one correct answer.
3. Include a short explanation for the correct answer.
4. Cover different important topics in the material.
5. Avoid duplicate questions.
6. Questions must be suitable for college students.
7. Do not invent information that is not present
   in the supplied material.
8. If the material does not contain enough information
   to generate the requested number of questions,
   return fewer questions rather than inventing facts.

Return ONLY valid JSON using this structure:

{{
    "questions": [
        {{
            "question": "Question text",
            "options": {{
                "A": "Option A",
                "B": "Option B",
                "C": "Option C",
                "D": "Option D"
            }},
            "correct_answer": "A",
            "explanation": "Explanation based on the material"
        }}
    ]
}}
"""

    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt
    )

    if not response.text:
        raise ValueError(
            "Gemini returned an empty quiz response."
        )

    # 5. Parse Gemini JSON response
    response_text = response.text.strip()

    # Remove optional Markdown JSON code fences
    response_text = re.sub(
        r"^```(?:json)?\s*|\s*```$",
        "",
        response_text,
        flags=re.IGNORECASE
    ).strip()

    try:
        quiz_data = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            "Gemini returned invalid quiz JSON. Please try again."
        ) from exc

    questions = quiz_data.get("questions")

    if not isinstance(questions, list) or not questions:
        raise ValueError(
            "No valid quiz questions were generated."
        )

    # 6. Validate every question
    validated_questions = []

    for index, item in enumerate(questions, start=1):

        question = item.get("question")
        options = item.get("options")
        correct_answer = item.get("correct_answer")
        explanation = item.get("explanation")

        if not isinstance(question, str) or not question.strip():
            continue

        if not isinstance(options, dict):
            continue

        if set(options.keys()) != {"A", "B", "C", "D"}:
            continue

        if not all(
            isinstance(options[key], str) and options[key].strip()
            for key in ["A", "B", "C", "D"]
        ):
            continue

        if correct_answer not in ["A", "B", "C", "D"]:
            continue

        if not isinstance(explanation, str) or not explanation.strip():
            continue

        validated_questions.append({
            "question_number": index,
            "question": question.strip(),
            "options": options,
            "correct_answer": correct_answer,
            "explanation": explanation.strip()
        })

    if not validated_questions:
        raise ValueError(
            "Gemini did not generate any valid questions."
        )

    # 7. Return quiz
    return {
        "note_id": note_id,
        "filename": filename,
        "requested_questions": number_of_questions,
        "total_questions": len(validated_questions),
        "questions": validated_questions,
        "status": "success"
    }
