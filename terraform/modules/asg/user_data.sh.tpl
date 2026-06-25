#!/bin/bash
set -euxo pipefail

# --- Install runtime ---
dnf install -y nodejs git jq awscli

# --- Pull app code ---

mkdir -p /opt/app
git clone --depth 1 ${app_repo_url} /opt/app
cd /opt/app/app
npm install --production

# --- Fetch DB credentials from Secrets Manager ---
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id ${db_secret_arn} \
  --region ${aws_region} \
  --query SecretString --output text)

DB_USER=$(echo "$SECRET_JSON" | jq -r .username)
DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r .password)

# --- Initialize schema on first boot ---
export DB_HOST=${db_host}
export DB_PORT=${db_port}
export DB_NAME=spliteasy
export DB_USER
export DB_PASSWORD

node <<'NODE'
const fs = require('fs');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'spliteasy',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const schema = fs.readFileSync('db/init.sql', 'utf8');
    await pool.query(schema);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Schema initialization failed', err);
  process.exit(1);
});
NODE

cat <<EOF > /etc/systemd/system/spliteasy.service
[Unit]
Description=SplitEasy App
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/app/app
Environment=PORT=8080
Environment=DB_HOST=${db_host}
Environment=DB_PORT=${db_port}
Environment=DB_NAME=spliteasy
Environment=DB_USER=$DB_USER
Environment=DB_PASSWORD=$DB_PASSWORD
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
User=ec2-user

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable spliteasy
systemctl start spliteasy
