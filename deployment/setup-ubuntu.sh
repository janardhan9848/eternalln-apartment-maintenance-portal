#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

trap 'status=$?; printf "Setup failed at line %s (exit %s).\n" "$LINENO" "$status" >&2; exit "$status"' ERR

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this script with sudo.\n' >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  printf 'Cannot identify the operating system.\n' >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  printf 'This setup supports Ubuntu 24.04 only.\n' >&2
  exit 1
fi

BUNDLE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="/opt/apartment-maintenance-portal"
APP_DIR="${APP_ROOT}/app"
DB_NAME="apartment_maintenance_db"
DB_USER="portal_app"
ENV_DIR="/etc/apartment-maintenance-portal"
ENV_FILE="${ENV_DIR}/backend.env"
MYSQL_BIND_CONF="/etc/mysql/mysql.conf.d/99-apartment-maintenance-portal-local.cnf"
NODE_SOURCE_KEY="/etc/apt/keyrings/apartment-portal-nodesource.gpg"
NODE_SOURCE_LIST="/etc/apt/sources.list.d/apartment-portal-nodesource.list"
SYSTEMD_FILE="/etc/systemd/system/apartment-portal.service"
NGINX_AVAILABLE="/etc/nginx/sites-available/apartment-portal"
NGINX_ENABLED="/etc/nginx/sites-enabled/apartment-portal"

for required in \
  "${BUNDLE_ROOT}/backend/package.json" \
  "${BUNDLE_ROOT}/backend/package-lock.json" \
  "${BUNDLE_ROOT}/backend/src/server.js" \
  "${BUNDLE_ROOT}/backend/src/config/database.js" \
  "${BUNDLE_ROOT}/database/schema.sql" \
  "${BUNDLE_ROOT}/frontend/dist/index.html" \
  "${BUNDLE_ROOT}/deployment/apartment-portal.service" \
  "${BUNDLE_ROOT}/deployment/nginx-apartment-portal.conf"; do
  if [[ ! -f "${required}" ]]; then
    printf 'Required release file is missing: %s\n' "${required}" >&2
    exit 1
  fi
done

for target in \
  "${APP_ROOT}" \
  "${ENV_DIR}" \
  "${MYSQL_BIND_CONF}" \
  "${NODE_SOURCE_KEY}" \
  "${NODE_SOURCE_LIST}" \
  "${SYSTEMD_FILE}" \
  "${NGINX_AVAILABLE}" \
  "${NGINX_ENABLED}"; do
  if [[ -e "${target}" ]]; then
    printf 'Refusing to overwrite existing path: %s\n' "${target}" >&2
    exit 1
  fi
done

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg mysql-server nginx openssl

install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o "${NODE_SOURCE_KEY}"
chmod 0644 "${NODE_SOURCE_KEY}"
printf 'deb [signed-by=%s] https://deb.nodesource.com/node_24.x nodistro main\n' \
  "${NODE_SOURCE_KEY}" > "${NODE_SOURCE_LIST}"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${NODE_MAJOR}" != "24" ]]; then
  printf 'Expected Node.js 24, found major version %s.\n' "${NODE_MAJOR}" >&2
  exit 1
fi

cat > "${MYSQL_BIND_CONF}" <<'EOF'
[mysqld]
bind-address = 127.0.0.1
EOF
chmod 0644 "${MYSQL_BIND_CONF}"
systemctl enable --now mysql
systemctl restart mysql

MYSQL_MAJOR="$(mysql --batch --skip-column-names --execute='SELECT VERSION()' | cut -d. -f1)"
if [[ "${MYSQL_MAJOR}" != "8" ]]; then
  printf 'Expected MySQL 8.x, found major version %s.\n' "${MYSQL_MAJOR}" >&2
  exit 1
fi

if mysql --batch --skip-column-names --execute="SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='${DB_NAME}'" \
  | grep --fixed-strings --line-regexp --quiet "${DB_NAME}"; then
  printf 'Database %s already exists; refusing to import or alter it.\n' "${DB_NAME}" >&2
  exit 1
fi

mysql < "${BUNDLE_ROOT}/database/schema.sql"

DB_PASSWORD="$(openssl rand -hex 32)"
install -d -o root -g www-data -m 0750 "${ENV_DIR}"
cat > "${ENV_FILE}" <<EOF
PORT=4000
NODE_ENV=production
FRONTEND_ORIGINS=http://127.0.0.1:8080
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_SSL=false
EOF
chown root:www-data "${ENV_FILE}"
chmod 0640 "${ENV_FILE}"

mysql <<SQL
CREATE USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
SQL
unset DB_PASSWORD

install -d -m 0755 "${APP_DIR}/backend/src/config"
install -m 0644 "${BUNDLE_ROOT}/backend/package.json" "${APP_DIR}/backend/package.json"
install -m 0644 "${BUNDLE_ROOT}/backend/package-lock.json" "${APP_DIR}/backend/package-lock.json"
install -m 0644 "${BUNDLE_ROOT}/backend/src/server.js" "${APP_DIR}/backend/src/server.js"
install -m 0644 "${BUNDLE_ROOT}/backend/src/config/database.js" "${APP_DIR}/backend/src/config/database.js"
install -d -m 0755 "${APP_DIR}/frontend"
cp -a "${BUNDLE_ROOT}/frontend/dist" "${APP_DIR}/frontend/dist"

(
  cd "${APP_DIR}/backend"
  npm ci --omit=dev --no-audit --no-fund
)

install -m 0644 "${BUNDLE_ROOT}/deployment/apartment-portal.service" "${SYSTEMD_FILE}"
install -m 0644 "${BUNDLE_ROOT}/deployment/nginx-apartment-portal.conf" "${NGINX_AVAILABLE}"
ln -s "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
nginx -t

systemctl daemon-reload
systemctl enable --now apartment-portal.service
systemctl enable --now nginx
systemctl reload nginx

if ! systemctl is-active --quiet mysql ||
   ! systemctl is-active --quiet apartment-portal.service ||
   ! systemctl is-active --quiet nginx; then
  printf 'One or more required services are not active.\n' >&2
  exit 1
fi

HEALTH="$(curl --fail --silent --show-error http://127.0.0.1:8080/api/health)"
if [[ "${HEALTH}" != *'"backend":"connected"'* ||
      "${HEALTH}" != *'"database":"connected"'* ]]; then
  printf 'Health check did not report both connections as healthy: %s\n' "${HEALTH}" >&2
  exit 1
fi

printf 'MySQL, the backend service, and Nginx are active.\n'
printf 'Health check: %s\n' "${HEALTH}"
printf 'The generated database password is stored only in %s (root:www-data, mode 0640).\n' "${ENV_FILE}"
printf 'Nginx listens on 127.0.0.1:8080; Express listens on 127.0.0.1:4000; MySQL is local.\n'
