// src/clients/pioneer.ts
// Pioneer.ai GLiNER2 client — purpose-built text classification + JSON extraction.
// Primary classifier for task_classifier and agentic_guard pillars.
// Sign up: agent.pioneer.ai → Settings → API Keys (free $30 credit)

const PIONEER_BASE = 'https://agent.pioneer.ai'

export async function callPioneerGLiNER(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 256
): Promise<string> {
  if (!process.env['PIONEER_API_KEY']) {
    throw new Error('PIONEER_API_KEY not set')
  }

  const res = await fetch(`${PIONEER_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env['PIONEER_API_KEY']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gliner2-large-v2',
      max_tokens: maxTokens,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage   },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    throw new Error(`Pioneer API error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const choice = data.choices[0]
  if (!choice) throw new Error('Pioneer API returned empty choices array')
  return choice.message.content
}
