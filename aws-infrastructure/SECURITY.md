# AWS Security Configuration

## 🔒 Security Best Practices Implemented

### **1. Network Security**

#### **VPC Isolation**
- Private subnets for microservices
- Database subnets with no internet access
- NAT Gateway for outbound internet from private subnets

#### **Security Groups**
- Least privilege principle
- Specific port access only
- No open ports to internet (except ALB)

### **2. Data Security**

#### **Encryption**
- **At Rest**: All databases encrypted
- **In Transit**: TLS/SSL for all connections
- **S3**: Server-side encryption enabled

#### **Secrets Management**
- AWS Secrets Manager for sensitive data
- No hardcoded credentials
- Automatic rotation (where applicable)

### **3. Access Control**

#### **IAM Roles**
- Service-specific IAM roles
- Least privilege policies
- No root access

#### **Network Access**
- No direct SSH access to containers
- AWS Systems Manager for secure access
- VPC endpoints for AWS services

### **4. Monitoring & Auditing**

#### **CloudWatch**
- All API calls logged
- VPC Flow Logs enabled
- CloudTrail for audit trail

#### **Alerts**
- High error rate alerts
- Unusual traffic patterns
- Failed authentication attempts

### **5. Compliance**

- **Encryption**: Meets encryption requirements
- **Backup**: Automated backups with retention
- **Audit**: Complete audit trail via CloudTrail
- **Isolation**: Network and resource isolation

## 🛡️ Security Group Rules

### **ALB Security Group**
```hcl
Inbound:
  - Port 80: 0.0.0.0/0 (HTTP)
  - Port 443: 0.0.0.0/0 (HTTPS)
Outbound:
  - All: microservices-sg
```

### **Microservices Security Group**
```hcl
Inbound:
  - Ports 5001-5006: nlb-sg (from load balancer)
  - Ports 5001-5006: microservices-sg (inter-service)
  - Port 9090: VPC CIDR (Prometheus)
Outbound:
  - Port 27017: docdb-sg (MongoDB)
  - Port 6379: elasticache-sg (Redis)
  - Ports 9092-9096: msk-sg (Kafka)
  - Port 443: 0.0.0.0/0 (external APIs)
```

### **Database Security Groups**
```hcl
DocumentDB:
  Inbound: Port 27017 from microservices-sg only
  Outbound: None

ElastiCache:
  Inbound: Port 6379 from microservices-sg only
  Outbound: None

MSK:
  Inbound: Ports 9092-9096 from microservices-sg only
  Outbound: All (for cluster communication)
```

## 🔐 IAM Policies

### **ECS Task Role** (Microservices)
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

## 🚨 Security Checklist

- [x] VPC with private subnets
- [x] Security groups with least privilege
- [x] Encryption at rest and in transit
- [x] Secrets in AWS Secrets Manager
- [x] IAM roles with minimal permissions
- [x] VPC Flow Logs enabled
- [x] CloudTrail enabled
- [x] WAF on ALB (optional)
- [x] SSL/TLS certificates
- [x] Regular security audits

## 🔍 Security Monitoring

### **CloudWatch Alarms**
- High error rate
- Unusual traffic patterns
- Failed authentication
- Resource exhaustion

### **VPC Flow Logs**
- All network traffic logged
- Anomaly detection
- Security incident investigation

### **CloudTrail**
- All API calls logged
- Audit trail
- Compliance reporting

## 📋 Regular Security Tasks

1. **Weekly**: Review CloudWatch alarms
2. **Monthly**: Security group audit
3. **Quarterly**: IAM role review
4. **Annually**: Penetration testing

