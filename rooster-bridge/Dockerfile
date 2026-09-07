FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY bootstrap.js ./
COPY team-api.js ./
COPY team-session-api.js ./
COPY identity-api.js ./
COPY personal-api.js ./
COPY colleague-profile-api.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "bootstrap.js"]
