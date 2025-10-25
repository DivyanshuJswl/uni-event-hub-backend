# ---- Stage 1: Build dependencies ----
# Use a slimmed-down Node.js image for the build stage.
FROM node:22-slim AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker's layer cache.
# This prevents re-installing dependencies if only application code changes.
COPY package*.json ./

# Install dependencies. `npm ci` is faster and more deterministic.
RUN npm install

# Copy the rest of the application code
COPY . .

# ---- Stage 2: Production runtime ----
FROM node:22-slim

# Set the working directory
WORKDIR /app

# Copy only the necessary production-ready files from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Expose the application's port
EXPOSE 5000

# Run the application as a non-root user for security
# The `node` user is often included in official node images
USER node

# Start the application using the explicit command
CMD ["node", "index.js"]
