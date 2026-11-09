FROM node:26-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends lua5.4 lua-dkjson \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server.js ./server.js
COPY random_walk.lua ./random_walk.lua

EXPOSE 10000

CMD ["node", "server.js"]
