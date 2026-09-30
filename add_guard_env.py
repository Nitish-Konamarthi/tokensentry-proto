content = open('api/src/config/env.ts', 'r', encoding='utf-8').read()
old_line = "  // Trusted proxies"
new_lines = "  // Agent Guard thresholds (V1 deterministic governance)\n  AGENT_GUARD_MAX_RPS: z.coerce.number().positive().default(4),\n  AGENT_GUARD_RETRY_RATIO: z.coerce.number().positive().default(0.5),\n  AGENT_GUARD_TOOL_RATIO: z.coerce.number().positive().default(0.75),\n  AGENT_GUARD_RECURSIVE_DEPTH_LIMIT: z.coerce.number().int().positive().default(2),\n  AGENT_GUARD_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(900),\n  AGENT_GUARD_BLOCK_TTL_SECONDS: z.coerce.number().int().positive().default(120),\n\n  // Trusted proxies"
content = content.replace(old_line, new_lines)
open('api/src/config/env.ts', 'w', encoding='utf-8').write(content)
print('env thresholds added')
