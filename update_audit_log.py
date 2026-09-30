content = open('dashboard/app/dashboard/audit-log/page.tsx', 'r', encoding='utf-8').read()
content = content.replace('            data={logs ?? []}\n            loading={isLoading}', '            data={logs ?? []}\n            loading={isLoading}\n            emptyState={<span className="text-sm text-muted-foreground">No audit events found.</span>}')
open('dashboard/app/dashboard/audit-log/page.tsx', 'w', encoding='utf-8').write(content)
print('audit log updated')
