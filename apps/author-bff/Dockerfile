# Dockerfile for author-bff (Cloud Build source path: repo root)
FROM node:20-slim AS builder
WORKDIR /workspace
COPY package.json package-lock.json* tsconfig.base.json ./
COPY libs/ ./libs/
COPY apps/ ./apps/
RUN npm ci --no-audit --no-fund
RUN npm run build -w libs/events && \
    npm run build -w libs/firestore && \
    npm run build -w libs/pubsub && \
    npm run build -w libs/auth && \
    npm run build -w libs/http && \
    npm run build -w libs/proto-decode && \
    npm run build -w libs/paste-id && \
    npm run build -w libs/storage
RUN npm run build -w apps/author-bff

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --chown=node:node --from=builder /workspace/apps/author-bff/package.json /app/package.json
COPY terraform/scripts/strip-pastebingcp-deps.sh /tmp/strip-pastebingcp-deps.sh
RUN sh /tmp/strip-pastebingcp-deps.sh && \
    npm install --omit=dev --ignore-scripts --no-audit --no-fund

RUN mkdir -p /app/node_modules/@pastebingcp
COPY --chown=node:node --from=builder /workspace/libs/events       /app/node_modules/@pastebingcp/events
COPY --chown=node:node --from=builder /workspace/libs/firestore    /app/node_modules/@pastebingcp/firestore
COPY --chown=node:node --from=builder /workspace/libs/pubsub       /app/node_modules/@pastebingcp/pubsub
COPY --chown=node:node --from=builder /workspace/libs/auth         /app/node_modules/@pastebingcp/auth
COPY --chown=node:node --from=builder /workspace/libs/http         /app/node_modules/@pastebingcp/http
COPY --chown=node:node --from=builder /workspace/libs/proto-decode /app/node_modules/@pastebingcp/proto-decode
COPY --chown=node:node --from=builder /workspace/libs/paste-id     /app/node_modules/@pastebingcp/paste-id
COPY --chown=node:node --from=builder /workspace/libs/storage      /app/node_modules/@pastebingcp/storage

COPY --chown=node:node --from=builder /workspace/apps/author-bff/dist ./dist
RUN chown -R node:node /app
USER node
CMD ["node", "./dist/index.js"]
