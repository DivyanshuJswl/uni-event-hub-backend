// middleware/logger.js
const Log = require("../models/log");

const apiLogger = async (req, res, next) => {
  const start = Date.now();

  // Store original response methods
  const originalSend = res.send;
  const originalJson = res.json;

  let responseBody = "";
  let responseSize = 0;

  // Override res.send to capture response body
  res.send = function (body) {
    responseBody = typeof body === "string" ? body : JSON.stringify(body);
    responseSize = Buffer.byteLength(responseBody, "utf8");
    return originalSend.call(this, body);
  };

  // Override res.json to capture response body
  res.json = function (body) {
    responseBody = JSON.stringify(body);
    responseSize = Buffer.byteLength(responseBody, "utf8");
    return originalJson.call(this, body);
  };

  res.on("finish", async () => {
    try {
      // Skip logging for 304 Not Modified responses
      if (res.statusCode === 304) {
        return;
      }

      // Skip logging for very large responses (like file downloads)
      if (responseSize > 100000) {
        // 100KB limit
        responseBody = "***RESPONSE_TOO_LARGE***";
      }

      const duration = Date.now() - start;

      // Extract user information from auth middleware
      const user = req.student || null;

      const logData = {
        timestamp: new Date(),
        method: req.method,
        url: req.originalUrl,
        path: req.path, // Just the path without query params
        ip: getClientIP(req),
        userAgent: req.get("User-Agent"),
        userId: user?._id || null,
        userEmail: user?.email || null,
        userRole: user?.role || "anonymous",
        statusCode: res.statusCode,
        statusMessage: res.statusMessage || getStatusMessage(res.statusCode),
        responseTime: duration,
        responseSize: responseSize,
        requestHeaders: sanitizeHeaders(req.headers),
        requestBody: req.method === "GET" ? undefined : sanitizeBody(req.body),
        responseBody: sanitizeResponseBody(responseBody, res.statusCode),
        queryParams: Object.keys(req.query).length > 0 ? req.query : undefined,
        routeParams:
          Object.keys(req.params).length > 0 ? req.params : undefined,
        error:
          res.statusCode >= 400
            ? {
                message: responseBody?.message || "Unknown error",
                code: res.statusCode,
              }
            : undefined,
      };

      // Skip logging health checks and static files
      if (shouldSkipLogging(logData)) {
        return;
      }

      // Save log to database (non-blocking)
      Log.create(logData).catch((err) => {
        console.error("Failed to save log:", err);
      });

      // Console log for development
      if (process.env.NODE_ENV === "development") {
        console.log(formatConsoleLog(logData));
      }
    } catch (error) {
      console.error("Logging error:", error);
    }
  });

  next();
};

// Helper function to get client IP
function getClientIP(req) {
  return (
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
    "unknown"
  );
}

// Helper function to determine if we should skip logging
function shouldSkipLogging(logData) {
  const skipPaths = [
    "/health",
    "/favicon.ico",
    "/robots.txt",
    "/static/",
    "/uploads/",
  ];

  return skipPaths.some((path) => logData.url.includes(path));
}

// Helper function to sanitize response body (limit size and remove sensitive data)
function sanitizeResponseBody(body, statusCode) {
  if (!body || body === "{}" || body === "") return undefined;

  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    const sanitized = sanitizeBody(parsed);

    // For large successful responses, only keep summary
    if (statusCode < 400) {
      if (sanitized.data && sanitized.data.events) {
        return {
          status: sanitized.status,
          results: sanitized.results,
          data: {
            events: `Array of ${sanitized.data.events.length} events`,
          },
        };
      }

      if (sanitized.data && sanitized.data.student) {
        return {
          status: sanitized.status,
          data: {
            student: {
              id: sanitized.data.student.id,
              name: sanitized.data.student.name,
              email: "***REDACTED***", // Redact email in logs
            },
          },
        };
      }
    }

    return sanitized;
  } catch (error) {
    // If not JSON, return truncated string
    return typeof body === "string" ? body.substring(0, 500) + "..." : body;
  }
}

// Improved sanitizeBody function
function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;

  const sensitiveFields = [
    "password",
    "token",
    "authorization",
    "refreshToken",
    "accessToken",
    "creditCard",
    "cvv",
    "email",
    "phone",
  ];

  const sanitized = JSON.parse(JSON.stringify(body));

  const redactSensitive = (obj) => {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        const lowerKey = key.toLowerCase();

        // Check if key contains sensitive terms
        if (sensitiveFields.some((field) => lowerKey.includes(field))) {
          obj[key] = "***REDACTED***";
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          redactSensitive(obj[key]);
        }
      }
    }
  };

  redactSensitive(sanitized);
  return sanitized;
}

// Improved sanitizeHeaders function
function sanitizeHeaders(headers) {
  const sensitiveHeaders = [
    "authorization",
    "cookie",
    "password",
    "token",
    "x-auth-token",
    "x-api-key",
    "proxy-authorization",
  ];

  const sanitized = {};

  Object.keys(headers).forEach((header) => {
    const lowerHeader = header.toLowerCase();

    if (sensitiveHeaders.some((sensitive) => lowerHeader.includes(sensitive))) {
      sanitized[header] = "***REDACTED***";
    } else {
      sanitized[header] = headers[header];
    }
  });

  return sanitized;
}

// Helper function for status messages
function getStatusMessage(statusCode) {
  const messages = {
    200: "OK",
    201: "Created",
    204: "No Content",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    500: "Internal Server Error",
  };

  return messages[statusCode] || "Unknown";
}

// Format console log
function formatConsoleLog(logData) {
  const statusColor =
    logData.statusCode >= 400
      ? "\x1b[31m" // red for errors
      : logData.statusCode >= 300
      ? "\x1b[33m" // yellow for redirects
      : "\x1b[32m"; // green for success

  const resetColor = "\x1b[0m";

  return `${statusColor}[${logData.timestamp.toISOString()}] ${
    logData.method
  } ${logData.url} ${logData.statusCode} - ${logData.responseTime}ms - User: ${
    logData.userEmail || "Anonymous"
  }${resetColor}`;
}

module.exports = { apiLogger };
