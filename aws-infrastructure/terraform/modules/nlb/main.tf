# Internal Network Load Balancer

resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.environment}-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = var.private_subnet_ids

  enable_deletion_protection = var.environment == "prod" ? true : false

  tags = {
    Name = "${var.project_name}-${var.environment}-nlb"
  }
}

# Outputs
output "nlb_arn" {
  value = aws_lb.main.arn
}

output "nlb_dns_name" {
  value = aws_lb.main.dns_name
}

