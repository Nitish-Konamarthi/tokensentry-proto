files = {
    'api/src/clients/providers/anthropic.ts': 'anthropic',
    'api/src/clients/providers/gemini.ts': 'gemini',
    'api/src/clients/providers/groq.ts': 'groq',
}

for path, provider in files.items():
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    # Replace await fetch(... with await fetchWithTimeoutAndRetry(...
    # This is a rough replacement — each file has slightly different fetch patterns
    if 'fetch(' in content and 'fetchWithTimeoutAndRetry(' not in content.split('await fetch(')[-1] if 'await fetch(' in content else '':
        content = content.replace('await fetch(', 'await fetchWithTimeoutAndRetry({ url:', 1)
        # Fix opening for anthropic
        if provider == 'anthropic':
            content = content.replace('await fetchWithTimeoutAndRetry({ url: `${BASE_URL}/messages`,', 'await fetchWithTimeoutAndRetry({ url: `${BASE_URL}/messages`,')
            # Find the closing }) and add provider param
            # Actually, the replacement is tricky. Let me use a regex-like approach.
    # Simpler approach: just replace the fetch call manually per file
    open(path, 'w', encoding='utf-8').write(content)
    print('Processed', path)
