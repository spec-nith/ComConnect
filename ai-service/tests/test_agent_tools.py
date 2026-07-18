import json

from langchain_core.documents import Document

from app.agent_tools import build_workspace_tools


def _tools(monkeypatch):
    monkeypatch.setattr(
        "app.agent_tools.search",
        lambda *args, **kwargs: [
            (
                Document(
                    page_content="Venue confirmation is still pending.",
                    metadata={
                        "type": "message",
                        "label": "Operations",
                        "source_id": "message-1",
                    },
                ),
                0.91,
            )
        ],
    )
    drafts = []
    trace = []
    tools = build_workspace_tools(
        "workspace-1",
        [{"name": "Asha", "email": "asha@example.com"}],
        [
            {
                "heading": "Book venue",
                "status": "in-progress",
                "priority": "high",
                "tags": ["venue"],
                "assignee_email": "asha@example.com",
            }
        ],
        drafts,
        trace,
    )
    return {item.name: item for item in tools}, drafts, trace


def test_agent_tools_search_inspect_and_draft(monkeypatch):
    tools, drafts, trace = _tools(monkeypatch)

    search_result = json.loads(
        tools["search_workspace_knowledge"].invoke(
            {"query": "venue", "tags": ["venue"], "limit": 5}
        )
    )
    workload = json.loads(
        tools["inspect_member_workload"].invoke(
            {"member_email": "asha@example.com"}
        )
    )
    drafted = json.loads(
        tools["draft_task"].invoke(
            {
                "heading": "Confirm venue",
                "description": "Get written confirmation from the venue.",
                "assignee_email": "asha@example.com",
                "priority": "high",
            }
        )
    )

    assert search_result[0]["source_id"] == "message-1"
    assert workload["in_progress"] == 1
    assert drafted["requires_human_approval"] is True
    assert len(drafts) == 1
    assert trace == [
        "search_workspace_knowledge",
        "inspect_member_workload",
        "draft_task",
    ]


def test_draft_tool_rejects_non_member(monkeypatch):
    tools, drafts, _ = _tools(monkeypatch)
    result = json.loads(
        tools["draft_task"].invoke(
            {
                "heading": "Invalid assignment",
                "description": "This must not be accepted.",
                "assignee_email": "outsider@example.com",
            }
        )
    )

    assert "error" in result
    assert drafts == []


def test_search_tool_fails_soft(monkeypatch):
    monkeypatch.setattr(
        "app.agent_tools.search",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("missing embeddings")),
    )
    drafts = []
    trace = []
    tools = build_workspace_tools(
        "workspace-1",
        [{"name": "Asha", "email": "asha@example.com"}],
        [],
        drafts,
        trace,
    )
    tool_map = {item.name: item for item in tools}

    result = json.loads(
        tool_map["search_workspace_knowledge"].invoke({"query": "venue"})
    )

    assert result["results"] == []
    assert "error" in result
    assert trace == ["search_workspace_knowledge"]
