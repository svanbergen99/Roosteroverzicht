FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./server.js
COPY elastic-sync.js ./elastic-sync.js

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]
