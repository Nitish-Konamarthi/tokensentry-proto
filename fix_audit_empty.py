content = open('dashboard/app/dashboard/audit-log/page.tsx', 'r', encoding='utf-8').read()
content = content.replace('            emptyState={<span className="text-sm text-muted-foreground">No audit events found.</span>}\n', '')
open('dashboard/app/dashboard/audit-log/page.tsx', 'w', encoding='utf-8').write(content)
print('fixed emptyState')
