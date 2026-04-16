FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY config.js /usr/share/nginx/html/config.js
COPY src /usr/share/nginx/html/src
COPY docker/40-codeflow-config.sh /docker-entrypoint.d/40-codeflow-config.sh

RUN chmod +x /docker-entrypoint.d/40-codeflow-config.sh
