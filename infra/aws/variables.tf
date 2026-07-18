variable "aws_region" {
  description = "AWS region for the deployment."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "production"
}

variable "image_tag" {
  description = "Container image tag deployed by ECS."
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "Fallback desired task count for services not listed in service_desired_counts."
  type        = number
  default     = 1
}

variable "service_desired_counts" {
  description = "Independent desired ECS task count per service."
  type        = map(number)
  default = {
    gateway           = 2
    identity          = 1
    chat              = 2
    message-worker    = 2
    knowledge-indexer = 1
    tasks             = 1
    notifications     = 1
    ai-orchestrator   = 1
    ai-engine         = 2
  }
}

variable "service_max_counts" {
  description = "Independent ECS autoscaling ceiling per service."
  type        = map(number)
  default = {
    gateway           = 6
    identity          = 3
    chat              = 8
    message-worker    = 8
    knowledge-indexer = 4
    tasks             = 4
    notifications     = 4
    ai-orchestrator   = 4
    ai-engine         = 6
  }
}

variable "mongo_uri" {
  description = "MongoDB Atlas connection URI."
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "LLM provider API key used by the LangChain AI service."
  type        = string
  sensitive   = true
  default     = ""
}

variable "kafka_broker" {
  description = "Comma-separated external Kafka bootstrap brokers."
  type        = string
  sensitive   = true
}

variable "kafka_username" {
  description = "Kafka SASL username."
  type        = string
  sensitive   = true
  default     = ""
}

variable "kafka_password" {
  description = "Kafka SASL password."
  type        = string
  sensitive   = true
  default     = ""
}

variable "firebase_service_account_json" {
  description = "Firebase service account JSON."
  type        = string
  sensitive   = true
  default     = ""
}

variable "cors_origin" {
  description = "Additional allowed frontend origin. CloudFront is always the primary origin."
  type        = string
  default     = "*"
}
