output "api_load_balancer_url" {
  value = "http://${aws_lb.gateway.dns_name}"
}

output "application_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "ecr_repositories" {
  value = {
    for name, repository in aws_ecr_repository.repository :
    name => repository.repository_url
  }
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "knowledge_opensearch_endpoint" {
  value = aws_opensearchserverless_collection.knowledge.collection_endpoint
}
