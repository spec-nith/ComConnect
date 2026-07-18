# ComConnect OpenSearch Analytics Integration

This guide wires ComConnect application analytics into OpenSearch and exposes
OpenSearch Dashboards for visualization.

## What Is Integrated

- `opensearch` stores analytics events in `comconnect-analytics-events`.
- `opensearch-dashboards` serves the analytics UI on `http://localhost:5601`.
- Backend services write HTTP request events and domain events for workspaces,
  messages, and tasks.
- The frontend adds `/analytics`, which opens or embeds OpenSearch Dashboards.

The AI knowledge/RAG OpenSearch settings are separate from analytics. Keep
`OPENSEARCH_ENDPOINT` and `OPENSEARCH_INDEX` for RAG, and use the
`OPENSEARCH_ANALYTICS_*` variables for product analytics.

## Local Setup

1. Copy `.env.example` to `.env` if you do not already have one.
2. Set a strong local admin password:

```env
OPENSEARCH_INITIAL_ADMIN_PASSWORD=C0mConnect!9vR7qP2zLx#2026
OPENSEARCH_ANALYTICS_PASSWORD=C0mConnect!9vR7qP2zLx#2026
```

3. Start the stack:

```powershell
docker compose up --build
```

4. Open ComConnect:

```text
http://localhost:3000/analytics
```

5. Open OpenSearch Dashboards directly if the iframe is blocked:

```text
http://localhost:5601
```

Use `admin` and the value of `OPENSEARCH_INITIAL_ADMIN_PASSWORD` to log in.

## Dashboard Data Source

Create an index pattern in OpenSearch Dashboards:

1. Go to `Management > Dashboards Management > Index patterns`.
2. Create an index pattern named:

```text
comconnect-analytics-events
```

3. Choose `@timestamp` as the time field.

OpenSearch requires indexed data before an index pattern can be useful. Create a
workspace, send messages, mark messages as read, allocate tasks, and move tasks
between statuses to generate events.

## Useful Visualizations

Create these panels in OpenSearch Dashboards:

| Panel | Visualization | Metric or query |
| --- | --- | --- |
| Event volume | Date histogram | Count grouped by `@timestamp` |
| Event mix | Pie chart | Terms on `event_type` |
| API latency | Line chart | Average `http.duration_ms` filtered to `event_type:http.request` |
| HTTP errors | Metric | Count filtered to `http.status_code >= 400` |
| Workspace activity | Bar chart | Terms on `workspace_id` |
| Task flow | Data table | Terms on `status`, filtered to `event_type:task.status_changed` |
| Message volume | Line chart | Count filtered to `event_type:message.sent` |

Suggested DQL filters:

```text
event_type: "message.sent"
event_type: "task.created" or event_type: "task.status_changed"
event_type: "http.request" and http.status_code >= 400
workspace_id: "<workspace-id>"
```

## Event Schema

Common fields:

| Field | Purpose |
| --- | --- |
| `@timestamp` | Event time used by Dashboards time filters |
| `event_type` | `http.request`, `message.sent`, `task.created`, and related names |
| `service` | Backend service that produced the event |
| `environment` | `development`, `production`, or current `NODE_ENV` |
| `request_id` | Request correlation ID |
| `actor_user_id` | Acting user ID when available |
| `workspace_id` | Workspace scope when available |
| `chat_id`, `message_id`, `task_id` | Entity references for drill-downs |
| `http.method`, `http.route`, `http.status_code`, `http.duration_ms` | API request telemetry |

## Configuration Reference

| Variable | Default | Description |
| --- | --- | --- |
| `OPENSEARCH_VERSION` | `2.19.1` | OpenSearch and Dashboards Docker image version |
| `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | local Compose default | Demo security admin password |
| `OPENSEARCH_ANALYTICS_ENABLED` | `true` in Compose | Enables backend analytics writes |
| `OPENSEARCH_ANALYTICS_NODE` | `https://opensearch:9200` | Backend OpenSearch endpoint |
| `OPENSEARCH_ANALYTICS_USERNAME` | `admin` | Backend analytics user |
| `OPENSEARCH_ANALYTICS_PASSWORD` | local Compose default | Backend analytics password |
| `OPENSEARCH_ANALYTICS_INDEX` | `comconnect-analytics-events` | Analytics index name |
| `OPENSEARCH_ANALYTICS_SSL_REJECT_UNAUTHORIZED` | `false` | Allows local self-signed demo certificates |
| `REACT_APP_OPENSEARCH_DASHBOARDS_URL` | `http://localhost:5601` | Frontend dashboard URL |

## Production Notes

- Do not expose OpenSearch or OpenSearch Dashboards publicly without SSO,
  network controls, and role-based access.
- Move passwords to a secret manager and remove Compose defaults.
- Use TLS with trusted certificates and set
  `OPENSEARCH_ANALYTICS_SSL_REJECT_UNAUTHORIZED=true`.
- Create an Index State Management policy for analytics retention, for example
  30 to 90 days depending on compliance needs.
- Consider one index per environment, such as
  `comconnect-prod-analytics-events`.

## Official References

- OpenSearch Dashboards docs: https://docs.opensearch.org/latest/dashboards/
- OpenSearch Docker install: https://docs.opensearch.org/latest/install-and-configure/install-opensearch/docker/
- OpenSearch Dashboards Docker install: https://docs.opensearch.org/latest/install-and-configure/install-dashboards/docker/
- OpenSearch project GitHub: https://github.com/opensearch-project
