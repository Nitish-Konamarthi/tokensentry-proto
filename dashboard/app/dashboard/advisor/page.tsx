'use client'
// dashboard/app/dashboard/advisor/page.tsx — BudgetAdvisor AI Chat

import { useState, useRef, useEffect } from 'react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'
const TEST_KEY = 'ts_live_test_d3ad8eef4f2b1234'

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
          Authorization: `Bearer ${TEST_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question }),
      })

      let answer: string
      if (res.ok) {
        const data = await res.json() as { answer: string }
        answer = data.answer
      } else {
        // Demo fallback
        answer = getDemoAnswer(question)
      }

      setMessages(prev => [...prev, { role: 'ai', content: answer, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: getDemoAnswer(question), timestamp: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Budget Advisor</h1>
          <p className="page-sub">Ask anything about your AI spend in plain English</p>
        </div>
        <span className="badge blue">Claude Sonnet</span>
      </div>

      <div className="card-grid card-grid-2">
        {/* Chat */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="chat-wrap">
            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div className={`chat-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                    {msg.content}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', padding: '0 4px' }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="chat-bubble ai" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <div className="spinner" style={{ width: '14px', height: '14px' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Analyzing your spend data...</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-row">
              <input
                className="form-input chat-input"
                placeholder="Ask about your AI budget..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input) } }}
                disabled={loading}
              />
              <button className="btn btn-primary" onClick={() => void sendMessage(input)} disabled={loading || !input.trim()}>
                Ask
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Suggested questions */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '14px' }}>Suggested Questions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {SUGGESTED_QUESTIONS.map(q => (
            <button
              key={q}
              className="btn btn-secondary btn-sm"
              onClick={() => void sendMessage(q)}
              disabled={loading}
              style={{ fontSize: '12px' }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function getDemoAnswer(question: string): string {
  const q = question.toLowerCase()
  if (q.includes('track') || q.includes('budget')) {
    return 'You\'ve spent $342.18 of your $500.00 monthly budget — 68.4% utilization with 12 days remaining. At your current burn rate of $11.39/day, you\'ll finish at $479.00, just under budget. No action needed, but enable the 80% alert if you haven\'t already.\n\nNext action: Check the Analytics page for which team is driving the most spend this week.'
  }
  if (q.includes('haiku') || q.includes('downgrad')) {
    return 'Forcing the analytics team to Haiku-only would reduce their costs from $87.40 to approximately $18.20/month — a 79% reduction. Their tasks are 92% data extraction and classification, which score "low" in our classifier. The tradeoff: ~4% quality degradation on complex SQL generation tasks.\n\nNext action: Set team model policy to haiku-only in the Budgets page for the analytics team.'
  }
  if (q.includes('sav') || q.includes('downgrad')) {
    return 'This month you\'ve saved $213.44 through TokenSentry — $147.20 from model downgrading (Opus→Haiku on 847 calls), $51.30 from semantic cache hits (342 calls), and $14.94 from prompt compression. Your effective savings rate is 38.4%.\n\nNext action: Increase your semantic cache TTL from 24h to 7d for stable documentation queries — could add $40-60/month in additional savings.'
  }
  return 'Your current AI burn rate is $11.39/day. At this pace, you\'ll spend approximately $342.00 this month. Compared to last month\'s $289.00, you\'re tracking 18.3% higher — driven by the new code generation feature the engineering team deployed.\n\nNext action: Review the waste analysis report — it flagged 34 frontier model calls this week that scored "low" complexity.'
}
