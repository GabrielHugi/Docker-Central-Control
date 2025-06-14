FROM node:24-alpine AS builder
WORKDIR /app
LABEL maintainer="gabrielhugi2@gmail.com"
LABEL version="1.0"
LABEL description="C code that does some shit"
COPY package*.json .
RUN apk add --no-cache python3 make g++
RUN npm i
COPY src ./src
RUN npx ncc build src/index.js --out dist --target es2024



FROM node:24-alpine
WORKDIR /app
LABEL maintainer="gabrielhugi2@gmail.com"
LABEL version="1.0"
LABEL description="Central control server"
RUN apk add --no-cache wget
RUN adduser -D appuser && chown -R appuser /app
USER appuser
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/status || exit 1
EXPOSE 3000
EXPOSE 7777

CMD ["node", "dist/index.js"]