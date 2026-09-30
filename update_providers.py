for provider_file in [
    'api/src/clients/providers/openai.ts',
    'api/src/clients/providers/anthropic.ts',
    'api/src/clients/providers/gemini.ts',
    'api/src/clients/providers/groq.ts',
]:
    content = open(provider_file, 'r', encoding='utf-8').read()
    provider_name = provider_file.split('/')[-1].replace('.ts', '')
    if 'import { fetchWithTimeoutAndRetry }' not in content:
        content = content.replace("import { logger } from '../../lib/logger.js'", "import { logger } from '../../lib/logger.js'\nimport { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'")
    open(provider_file, 'w', encoding='utf-8').write(content)
    print('Updated', provider_file)
