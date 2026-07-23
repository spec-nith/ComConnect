import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app


def main():
    app = create_app()
    client = app.test_client()

    health = client.get("/health")
    assert health.status_code == 200, health.get_data(as_text=True)

    missing_token = client.post("/v1/workspaces/test/ask", json={"question": "hello"})
    assert missing_token.status_code == 401, missing_token.get_data(as_text=True)

    empty_question = client.post(
        "/v1/workspaces/test/ask",
        headers={"X-Service-Token": app.config["AI_SERVICE_TOKEN"]},
        json={"question": ""},
    )
    assert empty_question.status_code == 400, empty_question.get_data(as_text=True)

    empty_chat = client.post(
        "/v1/chats/summary",
        headers={"X-Service-Token": app.config["AI_SERVICE_TOKEN"]},
        json={"messages": []},
    )
    assert empty_chat.status_code == 400, empty_chat.get_data(as_text=True)

    empty_task_plan = client.post(
        "/v1/workspaces/test/task-plan",
        headers={"X-Service-Token": app.config["AI_SERVICE_TOKEN"]},
        json={"request": ""},
    )
    assert empty_task_plan.status_code == 400, empty_task_plan.get_data(as_text=True)

    print("AI service smoke checks passed")


if __name__ == "__main__":
    main()
