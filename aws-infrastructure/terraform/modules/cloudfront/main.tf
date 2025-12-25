# CloudFront Distribution for Media CDN

# CloudFront Origin Access Identity (created in S3 module, referenced here)
data "aws_cloudfront_origin_access_identity" "media" {
  id = var.media_oai_id
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "media" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CloudFront distribution for ${var.project_name} media"
  default_root_object = "index.html"

  origin {
    domain_name = var.s3_bucket_domain_name
    origin_id   = "S3-${var.project_name}-${var.environment}-media"

    s3_origin_config {
      origin_access_identity = data.aws_cloudfront_origin_access_identity.media.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.project_name}-${var.environment}-media"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # Cache behavior for images
  ordered_cache_behavior {
    path_pattern     = "images/*"
    target_origin_id = "S3-${var.project_name}-${var.environment}-media"

    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    compress         = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400  # 1 day
    max_ttl     = 31536000  # 1 year
  }

  # Cache behavior for videos
  ordered_cache_behavior {
    path_pattern     = "videos/*"
    target_origin_id = "S3-${var.project_name}-${var.environment}-media"

    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    compress         = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600  # 1 hour
    max_ttl     = 86400  # 1 day
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    # For custom domain, use:
    # acm_certificate_arn      = var.certificate_arn
    # ssl_support_method       = "sni-only"
    # minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-media-cdn"
    Environment = var.environment
  }
}

