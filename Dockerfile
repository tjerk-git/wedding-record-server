FROM node:22-alpine

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
