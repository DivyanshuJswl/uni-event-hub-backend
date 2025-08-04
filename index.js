require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const path = require("path");
const compression = require("compression");
const connectDB = require("./config/connectdb");

// Import routes
const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");
const walletRoutes = require("./routes/walletRoutes");
const adminRoutes = require("./routes/adminRoutes");
const roleRoutes = require("./routes/roleRoutes");

// Import error handlers
const AppError = require("./utils/appError");
const globalErrorHandler = require("./middleware/errorMiddleware");

// Initialize Express app
const app = express();

// ===== GLOBAL MIDDLEWARES =====
app.use(helmet());
app.use(compression());

// Development logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.set("trust proxy", 1); // trust first proxy

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 300,
  message: "Too many requests from this IP, please try again in an hour!",
  skipSuccessfulRequests: true,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts, please try again later!",
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// Data sanitization
app.use(mongoSanitize());
app.use(xss());

// Prevent parameter pollution
app.use(
  hpp({
    whitelist: ["category", "date", "status"],
  })
);

// Enhanced CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "https://uni-event-hub-frontend.vercel.app",
  "https://uni-event-oauth.el.r.appspot.com",
  "https://uni-event.shop",
].filter(Boolean); // Remove any undefined values

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Authorization"],
    maxAge: 86400, // 24 hours
  })
);

// Handle preflight requests
app.options("*", cors());

// Serve static files
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1y",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// Debugging middleware
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`Incoming ${req.method} request for ${req.originalUrl}`);
    console.log("Headers:", req.headers);
    next();
  });
}

// ===== DATABASE CONNECTION =====
connectDB();

mongoose.connection.on("connected", () => {
  console.log("Mongoose connected to DB");

});

mongoose.connection.on("error", (err) => {
  console.error("Mongoose connection error:", err);
});

// ===== ROUTES =====
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/roles", roleRoutes);

app.get("/api/tech-news", async (req, res) => {
  const url = `https://newsapi.org/v2/top-headlines?category=technology&pageSize=8&apiKey=${process.env.NEWS_API_KEY}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error fetching news:", err.message);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// home route
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to Uni Event Hub API",
    version: "1.0.0",
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date(),
    uptime: process.uptime(),
    database: [
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      mongoose.connection.host,
      // get database name from connection string
      mongoose.connection.name || "unknown",
    ],
      routes: [
      "/api/auth",
      "/api/events",
      "/api/wallet",
      "/api/admin",
      "/api/roles",
    ],
  });
});

// ===== ERROR HANDLING =====
app.all("*", (req, res, next) => {
  console.error(`Route not found: ${req.originalUrl}`);
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

// ===== SERVER START =====
const port = process.env.PORT || 7000;
const server = app.listen(port, () => {
  console.log(`Server running on port ${port} in ${process.env.NODE_ENV} mode`);
  console.log("Allowed origins:", allowedOrigins);
  console.log("Available routes:");
  console.log("- POST /api/auth/signup");
  console.log("- POST /api/auth/login");
  console.log("- PATCH /api/roles/upgrade-to-organizer");
  console.log("- GET /api/events");
  console.log("- GET /api/admin/students/:email");
  console.log("- PATCH /api/wallet");
});

server.setTimeout(0); // Disable timeout completely

// Handle unhandled rejections
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! Shutting down...");
  console.error("Error:", err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down...");
  console.error("Error:", err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM RECEIVED. Shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});
