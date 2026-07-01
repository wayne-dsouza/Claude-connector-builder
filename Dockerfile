# Portable container image for hosting the Lemlist MCP connector in HTTP mode.
# Works on any container host (Render, Railway, Fly.io, Google Cloud Run, etc.).

# ---- build stage: compile TypeScript ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage: production deps + compiled output only ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
ENV MODE=http
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
