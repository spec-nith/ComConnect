# DocumentDB Cluster

resource "aws_docdb_cluster" "main" {
  cluster_identifier      = "${var.project_name}-${var.environment}-docdb"
  engine                  = "docdb"
  master_username         = "admin"
  master_password         = var.db_password
  db_subnet_group_name    = aws_docdb_subnet_group.main.name
  vpc_security_group_ids  = [var.security_group_id]
  backup_retention_period  = 7
  preferred_backup_window = "03:00-04:00"
  skip_final_snapshot     = var.environment != "prod"
  storage_encrypted       = true

  tags = {
    Name = "${var.project_name}-${var.environment}-docdb"
  }
}

resource "aws_docdb_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-docdb-subnet-group"
  subnet_ids = var.db_subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-docdb-subnet-group"
  }
}

resource "aws_docdb_cluster_instance" "main" {
  count              = 2
  identifier         = "${var.project_name}-${var.environment}-docdb-${count.index + 1}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = "db.r5.large"

  tags = {
    Name = "${var.project_name}-${var.environment}-docdb-${count.index + 1}"
  }
}

# Outputs
output "endpoint" {
  value = aws_docdb_cluster.main.endpoint
}

output "reader_endpoint" {
  value = aws_docdb_cluster.main.reader_endpoint
}

