from flask import current_app


def trace_config(run_name, workspace_id=None, feature=None, extra=None):
    metadata = {
        "service": "comconnect-ai-service",
        "feature": feature or run_name,
    }
    if workspace_id:
        metadata["workspace_id"] = workspace_id
    if extra:
        metadata.update(extra)
    return {
        "run_name": run_name,
        "tags": [
            tag
            for tag in [
                "comconnect",
                feature,
                current_app.config.get("VECTOR_STORE_BACKEND"),
            ]
            if tag
        ],
        "metadata": metadata,
    }
