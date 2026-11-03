
import os
import uuid
from pathlib import Path

import pymupdf
import chromadb

from dotenv import load_dotenv
from google import genai
from google.genai import types


# ==========================================
# 1. LOAD ENVIRONMENT VARIABLES
# ==========================================

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

load_dotenv(
    dotenv_path=ENV_PATH,
    override=True
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

EMBEDDING_MODEL = os.getenv(
    "GEMINI_EMBEDDING_MODEL",
    "gemini-embedding-2"
)

EMBEDDING_DIMENSIONS = int(
    os.getenv("GEMINI_EMBEDDING_DIMENSIONS", "768")
)

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is missing from backend/.env")

gemini_client = genai.Client(
    api_key=GEMINI_API_KEY
)


# ==========================================
# 2. CHROMADB CONFIGURATION
# ==========================================

CHROMA_DIR = os.getenv(
    "CHROMA_PERSIST_DIRECTORY",
    "./chroma_db"
)

CHROMA_PATH = Path(CHROMA_DIR)

if not CHROMA_PATH.is_absolute():
    CHROMA_PATH = ENV_PATH.parent / CHROMA_PATH

CHROMA_PATH.mkdir(
    parents=True,
    exist_ok=True
)

chroma_client = chromadb.PersistentClient(
    path=str(CHROMA_PATH)
)

collection = chroma_client.get_or_create_collection(
    name="study_buddy_notes",
    metadata={"hnsw:space": "cosine"}
)


# ==========================================
# 3. EXTRACT PDF TEXT
# ==========================================

def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract text from every PDF page."""

    try:
        document = pymupdf.open(
            stream=pdf_bytes,
            filetype="pdf"
        )

        extracted_text = []

        try:
            for page_number, page in enumerate(document):

                page_text = page.get_text("text")

                if page_text.strip():
                    extracted_text.append(
                        f"\n[Page {page_number + 1}]\n{page_text}"
                    )

        finally:
            document.close()

        return "\n".join(extracted_text)

    except Exception as exc:
        raise ValueError(
            f"Unable to read PDF: {str(exc)}"
        ) from exc


# ==========================================
# 4. SPLIT TEXT INTO CHUNKS
# ==========================================

def split_text(
    text: str,
    chunk_size: int = 300,
    overlap: int = 50
) -> list[str]:
    """Split document text into overlapping word-based chunks."""

    if chunk_size <= 0 or overlap < 0:
        raise ValueError("Invalid chunk size or overlap")

    if overlap >= chunk_size:
        raise ValueError(
            "Overlap must be smaller than chunk size"
        )

    words = text.split()

    chunks = []

    start = 0

    while start < len(words):

        end = min(
            start + chunk_size,
            len(words)
        )

        chunk = " ".join(words[start:end])

        if chunk.strip():
            chunks.append(chunk)

        if end == len(words):
            break

        start = end - overlap

    return chunks


# ==========================================
# 5. GENERATE SINGLE EMBEDDING
# ==========================================

def generate_single_embedding(text: str) -> list[float]:
    """Generate and validate one Gemini embedding."""

    result = gemini_client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            output_dimensionality=EMBEDDING_DIMENSIONS
        )
    )

    embeddings = result.embeddings or []

    if len(embeddings) != 1:
        raise ValueError(
            "Gemini did not return exactly one embedding"
        )

    values = embeddings[0].values

    if not values:
        raise ValueError(
            "Gemini returned an empty embedding"
        )

    if len(values) != EMBEDDING_DIMENSIONS:
        raise ValueError(
            f"Expected {EMBEDDING_DIMENSIONS} dimensions, "
            f"received {len(values)}"
        )

    return values


# ==========================================
# 6. GENERATE GEMINI EMBEDDINGS
# ==========================================

def generate_embeddings(
    texts: list[str]
) -> list[list[float]]:
    """
    Generate embeddings in batches.

    If a batch returns an incorrect number of embeddings,
    retry its texts individually.
    """

    all_embeddings = []

    batch_size = 5

    for start in range(0, len(texts), batch_size):

        batch = texts[start:start + batch_size]

        print(
            f"Generating embeddings: "
            f"{start + 1} to {start + len(batch)} "
            f"of {len(texts)} chunks"
        )

        try:

            result = gemini_client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=batch,
                config=types.EmbedContentConfig(
                    output_dimensionality=EMBEDDING_DIMENSIONS
                )
            )

            batch_embeddings = result.embeddings or []

            # Use batch response only when counts match.
            if len(batch_embeddings) == len(batch):

                validated_embeddings = []

                for embedding in batch_embeddings:

                    values = embedding.values

                    if (
                        not values
                        or len(values) != EMBEDDING_DIMENSIONS
                    ):
                        raise ValueError(
                            "Invalid embedding dimensions in batch"
                        )

                    validated_embeddings.append(values)

                all_embeddings.extend(validated_embeddings)

                continue

            print(
                f"Batch count mismatch: "
                f"expected {len(batch)}, "
                f"received {len(batch_embeddings)}"
            )

        except Exception as exc:

            print(f"Batch embedding failed: {exc}")

        # Individual fallback
        print("Retrying this batch one chunk at a time...")

        for index, text_item in enumerate(batch):

            try:

                embedding = generate_single_embedding(
                    text_item
                )

                all_embeddings.append(embedding)

            except Exception as exc:

                raise RuntimeError(
                    f"Failed to generate embedding for "
                    f"chunk {start + index + 1}: {exc}"
                ) from exc

    if len(all_embeddings) != len(texts):

        raise ValueError(
            f"Embedding count mismatch: "
            f"expected {len(texts)}, "
            f"received {len(all_embeddings)}"
        )

    print(
        f"Successfully generated {len(all_embeddings)} embeddings"
    )

    return all_embeddings


# ==========================================
# 7. PROCESS AND STORE PDF
# ==========================================

def process_and_store_pdf(
    pdf_bytes: bytes,
    filename: str,
    user_id: int
) -> dict:
    """Extract, chunk, embed and store PDF content."""

    # Step 1: Extract text
    extracted_text = extract_pdf_text(pdf_bytes)

    if not extracted_text.strip():

        raise ValueError(
            "No extractable text found. "
            "This may be a scanned PDF."
        )

    # Step 2: Split into chunks
    chunks = split_text(
        extracted_text,
        chunk_size=300,
        overlap=50
    )

    if not chunks:

        raise ValueError(
            "No text chunks were generated"
        )

    print(f"PDF filename: {filename}")
    print(f"Extracted characters: {len(extracted_text)}")
    print(f"Generated chunks: {len(chunks)}")

    # Step 3: Generate embeddings
    embeddings = generate_embeddings(chunks)

    # Step 4: Validate embedding count
    if len(embeddings) != len(chunks):

        raise ValueError(
            "Embedding count does not match chunk count"
        )

    # Step 5: Generate unique note ID
    note_id = str(uuid.uuid4())

    # Step 6: Store in ChromaDB
    collection.add(
        ids=[
            f"{note_id}_{i}"
            for i in range(len(chunks))
        ],

        documents=chunks,

        embeddings=embeddings,

        metadatas=[
            {
                "note_id": note_id,
                "filename": filename,
                "user_id": str(user_id),
                "chunk_index": i
            }
            for i in range(len(chunks))
        ]
    )

    print(
        f"Successfully stored PDF: {filename}"
    )

    return {
        "note_id": note_id,
        "filename": filename,
        "total_characters": len(extracted_text),
        "total_chunks": len(chunks),
        "embedding_dimensions": EMBEDDING_DIMENSIONS,
        "status": "processed"
    }


# ==========================================
# 8. GET USER NOTES
# ==========================================

def get_user_notes(user_id: int) -> list[dict]:
    """Return uploaded PDFs belonging to the logged-in user."""

    results = collection.get(
        where={
            "user_id": str(user_id)
        },
        include=["metadatas"]
    )

    notes = {}

    for metadata in results.get("metadatas", []):

        if not metadata:
            continue

        note_id = metadata.get("note_id")

        if not note_id:
            continue

        if note_id not in notes:

            notes[note_id] = {
                "note_id": note_id,
                "filename": metadata.get(
                    "filename",
                    "Unknown file"
                ),
                "chunks": 0
            }

        notes[note_id]["chunks"] += 1

    return list(notes.values())


# ==========================================
# 9. DELETE USER NOTE
# ==========================================

def delete_user_note(
    note_id: str,
    user_id: int
) -> bool:
    """Delete a note only when it belongs to the user."""

    results = collection.get(
        where={
            "$and": [
                {"note_id": note_id},
                {"user_id": str(user_id)}
            ]
        },
        include=["metadatas"]
    )

    ids = results.get("ids", [])

    if not ids:
        return False

    collection.delete(
        ids=ids
    )

    print(
        f"Deleted note: {note_id}"
    )

    return True
