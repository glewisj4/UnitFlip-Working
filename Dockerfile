FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS source
COPY . .

FROM source AS lint
RUN npm run lint

FROM source AS build
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_USE_EDGE_FUNCTIONS=false
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_USE_EDGE_FUNCTIONS=$VITE_USE_EDGE_FUNCTIONS
RUN npm run build

FROM source AS dev
ENV VITE_DEV_HOST=0.0.0.0
ENV VITE_DEV_PORT=3000
ENV VITE_DOCKER=true
EXPOSE 3000
CMD ["node", "./node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "3000", "--strictPort"]

FROM nginx:1.27-alpine AS prod
COPY docker/nginx/unitflip.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
