content = open('api/.env.example', 'r', encoding='utf-8').read()
old = '# Trusted Proxies\nTRUSTED_PROXY_CIDRS='
new = '# Agent Guard thresholds (deterministic governance)\nAGENT_GUARD_MAX_RPS=4\nAGENT_GUARD_RETRY_RATIO=0.5\nAGENT_GUARD_TOOL_RATIO=0.75\nAGENT_GUARD_RECURSIVE_DEPTH_LIMIT=2\nAGENT_GUARD_SESSION_TTL_SECONDS=900\nAGENT_GUARD_BLOCK_TTL_SECONDS=120\n\n# Trusted Proxies\nTRUSTED_PROXY_CIDRS='
content = content.replace(old, new)
open('api/.env.example', 'w', encoding='utf-8').write(content)
print('.env.example updated with thresholds')
