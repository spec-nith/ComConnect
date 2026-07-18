import json

from langchain_core.tools import tool

from .rag import search
from .schemas import PlannedTask


def _task_matches(task, status=None, assignee_email=None, tag=None):
    if status and task.get("status") != status:
        return False
    if assignee_email and task.get("assignee_email", "").lower() != assignee_email.lower():
        return False
    if tag and tag.lower() not in [item.lower() for item in task.get("tags", [])]:
        return False
    return True


def build_workspace_tools(workspace_id, members, tasks, drafted_tasks, trace):
    member_emails = {member["email"].lower() for member in members if member.get("email")}

    @tool
    def search_workspace_knowledge(
        query: str,
        tags: list[str] | None = None,
        source_type: str | None = None,
        limit: int = 8,
    ) -> str:
        """Search workspace messages and tasks using hybrid lexical and semantic retrieval."""
        trace.append("search_workspace_knowledge")
        try:
            results = search(
                workspace_id,
                query,
                tags=tags or [],
                source_type=source_type,
                limit=min(max(limit, 1), 20),
            )
        except Exception as error:
            return json.dumps(
                {
                    "error": "Workspace knowledge search is unavailable",
                    "detail": str(error),
                    "results": [],
                }
            )
        return json.dumps(
            [
                {
                    "content": document.page_content,
                    "type": document.metadata.get("type"),
                    "label": document.metadata.get("label"),
                    "source_id": document.metadata.get("source_id"),
                    "score": round(float(score), 5),
                }
                for document, score in results
            ]
        )

    @tool
    def list_workspace_tasks(
        status: str | None = None,
        assignee_email: str | None = None,
        tag: str | None = None,
        limit: int = 50,
    ) -> str:
        """List current structured tasks, optionally filtered by status, assignee, or tag."""
        trace.append("list_workspace_tasks")
        matching = [
            task
            for task in tasks
            if _task_matches(task, status, assignee_email, tag)
        ][: min(max(limit, 1), 100)]
        return json.dumps(matching)

    @tool
    def inspect_member_workload(member_email: str) -> str:
        """Count a workspace member's open, in-progress, and completed tasks."""
        trace.append("inspect_member_workload")
        email = member_email.lower()
        if email not in member_emails:
            return json.dumps({"error": "Member is not in this workspace"})
        member_tasks = [
            task for task in tasks if task.get("assignee_email", "").lower() == email
        ]
        return json.dumps(
            {
                "member_email": member_email,
                "to_do": sum(task.get("status") == "to-do" for task in member_tasks),
                "in_progress": sum(
                    task.get("status") == "in-progress" for task in member_tasks
                ),
                "done": sum(task.get("status") == "done" for task in member_tasks),
                "high_priority_open": sum(
                    task.get("priority") == "high" and task.get("status") != "done"
                    for task in member_tasks
                ),
            }
        )

    @tool
    def draft_task(
        heading: str,
        description: str,
        assignee_email: str,
        priority: str = "medium",
    ) -> str:
        """Draft an approval-gated task. This does not write to the database."""
        trace.append("draft_task")
        email = assignee_email.lower()
        if email not in member_emails:
            return json.dumps({"error": "Assignee is not a workspace member"})
        normalized_priority = priority if priority in {"low", "medium", "high"} else "medium"
        task = PlannedTask(
            heading=heading,
            description=description,
            assignee_email=assignee_email,
            priority=normalized_priority,
        )
        key = (task.heading.lower(), email)
        existing = {
            (item.heading.lower(), (item.assignee_email or "").lower())
            for item in drafted_tasks
        }
        if key not in existing and len(drafted_tasks) < 20:
            drafted_tasks.append(task)
        return json.dumps(
            {
                "drafted": True,
                "task_number": len(drafted_tasks),
                "requires_human_approval": True,
            }
        )

    return [
        search_workspace_knowledge,
        list_workspace_tasks,
        inspect_member_workload,
        draft_task,
    ]
