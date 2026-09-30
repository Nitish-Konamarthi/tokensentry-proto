with open('api/src/lib/provider-fetch.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and fix any truncated last lines
if not content.endswith('}\n') or 'new Error(`Provider' in content:
    # Check last line
    lines = content.split('\n')
    # Replace any broken last line
    for i in range(len(lines)-1, -1, -1):
        if 'new Error(`Provider' in lines[i] and not lines[i].endswith(')'):
            lines[i] = lines[i] + ")"
            break
    content = '\n'.join(lines)
    open('api/src/lib/provider-fetch.ts', 'w', encoding='utf-8').write(content)
    print('Fixed truncated provider-fetch')
else:
    print('provider-fetch looks complete')
