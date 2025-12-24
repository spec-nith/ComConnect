# CloudWatch Log Groups

locals {
  services = [
    "user-service",
    "chat-service",
    "message-service",
    "workspace-service",
    "task-service",
    "notification-service",
    "api-gateway"
  ]
}

resource "aws_cloudwatch_log_group" "services" {
  for_each = toset(local.services)

  name              = "/${var.project_name}/${var.environment}/${each.key}"
  retention_in_days = 30

  tags = {
    Name        = "${var.project_name}-${var.environment}-${each.key}-logs"
    Service     = each.key
    Environment = var.environment
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  for_each = toset(local.services)

  alarm_name          = "${var.project_name}-${var.environment}-${each.key}-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ErrorRate"
  namespace           = "${var.project_name}/${var.environment}"
  period              = 300
  statistic           = "Average"
  threshold           = 5.0
  alarm_description   = "This metric monitors error rate for ${each.key}"

  tags = {
    Service = each.key
  }
}

