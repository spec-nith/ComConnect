/**
 * CDN Configuration
 * Production-ready CDN setup for media assets
 */

class CDNConfig {
  constructor() {
    this.cdnDomain = process.env.CDN_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN || "";
    this.s3Bucket = process.env.AWS_S3_BUCKET_NAME || "comconnect-media";
    this.awsRegion = process.env.AWS_REGION || "us-east-1";
    this.useCDN = !!this.cdnDomain;
  }

  /**
   * Get the full URL for a media asset
   * @param {string} s3Key - The S3 key/path of the asset
   * @returns {string} - Full CDN URL or S3 URL
   */
  getMediaUrl(s3Key) {
    if (!s3Key) return null;

    // If CDN is configured, use it
    if (this.useCDN) {
      return `https://${this.cdnDomain}/${s3Key}`;
    }

    // Fallback to S3 direct URL
    return `https://${this.s3Bucket}.s3.${this.awsRegion}.amazonaws.com/${s3Key}`;
  }

  /**
   * Get thumbnail URL (if available)
   * @param {string} s3Key - The S3 key/path of the asset
   * @param {string} thumbnailKey - Optional thumbnail S3 key
   * @returns {string} - Full CDN URL for thumbnail
   */
  getThumbnailUrl(s3Key, thumbnailKey = null) {
    if (thumbnailKey) {
      return this.getMediaUrl(thumbnailKey);
    }

    // Generate thumbnail path from original key
    if (s3Key) {
      const parts = s3Key.split("/");
      const filename = parts.pop();
      const thumbnailKey = [...parts, "thumbnails", filename].join("/");
      return this.getMediaUrl(thumbnailKey);
    }

    return null;
  }

  /**
   * Check if CDN is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.useCDN;
  }

  /**
   * Get CDN domain
   * @returns {string}
   */
  getDomain() {
    return this.cdnDomain;
  }
}

// Export singleton instance
const cdnConfig = new CDNConfig();
module.exports = cdnConfig;

