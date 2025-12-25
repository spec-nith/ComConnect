output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.media.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.media.domain_name
}

output "cloudfront_arn" {
  value = aws_cloudfront_distribution.media.arn
}

