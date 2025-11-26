# Frontend container for Azure with Cosmos DB authentication
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY public ./public
COPY server.js ./
COPY auth-cosmos.js ./
COPY cosmosdb.js ./
COPY mailer.js ./

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]
