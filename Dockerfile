FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM deps AS backend
COPY tsconfig.json ./
COPY server/ server/
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]

FROM deps AS frontend-build
COPY tsconfig.json vite.config.ts index.html ./
COPY src/ src/
RUN npm run build

FROM nginx:alpine AS frontend
ARG LISTEN=80
ARG PROXY_PASS=http://backend:3001
COPY --from=frontend-build /app/dist /usr/share/nginx/html
RUN printf 'server {\n\
    listen %s;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    resolver 127.0.0.11 valid=30s;\n\
    set $backend "%s";\n\
    location /api/ {\n\
        proxy_pass $backend;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' "$LISTEN" "$PROXY_PASS" > /etc/nginx/conf.d/default.conf
EXPOSE ${LISTEN}
