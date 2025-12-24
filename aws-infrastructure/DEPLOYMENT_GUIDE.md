# AWS Deployment Guide for ComConnect

## 📋 Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Terraform** >= 1.0 installed
4. **Docker** installed (for building images)
5. **kubectl** (if using EKS)

---

## 🚀 Step-by-Step Deployment

### **Step 1: Configure AWS CLI**

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Enter default region (e.g., us-east-1)
# Enter default output format (json)
```

### **Step 2: Create S3 Bucket for Terraform State**

```bash
aws s3 mb s3://comconnect-terraform-state --region us-east-1
aws s3api put-bucket-versioning \
  --bucket comconnect-terraform-state \
  --versioning-configuration Status=Enabled
```

### **Step 3: Initialize Terraform**

```bash
cd aws-infrastructure/terraform
terraform init
```

### **Step 4: Create terraform.tfvars**

```hcl
aws_region     = "us-east-1"
environment    = "prod"
project_name   = "comconnect"
vpc_cidr       = "10.0.0.0/16"
min_capacity   = 2
max_capacity   = 10
desired_capacity = 3
```

### **Step 5: Plan Infrastructure**

```bash
terraform plan -out=tfplan
```

### **Step 6: Apply Infrastructure**

```bash
terraform apply tfplan
```

### **Step 7: Build and Push Docker Images**

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push each service
cd ../../backend/services
for service in user-service chat-service message-service workspace-service task-service notification-service; do
  cd $service
  docker build -t $service:latest .
  docker tag $service:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/$service:latest
  docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/$service:latest
  cd ..
done
```

### **Step 8: Update ECS Task Definitions**

Update the ECR repository URLs in the ECS task definitions with your actual ECR URLs.

### **Step 9: Configure Secrets**

Store sensitive data in AWS Secrets Manager:

```bash
# MongoDB connection string
aws secretsmanager create-secret \
  --name comconnect/mongodb-uri \
  --secret-string "mongodb://..."

# JWT Secret
aws secretsmanager create-secret \
  --name comconnect/jwt-secret \
  --secret-string "your-jwt-secret"

# Firebase credentials
aws secretsmanager create-secret \
  --name comconnect/firebase-credentials \
  --secret-file file://firebase-credentials.json
```

### **Step 10: Update Service Configurations**

Update environment variables in ECS task definitions to use Secrets Manager.

---

## 🔧 Configuration

### **Environment Variables**

Set these in ECS task definitions:

```env
MONGODB_URI=arn:aws:secretsmanager:region:account:secret:comconnect/mongodb-uri
REDIS_HOST=<elasticache-endpoint>
REDIS_PORT=6379
KAFKA_BROKER=<msk-broker-endpoints>
JWT_SECRET=arn:aws:secretsmanager:region:account:secret:comconnect/jwt-secret
NODE_ENV=production
```

### **Service Discovery**

Services communicate using internal NLB DNS names:
- `user-service.internal:5001`
- `chat-service.internal:5002`
- etc.

---

## 📊 Monitoring Setup

### **CloudWatch Dashboards**

1. Create CloudWatch dashboard for each service
2. Monitor CPU, memory, request count, error rate
3. Set up alarms for:
   - High error rate (> 5%)
   - High latency (> 1s)
   - Low available memory (< 20%)

### **X-Ray Setup**

1. Enable X-Ray in ECS task definitions
2. Install X-Ray daemon sidecar
3. Configure services to send traces

### **Prometheus + Grafana**

1. Deploy Prometheus on EC2 instance
2. Configure service discovery
3. Set up Grafana dashboards

---

## 🔒 Security Checklist

- [ ] Security groups configured correctly
- [ ] IAM roles follow least privilege
- [ ] Secrets stored in Secrets Manager
- [ ] Encryption enabled for databases
- [ ] VPC Flow Logs enabled
- [ ] WAF configured for ALB
- [ ] SSL/TLS certificates configured
- [ ] Regular security audits scheduled

---

## 🚨 Troubleshooting

### **Services Not Starting**

1. Check CloudWatch logs
2. Verify security group rules
3. Check IAM role permissions
4. Verify secrets are accessible

### **High Latency**

1. Check database connection pool
2. Monitor Redis cache hit rate
3. Review Kafka consumer lag
4. Check network bandwidth

### **Connection Issues**

1. Verify security group rules
2. Check VPC route tables
3. Test connectivity from within VPC
4. Review NAT Gateway configuration

---

## 📈 Scaling

### **Manual Scaling**

```bash
aws ecs update-service \
  --cluster comconnect-prod-cluster \
  --service comconnect-prod-user-service \
  --desired-count 5
```

### **Auto Scaling**

Auto scaling is configured via Terraform. Adjust `min_capacity`, `max_capacity`, and target metrics as needed.

---

## 🔄 Updates and Rollbacks

### **Update Service**

1. Build new Docker image
2. Push to ECR
3. Update ECS service with new image
4. Monitor deployment

### **Rollback**

```bash
aws ecs update-service \
  --cluster comconnect-prod-cluster \
  --service comconnect-prod-user-service \
  --force-new-deployment \
  --task-definition <previous-task-definition-arn>
```

---

## 💰 Cost Optimization

1. **Reserved Instances**: For predictable workloads
2. **Spot Instances**: For non-critical services
3. **Right-sizing**: Monitor and adjust instance sizes
4. **S3 Lifecycle**: Move old data to Glacier
5. **CloudWatch Logs**: Set retention periods

---

## 📝 Maintenance

### **Regular Tasks**

- Weekly: Review CloudWatch metrics
- Monthly: Security audit
- Quarterly: Cost optimization review
- Annually: Disaster recovery test

---

## 🆘 Support

For issues or questions:
1. Check CloudWatch logs
2. Review Terraform state
3. Consult AWS documentation
4. Contact DevOps team

