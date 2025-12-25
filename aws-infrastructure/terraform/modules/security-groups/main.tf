# Security Groups for ComConnect Infrastructure

# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
  }
}

# NLB Security Group
resource "aws_security_group" "nlb" {
  name        = "${var.project_name}-${var.environment}-nlb-sg"
  description = "Security group for Internal Network Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Microservices ports from ALB"
    from_port       = 5001
    to_port         = 5007
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-nlb-sg"
  }
}

# Microservices Security Group
resource "aws_security_group" "microservices" {
  name        = "${var.project_name}-${var.environment}-microservices-sg"
  description = "Security group for microservices"
  vpc_id      = var.vpc_id

  # Allow traffic from NLB
  ingress {
    description     = "Microservices ports from NLB"
    from_port       = 5001
    to_port         = 5007
    protocol        = "tcp"
    security_groups = [aws_security_group.nlb.id]
  }

  # Allow inter-service communication
  ingress {
    description     = "Inter-service communication"
    from_port       = 5001
    to_port         = 5007
    protocol        = "tcp"
    security_groups = [aws_security_group.microservices.id]
  }

  # Allow WebSocket gateway from ALB (for direct WebSocket connections)
  ingress {
    description     = "WebSocket gateway from ALB"
    from_port       = 5007
    to_port         = 5007
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Allow OpenSearch/Elasticsearch access
  egress {
    description     = "OpenSearch/Elasticsearch"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.opensearch.id]
  }

  # Allow Prometheus scraping
  ingress {
    description = "Prometheus metrics"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Outbound to RDS PostgreSQL
  egress {
    description     = "PostgreSQL"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds.id]
  }

  # Outbound to DocumentDB (for backward compatibility)
  egress {
    description     = "MongoDB/DocumentDB"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.documentdb.id]
  }

  # Outbound to ElastiCache
  egress {
    description     = "Redis"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.elasticache.id]
  }

  # Outbound to MSK
  egress {
    description     = "Kafka"
    from_port       = 9092
    to_port         = 9096
    protocol        = "tcp"
    security_groups = [aws_security_group.msk.id]
  }

  # Outbound to Cassandra (Keyspaces) via HTTPS
  egress {
    description = "Cassandra Keyspaces"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound HTTPS for external APIs
  egress {
    description = "HTTPS to internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-microservices-sg"
  }
}

# DocumentDB Security Group
resource "aws_security_group" "documentdb" {
  name        = "${var.project_name}-${var.environment}-documentdb-sg"
  description = "Security group for DocumentDB"
  vpc_id      = var.vpc_id

  ingress {
    description     = "MongoDB from microservices"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.microservices.id]
  }

  egress {
    description = "No outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-documentdb-sg"
  }
}

# ElastiCache Security Group
resource "aws_security_group" "elasticache" {
  name        = "${var.project_name}-${var.environment}-elasticache-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from microservices"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.microservices.id]
  }

  egress {
    description = "No outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-elasticache-sg"
  }
}

# MSK Security Group
resource "aws_security_group" "msk" {
  name        = "${var.project_name}-${var.environment}-msk-sg"
  description = "Security group for Amazon MSK"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Kafka from microservices"
    from_port       = 9092
    to_port         = 9096
    protocol        = "tcp"
    security_groups = [aws_security_group.microservices.id]
  }

  ingress {
    description     = "Kafka Zookeeper"
    from_port       = 2181
    to_port         = 2181
    protocol        = "tcp"
    security_groups = [aws_security_group.msk.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-msk-sg"
  }
}

# Prometheus/Grafana Security Group
resource "aws_security_group" "monitoring" {
  name        = "${var.project_name}-${var.environment}-monitoring-sg"
  description = "Security group for Prometheus and Grafana"
  vpc_id      = var.vpc_id

  ingress {
    description = "Prometheus from VPC"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    description = "Grafana from VPC"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-monitoring-sg"
  }
}

# Outputs
output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "nlb_sg_id" {
  value = aws_security_group.nlb.id
}

output "microservices_sg_id" {
  value = aws_security_group.microservices.id
}

output "documentdb_sg_id" {
  value = aws_security_group.documentdb.id
}

output "elasticache_sg_id" {
  value = aws_security_group.elasticache.id
}

output "msk_sg_id" {
  value = aws_security_group.msk.id
}

# RDS PostgreSQL Security Group
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-${var.environment}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from microservices"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.microservices.id]
  }

  egress {
    description = "No outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-sg"
  }
}

# Outputs
output "monitoring_sg_id" {
  value = aws_security_group.monitoring.id
}

output "rds_sg_id" {
  value = aws_security_group.rds.id
}

# OpenSearch Security Group
resource "aws_security_group" "opensearch" {
  name        = "${var.project_name}-${var.environment}-opensearch-sg"
  description = "Security group for OpenSearch (managed by opensearch module)"
  vpc_id      = var.vpc_id

  # This will be managed by the opensearch module, but we create it here for reference
  # The actual rules are in the opensearch module

  tags = {
    Name = "${var.project_name}-${var.environment}-opensearch-sg"
  }
}

output "opensearch_sg_id" {
  value = aws_security_group.opensearch.id
}

