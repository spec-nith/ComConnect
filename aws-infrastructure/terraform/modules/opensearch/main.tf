# AWS OpenSearch (Elasticsearch-compatible) Module

resource "aws_opensearch_domain" "main" {
  domain_name    = "${var.project_name}-${var.environment}"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type            = var.instance_type
    instance_count           = var.instance_count
    dedicated_master_enabled = var.dedicated_master_enabled
    master_instance_type     = var.master_instance_type
    master_instance_count    = var.master_instance_count
    zone_awareness_enabled   = var.zone_awareness_enabled

    dynamic "zone_awareness_config" {
      for_each = var.zone_awareness_enabled ? [1] : []
      content {
        availability_zone_count = length(var.availability_zones)
      }
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.volume_size
    iops        = var.volume_iops
  }

  vpc_options {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.opensearch.id]
  }

  node_to_node_encryption {
    enabled = true
  }

  encrypt_at_rest {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true
    master_user_options {
      master_user_name     = var.master_user_name
      master_user_password = var.master_user_password
    }
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch.arn
    log_type                 = "INDEX_SLOW_LOGS"
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch.arn
    log_type                 = "SEARCH_SLOW_LOGS"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-opensearch"
  }
}

# Security Group for OpenSearch
resource "aws_security_group" "opensearch" {
  name        = "${var.project_name}-${var.environment}-opensearch-sg"
  description = "Security group for OpenSearch domain"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "HTTPS from VPC"
  }

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
    description     = "HTTPS from microservices"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-opensearch-sg"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "opensearch" {
  name              = "/aws/opensearch/${var.project_name}-${var.environment}"
  retention_in_days = var.log_retention_days
}

# Outputs
output "domain_endpoint" {
  value       = aws_opensearch_domain.main.endpoint
  description = "OpenSearch domain endpoint"
}

output "domain_arn" {
  value       = aws_opensearch_domain.main.arn
  description = "OpenSearch domain ARN"
}

output "kibana_endpoint" {
  value       = aws_opensearch_domain.main.kibana_endpoint
  description = "Kibana endpoint"
}

output "security_group_id" {
  value       = aws_security_group.opensearch.id
  description = "OpenSearch security group ID"
}


