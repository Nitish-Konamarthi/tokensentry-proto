content = open('dashboard/app/dashboard/audit-log/page.tsx', 'r', encoding='utf-8').read()
old = "import { Shield } from 'lucide-react'"
new = "import { Shield } from 'lucide-react'\nimport { Button } from '@/components/ui/button'"
content = content.replace(old, new)
open('dashboard/app/dashboard/audit-log/page.tsx', 'w', encoding='utf-8').write(content)
print('Button import added')
