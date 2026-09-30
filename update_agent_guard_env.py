content = open('api/src/services/agent-guard.ts', 'r', encoding='utf-8').read()
old_import = "import { valkey, ValkeyKeys } from '../clients/valkey.js'\nimport { logger } from '../lib/logger.js'"
new_import = "import { valkey, ValkeyKeys } from '../clients/valkey.js'\nimport { logger } from '../lib/logger.js'\nimport { env } from '../config/env.js'"
content = content.replace(old_import, new_import)
old_constants = "const TIMELINE_WINDOW_MS = 60_000\nconst TOKEN_HISTORY_WINDOW_MS = 300_000\nconst FREQUENCY_THRESHOLD_RPS = 4\nconst RETRY_RATIO_THRESHOLD = 0.5\nconst TOOL_RATIO_THRESHOLD = 0.75\nconst RECURSIVE_DEPTH_LIMIT = 2"
new_constants = "const TIMELINE_WINDOW_MS = 60_000\nconst TOKEN_HISTORY_WINDOW_MS = 300_000\nconst FREQUENCY_THRESHOLD_RPS = env.AGENT_GUARD_MAX_RPS ?? 4\nconst RETRY_RATIO_THRESHOLD = env.AGENT_GUARD_RETRY_RATIO ?? 0.5\nconst TOOL_RATIO_THRESHOLD = env.AGENT_GUARD_TOOL_RATIO ?? 0.75\nconst RECURSIVE_DEPTH_LIMIT = env.AGENT_GUARD_RECURSIVE_DEPTH_LIMIT ?? 2"
content = content.replace(old_constants, new_constants)
open('api/src/services/agent-guard.ts', 'w', encoding='utf-8').write(content)
print('agent-guard thresholds configurable')
