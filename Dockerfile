FROM node:20-alpine AS builder

WORKDIR /app

# Install backend deps
COPY package.json ./
RUN npm install --omit=dev

# Install and build frontend
COPY client/package.json ./client/
RUN cd client && npm install

COPY . .
RUN cd client && npm run build

# ---- Runtime ----
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

CMD ["node", "server/index.js"]
