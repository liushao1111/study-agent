export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const apiKey = formData.get('apiKey') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Ensure /tmp/study-agent exists
    const tmpDir = '/tmp/study-agent'
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true })
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const tmpPath = path.join(tmpDir, `${Date.now()}_${safeName}`)

    let uploadMimeType = file.type || 'application/octet-stream'
    let uploadPath = tmpPath
    let displayName = file.name

    // Handle DOCX: extract text with mammoth
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      await writeFile(tmpPath, buffer)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: tmpPath })
      const textContent = result.value
      const textPath = tmpPath + '.txt'
      await writeFile(textPath, textContent, 'utf-8')
      uploadMimeType = 'text/plain'
      uploadPath = textPath
      displayName = file.name.replace(/\.docx$/i, '.txt')
      // Clean up original
      await unlink(tmpPath).catch(() => {})
    } else {
      await writeFile(tmpPath, buffer)
      // Normalize mime type
      if (ext === 'pdf') uploadMimeType = 'application/pdf'
      else if (ext === 'txt' || ext === 'md') uploadMimeType = 'text/plain'
    }

    const fileManager = new GoogleAIFileManager(apiKey)
    const uploadResult = await fileManager.uploadFile(uploadPath, {
      mimeType: uploadMimeType,
      displayName,
    })

    // Clean up temp file
    await unlink(uploadPath).catch(() => {})

    return NextResponse.json({
      uri: uploadResult.file.uri,
      name: uploadResult.file.name,
      mimeType: uploadResult.file.mimeType,
      displayName,
    })
  } catch (err: unknown) {
    console.error('[upload] error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
