#!/bin/sh
# Daily PostgreSQL backup — runs via pgbackup service

set -e

BACKUP_DIR="/var/lib/postgresql/data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="tokensentry_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"
echo "[$(date -Iseconds)] Starting backup: $FILENAME"

pg_dump --no-owner --no-acl --compress=9 -f "${BACKUP_DIR}/${FILENAME}"

echo "[$(date -Iseconds)] Backup complete: $FILENAME"

find "$BACKUP_DIR" -name "tokensentry_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date -Iseconds)] Retention applied: keeping ${RETENTION_DAYS} days"
ls -lh "${BACKUP_DIR}/${FILENAME}"
