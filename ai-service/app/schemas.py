from typing import Literal

from pydantic import BaseModel, Field


class PlannedTask(BaseModel):
    heading: str = Field(
        min_length=1,
        max_length=160,
        description="A concise, actionable task title",
    )
    description: str = Field(
        min_length=1,
        max_length=2000,
        description="Clear completion criteria and useful context",
    )
    assignee_email: str | None = Field(
        default=None,
        description="Email of the best workspace member for this task, or null",
    )
    priority: Literal["low", "medium", "high"] = "medium"


class TaskPlan(BaseModel):
    summary: str = Field(
        max_length=1000,
        description="Short explanation of the proposed plan",
    )
    tasks: list[PlannedTask] = Field(
        min_length=1,
        max_length=20,
        description="Tasks needed to complete the request",
    )


class ChatSummary(BaseModel):
    short_summary: str = Field(
        max_length=1000,
        description="Brief summary of the group-chat discussion",
    )
    action_items: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Concrete actions mentioned in the chat",
    )
    unresolved_questions: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Questions or decisions still open",
    )
    people_mentioned: list[str] = Field(
        default_factory=list,
        max_length=30,
        description="People explicitly mentioned or assigned work",
    )
    deadlines: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Dates, times, or deadline phrases from the chat",
    )


class EventCoordinatorReport(BaseModel):
    answer: str = Field(
        max_length=1500,
        description="Direct answer to the coordinator question",
    )
    readiness: Literal["ready", "mostly_ready", "at_risk", "blocked", "unknown"]
    blocked_items: list[str] = Field(default_factory=list, max_length=20)
    overloaded_members: list[str] = Field(default_factory=list, max_length=20)
    follow_up_tasks: list[str] = Field(default_factory=list, max_length=20)
    risks: list[str] = Field(default_factory=list, max_length=20)
    proposed_tasks: list[PlannedTask] = Field(
        default_factory=list,
        max_length=20,
        description="Approval-gated tasks drafted by the coordinator agent",
    )
