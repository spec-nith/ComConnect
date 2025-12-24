# AWS Infrastructure Quick Start

## 🚀 Quick Deployment Steps

### 1. Prerequisites Check
```bash
# Check AWS CLI
aws --version

# Check Terraform
terraform version

# Configure AWS credentials
aws configure
```

### 2. Initialize Terraform
```bash
cd aws-infrastructure/terraform
terraform init
```

### 3. Create Configuration
Create `terraform.tfvars`:
```hcl
aws_region       = "us-east-1"
environment      = "prod"
project_name     = "comconnect"
vpc_cidr         = "10.0.0.0/16"
min_capacity     = 2
max_capacity     = 10
desired_capacity = 3
```

### 4. Plan and Apply
```bash
terraform plan
terraform apply
```

### 5. Get Outputs
```bash
terraform output
```

## 📋 Key Resources Created

- **VPC**: 10.0.0.0/16 with public/private/database subnets
- **ALB**: Application Load Balancer for external traffic
- **NLB**: Internal Network Load Balancer for service communication
- **ECS Cluster**: Fargate cluster for microservices
- **DocumentDB**: MongoDB-compatible database
- **ElastiCache**: Redis cluster
- **MSK**: Managed Kafka cluster
- **Security Groups**: Network-level security
- **CloudWatch**: Logging and monitoring

## 🔐 Security Groups Summary

| Security Group | Purpose | Key Rules |
|---------------|---------|-----------|
| `alb-sg` | Application Load Balancer | HTTP/HTTPS from internet |
| `nlb-sg` | Internal Load Balancer | Ports 5001-5006 from ALB |
| `microservices-sg` | All microservices | Ports 5001-5006 from NLB, inter-service communication |
| `docdb-sg` | DocumentDB | Port 27017 from microservices |
| `elasticache-sg` | Redis | Port 6379 from microservices |
| `msk-sg` | Kafka | Ports 9092-9096 from microservices |

## 🌐 Service Endpoints

After deployment, services communicate via:
- **Internal**: `http://nlb-dns-name:5001` (user-service)
- **External**: `https://alb-dns-name/api/user`

## 📊 Monitoring

- **CloudWatch Logs**: `/comconnect/prod/<service-name>`
- **CloudWatch Metrics**: Auto-created for ECS services
- **X-Ray**: Enable in task definitions

## 🔄 Next Steps

1. Build and push Docker images to ECR
2. Update ECS task definitions with image URLs
3. Configure secrets in AWS Secrets Manager
4. Set up CI/CD pipeline
5. Configure domain and SSL certificates

## 💡 Tips

- Start with `environment = "dev"` for testing
- Use smaller instance sizes for dev/staging
- Enable CloudWatch Container Insights for better monitoring
- Set up VPC Flow Logs for network troubleshooting
- Use AWS Systems Manager for secure access to instances

