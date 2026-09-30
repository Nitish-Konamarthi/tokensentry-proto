with open('api/package.json', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(',\n    "stripe": "^17.4.0"', '')
open('api/package.json', 'w', encoding='utf-8').write(content)
print('stripe dependency removed from package.json')
