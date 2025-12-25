variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for OpenSearch"
  type        = list(string)
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = []
}

variable "allowed_security_groups" {
  description = "Security group IDs allowed to access OpenSearch"
  type        = list(string)
  default     = []
}

variable "instance_type" {
  description = "OpenSearch instance type"
  type        = string
  default     = "t3.small.search"
}

variable "instance_count" {
  description = "Number of instances"
  type        = number
  default     = 2
}

variable "dedicated_master_enabled" {
  description = "Enable dedicated master nodes"
  type        = bool
  default     = false
}

variable "master_instance_type" {
  description = "Master instance type"
  type        = string
  default     = "t3.small.search"
}

variable "master_instance_count" {
  description = "Number of master instances"
  type        = number
  default     = 3
}

variable "zone_awareness_enabled" {
  description = "Enable zone awareness"
  type        = bool
  default     = true
}

variable "volume_size" {
  description = "EBS volume size in GB"
  type        = number
  default     = 20
}

variable "volume_iops" {
  description = "EBS volume IOPS"
  type        = number
  default     = 3000
}

variable "master_user_name" {
  description = "Master user name"
  type        = string
  default     = "admin"
}

variable "master_user_password" {
  description = "Master user password"
  type        = string
  sensitive   = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}


