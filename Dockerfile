FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8788
CMD ["npm", "run", "start:prod"]
