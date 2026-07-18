from langchain_core.embeddings import FakeEmbeddings

from app import create_app
from app import rag


def test_chroma_upsert_accepts_tag_lists_and_resets(tmp_path, monkeypatch):
    class ChromaConfig:
        TESTING = True
        AI_SERVICE_TOKEN = "test-token"
        OPENAI_API_KEY = "test-key"
        OPENAI_MODEL = "test-model"
        OPENAI_EMBEDDING_MODEL = "test-embedding"
        EMBEDDING_DIMENSIONS = 8
        VECTOR_STORE_BACKEND = "chroma"
        CHROMA_DIR = str(tmp_path)
        OPENSEARCH_ENDPOINT = ""
        OPENSEARCH_INDEX = "test"
        AWS_REGION = "us-east-1"
        RETRIEVAL_LIMIT = 3
        RETRIEVAL_CANDIDATE_LIMIT = 10
        RRF_K = 60
        AI_MODEL_TIMEOUT_SECONDS = 10
        AI_AGENT_RECURSION_LIMIT = 8

    app = create_app(ChromaConfig)
    monkeypatch.setattr(rag, "_embeddings", lambda: FakeEmbeddings(size=8))

    with app.app_context():
        assert rag.upsert_workspace_documents(
            "workspace-1",
            [
                {
                    "id": "message-1",
                    "content": "The venue is confirmed.",
                    "metadata": {
                        "type": "message",
                        "source_id": "message-1",
                        "label": "Operations",
                        "tags": ["venue", "confirmed"],
                    },
                }
            ],
        ) == 1
        stored = rag._chroma_store("workspace-1").get(ids=["message-1"])
        assert stored["metadatas"][0]["tags"] == "venue,confirmed"

        rag.reset_workspace_documents("workspace-1")
        assert rag._chroma_store("workspace-1").get(include=[])["ids"] == []
