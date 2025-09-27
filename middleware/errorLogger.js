// middleware/errorLogger.js
const Log = require("../models/Log");

const errorLogger = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const logData = {
    timestamp: new Date(),
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("User-Agent"),
    userId: req.student?._id || null,
    userEmail: req.student?.email || null,
    userRole: req.student?.role || "anonymous",
    statusCode: err.statusCode || 500,
    statusMessage: err.message || "Internal Server Error",
    responseTime: Date.now() - req.startTime,
    requestHeaders: sanitizeHeaders(req.headers),
    requestBody: req.method === "GET" ? undefined : sanitizeBody(req.body),
    queryParams: Object.keys(req.query).length > 0 ? req.query : undefined,
    error: {
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
      name: err.name,
      code: err.statusCode || 500,
      operational: err.isOperational || false,
    },
    isError: true,
  };

  // Save error log
  Log.create(logData).catch((logErr) => {
    console.error("Failed to save error log:", logErr);
  });

  next(err);
};

// Reuse sanitize functions from logger
function sanitizeHeaders(headers) {
  const sensitiveHeaders = ["authorization", "cookie", "password", "token"];
  const sanitized = {};

  Object.keys(headers).forEach((header) => {
    if (sensitiveHeaders.some((h) => header.toLowerCase().includes(h))) {
      sanitized[header] = "***REDACTED***";
    } else {
      sanitized[header] = headers[header];
    }
  });

  return sanitized;
}

function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;

  const sensitiveFields = ["password", "token", "authorization"];
  const sanitized = JSON.parse(JSON.stringify(body));

  sensitiveFields.forEach((field) => {
    if (sanitized[field]) sanitized[field] = "***REDACTED***";
  });

  return sanitized;
}

module.exports = errorLogger;
