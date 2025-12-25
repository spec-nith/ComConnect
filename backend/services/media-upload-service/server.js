const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const authMiddleware = require("./middleware/authMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");
const { tracingMiddleware } = require("../shared/middleware/tracing");
const { metricsMiddleware, register } = require("../shared/middleware/metrics");
require("dotenv").config();

const app = express();
const PORT = process.env.MEDIA_UPLOAD_SERVICE_PORT || 5008;

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
  signatureVersion: "v4",
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "comconnect-media";
const CDN_DOMAIN = process.env.CDN_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN || "";

// Configure multer for memory storage (we'll upload directly to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "video/x-msvideo",
      "application/pdf",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images, videos, and PDFs are allowed."), false);
    }
  },
});

// Middleware
app.use(express.json());
app.use(tracingMiddleware);
app.use(metricsMiddleware);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "media-upload-service",
    timestamp: new Date().toISOString(),
  });
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

/**
 * Upload single file to S3
 * POST /api/media/upload
 */
app.post(
  "/api/media/upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const file = req.file;
      const userId = req.user.id || req.user._id;
      const fileType = file.mimetype.startsWith("image/") ? "image" : file.mimetype.startsWith("video/") ? "video" : "document";
      
      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const fileName = `${fileType}s/${userId}/${uuidv4()}${fileExtension}`;

      // Upload to S3
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read", // For public access via CDN
        Metadata: {
          originalName: file.originalname,
          uploadedBy: userId.toString(),
          uploadedAt: new Date().toISOString(),
        },
      };

      const uploadResult = await s3.upload(uploadParams).promise();

      // Generate CDN URL or S3 URL
      const mediaUrl = CDN_DOMAIN
        ? `https://${CDN_DOMAIN}/${fileName}`
        : uploadResult.Location;

      res.status(200).json({
        success: true,
        media: {
          id: uuidv4(),
          url: mediaUrl,
          s3Key: fileName,
          type: fileType,
          mimeType: file.mimetype,
          size: file.size,
          originalName: file.originalname,
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).json({ error: "Failed to upload file", message: error.message });
    }
  }
);

/**
 * Upload multiple files to S3
 * POST /api/media/upload-multiple
 */
app.post(
  "/api/media/upload-multiple",
  authMiddleware,
  upload.array("files", 10), // Max 10 files
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      const userId = req.user.id || req.user._id;
      const uploadResults = [];

      for (const file of req.files) {
        try {
          const fileType = file.mimetype.startsWith("image/")
            ? "image"
            : file.mimetype.startsWith("video/")
            ? "video"
            : "document";
          
          const fileExtension = path.extname(file.originalname);
          const fileName = `${fileType}s/${userId}/${uuidv4()}${fileExtension}`;

          const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: file.buffer,
            ContentType: file.mimetype,
            ACL: "public-read",
            Metadata: {
              originalName: file.originalname,
              uploadedBy: userId.toString(),
              uploadedAt: new Date().toISOString(),
            },
          };

          const uploadResult = await s3.upload(uploadParams).promise();
          const mediaUrl = CDN_DOMAIN
            ? `https://${CDN_DOMAIN}/${fileName}`
            : uploadResult.Location;

          uploadResults.push({
            id: uuidv4(),
            url: mediaUrl,
            s3Key: fileName,
            type: fileType,
            mimeType: file.mimetype,
            size: file.size,
            originalName: file.originalname,
            uploadedBy: userId,
            uploadedAt: new Date().toISOString(),
          });
        } catch (error) {
          console.error(`❌ Failed to upload ${file.originalname}:`, error);
          uploadResults.push({
            error: `Failed to upload ${file.originalname}`,
            message: error.message,
          });
        }
      }

      res.status(200).json({
        success: true,
        media: uploadResults,
      });
    } catch (error) {
      console.error("❌ Multiple upload error:", error);
      res.status(500).json({ error: "Failed to upload files", message: error.message });
    }
  }
);

/**
 * Delete file from S3
 * DELETE /api/media/:s3Key
 */
app.delete("/api/media/:s3Key", authMiddleware, async (req, res) => {
  try {
    const s3Key = decodeURIComponent(req.params.s3Key);
    const userId = req.user.id || req.user._id;

    // Verify the file belongs to the user (check S3 key path)
    if (!s3Key.includes(`/${userId}/`)) {
      return res.status(403).json({ error: "Unauthorized to delete this file" });
    }

    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
    };

    await s3.deleteObject(deleteParams).promise();

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete error:", error);
    res.status(500).json({ error: "Failed to delete file", message: error.message });
  }
});

/**
 * Get presigned URL for direct client upload (optional, for large files)
 * GET /api/media/presigned-url
 */
app.get("/api/media/presigned-url", authMiddleware, async (req, res) => {
  try {
    const { fileName, fileType, contentType } = req.query;

    if (!fileName || !fileType || !contentType) {
      return res.status(400).json({ error: "fileName, fileType, and contentType are required" });
    }

    const userId = req.user.id || req.user._id;
    const fileExtension = path.extname(fileName);
    const s3Key = `${fileType}s/${userId}/${uuidv4()}${fileExtension}`;

    const presignedUrl = s3.getSignedUrl("putObject", {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
      ACL: "public-read",
      Expires: 3600, // 1 hour
    });

    const mediaUrl = CDN_DOMAIN
      ? `https://${CDN_DOMAIN}/${s3Key}`
      : `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${s3Key}`;

    res.status(200).json({
      success: true,
      presignedUrl,
      s3Key,
      mediaUrl,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error("❌ Presigned URL error:", error);
    res.status(500).json({ error: "Failed to generate presigned URL", message: error.message });
  }
});

// Error handling middleware
app.use(errorMiddleware);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Media Upload Service running on port ${PORT}`);
  console.log(`📦 S3 Bucket: ${BUCKET_NAME}`);
  console.log(`🌐 CDN Domain: ${CDN_DOMAIN || "Not configured"}`);
});

