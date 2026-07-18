import re
from collections import defaultdict
from urllib.parse import urlparse

import boto3
from flask import current_app
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from opensearchpy import (
    AWSV4SignerAuth,
    OpenSearch,
    RequestError,
    RequestsHttpConnection,
    helpers,
)


def _collection_name(workspace_id):
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "-", workspace_id)
    return f"workspace-{safe_id}"[:63]


def _embeddings():
    kwargs = {}
    if current_app.config.get("OPENAI_EMBEDDING_BASE_URL"):
        kwargs["base_url"] = current_app.config["OPENAI_EMBEDDING_BASE_URL"]
    return OpenAIEmbeddings(
        model=current_app.config["OPENAI_EMBEDDING_MODEL"],
        dimensions=current_app.config["EMBEDDING_DIMENSIONS"],
        api_key=_embedding_api_key(),
        **kwargs,
    )


def _embedding_api_key():
    return current_app.config.get(
        "OPENAI_EMBEDDING_API_KEY",
        current_app.config.get("OPENAI_API_KEY", ""),
    )


def _has_embedding_config():
    return bool(_embedding_api_key())


def _backend():
    return current_app.config["VECTOR_STORE_BACKEND"]


def _normalize_metadata(workspace_id, metadata):
    normalized = dict(metadata or {})
    normalized["workspace_id"] = workspace_id
    tags = normalized.get("tags", [])
    if isinstance(tags, str):
        tags = [tag for tag in tags.split(",") if tag]
    normalized["tags"] = tags
    return normalized


def _document(workspace_id, item):
    return Document(
        page_content=item["content"],
        metadata=_normalize_metadata(workspace_id, item.get("metadata", {})),
    )


def _valid_documents(workspace_id, raw_documents):
    return [
        (item["id"], _document(workspace_id, item))
        for item in raw_documents
        if item.get("id") and item.get("content", "").strip()
    ]


def _chroma_store(workspace_id):
    return Chroma(
        collection_name=_collection_name(workspace_id),
        embedding_function=_embeddings(),
        persist_directory=current_app.config["CHROMA_DIR"],
    )


def _chroma_document(document):
    metadata = dict(document.metadata)
    tags = metadata.get("tags", [])
    if isinstance(tags, list):
        metadata["tags"] = ",".join(tags)
    return Document(page_content=document.page_content, metadata=metadata)


def _opensearch_client():
    endpoint = current_app.config["OPENSEARCH_ENDPOINT"]
    if not endpoint:
        raise RuntimeError("OPENSEARCH_ENDPOINT is required for the OpenSearch backend")
    parsed = urlparse(
        endpoint if "://" in endpoint else f"https://{endpoint}"
    )
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(
        credentials,
        current_app.config["AWS_REGION"],
        "aoss",
    )
    return OpenSearch(
        hosts=[{"host": parsed.hostname, "port": parsed.port or 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        pool_maxsize=20,
        timeout=30,
    )


def _opensearch_index():
    return current_app.config["OPENSEARCH_INDEX"]


def _ensure_opensearch_index(client):
    index = _opensearch_index()
    if client.indices.exists(index=index):
        return
    try:
        client.indices.create(
            index=index,
            body={
                "settings": {"index": {"knn": True}},
                "mappings": {
                    "properties": {
                        "workspace_id": {"type": "keyword"},
                        "source_id": {"type": "keyword"},
                        "type": {"type": "keyword"},
                        "chat_id": {"type": "keyword"},
                        "label": {
                            "type": "text",
                            "fields": {"keyword": {"type": "keyword"}},
                        },
                        "content": {"type": "text"},
                        "tags": {"type": "keyword"},
                        "created_at": {"type": "date", "ignore_malformed": True},
                        "embedding": {
                            "type": "knn_vector",
                            "dimension": current_app.config["EMBEDDING_DIMENSIONS"],
                            "method": {
                                "name": "hnsw",
                                "engine": "faiss",
                                "space_type": "cosinesimil",
                            },
                        },
                    }
                },
            },
        )
    except RequestError as error:
        if error.error not in {"resource_already_exists_exception", "index_already_exists_exception"}:
            raise


def _opensearch_id(workspace_id, source_id):
    return f"{workspace_id}:{source_id}"


def _opensearch_actions(workspace_id, entries):
    texts = [document.page_content for _, document in entries]
    vectors = _embeddings().embed_documents(texts)
    for (source_id, document), vector in zip(entries, vectors):
        metadata = document.metadata
        yield {
            "_op_type": "index",
            "_index": _opensearch_index(),
            "_id": _opensearch_id(workspace_id, source_id),
            "_source": {
                "workspace_id": workspace_id,
                "source_id": metadata.get("source_id", source_id),
                "type": metadata.get("type"),
                "chat_id": metadata.get("chat_id"),
                "label": metadata.get("label"),
                "tags": metadata.get("tags", []),
                "created_at": metadata.get("created_at"),
                "content": document.page_content,
                "embedding": vector,
            },
        }


def replace_workspace_documents(workspace_id, raw_documents):
    reset_workspace_documents(workspace_id)
    return upsert_workspace_documents(workspace_id, raw_documents, refresh=True)


def reset_workspace_documents(workspace_id):
    if not _has_embedding_config():
        return
    if _backend() == "opensearch":
        client = _opensearch_client()
        _ensure_opensearch_index(client)
        client.delete_by_query(
            index=_opensearch_index(),
            body={"query": {"term": {"workspace_id": workspace_id}}},
            conflicts="proceed",
            refresh=True,
        )
        return

    store = _chroma_store(workspace_id)
    existing = store.get(include=[])
    if existing["ids"]:
        store.delete(ids=existing["ids"])


def upsert_workspace_documents(workspace_id, raw_documents, refresh=False):
    entries = _valid_documents(workspace_id, raw_documents)
    if not entries or not _has_embedding_config():
        return 0
    if _backend() == "opensearch":
        client = _opensearch_client()
        _ensure_opensearch_index(client)
        helpers.bulk(client, _opensearch_actions(workspace_id, entries), refresh=refresh)
        return len(entries)

    store = _chroma_store(workspace_id)
    ids = [source_id for source_id, _ in entries]
    existing = set(store.get(ids=ids, include=[])["ids"])
    if existing:
        store.delete(ids=list(existing))
    store.add_documents(
        documents=[_chroma_document(document) for _, document in entries],
        ids=ids,
    )
    return len(entries)


def delete_workspace_documents(workspace_id, source_ids):
    ids = [source_id for source_id in source_ids if source_id]
    if not ids:
        return 0
    if _backend() == "opensearch":
        client = _opensearch_client()
        actions = [
            {
                "_op_type": "delete",
                "_index": _opensearch_index(),
                "_id": _opensearch_id(workspace_id, source_id),
            }
            for source_id in ids
        ]
        helpers.bulk(client, actions, raise_on_error=False, refresh=False)
        return len(ids)

    store = _chroma_store(workspace_id)
    store.delete(ids=ids)
    return len(ids)


def _filters(workspace_id, tags=None, source_type=None):
    filters = [{"term": {"workspace_id": workspace_id}}]
    filters.extend({"term": {"tags": tag}} for tag in (tags or []))
    if source_type:
        filters.append({"term": {"type": source_type}})
    return filters


def _source_to_document(source):
    metadata = {
        "workspace_id": source.get("workspace_id"),
        "source_id": source.get("source_id"),
        "type": source.get("type"),
        "chat_id": source.get("chat_id"),
        "label": source.get("label"),
        "tags": source.get("tags", []),
        "created_at": source.get("created_at"),
    }
    return Document(page_content=source.get("content", ""), metadata=metadata)


def _rrf(result_lists, limit):
    scores = defaultdict(float)
    documents = {}
    rrf_k = current_app.config["RRF_K"]
    for results in result_lists:
        for rank, hit in enumerate(results, start=1):
            source = hit["_source"]
            key = f"{source.get('type')}:{source['source_id']}"
            scores[key] += 1.0 / (rrf_k + rank)
            documents[key] = _source_to_document(source)
    ranked = sorted(scores, key=scores.get, reverse=True)[:limit]
    maximum = max((scores[key] for key in ranked), default=1.0)
    return [(documents[key], scores[key] / maximum) for key in ranked]


def _opensearch_search(workspace_id, query, tags=None, source_type=None, limit=None):
    client = _opensearch_client()
    _ensure_opensearch_index(client)
    size = limit or current_app.config["RETRIEVAL_LIMIT"]
    candidate_limit = max(size, current_app.config["RETRIEVAL_CANDIDATE_LIMIT"])
    filters = _filters(workspace_id, tags, source_type)
    result_lists = []

    if query.strip():
        lexical = client.search(
            index=_opensearch_index(),
            body={
                "size": candidate_limit,
                "query": {
                    "bool": {
                        "filter": filters,
                        "must": {
                            "multi_match": {
                                "query": query,
                                "fields": ["label^3", "tags^2", "content"],
                            }
                        },
                    }
                },
            },
        )
        result_lists.append(lexical["hits"]["hits"])

        vector = _embeddings().embed_query(query)
        semantic = client.search(
            index=_opensearch_index(),
            body={
                "size": candidate_limit,
                "query": {
                    "knn": {
                        "embedding": {
                            "vector": vector,
                            "k": candidate_limit,
                            "filter": {"bool": {"filter": filters}},
                        }
                    }
                },
            },
        )
        result_lists.append(semantic["hits"]["hits"])
    else:
        filtered = client.search(
            index=_opensearch_index(),
            body={
                "size": candidate_limit,
                "sort": [{"created_at": {"order": "desc", "unmapped_type": "date"}}],
                "query": {"bool": {"filter": filters}},
            },
        )
        result_lists.append(filtered["hits"]["hits"])

    return _rrf(result_lists, size)


def search(workspace_id, query, tags=None, limit=None, source_type=None):
    if not query.strip() and not tags:
        return []
    if not _has_embedding_config():
        return []
    if _backend() == "opensearch":
        return _opensearch_search(
            workspace_id,
            query,
            tags=tags,
            source_type=source_type,
            limit=limit,
        )

    search_text = " ".join(
        part
        for part in [query.strip(), " ".join(f"#{tag}" for tag in (tags or []))]
        if part
    )
    results = _chroma_store(workspace_id).similarity_search_with_relevance_scores(
        search_text,
        k=limit or current_app.config["RETRIEVAL_LIMIT"],
    )
    if source_type:
        results = [
            (document, score)
            for document, score in results
            if document.metadata.get("type") == source_type
        ]
    return results


def retrieve(workspace_id, query, limit=None):
    return [
        document
        for document, _ in search(
            workspace_id,
            query,
            limit=limit or current_app.config["RETRIEVAL_LIMIT"],
        )
    ]
