---
layout: post
title: "Building an MCP Server for a Todo App with FastAPI and LangChain"
date: 2026-03-03
tags: [AI, Python, MCP]
read_time: 14
excerpt: "How to build a Model Context Protocol (MCP) server using FastAPI for a todo application — complete with a notification system and a LangChain agent that manages tasks through natural language."
---

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard that lets AI models interact with external tools and data sources through a unified interface. Instead of building custom integrations for every tool, you expose capabilities as MCP tools and resources — and any MCP-compatible AI agent can use them.

In this post, we'll build a complete MCP server for a todo application using [FastAPI](https://fastapi.tiangolo.com), add a notification system for todo events, and wire it all up to a [LangChain](https://www.langchain.com) agent that manages tasks through natural language.

## What We're Building

1. **A Todo MCP Server** — Exposes CRUD operations on todos as MCP tools
2. **A Notification MCP Server** — Sends notifications (email, Slack, webhook) when todo events occur
3. **A LangChain Agent** — Uses both MCP servers to manage tasks via natural conversation

## MCP Concepts in 60 Seconds

MCP defines three core primitives:

- **Tools** — Functions the AI can call (like `create_todo`, `send_notification`)
- **Resources** — Data the AI can read (like a list of todos, or a specific todo by ID)
- **Prompts** — Reusable prompt templates the AI can use

The protocol uses JSON-RPC over stdio or HTTP (Server-Sent Events). We'll use the HTTP transport with FastAPI.

## Project Structure

```
mcp-todo/
├── todo_server.py          # Todo MCP server
├── notification_server.py  # Notification MCP server
├── agent.py                # LangChain agent
├── models.py               # Shared data models
├── requirements.txt
└── docker-compose.yml
```

## Step 1: Data Models

First, let's define our shared models:

```python
# models.py
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
from typing import Optional

class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class TodoStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"

class Todo(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    priority: Priority = Priority.MEDIUM
    status: TodoStatus = TodoStatus.PENDING
    due_date: Optional[datetime] = None
    tags: list[str] = []
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Priority = Priority.MEDIUM
    due_date: Optional[datetime] = None
    tags: list[str] = []

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Priority] = None
    status: Optional[TodoStatus] = None
    due_date: Optional[datetime] = None
    tags: Optional[list[str]] = None

class NotificationType(str, Enum):
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"

class NotificationPayload(BaseModel):
    type: NotificationType
    recipient: str
    subject: str
    message: str
    todo_id: Optional[str] = None
```

## Step 2: Todo MCP Server with FastAPI

Here's the core of the todo MCP server. We use the `mcp` Python SDK with FastAPI's HTTP transport:

```python
# todo_server.py
import uuid
from datetime import datetime
from typing import Any

from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP

from models import Todo, TodoCreate, TodoUpdate, TodoStatus, Priority

# In-memory store (swap with a database in production)
todos: dict[str, Todo] = {}

# Create FastMCP server
mcp = FastMCP(
    "Todo MCP Server",
    description="MCP server for managing todo items",
)

# ---- MCP Tools ----

@mcp.tool()
def create_todo(
    title: str,
    description: str = "",
    priority: str = "medium",
    due_date: str = "",
    tags: list[str] = [],
) -> dict[str, Any]:
    """Create a new todo item.

    Args:
        title: The title of the todo
        description: Detailed description of the task
        priority: Priority level - low, medium, or high
        due_date: Due date in ISO format (YYYY-MM-DD)
        tags: List of tags for categorization
    """
    todo_id = str(uuid.uuid4())[:8]
    parsed_due = datetime.fromisoformat(due_date) if due_date else None

    todo = Todo(
        id=todo_id,
        title=title,
        description=description,
        priority=Priority(priority),
        due_date=parsed_due,
        tags=tags,
    )
    todos[todo_id] = todo
    return {"status": "created", "todo": todo.model_dump(mode="json")}


@mcp.tool()
def update_todo(todo_id: str, **kwargs) -> dict[str, Any]:
    """Update an existing todo item.

    Args:
        todo_id: The ID of the todo to update
        **kwargs: Fields to update (title, description, priority, status, tags)
    """
    if todo_id not in todos:
        return {"error": f"Todo {todo_id} not found"}

    todo = todos[todo_id]
    update_data = {k: v for k, v in kwargs.items() if v is not None}

    if "priority" in update_data:
        update_data["priority"] = Priority(update_data["priority"])
    if "status" in update_data:
        update_data["status"] = TodoStatus(update_data["status"])

    updated = todo.model_copy(update=update_data)
    updated.updated_at = datetime.now()
    todos[todo_id] = updated

    return {"status": "updated", "todo": updated.model_dump(mode="json")}


@mcp.tool()
def delete_todo(todo_id: str) -> dict[str, str]:
    """Delete a todo item by its ID.

    Args:
        todo_id: The ID of the todo to delete
    """
    if todo_id not in todos:
        return {"error": f"Todo {todo_id} not found"}

    deleted = todos.pop(todo_id)
    return {"status": "deleted", "title": deleted.title}


@mcp.tool()
def list_todos(
    status: str = "",
    priority: str = "",
    tag: str = "",
) -> list[dict[str, Any]]:
    """List todos with optional filters.

    Args:
        status: Filter by status (pending, in_progress, completed)
        priority: Filter by priority (low, medium, high)
        tag: Filter by tag
    """
    result = list(todos.values())

    if status:
        result = [t for t in result if t.status == TodoStatus(status)]
    if priority:
        result = [t for t in result if t.priority == Priority(priority)]
    if tag:
        result = [t for t in result if tag in t.tags]

    return [t.model_dump(mode="json") for t in result]


@mcp.tool()
def mark_complete(todo_id: str) -> dict[str, Any]:
    """Mark a todo as completed.

    Args:
        todo_id: The ID of the todo to complete
    """
    if todo_id not in todos:
        return {"error": f"Todo {todo_id} not found"}

    todos[todo_id].status = TodoStatus.COMPLETED
    todos[todo_id].updated_at = datetime.now()
    return {
        "status": "completed",
        "todo": todos[todo_id].model_dump(mode="json"),
    }


# ---- MCP Resources ----

@mcp.resource("todo://list")
def get_all_todos() -> str:
    """Get all todos as a formatted list."""
    if not todos:
        return "No todos found."

    lines = []
    for todo in todos.values():
        status_icon = {
            TodoStatus.PENDING: "pending",
            TodoStatus.IN_PROGRESS: "in_progress",
            TodoStatus.COMPLETED: "completed",
        }[todo.status]
        lines.append(
            f"[{status_icon}] [{todo.id}] {todo.title} "
            f"(priority: {todo.priority}, status: {todo.status})"
        )
    return "\n".join(lines)


@mcp.resource("todo://{todo_id}")
def get_todo(todo_id: str) -> str:
    """Get a specific todo by ID."""
    if todo_id not in todos:
        return f"Todo {todo_id} not found."

    todo = todos[todo_id]
    return todo.model_dump_json(indent=2)


# ---- Run with FastAPI ----

app = FastAPI()
app.mount("/", mcp.get_asgi_app())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

### What's Happening Here

- **`@mcp.tool()`** registers a function as an MCP tool. The docstring becomes the tool description that the AI model sees — keep it clear and specific.
- **`@mcp.resource()`** registers a URI-based resource. Resources are read-only data sources.
- **`mcp.get_asgi_app()`** returns an ASGI application that handles the MCP protocol over HTTP with SSE transport. We mount it on a FastAPI app.

Run it:

```bash
uvicorn todo_server:app --host 0.0.0.0 --port 8001
```

## Step 3: Notification MCP Server

The notification server handles sending alerts when todo events happen. It exposes tools for different notification channels:

```python
# notification_server.py
import json
import httpx
from datetime import datetime
from typing import Any

from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP

from models import NotificationType

# Notification log (in-memory)
notification_log: list[dict[str, Any]] = []

mcp = FastMCP(
    "Notification MCP Server",
    description="MCP server for sending notifications on todo events",
)


@mcp.tool()
def send_email_notification(
    recipient: str,
    subject: str,
    message: str,
    todo_id: str = "",
) -> dict[str, str]:
    """Send an email notification about a todo event.

    Args:
        recipient: Email address of the recipient
        subject: Email subject line
        message: Email body content
        todo_id: Related todo ID (optional)
    """
    # In production, use SMTP or an email service like SendGrid
    entry = {
        "type": "email",
        "recipient": recipient,
        "subject": subject,
        "message": message,
        "todo_id": todo_id,
        "sent_at": datetime.now().isoformat(),
    }
    notification_log.append(entry)
    print(f"[EMAIL] To: {recipient} | Subject: {subject}")
    return {"status": "sent", "channel": "email", "recipient": recipient}


@mcp.tool()
def send_slack_notification(
    channel: str,
    message: str,
    todo_id: str = "",
) -> dict[str, str]:
    """Send a Slack notification about a todo event.

    Args:
        channel: Slack channel name (e.g., #team-tasks)
        message: Notification message
        todo_id: Related todo ID (optional)
    """
    # In production, use Slack webhook URL
    entry = {
        "type": "slack",
        "channel": channel,
        "message": message,
        "todo_id": todo_id,
        "sent_at": datetime.now().isoformat(),
    }
    notification_log.append(entry)
    print(f"[SLACK] #{channel} | {message}")
    return {"status": "sent", "channel": "slack", "target": channel}


@mcp.tool()
def send_webhook_notification(
    url: str,
    payload: str,
    todo_id: str = "",
) -> dict[str, str]:
    """Send a webhook notification about a todo event.

    Args:
        url: Webhook endpoint URL
        payload: JSON payload to send
        todo_id: Related todo ID (optional)
    """
    entry = {
        "type": "webhook",
        "url": url,
        "payload": payload,
        "todo_id": todo_id,
        "sent_at": datetime.now().isoformat(),
    }
    notification_log.append(entry)
    print(f"[WEBHOOK] {url} | {payload}")

    # In production, actually POST to the webhook
    # async with httpx.AsyncClient() as client:
    #     response = await client.post(url, json=json.loads(payload))

    return {"status": "sent", "channel": "webhook", "url": url}


@mcp.tool()
def notify_todo_event(
    event: str,
    todo_title: str,
    todo_id: str = "",
    channels: list[str] = ["slack"],
    slack_channel: str = "#team-tasks",
    email_recipient: str = "",
    webhook_url: str = "",
) -> list[dict[str, str]]:
    """Send notifications across multiple channels for a todo event.

    This is a convenience tool that dispatches to the appropriate
    notification channels based on the event type.

    Args:
        event: Event type (created, updated, completed, deleted, overdue)
        todo_title: Title of the related todo
        todo_id: ID of the related todo
        channels: List of channels to notify (email, slack, webhook)
        slack_channel: Slack channel for slack notifications
        email_recipient: Email address for email notifications
        webhook_url: URL for webhook notifications
    """
    message = f"Todo {event}: {todo_title}"
    if todo_id:
        message += f" (ID: {todo_id})"

    results = []

    for ch in channels:
        if ch == "slack":
            result = send_slack_notification(
                channel=slack_channel,
                message=message,
                todo_id=todo_id,
            )
            results.append(result)

        elif ch == "email" and email_recipient:
            result = send_email_notification(
                recipient=email_recipient,
                subject=f"Todo {event}: {todo_title}",
                message=message,
                todo_id=todo_id,
            )
            results.append(result)

        elif ch == "webhook" and webhook_url:
            payload = json.dumps({
                "event": event,
                "todo_id": todo_id,
                "todo_title": todo_title,
                "timestamp": datetime.now().isoformat(),
            })
            result = send_webhook_notification(
                url=webhook_url,
                payload=payload,
                todo_id=todo_id,
            )
            results.append(result)

    return results


# ---- MCP Resources ----

@mcp.resource("notifications://log")
def get_notification_log() -> str:
    """Get the notification log."""
    if not notification_log:
        return "No notifications sent yet."
    return json.dumps(notification_log, indent=2)


@mcp.resource("notifications://log/{notification_type}")
def get_notifications_by_type(notification_type: str) -> str:
    """Get notifications filtered by type."""
    filtered = [n for n in notification_log if n["type"] == notification_type]
    if not filtered:
        return f"No {notification_type} notifications found."
    return json.dumps(filtered, indent=2)


# ---- Run with FastAPI ----

app = FastAPI()
app.mount("/", mcp.get_asgi_app())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

Run it on a separate port:

```bash
uvicorn notification_server:app --host 0.0.0.0 --port 8002
```

## Step 4: LangChain Agent with MCP Tools

Now the exciting part — connecting both MCP servers to a LangChain agent. The agent can manage todos and send notifications using natural language:

```python
# agent.py
import asyncio
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_mcp_adapters.client import MultiServerMCPClient

async def create_agent():
    """Create a LangChain agent connected to both MCP servers."""

    # Connect to both MCP servers
    client = MultiServerMCPClient(
        {
            "todo": {
                "url": "http://localhost:8001/sse",
                "transport": "sse",
            },
            "notifications": {
                "url": "http://localhost:8002/sse",
                "transport": "sse",
            },
        }
    )

    # Get tools from both MCP servers
    tools = await client.get_tools()

    print(f"Loaded {len(tools)} tools from MCP servers:")
    for tool in tools:
        print(f"  - {tool.name}: {tool.description[:60]}...")

    # Create the agent with a system prompt
    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            """You are a helpful todo management assistant. You can:
1. Create, update, list, and delete todos
2. Mark todos as complete
3. Send notifications about todo events via email, Slack, or webhooks

When a user creates or completes a todo, proactively ask if they
want to send a notification. Always confirm destructive actions
(delete) before executing them.

When listing todos, present them in a clean, readable format.""",
        ),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    llm = ChatOpenAI(model="gpt-4", temperature=0)
    agent = create_openai_tools_agent(llm, tools, prompt)

    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        handle_parsing_errors=True,
    )


async def main():
    agent = await create_agent()
    chat_history = []

    print("\nTodo Assistant ready. Type 'quit' to exit.\n")

    while True:
        user_input = input("You: ").strip()
        if user_input.lower() in ("quit", "exit"):
            break

        result = await agent.ainvoke({
            "input": user_input,
            "chat_history": chat_history,
        })

        print(f"\nAssistant: {result['output']}\n")

        chat_history.extend([
            ("human", user_input),
            ("ai", result["output"]),
        ])


if __name__ == "__main__":
    asyncio.run(main())
```

### How the Agent Works

1. **`MultiServerMCPClient`** connects to both MCP servers over SSE and discovers all available tools automatically
2. **`create_openai_tools_agent`** creates an agent that can call MCP tools as OpenAI function calls
3. The agent decides which tools to use based on the user's natural language request
4. Tool calls are routed to the correct MCP server transparently

## Step 5: Running Everything with Docker Compose

```yaml
# docker-compose.yml
services:
  todo-server:
    build: .
    command: uvicorn todo_server:app --host 0.0.0.0 --port 8001
    ports:
      - "8001:8001"

  notification-server:
    build: .
    command: uvicorn notification_server:app --host 0.0.0.0 --port 8002
    ports:
      - "8002:8002"

  agent:
    build: .
    command: python agent.py
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - todo-server
      - notification-server
    stdin_open: true
    tty: true
```

```bash
docker compose up -d todo-server notification-server
docker compose run agent
```

## Step 6: Using the Agent

Here is a sample conversation with the agent:

```
You: Create a high priority todo to review the Q1 report,
     due tomorrow, tagged with work and finance
Assistant: Done! I created a high priority todo:
  - Title: Review the Q1 report
  - ID: a1b2c3d4
  - Priority: high
  - Due: 2026-03-04
  - Tags: work, finance
  Would you like me to send a notification about this?

You: Yes, notify the team on Slack in #finance-team
Assistant: Notification sent to #finance-team on Slack:
  "Todo created: Review the Q1 report (ID: a1b2c3d4)"

You: Show me all my high priority todos
Assistant: Here are your high priority todos:
  1. [a1b2c3d4] Review the Q1 report (pending, due 2026-03-04)

You: Mark it as complete and notify on Slack and email to boss@company.com
Assistant: Done! I marked "Review the Q1 report" as completed and sent
  notifications:
  - Slack #finance-team: "Todo completed: Review the Q1 report"
  - Email to boss@company.com: "Todo completed: Review the Q1 report"
```

The agent seamlessly chains tools across both MCP servers — it called `mark_complete` on the todo server and `notify_todo_event` on the notification server in a single turn.

## Key Design Decisions

### Why Two Separate MCP Servers?

Separating todo management from notifications follows the single-responsibility principle. Each server can be:

- **Scaled independently** — The notification server may need more resources during high-traffic periods
- **Reused across projects** — The notification MCP server works with any application, not just todos
- **Developed by different teams** — Clear ownership boundaries

### Why FastAPI for MCP?

FastAPI is a natural fit for MCP servers:

1. **Native async support** — MCP's SSE transport benefits from async I/O
2. **Pydantic integration** — MCP tool parameters map directly to Pydantic models
3. **Auto-generated docs** — You get Swagger UI at `/docs` for free, useful during development
4. **Middleware ecosystem** — Add authentication, CORS, rate limiting without touching MCP code

### Tool Design Tips

Good MCP tool design makes or breaks the agent experience:

- **Clear docstrings** — The AI reads them to decide when and how to use each tool
- **Specific parameter names** — `todo_id` is better than `id`
- **Sensible defaults** — Make common cases require fewer arguments
- **Return structured data** — Include status codes and error messages the AI can act on
- **Granular tools** — Prefer `mark_complete` over a generic `update_todo` for common operations

## Adding Authentication

In production, you need to secure your MCP servers. Add FastAPI middleware before mounting the MCP app:

```python
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()

@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    api_key = request.headers.get("Authorization")
    if not api_key or api_key != f"Bearer {os.environ['MCP_API_KEY']}":
        raise HTTPException(status_code=401, detail="Invalid API key")
    return await call_next(request)

app.mount("/", mcp.get_asgi_app())
```

## Requirements

```
# requirements.txt
fastapi>=0.115.0
uvicorn>=0.34.0
mcp[cli]>=1.0.0
langchain>=0.3.0
langchain-openai>=0.3.0
langchain-mcp-adapters>=0.1.0
pydantic>=2.0.0
httpx>=0.28.0
```

## Wrapping Up

MCP gives you a clean way to expose application functionality to AI agents. By building MCP servers with FastAPI, you get a production-grade HTTP stack with minimal boilerplate. The combination of a todo MCP server, a notification MCP server, and a LangChain agent demonstrates how to compose multiple MCP servers into a cohesive AI-powered workflow.

The key takeaway: **design your MCP tools like you design APIs** — clear naming, good documentation, sensible defaults, and separation of concerns. The AI agent is just another client consuming your interface.
