#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TRUENAS_HOST="${TRUENAS_HOST:-192.168.1.134}"
TRUENAS_SSH_USER="${TRUENAS_SSH_USER:-truenas_admin}"
APP_NAME="${APP_NAME:-codeflow}"
REMOTE_ROOT="${REMOTE_ROOT:-/mnt/apps/devtools/codeflow}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd ssh
require_cmd tar
require_cmd jq

COMPOSE_FILE="${ROOT_DIR}/deploy/truenas/docker-compose.yml"
PAYLOAD_FILE="$(mktemp)"
STAGE_DIR="$(mktemp -d)"
trap 'rm -f "${PAYLOAD_FILE}"; rm -rf "${STAGE_DIR}"' EXIT
FORGEJO_BASE_URL="${FORGEJO_BASE_URL:-http://192.168.1.134:30142}"
FORGEJO_API_BASE_URL="${FORGEJO_API_BASE_URL:-/forgejo-api}"
FORGEJO_PROXY_AUTH="${FORGEJO_PROXY_AUTH:-true}"
FORGEJO_TOKEN="${FORGEJO_TOKEN:-$(security find-generic-password -s 'TrueNAS-Forgejo-Token' -w 2>/dev/null || true)}"

if [[ -z "${FORGEJO_TOKEN}" ]]; then
  echo "Missing Forgejo token. Set FORGEJO_TOKEN or store TrueNAS-Forgejo-Token in macOS Keychain." >&2
  exit 1
fi

REMOTE_UID="$(ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" "id -u")"
REMOTE_GID="$(ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" "id -g")"

ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" \
  "midclt call filesystem.mkdir '{\"path\": \"${REMOTE_ROOT}\", \"options\": {\"mode\": \"755\", \"raise_chmod_error\": false}}' >/dev/null 2>&1 || true"

ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" \
  "midclt call -j filesystem.chown '{\"path\": \"${REMOTE_ROOT}\", \"uid\": ${REMOTE_UID}, \"gid\": ${REMOTE_GID}, \"options\": {\"recursive\": true}}' >/dev/null"

mkdir -p "${STAGE_DIR}/src" "${STAGE_DIR}/deploy/truenas"
cp "${ROOT_DIR}/index.html" "${STAGE_DIR}/index.html"
cp -R "${ROOT_DIR}/src/." "${STAGE_DIR}/src/"
cp "${ROOT_DIR}/deploy/truenas/docker-compose.yml" "${STAGE_DIR}/deploy/truenas/docker-compose.yml"

sed \
  -e "s|__FORGEJO_BASE_URL__|${FORGEJO_BASE_URL}|g" \
  -e "s|__FORGEJO_API_BASE_URL__|${FORGEJO_API_BASE_URL}|g" \
  -e "s|__FORGEJO_PROXY_AUTH__|${FORGEJO_PROXY_AUTH}|g" \
  "${ROOT_DIR}/deploy/truenas/config.js.template" > "${STAGE_DIR}/deploy/truenas/config.js"

sed \
  -e "s|__FORGEJO_UPSTREAM__|${FORGEJO_BASE_URL}|g" \
  -e "s|__FORGEJO_AUTH_HEADER__|token ${FORGEJO_TOKEN}|g" \
  "${ROOT_DIR}/deploy/truenas/nginx.conf.template" > "${STAGE_DIR}/deploy/truenas/nginx.conf"

tar -C "${STAGE_DIR}" -czf - \
  index.html \
  src \
  deploy/truenas/config.js \
  deploy/truenas/nginx.conf \
  deploy/truenas/docker-compose.yml |
  ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" "tar -xzf - -C '${REMOTE_ROOT}'"

jq -n \
  --arg app_name "${APP_NAME}" \
  --arg compose "$(cat "${COMPOSE_FILE}")" \
  '{
    custom_app: true,
    app_name: $app_name,
    custom_compose_config_string: $compose
  }' > "${PAYLOAD_FILE}"

if ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" "midclt call app.query | jq -e '.[] | select(.name==\"${APP_NAME}\")' >/dev/null"; then
  ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" \
    "midclt call -j app.update '${APP_NAME}' '$(jq -c '{custom_compose_config_string: .custom_compose_config_string}' "${PAYLOAD_FILE}")'"
else
  ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" \
    "midclt call -j app.create '$(jq -c . "${PAYLOAD_FILE}")'"
fi

ssh "${TRUENAS_SSH_USER}@${TRUENAS_HOST}" \
  "midclt call app.query | jq '.[] | select(.name==\"${APP_NAME}\") | {name,state,custom_app,portals,active_workloads}'"
