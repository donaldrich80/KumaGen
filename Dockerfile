FROM node:22-alpine AS builder

WORKDIR /app

# Install backend deps
COPY package.json ./
RUN npm install --omit=dev

# Install and build frontend
COPY web/package.json ./web/
RUN cd web && npm install

COPY . .
RUN cd web && npm run build

# ---- Runtime ----
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

CMD ["node", "src/index.js"]
