output "app_files_bucket_name" {
  value = aws_s3_bucket.app_files.id
}

output "terraform_state_bucket_name" {
  value = aws_s3_bucket.terraform_state.id
}

output "media_bucket_name" {
  value = aws_s3_bucket.media.id
}

output "media_bucket_domain_name" {
  value = aws_s3_bucket.media.bucket_domain_name
}

output "media_bucket_arn" {
  value = aws_s3_bucket.media.arn
}

output "media_oai_id" {
  value = aws_cloudfront_origin_access_identity.media.id
}

output "media_oai_iam_arn" {
  value = aws_cloudfront_origin_access_identity.media.iam_arn
}

