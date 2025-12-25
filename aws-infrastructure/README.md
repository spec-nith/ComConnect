# AWS Infrastructure Architecture

## 🏗️ Complete AWS Infrastructure for ComConnect Microservices

This document outlines the complete AWS infrastructure setup for the ComConnect microservices application.

---

## 📊 Architecture Overview

### **High-Level Architecture**

```
Internet
    │
    ▼
[Route 53] (DNS)
    │
    ▼
[CloudFront] (CDN)
    │
    ▼
[Application Load Balancer (ALB)]
    │
    ├─── [Target Group 1: Frontend] ────► [EC2 Auto Scaling Group]
    │
    ├─── [Target Group 2: API Gateway] ────► [EC2 Auto Scaling Group]
    │
    └─── [Target Group 3: WebSocket] ────► [EC2 Auto Scaling Group]
    
[Internal Load Balancer (NLB)]
    │
    ├─── [User Service] ────► [ECS Fargate / EC2]
    ├─── [Chat Service] ────► [ECS Fargate / EC2]
    ├─── [Message Service] ────► [ECS Fargate / EC2]
    ├─── [Workspace Service] ────► [ECS Fargate / EC2]
    ├─── [Task Service] ────► [ECS Fargate / EC2]
    └─── [Notification Service] ────► [ECS Fargate / EC2]

[Data Layer]
    ├─── [RDS PostgreSQL] (Users & Workspaces)
    ├─── [Amazon Keyspaces (Cassandra)] (Messages & Chats)
    ├─── [ElastiCache Redis]
    ├─── [MSK (Managed Kafka)]
    └─── [S3] (File Storage)

[Monitoring & Observability]
    ├─── [CloudWatch]
    ├─── [X-Ray] (Distributed Tracing)
    └─── [Prometheus + Grafana on EC2]
```

---

## 🌐 Network Architecture

### **VPC Structure**

```
VPC: 10.0.0.0/16
│
├── Public Subnets (10.0.1.0/24, 10.0.2.0/24) - Multi-AZ
│   ├── NAT Gateway
│   ├── Internet Gateway
│   └── Load Balancers
│
├── Private Subnets (10.0.10.0/24, 10.0.11.0/24) - Multi-AZ
│   ├── Application Services (ECS/EC2)
│   └── Internal Load Balancers
│
└── Database Subnets (10.0.20.0/24, 10.0.21.0/24) - Multi-AZ
    ├── RDS PostgreSQL
    ├── ElastiCache Redis
    ├── DocumentDB (MongoDB) - Optional/Backward Compat
    └── MSK (Kafka)
```

---

## 🔒 Security Groups Configuration

### **1. ALB Security Group**
- **Inbound**: HTTP (80), HTTPS (443) from 0.0.0.0/0
- **Outbound**: All traffic to application security groups

### **2. API Gateway Security Group**
- **Inbound**: Port 80 from ALB security group
- **Outbound**: All traffic to microservices security groups

### **3. Microservices Security Group**
- **Inbound**: 
  - Port 5001-5006 from API Gateway security group
  - Port 5001-5006 from same security group (inter-service)
- **Outbound**: 
  - Port 5432 to RDS PostgreSQL security group
  - Port 27017 to DocumentDB security group (optional)
  - Port 6379 to ElastiCache security group
  - Port 9092 to MSK security group
  - HTTPS (443) to internet (for external APIs and Cassandra Keyspaces)

### **4. RDS PostgreSQL Security Group**
- **Inbound**: Port 5432 from microservices security group
- **Outbound**: None

### **5. DocumentDB Security Group** (Optional/Backward Compat)
- **Inbound**: Port 27017 from microservices security group
- **Outbound**: None

### **6. ElastiCache Security Group**
- **Inbound**: Port 6379 from microservices security group
- **Outbound**: None

### **7. MSK Security Group**
- **Inbound**: Port 9092-9096 from microservices security group
- **Outbound**: None

### **8. Prometheus/Grafana Security Group**
- **Inbound**: Port 9090, 3001 from VPC CIDR
- **Outbound**: All traffic

---

## 🚀 Deployment Options

### **Option 1: ECS Fargate (Recommended)**
- Serverless container orchestration
- Auto-scaling built-in
- Pay per use
- No server management

### **Option 2: EC2 Auto Scaling Groups**
- Full control over instances
- Cost-effective for predictable workloads
- Requires more management

### **Option 3: EKS (Kubernetes)**
- Best for complex orchestration
- More overhead but maximum flexibility

---

## 📦 Infrastructure Components

### **1. Compute**
- **ECS Fargate** or **EC2 Auto Scaling Groups** for microservices
- **EC2** for API Gateway (Nginx)
- **EC2** for Prometheus/Grafana

### **2. Networking**
- **VPC** with public/private subnets
- **Application Load Balancer** (ALB) for HTTP/HTTPS
- **Network Load Balancer** (NLB) for internal service communication
- **NAT Gateway** for private subnet internet access
- **Internet Gateway** for public subnet

### **3. Data Storage**
- **RDS PostgreSQL** for users and workspaces (via Prisma ORM)
- **Amazon Keyspaces** (Cassandra-compatible) for messages and chats
- **ElastiCache Redis** for caching
- **Amazon MSK** (Managed Kafka) for event streaming
- **S3** for file storage
- **DocumentDB** (MongoDB-compatible) - Optional, kept for backward compatibility

### **4. Monitoring**
- **CloudWatch** for logs and metrics
- **X-Ray** for distributed tracing
- **Prometheus + Grafana** on EC2 for custom metrics

### **5. Security**
- **Security Groups** for network-level security
- **IAM Roles** for service authentication
- **Secrets Manager** for sensitive data
- **WAF** for application firewall

---

## 🔐 IAM Roles & Policies

### **Microservices IAM Role**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:comconnect/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 📈 Auto Scaling Configuration

### **ECS Service Auto Scaling**
- **Min Capacity**: 2 tasks per service
- **Max Capacity**: 10 tasks per service
- **Target CPU**: 70%
- **Target Memory**: 80%

### **EC2 Auto Scaling**
- **Min Size**: 2 instances
- **Max Size**: 10 instances
- **Desired Capacity**: 3 instances
- **Scaling Policy**: Target CPU 70%

---

## 💾 Database Configuration

### **RDS PostgreSQL**
- **Engine**: PostgreSQL 15.4
- **Instance Class**: db.r5.large (2 vCPU, 16GB RAM)
- **Storage**: 100GB (auto-scaling up to 1TB)
- **Multi-AZ**: Enabled in production
- **Backup Retention**: 7 days
- **Encryption**: Enabled at rest and in transit
- **Performance Insights**: Enabled

### **Amazon Keyspaces (Cassandra)**
- **Service**: Fully managed Apache Cassandra-compatible
- **Replication**: Multi-region support
- **Point-in-Time Recovery**: Enabled
- **Encryption**: Enabled at rest and in transit
- **Tables**: messages, chats

### **DocumentDB** (Optional/Backward Compat)
- **Instance Class**: db.r5.large (2 vCPU, 16GB RAM)
- **Multi-AZ**: Enabled
- **Backup Retention**: 7 days
- **Encryption**: Enabled

### **ElastiCache Redis**
- **Node Type**: cache.r6g.large
- **Multi-AZ**: Enabled
- **Cluster Mode**: Disabled (for simplicity)
- **Backup**: Daily snapshots

### **Amazon MSK**
- **Broker Instance Type**: kafka.m5.large
- **Number of Brokers**: 3 (multi-AZ)
- **Storage**: 100GB per broker

---

## 🔄 Service Communication

### **Internal Communication**
- Services communicate via **Internal NLB**
- DNS-based service discovery
- Service mesh (optional): AWS App Mesh

### **Service Discovery**
- **Route 53 Private Hosted Zone**
- Service endpoints: `service-name.internal`
- Example: `user-service.internal:5001`

---

## 📊 Monitoring & Logging

### **CloudWatch**
- Log groups for each service
- Custom metrics for Prometheus
- Alarms for error rates, latency

### **X-Ray**
- Distributed tracing
- Service map visualization
- Performance insights

### **Prometheus + Grafana**
- Custom metrics collection
- Service dashboards
- Alerting rules

---

## 🚨 High Availability

- **Multi-AZ Deployment**: All services in multiple availability zones
- **Auto Scaling**: Automatic scaling based on load
- **Health Checks**: ALB and service-level health checks
- **Backup Strategy**: Automated backups for databases
- **Disaster Recovery**: Cross-region backup (optional)

---

## 💰 Cost Optimization

- **Reserved Instances**: For predictable workloads
- **Spot Instances**: For non-critical services
- **Fargate**: Pay per use, no idle costs
- **S3 Lifecycle Policies**: Move old data to Glacier
- **CloudWatch Logs Retention**: 30 days

---

## 🔐 Security Best Practices

1. **Network Isolation**: Private subnets for services
2. **Least Privilege**: IAM roles with minimal permissions
3. **Encryption**: At rest and in transit
4. **Secrets Management**: AWS Secrets Manager
5. **VPC Flow Logs**: Network traffic monitoring
6. **WAF**: Web Application Firewall for ALB
7. **SSL/TLS**: Certificates via ACM

---

## 📝 Next Steps

1. Review and customize the Terraform/CloudFormation templates
2. Set up AWS account and configure IAM
3. Deploy infrastructure using Terraform
4. Configure CI/CD pipeline
5. Set up monitoring and alerting
6. Perform security audit
7. Load testing and optimization

