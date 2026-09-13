# Use an official lightweight Node.js LTS image based on Debian Bookworm
FROM node:22-bookworm-slim

# Set non-interactive mode for apt
ENV DEBIAN_FRONTEND=noninteractive

# Install PostgreSQL client, CA certificates (for TLS with Neon/Azure), and cleanup apt cache
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package.json ./

# Install packages
RUN npm install

# Copy source code and TypeScript configs
COPY tsconfig.json ./
COPY src/ ./src/

# Verify dependencies are available during build phase
RUN echo "=== VERIFICANDO DEPENDÊNCIAS DO CONTAINER ===" && \
    node --version && \
    npm --version && \
    pg_dump --version && \
    echo "=== VERIFICAÇÃO CONCLUÍDA ==="

# Execute TypeScript typechecking and compilation (verify correctness)
RUN npx tsc --noEmit

# Default command to start the backup process
CMD ["npm", "start"]
