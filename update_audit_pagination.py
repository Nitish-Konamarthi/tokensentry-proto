content = open('dashboard/app/dashboard/audit-log/page.tsx', 'r', encoding='utf-8').read()
# Add pagination state and simple pagination controls
old_use_state = "const [filter, setFilter] = useState('all')"
new_use_state = "const [filter, setFilter] = useState('all')\n  const [page, setPage] = useState(1)\n  const pageSize = 20"
content = content.replace(old_use_state, new_use_state)
old_use_logs = "const { data: logs, isLoading } = useAuditLogs(200, FILTER_MAP[filter])"
new_use_logs = "const { data: logs, isLoading } = useAuditLogs(pageSize, FILTER_MAP[filter])"
content = content.replace(old_use_logs, new_use_logs)
# Add pagination controls at the bottom of the card
old_end = "          />\n        </CardContent>\n      </Card>"
new_end = "          />\n        </CardContent>\n        <div className=\"flex items-center justify-between px-4 py-3 border-t bg-muted/30\">\n          <span className=\"text-xs text-muted-foreground\">Page {page}</span>\n          <div className=\"flex gap-2\">\n            <Button variant=\"outline\" size=\"sm\" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>\n            <Button variant=\"outline\" size=\"sm\" onClick={() => setPage(p => p + 1)}>Next</Button>\n          </div>\n        </div>\n      </Card>"
content = content.replace(old_end, new_end)
open('dashboard/app/dashboard/audit-log/page.tsx', 'w', encoding='utf-8').write(content)
print('audit pagination added')
