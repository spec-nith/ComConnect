from flask import Blueprint, jsonify, request

from .auth import require_service_token
from .chains import (
    answer_chat_context,
    answer_question,
    coordinate_event,
    create_task_plan,
    summarize_chat,
)
from .rag import (
    delete_workspace_documents,
    replace_workspace_documents,
    reset_workspace_documents,
    search,
    upsert_workspace_documents,
)

api = Blueprint("api", __name__)


def _sources(documents):
    return [
        {
            "type": document.metadata.get("type"),
            "label": document.metadata.get("label"),
            "sourceId": document.metadata.get("source_id"),
        }
        for document in documents
    ]


@api.post("/workspaces/<workspace_id>/index")
@require_service_token
def index_workspace(workspace_id):
    payload = request.get_json(silent=True) or {}
    count = replace_workspace_documents(workspace_id, payload.get("documents", []))
    return jsonify({"indexed": count})


@api.post("/workspaces/<workspace_id>/documents/reset")
@require_service_token
def reset_workspace_knowledge(workspace_id):
    reset_workspace_documents(workspace_id)
    return jsonify({"reset": True})


@api.post("/workspaces/<workspace_id>/documents/upsert")
@require_service_token
def upsert_workspace_knowledge(workspace_id):
    payload = request.get_json(silent=True) or {}
    count = upsert_workspace_documents(
        workspace_id,
        payload.get("documents", []),
    )
    return jsonify({"upserted": count})


@api.post("/workspaces/<workspace_id>/documents/delete")
@require_service_token
def delete_workspace_knowledge(workspace_id):
    payload = request.get_json(silent=True) or {}
    count = delete_workspace_documents(
        workspace_id,
        payload.get("ids", []),
    )
    return jsonify({"deleted": count})


@api.post("/workspaces/<workspace_id>/ask")
@require_service_token
def ask_workspace(workspace_id):
    payload = request.get_json(silent=True) or {}
    question = payload.get("question", "").strip()
    if not question:
        return jsonify({"message": "question is required"}), 400
    answer, documents = answer_question(workspace_id, question)
    return jsonify({"answer": answer, "sources": _sources(documents)})


@api.post("/workspaces/<workspace_id>/search")
@require_service_token
def search_workspace(workspace_id):
    payload = request.get_json(silent=True) or {}
    query = payload.get("query", "").strip()
    tags = [
        str(tag).strip().lower().lstrip("#")
        for tag in payload.get("tags", [])
        if str(tag).strip()
    ]
    if not query and not tags:
        return jsonify({"results": []})

    limit = min(max(int(payload.get("limit", 12)), 1), 30)
    results = []
    source_type = payload.get("sourceType")
    for document, score in search(
        workspace_id,
        query,
        tags,
        limit,
        source_type=source_type,
    ):
        metadata = document.metadata
        raw_tags = metadata.get("tags", [])
        tags = (
            [tag for tag in raw_tags.split(",") if tag]
            if isinstance(raw_tags, str)
            else raw_tags
        )
        results.append(
            {
                "type": metadata.get("type"),
                "sourceId": metadata.get("source_id"),
                "chatId": metadata.get("chat_id"),
                "label": metadata.get("label"),
                "title": metadata.get("label"),
                "excerpt": document.page_content[:500],
                "tags": tags,
                "createdAt": metadata.get("created_at"),
                "score": score,
            }
        )
    return jsonify({"results": results})


@api.post("/workspaces/<workspace_id>/task-plan")
@require_service_token
def plan_workspace_tasks(workspace_id):
    payload = request.get_json(silent=True) or {}
    request_text = payload.get("request", "").strip()
    if not request_text:
        return jsonify({"message": "request is required"}), 400
    plan, trace = create_task_plan(
        workspace_id,
        request_text,
        payload.get("members", []),
        payload.get("tasks", []),
    )
    return jsonify(
        {
            "plan": plan.model_dump(by_alias=True),
            "agent": trace,
        }
    )


@api.post("/workspaces/<workspace_id>/event-coordinator")
@require_service_token
def coordinate_workspace_event(workspace_id):
    payload = request.get_json(silent=True) or {}
    question = payload.get("question", "").strip()
    if not question:
        return jsonify({"message": "question is required"}), 400
    report, trace = coordinate_event(
        workspace_id,
        question,
        payload.get("members", []),
        payload.get("tasks", []),
    )
    return jsonify({"report": report.model_dump(), "agent": trace})


@api.post("/chats/summary")
@require_service_token
def summarize_group_chat():
    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages", [])
    if not messages:
        return jsonify({"message": "messages are required"}), 400
    summary = summarize_chat(payload.get("chatName", "Group chat"), messages)
    return jsonify({"summary": summary.model_dump()})


@api.post("/chats/answer")
@require_service_token
def answer_recent_chats():
    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages", [])
    question = payload.get("question", "").strip()
    if not question:
        return jsonify({"message": "question is required"}), 400
    if not messages:
        return jsonify({"answer": "I could not find recent workspace chats to answer from."})
    answer = answer_chat_context(
        payload.get("chatName", "Workspace recent chats"),
        question,
        messages,
    )
    return jsonify({"answer": answer})
