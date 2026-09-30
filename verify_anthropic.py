with open('api/src/clients/providers/anthropic.ts', 'r', encoding='utf-8') as f:
    content = f.read()
print('Length:', len(content))
print('Contains fetchWithTimeoutAndRetry:', 'fetchWithTimeoutAndRetry' in content)
print('Contains await fetch:', 'await fetch(' in content)
