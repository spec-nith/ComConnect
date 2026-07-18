# Deployment Guide

ComConnect supports two production deployment paths:

1. Render private services with a Vercel frontend.
2. AWS ECS Fargate with CloudFront and S3.

## Render and Vercel

### Render Blueprint

Create a Render Blueprint from the repository root. Render reads
`render.yaml` and creates:

- public API gateway
- private identity, chat, message worker, task, notification, and AI orchestrator services
- private Flask AI engine with a persistent Chroma disk
- Redis-compatible Render Key Value

During the initial Blueprint flow, provide:

```text
CORS_ORIGIN=https://your-vercel-project.vercel.app
MONGO_URI=mongodb+srv://...
OPENAI_API_KEY=...
KAFKA_BROKER=...
KAFKA_USERNAME=...
KAFKA_PASSWORD=...
FIREBASE_SERVICE_ACCOUNT_JSON={...}
```

Render does not provide MongoDB or Kafka in this Blueprint. Use MongoDB Atlas
and a managed Kafka provider such as Confluent Cloud.

The gateway health URL is:

```text
https://<render-gateway>.onrender.com/health
```

### Vercel

Import the repository into Vercel. `vercel.json` builds `frontend`.

The install is deterministic: `npm ci --prefix frontend` uses the committed
frontend lockfile. `react-split-pane` is no longer a dependency. If a previous
deployment still reports it, redeploy once with the Vercel build cache cleared.

Set:

```text
REACT_APP_API_URL=https://<render-gateway>.onrender.com
REACT_APP_SOCKET_URL=https://<render-gateway>.onrender.com
```

The GitHub Actions environment `production-render-vercel` requires:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
REACT_APP_API_URL
RENDER_DEPLOY_HOOK_URLS
```

`RENDER_DEPLOY_HOOK_URLS` is a newline-separated list containing the deploy
hook for each Render service. Blueprint services also use
`autoDeployTrigger: checksPass`.

## AWS ECS Fargate

Terraform creates:

- VPC and two availability-zone subnets
- Application Load Balancer
- ECS Fargate cluster and Cloud Map private DNS
- gateway and internal services
- ECR repositories
- Multi-AZ ElastiCache Redis replication group for presence, Socket.IO, and streams
- private OpenSearch Serverless vector-search collection and VPC endpoint
- knowledge-indexer ECS service for incremental embeddings
- Secrets Manager runtime secret
- CloudWatch logs
- private S3 frontend bucket
- CloudFront distribution routing frontend and API traffic

Every deployable service has its own ECR repository and ECS task definition.
`service_desired_counts` and `service_max_counts` configure services
independently, and target-tracking CPU policies scale eligible services without
scaling the rest of the application.

The AWS AI engine uses OpenSearch Serverless instead of task-local Chroma.
Vector data therefore survives Fargate replacement and can be shared by
multiple AI-engine tasks. Existing workspaces should be backfilled through the
workspace sync API before production traffic is enabled.

### Prerequisites

- Terraform 1.6 or newer
- AWS account and deployment role
- existing S3 Terraform state bucket
- existing DynamoDB state lock table
- MongoDB Atlas
- managed Kafka bootstrap credentials

Create `infra/aws/terraform.tfvars` from the example and use an encrypted remote
state because sensitive variables are written to Terraform state.

```bash
cd infra/aws
terraform init \
  -backend-config="bucket=<state-bucket>" \
  -backend-config="key=comconnect/production.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=<lock-table>"
terraform plan
terraform apply
```

The first automated deployment bootstraps ECR repositories, pushes service
images, and then applies the complete infrastructure.

The GitHub Actions environment `production-aws` requires:

Secrets:

```text
AWS_DEPLOY_ROLE_ARN
AWS_ACCOUNT_ID
TF_STATE_BUCKET
TF_LOCK_TABLE
MONGO_URI
OPENAI_API_KEY
KAFKA_BROKER
KAFKA_USERNAME
KAFKA_PASSWORD
FIREBASE_SERVICE_ACCOUNT_JSON
```

Variables:

```text
AWS_REGION
```

The AWS workflow uses GitHub OIDC. The deployment role should trust the GitHub
repository and have the scoped permissions required for Terraform-managed
resources, ECR push, S3 sync, and CloudFront invalidation.

## Local Docker Compose

```bash
docker compose config
docker compose up --build -d
docker compose ps
```

Verify:

```bash
curl http://localhost:5000/health
curl http://localhost:5000/health/services
curl http://localhost:5001/health
```

Swagger is at `http://localhost:5000/api-docs`.

## Rollback

- Render: use service rollback in the Render dashboard.
- Vercel: promote a previous production deployment.
- AWS: rerun `deploy-aws.yml` with a known image tag or update
  `TF_VAR_image_tag` and apply Terraform.

Database migrations should remain backward-compatible during rolling
deployments because old and new ECS tasks can overlap.
