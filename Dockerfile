# Single container: Node serves the built client and the realtime server.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
COPY engine/package.json engine/
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build -w client
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "server"]
