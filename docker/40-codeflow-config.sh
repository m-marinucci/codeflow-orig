#!/bin/sh
set -eu

forgejo_base_url="${CODEFLOW_FORGEJO_BASE_URL:-}"
forgejo_api_base_url="${CODEFLOW_FORGEJO_API_BASE_URL:-}"
forgejo_upstream="${CODEFLOW_FORGEJO_UPSTREAM:-}"

if [ -z "${forgejo_api_base_url}" ]; then
  if [ -n "${forgejo_upstream}" ]; then
    forgejo_api_base_url="/forgejo-api"
  elif [ -n "${forgejo_base_url}" ]; then
    forgejo_api_base_url="${forgejo_base_url%/}/api/v1"
  else
    forgejo_api_base_url=""
  fi
fi

cat > /usr/share/nginx/html/config.js <<EOF
window.CODEFLOW_CONFIG = {
  forgejoBaseUrl: "${forgejo_base_url}",
  forgejoApiBaseUrl: "${forgejo_api_base_url}"
};
EOF

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location ~ (^|/)\. {
        return 404;
    }

    location = /config.js {
        add_header Cache-Control "no-store";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
EOF

if [ -n "${forgejo_upstream}" ]; then
cat >> /etc/nginx/conf.d/default.conf <<EOF

    location /forgejo-api/ {
        proxy_pass ${forgejo_upstream%/}/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host \$proxy_host;
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
EOF
fi

cat >> /etc/nginx/conf.d/default.conf <<'EOF'
}
EOF
