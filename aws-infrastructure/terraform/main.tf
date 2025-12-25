# Main Terraform Configuration for ComConnect AWS Infrastructure

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket = "comconnect-terraform-state"
    key    = "terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "ComConnect"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# VPC Module
module "vpc" {
  source = "./modules/vpc"
  
  vpc_cidr             = var.vpc_cidr
  availability_zones   = data.aws_availability_zones.available.names
  environment          = var.environment
  project_name         = var.project_name
}

# Security Groups Module
module "security_groups" {
  source = "./modules/security-groups"
  
  vpc_id      = module.vpc.vpc_id
  environment = var.environment
  project_name = var.project_name
  
  depends_on = [module.vpc]
}

# Application Load Balancer
module "alb" {
  source = "./modules/alb"
  
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  security_group_id   = module.security_groups.alb_sg_id
  environment         = var.environment
  project_name        = var.project_name
  certificate_arn     = var.certificate_arn
  
  depends_on = [module.vpc, module.security_groups]
}

# Internal Network Load Balancer
module "nlb" {
  source = "./modules/nlb"
  
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  security_group_id   = module.security_groups.nlb_sg_id
  environment         = var.environment
  project_name        = var.project_name
  
  depends_on = [module.vpc, module.security_groups]
}

# ECS Cluster
module "ecs" {
  source = "./modules/ecs"
  
  cluster_name            = "${var.project_name}-${var.environment}"
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  security_group_id       = module.security_groups.microservices_sg_id
  nlb_arn                 = module.nlb.nlb_arn
  websocket_target_group_arn = module.alb.websocket_target_group_arn
  environment             = var.environment
  project_name            = var.project_name
  
  depends_on = [module.vpc, module.security_groups, module.nlb, module.alb]
}

# RDS PostgreSQL
module "rds" {
  source = "./modules/rds"
  
  vpc_id              = module.vpc.vpc_id
  db_subnet_ids       = module.vpc.database_subnet_ids
  security_group_id   = module.security_groups.rds_sg_id
  environment         = var.environment
  project_name        = var.project_name
  db_password         = var.db_password
  
  depends_on = [module.vpc, module.security_groups]
}

# Amazon Keyspaces (Cassandra)
module "cassandra" {
  source = "./modules/cassandra"
  
  environment         = var.environment
  project_name        = var.project_name
  aws_region          = var.aws_region
}

# DocumentDB (MongoDB) - Kept for backward compatibility if needed
module "documentdb" {
  source = "./modules/documentdb"
  
  vpc_id              = module.vpc.vpc_id
  db_subnet_ids       = module.vpc.database_subnet_ids
  security_group_id   = module.security_groups.documentdb_sg_id
  environment         = var.environment
  project_name        = var.project_name
  
  depends_on = [module.vpc, module.security_groups]
}

# ElastiCache Redis
module "elasticache" {
  source = "./modules/elasticache"
  
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.database_subnet_ids
  security_group_id   = module.security_groups.elasticache_sg_id
  environment         = var.environment
  project_name        = var.project_name
  
  depends_on = [module.vpc, module.security_groups]
}

# Amazon MSK (Kafka)
module "msk" {
  source = "./modules/msk"
  
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.database_subnet_ids
  security_group_id   = module.security_groups.msk_sg_id
  environment         = var.environment
  project_name        = var.project_name
  
  depends_on = [module.vpc, module.security_groups]
}

# S3 Buckets
module "s3" {
  source = "./modules/s3"
  
  environment = var.environment
  project_name = var.project_name
}

# CloudFront CDN for Media
module "cloudfront" {
  source = "./modules/cloudfront"
  
  project_name          = var.project_name
  environment           = var.environment
  s3_bucket_domain_name = module.s3.media_bucket_domain_name
  media_oai_id          = module.s3.media_oai_id
  certificate_arn       = var.certificate_arn
  
  depends_on = [module.s3]
}

# CloudWatch Log Groups
module "cloudwatch" {
  source = "./modules/cloudwatch"
  
  environment = var.environment
  project_name = var.project_name
}

# AWS OpenSearch (Elasticsearch-compatible)
module "opensearch" {
  source = "./modules/opensearch"
  
  vpc_id                  = module.vpc.vpc_id
  vpc_cidr                = var.vpc_cidr
  subnet_ids              = module.vpc.private_subnet_ids
  availability_zones      = data.aws_availability_zones.available.names
  allowed_security_groups = [module.security_groups.microservices_sg_id]
  environment             = var.environment
  project_name            = var.project_name
  master_user_password    = var.opensearch_master_password
  
  depends_on = [module.vpc, module.security_groups]
}

# Outputs
output "vpc_id" {
  value = module.vpc.vpc_id
}

output "alb_dns_name" {
  value = module.alb.alb_dns_name
}

output "nlb_dns_name" {
  value = module.nlb.nlb_dns_name
}

output "rds_endpoint" {
  value = module.rds.endpoint
  sensitive = true
}

output "rds_address" {
  value = module.rds.address
  sensitive = true
}

output "cassandra_keyspace" {
  value = module.cassandra.keyspace_name
}

output "cassandra_endpoint" {
  value = module.cassandra.service_endpoint
}

output "documentdb_endpoint" {
  value = module.documentdb.endpoint
  sensitive = true
}

output "elasticache_endpoint" {
  value = module.elasticache.endpoint
  sensitive = true
}

output "msk_broker_endpoints" {
  value = module.msk.broker_endpoints
  sensitive = true
}

output "opensearch_endpoint" {
  value       = module.opensearch.domain_endpoint
  description = "OpenSearch domain endpoint"
}

output "opensearch_kibana_endpoint" {
  value       = module.opensearch.kibana_endpoint
  description = "Kibana endpoint"
}

output "s3_media_bucket_name" {
  value = module.s3.media_bucket_name
}

output "cloudfront_domain_name" {
  value = module.cloudfront.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  value = module.cloudfront.cloudfront_distribution_id
}

