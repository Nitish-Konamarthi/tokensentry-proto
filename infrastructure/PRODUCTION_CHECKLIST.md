# TokenSentry Production Checklist

## Pre-Launch

### Security
- [ ] `.env` has strong unique passwords (not defaults)
- [ ] `TS_PEPPER` generated via `openssl rand -hex 32`
- [ ] Database password > 20 chars
- [ ] AI provider API keys have spend limits
- [ ] SSL certificates issued and auto-renewal verified
- [ ] Ports 80/443 only; all others firewalled
- [ ] SSH key-only auth, password login disabled
- [ ] Root SSH login disabled
- [ ] Automatic security updates enabled

### DNS
- [ ] A records point to VPS IP for all 4 domains
- [ ] Reverse DNS (PTR) set

### Monitoring
- [ ] Sentry DSN configured and receiving events
- [ ] Uptime monitoring on `/health/ready`
- [ ] OTel collector running
- [ ] JSON access logs enabled in NGINX
- [ ] Docker log rotation configured (max-size 10m, max-file 3)

### Database
- [ ] Schema applied and connections working
- [ ] Auto-backups confirmed running
- [ ] Restore verified from backup file

### Valkey
- [ ] Connected and responding to pings
- [ ] `maxmemory` set (default 512MB sufficient for small VPS)
- [ ] Eviction policy: `allkeys-lru`

## Post-Launch (First Week)
- [ ] Health endpoint: `curl https://api.tokensentry.ai/health/ready`
- [ ] Proxy working with a test API key
- [ ] Dashboard loads: `curl -I https://app.tokensentry.ai`
- [ ] SSL Labs rating A or better
- [ ] Rate limiting responds with 429 on abuse
- [ ] Budget checks work (create budget, hit limit, confirm block)
- [ ] Agent Guard blocks runaway sessions
- [ ] CORS headers correct for dashboard
- [ ] API error responses return JSON, not HTML
- [ ] Backups appearing in `pgdata/backups/`
- [ ] Certbot renewal log shows success

## Performance Targets

| Metric | Target | Alarm |
|---|---|---|
| API p95 latency | < 200ms | > 1s |
| Dashboard load | < 1.5s | > 3s |
| Budget check | < 5ms | > 50ms |
| Agent guard eval | < 10ms | > 100ms |
| DB query p99 | < 50ms | > 200ms |
| Valkey cmd p99 | < 5ms | > 20ms |
| Backup completion | < 5 min | > 30 min |
| Uptime | 99.9% | < 99.5% |
