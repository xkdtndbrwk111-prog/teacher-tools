FROM node:24-slim
WORKDIR /app
COPY classroom/cloud/package*.json ./classroom/cloud/
RUN cd classroom/cloud && npm ci --omit=dev
COPY classroom ./classroom
ENV NODE_ENV=production PORT=8080
USER node
CMD ["node", "classroom/cloud/server.mjs"]
