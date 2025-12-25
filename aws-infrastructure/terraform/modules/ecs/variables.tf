variable "cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for microservices"
  type        = string
}

variable "nlb_arn" {
  description = "Network Load Balancer ARN"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL"
  type        = string
  default     = ""
}

variable "min_capacity" {
  description = "Minimum number of tasks"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum number of tasks"
  type        = number
  default     = 10
}

variable "desired_capacity" {
  description = "Desired number of tasks"
  type        = number
  default     = 3
}

variable "websocket_target_group_arn" {
  description = "ALB target group ARN for WebSocket gateway"
  type        = string
  default     = ""
}

