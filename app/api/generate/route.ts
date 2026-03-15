export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type { StoredFile } from '@/lib/types'
import {
  SUMMARY_PROMPT,
  PODCAST_PROMPT,
  PRICING_PODCAST_PROMPT,
} from '@/lib/prompts'

interface GenerateBody {
  apiKey: string
  files: StoredFile[]
  urls: string[]
  prompt: string
  mode: 'summary' | 'podcast'
  subject: string
}

async function fetchAndUploadUrl(
  url: string,
  apiKey: string
): Promise<{ uri: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; StudyAgentBot/1.0)',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // Use cheerio to extract text
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cheerio = require('cheerio')
    const $ = cheerio.load(html)

    // Remove script/style tags
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
    console.error('[generate] URL fetch error:', url, err)
    return null
  }
}

export async function POST(req: NextRequest) {
  const body: GenerateBody = await req.json()
  const { apiKey, files, urls, prompt, mode, subject } = body

  if (!apiKey) {
    return new Response('Missing API key', { status: 400 })
  }

  // Determine system instruction
  const isPricing =
    subject.toLowerCase().includes('pric') ||
    subject.toLowerCase().includes('mba')

  let systemInstruction: string
  if (mode === 'summary') {
    systemInstruction = SUMMARY_PROMPT
  } else {
    systemInstruction = isPricing ? PRICING_PODCAST_PROMPT : PODCAST_PROMPT
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
  })

  // Build parts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = []

  for (const f of files) {
    parts.push({
      fileData: {
        fileUri: f.geminiFileUri,
        mimeType: f.mimeType,
      },
    })
  }

  // Fetch and upload URLs
  for (const url of urls) {
    const uploaded = await fetchAndUploadUrl(url, apiKey)
    if (uploaded) {
      parts.push({
        fileData: {
          fileUri: uploaded.uri,
          mimeType: uploaded.mimeType,
        },
      })
    }
  }

  // Add the user prompt
  const userPrompt = prompt
    ? `${prompt}\n\nPlease focus on: ${prompt}`
    : mode === 'summary'
    ? 'Please create a comprehensive structured summary of the provided materials.'
    : 'Please create an engaging podcast episode based on the provided materials.'

  parts.push({ text: userPrompt })

  // Create streaming response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await model.generateContentStream(parts)
        for await (const chunk of result.stream) {
          const text = chunk.text()
          if (text) {
            controller.enqueue(encoder.encode(text))
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
