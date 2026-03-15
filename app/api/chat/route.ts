export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type { StoredFile, ChatMessage } from '@/lib/types'
import { QA_PROMPT, PRICING_QA_PROMPT } from '@/lib/prompts'

interface ChatBody {
  apiKey: string
  files: StoredFile[]
  urls: string[]
  history: ChatMessage[]
  message: string
  subject: string
  isFirst: boolean
}

async function fetchAndUploadUrl(
  url: string,
  apiKey: string
): Promise<{ uri: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StudyAgentBot/1.0)',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cheerio = require('cheerio')
    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, aside, [role="navigation"]').remove()
    const title = $('title').text().trim()
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    const content = `URL: ${url}\nTitle: ${title}\n\n${bodyText}`.slice(0, 100000)

    const tmpDir = '/tmp/study-agent'
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true })
    }
    const tmpPath = path.join(tmpDir, `url_${Date.now()}.txt`)
    await writeFile(tmpPath, content, 'utf-8')

    const fileManager = new GoogleAIFileManager(apiKey)
    const uploaded = await fileManager.uploadFile(tmpPath, {
      mimeType: 'text/plain',
      displayName: `URL: ${new URL(url).hostname}`,
    })

    await unlink(tmpPath).catch(() => {})

    return { uri: uploaded.file.uri, mimeType: uploaded.file.mimeType }
  } catch (err) {
    console.error('[chat] URL fetch error:', url, err)
    return null
  }
}

export async function POST(req: NextRequest) {
  const body: ChatBody = await req.json()
  const { apiKey, files, urls, history, message, subject, isFirst } = body

  if (!apiKey) {
    return new Response('Missing API key', { status: 400 })
  }

  const isPricing =
    subject.toLowerCase().includes('pric') ||
    subject.toLowerCase().includes('mba')

  const systemInstruction = isPricing ? PRICING_QA_PROMPT : QA_PROMPT

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (isFirst) {
          // First message: attach all files and URLs + intro message
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstParts: any[] = []

          for (const f of files) {
            firstParts.push({
              fileData: {
                fileUri: f.geminiFileUri,
                mimeType: f.mimeType,
              },
            })
          }

          for (const url of urls) {
            const uploaded = await fetchAndUploadUrl(url, apiKey)
            if (uploaded) {
              firstParts.push({
                fileData: {
                  fileUri: uploaded.uri,
                  mimeType: uploaded.mimeType,
                },
              })
            }
          }

          firstParts.push({
            text: message || "Hello! I've loaded the study materials. Please introduce yourself and give me an overview of what we'll be studying.",
          })

          const chat = model.startChat({ history: [] })
          const result = await chat.sendMessageStream(firstParts)
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              controller.enqueue(encoder.encode(text))
            }
          }
        } else {
          // Reconstruct history for Gemini
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const geminiHistory: any[] = []

          for (const msg of history) {
            geminiHistory.push({
              role: msg.role === 'user' ? 'user' : 'model',
              parts: [{ text: msg.content }],
            })
          }

          const chat = model.startChat({ history: geminiHistory })
          const result = await chat.sendMessageStream([{ text: message }])
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              controller.enqueue(encoder.encode(text))
            }
          }
        }

        controller.close()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
