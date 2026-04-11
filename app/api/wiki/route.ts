export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { StoredFile, WikiPage } from '@/lib/types'
import { WIKI_INGEST_PROMPT, WIKI_QUERY_PROMPT, WIKI_LINT_PROMPT } from '@/lib/prompts'

interface WikiBody {
  apiKey: string
  operation: 'ingest' | 'query' | 'lint'
  // for ingest:
  files?: StoredFile[]
  // for query:
  question?: string
  // shared:
  wikiPages: Record<string, WikiPage>  // current wiki state
  subject: string
}

export async function POST(req: NextRequest) {
  const body: WikiBody = await req.json()
  const { apiKey, operation, files, question, wikiPages, subject } = body

  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 400 })

  const genAI = new GoogleGenerativeAI(apiKey)

  // Build wiki context string
  const wikiContext = Object.entries(wikiPages)
    .map(([path, page]) => `=== ${path} ===\n${page.content}`)
    .join('\n\n')

  if (operation === 'ingest') {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: WIKI_INGEST_PROMPT,
      generationConfig: { responseMimeType: 'application/json' },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = []

    // Add files
    for (const f of files || []) {
      parts.push({ fileData: { fileUri: f.geminiFileUri, mimeType: f.mimeType } })
    }

    // Add existing wiki context
    if (wikiContext) {
      parts.push({ text: `Current wiki state:\n\n${wikiContext}` })
    } else {
      parts.push({ text: 'This is a new wiki. Create initial pages for this source.' })
    }

    parts.push({ text: `Process this source for the "${subject}" subject wiki. Return JSON with all page updates.` })

    const result = await model.generateContent(parts)
    const text = result.response.text()

    let parsed: { title: string; pages: Record<string, string> }
    try {
      parsed = JSON.parse(text)
    } catch {
      // Try to extract JSON from the response
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return NextResponse.json({ error: 'Failed to parse wiki response' }, { status: 500 })
      parsed = JSON.parse(match[0])
    }

    return NextResponse.json(parsed)
  }

  if (operation === 'query') {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: WIKI_QUERY_PROMPT,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await model.generateContentStream([
            { text: `Wiki contents:\n\n${wikiContext}\n\nQuestion: ${question}` }
          ])
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) controller.enqueue(encoder.encode(text))
          }
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
  }

  if (operation === 'lint') {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: WIKI_LINT_PROMPT,
      generationConfig: { responseMimeType: 'application/json' },
    })

    const result = await model.generateContent([
      { text: `Health-check this wiki:\n\n${wikiContext}` }
    ])
    const text = result.response.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : { healthScore: 0, issues: [], suggestions: [] }
    }
    return NextResponse.json(parsed)
  }

  return NextResponse.json({ error: 'Unknown operation' }, { status: 400 })
}
