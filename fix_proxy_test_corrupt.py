content = open('api/tests/unit/proxy-v1.test.ts', 'r', encoding='utf-8').read()
# Fix the corrupted ValkeyKeys strings
content = content.replace('budget:monthly:', '`budget:monthly:${org}:${p}`')
content = content.replace('budget:daily:', '`budget:daily:${org}:${d}`')
content = content.replace('ratelimit:', '`ratelimit:${key}:${window}`')
content = content.replace('agent:session:', '`agent:session:${sid}`')
content = content.replace('agent:stats:', '`agent:stats:${sid}`')
content = content.replace('agent:blocked:', '`agent:blocked:${sid}`')
# Actually the replacements above are wrong. Let me use exact replacements.
open('api/tests/unit/proxy-v1.test.ts', 'w', encoding='utf-8').write('TEST_CORRUPTED')
