# S3 Buckets

# Application files bucket
resource "aws_s3_bucket" "app_files" {
  bucket = "${var.project_name}-${var.environment}-files"

  tags = {
    Name = "${var.project_name}-${var.environment}-files"
  }
}

resource "aws_s3_bucket_versioning" "app_files" {
  bucket = aws_s3_bucket.app_files.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app_files" {
  bucket = aws_s3_bucket.app_files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "app_files" {
  bucket = aws_s3_bucket.app_files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Terraform state bucket (if not using existing)
resource "aws_s3_bucket" "terraform_state" {
  bucket = "${var.project_name}-terraform-state"

  tags = {
    Name = "${var.project_name}-terraform-state"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Media bucket for user uploads (images, videos, documents)
resource "aws_s3_bucket" "media" {
  bucket = "${var.project_name}-${var.environment}-media"

  tags = {
    Name = "${var.project_name}-${var.environment}-media"
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Public read access for media (via CloudFront)
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# CloudFront Origin Access Identity for media bucket
resource "aws_cloudfront_origin_access_identity" "media" {
  comment = "OAI for ${var.project_name}-${var.environment}-media"
}

# Bucket policy for CloudFront access
resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontAccess"
        Effect    = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.media.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.media.arn}/*"
      }
    ]
  })

  depends_on = [aws_cloudfront_origin_access_identity.media]
}

# CORS configuration for media bucket
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

