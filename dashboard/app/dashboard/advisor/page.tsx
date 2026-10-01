'use client'

import { useState, useRef, useEffect } from 'react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Bot, Send, Sparkles } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000'
const TS_KEY = process.env['NEXT_PUBLIC_TS_KEY'] ?? ''

const SUGGESTED_QUESTIONS = [
  'Are we on track to stay within our $500 budget this month?',
  'Which team is spending the most on AI?',
  'What would our bill look like if we enforced haiku-only for the analytics team?',
  'How much have we saved from model downgrading this month?',
  'Project our AI costs for next quarter at current growth rate.',
]

interface Message {
  role: 'user' | 'ai'
  content: string
  timestamp: Date
}

export default function AdvisorPage() {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'ai',
    content: 'Hello! I\'m your BudgetAdvisor. Ask me anything about your AI spend — burn rates, team budgets, savings opportunities, or forecasts. I have full context on your organization\'s usage.',
    timestamp: new Date(),
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return

    const userMsg: Message = { role: 'user', content: question, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/v1/advisor/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TS_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question }),
      })

      if (res.ok) {
        const data = await res.json() as { answer: string }
        setMessages(prev => [...prev, { role: 'ai', content: data.answer, timestamp: new Date() }])
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: 'I\'m having trouble connecting to the advisor service. Please try again later.', timestamp: new Date() }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: 'Network error. Please check your connection and try again.', timestamp: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="AI Budget Advisor"
        description="Ask anything about your AI spend in plain English"
      >
        <Badge variant="info" className="gap-1">
          <Sparkles className="h-3 w-3" />
          Claude Sonnet
        </Badge>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col h-[600px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 opacity-60">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t p-4">
              <form
                onSubmit={e => { e.preventDefault(); void sendMessage(input) }}
                className="flex gap-3"
              >
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about your AI budget..."
                  disabled={loading}
                  className="flex-1"
                />
                <Button type="submit" disabled={loading || !input.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  Ask
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Suggested Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map(q => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                onClick={() => void sendMessage(q)}
                disabled={loading}
                className="text-xs"
              >
                {q}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
