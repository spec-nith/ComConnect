data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name                      = "comconnect-${var.environment}"
  knowledge_collection_name = substr("comconnect-${var.environment}-knowledge", 0, 32)

  services = {
    gateway = {
      port       = 5000
      repository = "gateway"
    }
    identity = {
      port       = 5101
      repository = "identity"
    }
    chat = {
      port       = 5102
      repository = "chat"
    }
    message-worker = {
      port       = 5106
      repository = "message-worker"
    }
    knowledge-indexer = {
      port       = 5107
      repository = "knowledge-indexer"
    }
    tasks = {
      port       = 5103
      repository = "tasks"
    }
    notifications = {
      port       = 5104
      repository = "notifications"
    }
    ai-orchestrator = {
      port       = 5105
      repository = "ai-orchestrator"
    }
    ai-engine = {
      port       = 5001
      repository = "ai-engine"
    }
  }

  backend_services = toset(["identity", "chat", "message-worker", "knowledge-indexer", "tasks", "notifications", "ai-orchestrator"])
  secret_keys      = ["MONGO_URI", "JWT_SECRET", "INTERNAL_SERVICE_TOKEN", "AI_SERVICE_TOKEN"]
}

resource "aws_vpc" "main" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.name}-public-${count.index + 1}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public HTTP entry point"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "${local.name}-ecs"
  description = "ECS service communication"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    from_port = 5000
    to_port   = 5200
    protocol  = "tcp"
    self      = true
  }

  ingress {
    from_port = 6379
    to_port   = 6379
    protocol  = "tcp"
    self      = true
  }

  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "gateway" {
  name               = substr("${local.name}-alb", 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "gateway" {
  name        = substr("${local.name}-gateway", 0, 32)
  port        = 5000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 20
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.gateway.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gateway.arn
  }
}

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "comconnect.local"
  description = "ComConnect internal services"
  vpc         = aws_vpc.main.id
}

resource "aws_service_discovery_service" "service" {
  for_each = local.services
  name     = each.key

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_ecr_repository" "repository" {
  for_each             = toset([for service in values(local.services) : service.repository])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "repository" {
  for_each   = aws_ecr_repository.repository
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 20 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "internal" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "runtime" {
  name = "${local.name}/runtime"
}

resource "aws_secretsmanager_secret_version" "runtime" {
  secret_id = aws_secretsmanager_secret.runtime.id
  secret_string = jsonencode({
    MONGO_URI                     = var.mongo_uri
    JWT_SECRET                    = random_password.jwt.result
    INTERNAL_SERVICE_TOKEN        = random_password.internal.result
    AI_SERVICE_TOKEN              = random_password.internal.result
    OPENAI_API_KEY                = var.openai_api_key
    KAFKA_BROKER                  = var.kafka_broker
    KAFKA_USERNAME                = var.kafka_username
    KAFKA_PASSWORD                = var.kafka_password
    FIREBASE_SERVICE_ACCOUNT_JSON = var.firebase_service_account_json
  })
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "secrets" {
  name = "read-runtime-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.runtime.arn
    }]
  })
}

resource "aws_iam_role" "task" {
  name = "${local.name}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role" "ai_task" {
  name = "${local.name}-ai-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_opensearchserverless_vpc_endpoint" "knowledge" {
  name               = local.knowledge_collection_name
  vpc_id             = aws_vpc.main.id
  subnet_ids         = aws_subnet.public[*].id
  security_group_ids = [aws_security_group.ecs.id]
}

resource "aws_opensearchserverless_security_policy" "knowledge_encryption" {
  name = local.knowledge_collection_name
  type = "encryption"
  policy = jsonencode({
    Rules = [{
      ResourceType = "collection"
      Resource     = ["collection/${local.knowledge_collection_name}"]
    }]
    AWSOwnedKey = true
  })
}

resource "aws_opensearchserverless_security_policy" "knowledge_network" {
  name = local.knowledge_collection_name
  type = "network"
  policy = jsonencode([{
    Rules = [{
      ResourceType = "collection"
      Resource     = ["collection/${local.knowledge_collection_name}"]
    }]
    AllowFromPublic = false
    SourceVPCEs     = [aws_opensearchserverless_vpc_endpoint.knowledge.id]
  }])
}

resource "aws_opensearchserverless_collection" "knowledge" {
  name = local.knowledge_collection_name
  type = "VECTORSEARCH"

  depends_on = [
    aws_opensearchserverless_security_policy.knowledge_encryption,
    aws_opensearchserverless_security_policy.knowledge_network,
  ]
}

resource "aws_opensearchserverless_access_policy" "knowledge" {
  name = local.knowledge_collection_name
  type = "data"
  policy = jsonencode([{
    Rules = [
      {
        ResourceType = "collection"
        Resource     = ["collection/${local.knowledge_collection_name}"]
        Permission = [
          "aoss:DescribeCollectionItems",
          "aoss:CreateCollectionItems",
          "aoss:UpdateCollectionItems",
        ]
      },
      {
        ResourceType = "index"
        Resource     = ["index/${local.knowledge_collection_name}/*"]
        Permission = [
          "aoss:CreateIndex",
          "aoss:UpdateIndex",
          "aoss:DescribeIndex",
          "aoss:ReadDocument",
          "aoss:WriteDocument",
        ]
      }
    ]
    Principal = [aws_iam_role.ai_task.arn]
  }])
}

resource "aws_iam_role_policy" "ai_opensearch" {
  name = "access-knowledge-opensearch"
  role = aws_iam_role.ai_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["aoss:APIAccessAll"]
      Resource = aws_opensearchserverless_collection.knowledge.arn
    }]
  })
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = 30
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.public[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = substr("${local.name}-redis", 0, 40)
  description                = "ComConnect presence, Socket.IO adapter, and message streams"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t4g.micro"
  num_cache_clusters         = 2
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.ecs.id]
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  snapshot_retention_limit   = 7
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.services
  family                   = "${local.name}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.key == "ai-engine" ? 1024 : 512
  memory                   = each.key == "ai-engine" ? 2048 : 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn = each.key == "ai-engine" ? (
    aws_iam_role.ai_task.arn
  ) : aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = each.key
    image     = "${aws_ecr_repository.repository[each.value.repository].repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{
      containerPort = each.value.port
      hostPort      = each.value.port
      protocol      = "tcp"
    }]
    environment = concat(
      [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(each.value.port) },
        { name = "CORS_ORIGIN", value = var.cors_origin },
        { name = "REDIS_HOST", value = aws_elasticache_replication_group.redis.primary_endpoint_address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "PRESENCE_TTL_SECONDS", value = "75" },
        { name = "MESSAGE_STREAM_KEY", value = "chat:messages" },
        { name = "MESSAGE_STREAM_CONSUMER_GROUP", value = "message-persistence" },
        { name = "MESSAGE_PERSIST_TIMEOUT_MS", value = "10000" },
        { name = "KNOWLEDGE_STREAM_KEY", value = "workspace:knowledge" },
        { name = "KNOWLEDGE_DLQ_STREAM_KEY", value = "workspace:knowledge:dead-letter" },
        { name = "KNOWLEDGE_STREAM_CONSUMER_GROUP", value = "knowledge-indexing" },
        { name = "KNOWLEDGE_BACKFILL_BATCH_SIZE", value = "200" },
        { name = "KNOWLEDGE_BACKFILL_LEASE_MS", value = "600000" },
        { name = "IDENTITY_SERVICE_URL", value = "http://identity.comconnect.local:5101" },
        { name = "CHAT_SERVICE_URL", value = "http://chat.comconnect.local:5102" },
        { name = "TASK_SERVICE_URL", value = "http://tasks.comconnect.local:5103" },
        { name = "NOTIFICATION_SERVICE_URL", value = "http://notifications.comconnect.local:5104" },
        { name = "AI_ORCHESTRATOR_URL", value = "http://ai-orchestrator.comconnect.local:5105" },
        { name = "AI_SERVICE_URL", value = "http://ai-engine.comconnect.local:5001" },
        { name = "MESSAGE_WORKER_SERVICE_URL", value = "http://message-worker.comconnect.local:5106" },
        { name = "KAFKA_SSL", value = "true" }
      ],
      each.key == "ai-engine" ? [
        { name = "OPENAI_MODEL", value = "gpt-4.1-mini" },
        { name = "OPENAI_EMBEDDING_MODEL", value = "text-embedding-3-small" },
        { name = "EMBEDDING_DIMENSIONS", value = "1536" },
        { name = "VECTOR_STORE_BACKEND", value = "opensearch" },
        { name = "AI_WORKERS", value = "2" },
        { name = "OPENSEARCH_ENDPOINT", value = aws_opensearchserverless_collection.knowledge.collection_endpoint },
        { name = "OPENSEARCH_INDEX", value = "comconnect-knowledge" },
        { name = "RETRIEVAL_CANDIDATE_LIMIT", value = "40" },
        { name = "RRF_K", value = "60" },
        { name = "AI_MODEL_TIMEOUT_SECONDS", value = "60" },
        { name = "AI_AGENT_RECURSION_LIMIT", value = "12" },
        { name = "AWS_REGION", value = var.aws_region }
      ] : []
    )
    secrets = concat(
      contains(local.backend_services, each.key) ? [
        for key in local.secret_keys : {
          name      = key
          valueFrom = "${aws_secretsmanager_secret.runtime.arn}:${key}::"
        }
      ] : [],
      each.key == "notifications" ? [
        for key in ["KAFKA_BROKER", "KAFKA_USERNAME", "KAFKA_PASSWORD", "FIREBASE_SERVICE_ACCOUNT_JSON"] : {
          name      = key
          valueFrom = "${aws_secretsmanager_secret.runtime.arn}:${key}::"
        }
      ] : [],
      each.key == "ai-engine" ? [
        for key in ["AI_SERVICE_TOKEN", "OPENAI_API_KEY"] : {
          name      = key
          valueFrom = "${aws_secretsmanager_secret.runtime.arn}:${key}::"
        }
      ] : []
    )
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "service"
      }
    }
    healthCheck = {
      command     = each.key == "ai-engine" ? ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:5001/health')\" || exit 1"] : ["CMD-SHELL", "node -e \"fetch('http://localhost:${each.value.port}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])

  depends_on = [
    aws_secretsmanager_secret_version.runtime,
    aws_opensearchserverless_access_policy.knowledge,
    aws_iam_role_policy.ai_opensearch,
  ]
}

resource "aws_ecs_service" "service" {
  for_each        = local.services
  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count = lookup(
    var.service_desired_counts,
    each.key,
    var.desired_count
  )
  launch_type = "FARGATE"

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  enable_execute_command             = true

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.service[each.key].arn
  }

  dynamic "load_balancer" {
    for_each = each.key == "gateway" ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.gateway.arn
      container_name   = "gateway"
      container_port   = 5000
    }
  }

  depends_on = [aws_lb_listener.http]
}

resource "aws_appautoscaling_target" "ecs" {
  for_each = local.services

  max_capacity = lookup(
    var.service_max_counts,
    each.key,
    lookup(var.service_desired_counts, each.key, var.desired_count)
  )
  min_capacity = lookup(
    var.service_desired_counts,
    each.key,
    var.desired_count
  )
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.service[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = {
    for name, service in local.services : name => service
    if lookup(var.service_max_counts, name, 1) >
    lookup(var.service_desired_counts, name, var.desired_count)
  }

  name               = "${local.name}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 65
    scale_in_cooldown  = 120
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_s3_bucket" "frontend" {
  bucket_prefix = "${local.name}-frontend-"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name}-frontend"
  description                       = "Private S3 access for ComConnect"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    domain_name = aws_lb.gateway.dns_name
    origin_id   = "api-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true
  }

  dynamic "ordered_cache_behavior" {
    for_each = toset(["/api/*", "/socket.io/*", "/health*", "/api-docs*", "/openapi.json"])
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "api-alb"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
      compress                 = true
    }
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "frontend" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend.json
}
