variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "s3_bucket_domain_name" {
  description = "Domain name of the S3 media bucket"
  type        = string
}

variable "media_oai_id" {
  description = "CloudFront Origin Access Identity ID for media bucket"
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate ARN for custom domain (optional)"
  type        = string
  default     = ""
}

