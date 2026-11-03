
from app.services.document_service import collection

print("\n========== CHROMADB DEBUG ==========")

print("Total stored chunks:", collection.count())

records = collection.get(
    include=["metadatas", "documents"]
)

for metadata, document in zip(
    records["metadatas"],
    records["documents"]
):
    print("\nMetadata:", metadata)
    print("Content preview:", document[:200])

print("\n====================================")
