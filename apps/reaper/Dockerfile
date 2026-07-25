# Dockerfile for reaper (Cloud Build source path: repo root)
FROM node:20-slim AS builder
WORKDIR /workspace
COPY package.json package-lock.json* tsconfig.base.json ./
COPY libs/ ./libs/
COPY apps/ ./apps/
RUN npm ci --no-audit --no-fund
RUN npm run build -w libs/firestore && \
    npm run build -w libs/http && \
    npm run build -w libs/storage
RUN npm run build -w apps/reaper

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --chown=node:node --from=builder /workspace/apps/reaper/package.json /app/package.json
COPY terraform/scripts/strip-pastebingcp-deps.sh /tmp/strip-pastebingcp-deps.sh
RUN sh /tmp/strip-pastebingcp-deps.sh && \
    npm install --omit=dev --ignore-scripts --no-audit --no-fund

RUN mkdir -p /app/node_modules/@pastebingcp
COPY --chown=node:node --from=builder /workspace/libs/firestore /app/node_modules/@pastebingcp/firestore
COPY --chown=node:node --from=builder /workspace/libs/http     /app/node_modules/@pastebingcp/http
COPY --chown=node:node --from=builder /workspace/libs/storage  /app/node_modules/@pastebingcp/storage

COPY --chown=node:node --from=builder /workspace/apps/reaper/dist ./dist
RUN chown -R node:node /app
USER node
CMD ["node", "./dist/index.js"]
