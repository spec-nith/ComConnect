# RDS PostgreSQL Cluster

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-rds-subnet-group"
  subnet_ids = var.db_subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-subnet-group"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.r5.large"
  
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  
  db_name  = "comconnect"
  username = "admin"
  password = var.db_password
  
  vpc_security_group_ids = [var.security_group_id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"
  
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier  = "${var.project_name}-${var.environment}-postgres-final-snapshot"
  deletion_protection        = var.environment == "prod"
  
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  
  performance_insights_enabled = true
  performance_insights_retention_period = 7
  
  multi_az = var.environment == "prod"
  
  tags = {
    Name = "${var.project_name}-${var.environment}-postgres"
  }
}

# Outputs
output "endpoint" {
  value = aws_db_instance.main.endpoint
  sensitive = true
}

output "address" {
  value = aws_db_instance.main.address
  sensitive = true
}

output "port" {
  value = aws_db_instance.main.port
}

output "database_name" {
  value = aws_db_instance.main.db_name
}

