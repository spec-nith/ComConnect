variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "comconnect"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = ""
}

variable "min_capacity" {
  description = "Minimum number of tasks/instances"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum number of tasks/instances"
  type        = number
  default     = 10
}

variable "desired_capacity" {
  description = "Desired number of tasks/instances"
  type        = number
  default     = 3
}

variable "db_password" {
  description = "Database password for RDS PostgreSQL"
  type        = string
  sensitive   = true
  default     = ""
}

variable "opensearch_master_password" {
  description = "Master user password for OpenSearch"
  type        = string
  sensitive   = true
  default     = ""
}

