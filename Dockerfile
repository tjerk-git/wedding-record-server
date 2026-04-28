FROM node:22-slim

# ffmpeg + ffprobe for the cutout extraction pipeline
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

EXPOSE 8080

ENV NODE_ENV=production \
    PORT=8080

CMD ["node", "server.js"]
