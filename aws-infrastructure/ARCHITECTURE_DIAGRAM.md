# AWS Infrastructure Architecture Diagram

## Complete Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │   Route 53      │ (DNS)
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  CloudFront     │ (CDN)
                    └────────┬───────┘
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │  Application Load Balancer (ALB)           │
        │  Security Group: alb-sg                     │
        │  Ports: 80, 443                            │
        └────────┬───────────────────────────────────┘
                 │
        ┌────────┴────────┬──────────────┬──────────────┐
        │                 │              │              │
        ▼                 ▼              ▼              ▼
   ┌─────────┐      ┌──────────┐   ┌──────────┐   ┌──────────┐
   │Frontend │      │API Gateway│  │WebSocket │   │  ...     │
   │Target   │      │Target     │  │Target    │   │          │
   │Group    │      │Group      │  │Group     │   │          │
   └────┬────┘      └─────┬─────┘  └────┬─────┘   └──────────┘
        │                 │              │
        │                 │              │
        ▼                 ▼              ▼
   ┌─────────┐      ┌──────────┐   ┌──────────┐
   │Frontend │      │API       │   │Message   │
   │EC2 ASG  │      │Gateway   │   │Service   │
   │         │      │EC2 ASG   │   │ECS       │
   └─────────┘      └─────┬────┘   └──────────┘
                          │
                          ▼
        ┌────────────────────────────────────────────┐
        │  Internal Network Load Balancer (NLB)      │
        │  Security Group: nlb-sg                    │
        │  Ports: 5001-5006                          │
        └────────┬───────────────────────────────────┘
                 │
        ┌────────┴──────────────────────────────────┐
        │                                            │
        ▼                                            ▼
┌──────────────┐                            ┌──────────────┐
│User Service  │                            │Chat Service  │
│ECS Fargate   │                            │ECS Fargate   │
│Port: 5001    │                            │Port: 5002    │
│SG: micro-   │                            │SG: micro-    │
│   services  │                            │   services   │
└──────┬──────┘                            └──────┬───────┘
       │                                           │
       │                                           │
       ▼                                           ▼
┌──────────────┐                            ┌──────────────┐
│Message       │                            │Workspace     │
│Service       │                            │Service       │
│ECS Fargate   │                            │ECS Fargate   │
│Port: 5003    │                            │Port: 5004    │
└──────┬───────┘                            └──────┬───────┘
       │                                           │
       │                                           │
       ▼                                           ▼
┌──────────────┐                            ┌──────────────┐
│Task Service  │                            │Notification  │
│ECS Fargate   │                            │Service       │
│Port: 5005    │                            │ECS Fargate   │
│              │                            │Port: 5006    │
└──────┬───────┘                            └──────┬───────┘
       │                                           │
       └───────────────┬───────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────┐            ┌──────────────┐
│DocumentDB    │            │ElastiCache   │
│(MongoDB)     │            │Redis         │
│Port: 27017   │            │Port: 6379    │
│SG: docdb-sg  │            │SG: redis-sg  │
└──────────────┘            └──────┬───────┘
                                    │
                                    ▼
                            ┌──────────────┐
                            │Amazon MSK    │
                            │(Kafka)       │
                            │Port: 9092-   │
                            │     9096     │
                            │SG: msk-sg    │
                            └──────────────┘
```

## VPC Structure

```
VPC: 10.0.0.0/16
│
├── Availability Zone: us-east-1a
│   ├── Public Subnet: 10.0.1.0/24
│   │   ├── NAT Gateway
│   │   └── ALB
│   ├── Private Subnet: 10.0.10.0/24
│   │   ├── ECS Services
│   │   └── NLB
│   └── Database Subnet: 10.0.20.0/24
│       ├── DocumentDB
│       ├── ElastiCache
│       └── MSK
│
└── Availability Zone: us-east-1b
    ├── Public Subnet: 10.0.2.0/24
    │   ├── NAT Gateway
    │   └── ALB
    ├── Private Subnet: 10.0.11.0/24
    │   ├── ECS Services
    │   └── NLB
    └── Database Subnet: 10.0.21.0/24
        ├── DocumentDB
        ├── ElastiCache
        └── MSK
```

## Security Group Rules

### ALB Security Group
```
Inbound:
  - Port 80 from 0.0.0.0/0
  - Port 443 from 0.0.0.0/0
Outbound:
  - All to microservices-sg
```

### Microservices Security Group
```
Inbound:
  - Ports 5001-5006 from nlb-sg
  - Ports 5001-5006 from microservices-sg (inter-service)
  - Port 9090 from VPC CIDR (Prometheus)
Outbound:
  - Port 27017 to docdb-sg
  - Port 6379 to redis-sg
  - Ports 9092-9096 to msk-sg
  - Port 443 to 0.0.0.0/0 (external APIs)
```

### DocumentDB Security Group
```
Inbound:
  - Port 27017 from microservices-sg
Outbound:
  - None
```

### ElastiCache Security Group
```
Inbound:
  - Port 6379 from microservices-sg
Outbound:
  - None
```

### MSK Security Group
```
Inbound:
  - Ports 9092-9096 from microservices-sg
  - Port 2181 from msk-sg (Zookeeper)
Outbound:
  - All
```

## Service Communication Flow

1. **Client Request** → Route 53 → CloudFront → ALB
2. **ALB** → Routes to API Gateway (port 80)
3. **API Gateway** → Routes to Internal NLB
4. **NLB** → Routes to appropriate microservice (ports 5001-5006)
5. **Microservice** → Communicates with:
   - DocumentDB (MongoDB)
   - ElastiCache (Redis)
   - MSK (Kafka)
   - Other microservices via NLB

## High Availability

- **Multi-AZ**: All services deployed across 2+ availability zones
- **Auto Scaling**: ECS services auto-scale based on CPU/memory
- **Load Balancing**: ALB and NLB distribute traffic
- **Database Replication**: DocumentDB and ElastiCache with multi-AZ
- **Backup**: Automated backups for databases

