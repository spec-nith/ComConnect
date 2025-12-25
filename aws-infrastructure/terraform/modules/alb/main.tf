# Application Load Balancer

resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "prod" ? true : false

  tags = {
    Name = "${var.project_name}-${var.environment}-alb"
  }
}

# Target Group for Frontend
resource "aws_lb_target_group" "frontend" {
  name     = "${var.project_name}-${var.environment}-frontend-tg"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-frontend-tg"
  }
}

# Target Group for API Gateway
resource "aws_lb_target_group" "api_gateway" {
  name     = "${var.project_name}-${var.environment}-api-gateway-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-api-gateway-tg"
  }
}

# Target Group for WebSocket Gateway
resource "aws_lb_target_group" "websocket_gateway" {
  name     = "${var.project_name}-${var.environment}-websocket-gateway-tg"
  port     = 5007
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  # Enable sticky sessions for WebSocket connections
  stickiness {
    enabled = true
    type    = "lb_cookie"
    cookie_duration = 86400  # 24 hours
  }

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
  }

  # Connection draining
  deregistration_delay = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-websocket-gateway-tg"
  }
}

# HTTP Listener (redirects to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  count = var.certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = var.certificate_arn

  # WebSocket Gateway route (Socket.IO)
  default_action {
    type = "forward"
    forward {
      target_group {
        arn = aws_lb_target_group.websocket_gateway.arn
      }
      target_group {
        arn = aws_lb_target_group.api_gateway.arn
      }
    }
  }
}

# Listener Rule for WebSocket (Socket.IO)
resource "aws_lb_listener_rule" "websocket" {
  count = var.certificate_arn != "" ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.websocket_gateway.arn
  }

  condition {
    path_pattern {
      values = ["/socket.io/*"]
    }
  }
}

# Listener Rule for API routes
resource "aws_lb_listener_rule" "api" {
  count = var.certificate_arn != "" ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api_gateway.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

# Outputs
output "alb_arn" {
  value = aws_lb.main.arn
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "frontend_target_group_arn" {
  value = aws_lb_target_group.frontend.arn
}

output "api_gateway_target_group_arn" {
  value = aws_lb_target_group.api_gateway.arn
}

output "websocket_target_group_arn" {
  value = aws_lb_target_group.websocket_gateway.arn
  description = "WebSocket gateway target group ARN"
}

