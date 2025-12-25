# Amazon Keyspaces (Cassandra-compatible managed service)

resource "aws_keyspaces_keyspace" "main" {
  name = "${var.project_name}_${var.environment}"

  tags = {
    Name = "${var.project_name}-${var.environment}-keyspace"
  }
}

resource "aws_keyspaces_table" "messages" {
  keyspace_name = aws_keyspaces_keyspace.main.name
  table_name    = "messages"

  schema_definition {
    column {
      name = "message_id"
      type = "uuid"
    }
    column {
      name = "chat_id"
      type = "text"
    }
    column {
      name = "sender_id"
      type = "text"
    }
    column {
      name = "content"
      type = "text"
    }
    column {
      name = "read_by"
      type = "set<text>"
    }
    column {
      name = "created_at"
      type = "timestamp"
    }
    column {
      name = "updated_at"
      type = "timestamp"
    }

    partition_key {
      name = "message_id"
    }

    clustering_key {
      name = "created_at"
    }
  }

  point_in_time_recovery {
    status = "ENABLED"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-messages-table"
  }
}

resource "aws_keyspaces_table" "chats" {
  keyspace_name = aws_keyspaces_keyspace.main.name
  table_name    = "chats"

  schema_definition {
    column {
      name = "chat_id"
      type = "text"
    }
    column {
      name = "chat_name"
      type = "text"
    }
    column {
      name = "is_group_chat"
      type = "boolean"
    }
    column {
      name = "users"
      type = "list<text>"
    }
    column {
      name = "latest_message_id"
      type = "uuid"
    }
    column {
      name = "group_admin"
      type = "text"
    }
    column {
      name = "workspace_id"
      type = "text"
    }
    column {
      name = "created_at"
      type = "timestamp"
    }
    column {
      name = "updated_at"
      type = "timestamp"
    }

    partition_key {
      name = "chat_id"
    }
  }

  point_in_time_recovery {
    status = "ENABLED"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-chats-table"
  }
}

# Outputs
output "keyspace_name" {
  value = aws_keyspaces_keyspace.main.name
}

output "service_endpoint" {
  value = "cassandra.${var.aws_region}.amazonaws.com"
}

output "messages_table_name" {
  value = aws_keyspaces_table.messages.table_name
}

output "chats_table_name" {
  value = aws_keyspaces_table.chats.table_name
}

