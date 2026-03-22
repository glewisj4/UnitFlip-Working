FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS source
COPY . .

FROM source AS lint
RUN npm run lint

FROM source AS build
RUN npm run build

FROM source AS dev
ENV VITE_DEV_HOST=0.0.0.0
ENV VITE_DEV_PORT=3000
ENV VITE_DOCKER=true
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
