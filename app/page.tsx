'use client'

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  DragEvent,
  ChangeEvent,
} from 'react'
import {
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Link,
  FileText,
  File,
  Upload,
  Volume2,
  VolumeX,
  Download,
  Send,
  RefreshCw,
  Loader2,
  ChevronRight,
  Globe,
  GraduationCap,
  Sparkles,
  Mic,
  Key,
} from 'lucide-react'
import type { StoredFile, SubjectURL, Subject, ChatMessage } from '@/lib/types'

// ─── TTS helper ──────────────────────────────────────────────────────────────
function speak(text: string, enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(
    text.replace(/[#*_`[\]>]/g, '').replace(/\n+/g, ' ')
  )
  utterance.rate = 1.05
  utterance.pitch = 1.0
  window.speechSynthesis.speak(utterance)
}

// ─── Streaming fetch helper ───────────────────────────────────────────────────
async function streamFetch(
  url: string,
  body: object,
  onChunk: (text: string) => void
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(decoder.decode(value))
  }
}

// ─── Simple markdown renderer ─────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$2</h2>'.replace('$2', '$1'))
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  html = html.replace(/_(.+?)_/g, '<em>$1</em>')

  // Code inline
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')

  // Unordered lists
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>')
  html = html.replace(/(<oli>.*<\/oli>\n?)+/g, (m) =>
    `<ol>${m.replace(/<\/?oli>/g, (t) => t.replace('oli', 'li'))}</ol>`
  )

  // Paragraphs
  html = html
    .split(/\n\n+/)
    .map((block) => {
      if (
        block.startsWith('<h') ||
        block.startsWith('<ul') ||
        block.startsWith('<ol') ||
        block.startsWith('<blockquote')
      )
        return block
      const trimmed = block.trim()
      if (!trimmed) return ''
      return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`
    })
    .join('\n')

  return html
}

// ─── File icon helper ─────────────────────────────────────────────────────────
function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType === 'application/pdf') {
    return <File className={className ?? 'w-4 h-4 text-red-500'} />
  }
  if (mimeType.includes('word') || mimeType.includes('docx')) {
    return <FileText className={className ?? 'w-4 h-4 text-blue-500'} />
  }
  return <FileText className={className ?? 'w-4 h-4 text-slate-500'} />
}

// ─── Time ago helper ──────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Storage keys ─────────────────────────────────────────────────────────────
const LS_KEY = 'study-agent-state'

interface PersistedState {
  apiKey: string
  subjects: Record<string, Subject>
  activeSubject: string
  chatHistories: Record<string, ChatMessage[]>
  ttsEnabled: boolean
}

function loadState(): PersistedState {
  if (typeof window === 'undefined') {
    return {
      apiKey: '',
      subjects: {},
      activeSubject: '',
      chatHistories: {},
      ttsEnabled: false,
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {
    apiKey: '',
    subjects: {},
    activeSubject: '',
    chatHistories: {},
    ttsEnabled: false,
  }
}

// ─── Toast component ──────────────────────────────────────────────────────────
function Toast({
  message,
  type,
  onClose,
}: {
  message: string
  type: 'error' | 'success' | 'info'
  onClose: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-md ${colors[type]}`}
    >
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Page() {
  const [mounted, setMounted] = useState(false)

  // ── Core state
  const [apiKey, setApiKey] = useState('')
  const [subjects, setSubjects] = useState<Record<string, Subject>>({})
  const [activeSubject, setActiveSubject] = useState('')
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({})
  const [ttsEnabled, setTtsEnabled] = useState(false)

  // ── UI state
  const [activeTab, setActiveTab] = useState<'summary' | 'podcast' | 'qa'>('summary')
  const [newSubjectName, setNewSubjectName] = useState('')
  const [renamingSubject, setRenamingSubject] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingSubject, setDeletingSubject] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null)

  // ── Upload state
  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // ── Generation state
  const [summaryFocus, setSummaryFocus] = useState('')
  const [summaryOutput, setSummaryOutput] = useState('')
  const [summaryStreaming, setSummaryStreaming] = useState(false)

  const [podcastFocus, setPodcastFocus] = useState('')
  const [podcastOutput, setPodcastOutput] = useState('')
  const [podcastStreaming, setPodcastStreaming] = useState(false)

  // ── Chat state
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const [chatSessionActive, setChatSessionActive] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load from localStorage on mount
  useEffect(() => {
    const saved = loadState()
    setApiKey(saved.apiKey)
    setSubjects(saved.subjects)
    setActiveSubject(saved.activeSubject)
    setChatHistories(saved.chatHistories)
    setTtsEnabled(saved.ttsEnabled)
    setMounted(true)
  }, [])

  // ── Save to localStorage whenever state changes
  useEffect(() => {
    if (!mounted) return
    const state: PersistedState = {
      apiKey,
      subjects,
      activeSubject,
      chatHistories,
      ttsEnabled,
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
    } catch {}
  }, [mounted, apiKey, subjects, activeSubject, chatHistories, ttsEnabled])

  // ── Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistories, chatStreaming])

  const showToast = useCallback(
    (message: string, type: 'error' | 'success' | 'info' = 'info') => {
      setToast({ message, type })
    },
    []
  )

  // ── Subject operations
  const currentSubject: Subject | null = subjects[activeSubject] ?? null
  const hasMaterials = currentSubject
    ? currentSubject.files.length > 0 || currentSubject.urls.length > 0
    : false

  const addSubject = () => {
    const name = newSubjectName.trim()
    if (!name) return
    if (subjects[name]) {
      showToast('A subject with that name already exists.', 'error')
      return
    }
    setSubjects((prev) => ({
      ...prev,
      [name]: { name, files: [], urls: [] },
    }))
    setActiveSubject(name)
    setNewSubjectName('')
    setActiveTab('summary')
  }

  const renameSubject = (oldName: string, newName: string) => {
    newName = newName.trim()
    if (!newName || newName === oldName) {
      setRenamingSubject(null)
      return
    }
    if (subjects[newName]) {
      showToast('A subject with that name already exists.', 'error')
      return
    }
    setSubjects((prev) => {
      const next = { ...prev }
      const subj = { ...next[oldName], name: newName }
      delete next[oldName]
      next[newName] = subj
      return next
    })
    setChatHistories((prev) => {
      const next = { ...prev }
      if (next[oldName]) {
        next[newName] = next[oldName]
        delete next[oldName]
      }
      return next
    })
    if (activeSubject === oldName) setActiveSubject(newName)
    setRenamingSubject(null)
  }

  const deleteSubject = (name: string) => {
    setSubjects((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    setChatHistories((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    if (activeSubject === name) {
      const remaining = Object.keys(subjects).filter((k) => k !== name)
      setActiveSubject(remaining[0] ?? '')
    }
    setDeletingSubject(null)
  }

  // ── File upload
  const uploadFile = async (file: File) => {
    if (!apiKey) {
      showToast('Please enter your Gemini API key first.', 'error')
      return
    }
    if (!activeSubject) {
      showToast('Please select a subject first.', 'error')
      return
    }

    const allowed = ['pdf', 'docx', 'txt', 'md']
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!allowed.includes(ext)) {
      showToast(`File type .${ext} is not supported. Use PDF, DOCX, TXT, or MD.`, 'error')
      return
    }

    setUploadingFile(file.name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('apiKey', apiKey)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Upload failed')
      }

      const data = await res.json()
      const storedFile: StoredFile = {
        geminiFileUri: data.uri,
        geminiFileName: data.name,
        displayName: data.displayName,
        mimeType: data.mimeType,
        uploadedAt: Date.now(),
      }

      setSubjects((prev) => ({
        ...prev,
        [activeSubject]: {
          ...prev[activeSubject],
          files: [...prev[activeSubject].files, storedFile],
        },
      }))
      showToast(`"${file.name}" uploaded successfully!`, 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(`Upload failed: ${message}`, 'error')
    } finally {
      setUploadingFile(null)
    }
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach(uploadFile)
    e.target.value = ''
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(uploadFile)
  }

  const removeFile = (subjectName: string, fileUri: string) => {
    setSubjects((prev) => ({
      ...prev,
      [subjectName]: {
        ...prev[subjectName],
        files: prev[subjectName].files.filter((f) => f.geminiFileUri !== fileUri),
      },
    }))
  }

  // ── URL operations
  const addUrl = async () => {
    const url = urlInput.trim()
    if (!url) return
    if (!activeSubject) {
      showToast('Please select a subject first.', 'error')
      return
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`)
    } catch {
      showToast('Please enter a valid URL.', 'error')
      return
    }

    const finalUrl = parsedUrl.href
    if (subjects[activeSubject]?.urls.some((u) => u.url === finalUrl)) {
      showToast('This URL is already added.', 'info')
      return
    }

    const subjectUrl: SubjectURL = {
      url: finalUrl,
      title: parsedUrl.hostname,
      addedAt: Date.now(),
    }

    setSubjects((prev) => ({
      ...prev,
      [activeSubject]: {
        ...prev[activeSubject],
        urls: [...prev[activeSubject].urls, subjectUrl],
      },
    }))
    setUrlInput('')
    showToast(`URL added: ${parsedUrl.hostname}`, 'success')
  }

  const removeUrl = (subjectName: string, url: string) => {
    setSubjects((prev) => ({
      ...prev,
      [subjectName]: {
        ...prev[subjectName],
        urls: prev[subjectName].urls.filter((u) => u.url !== url),
      },
    }))
  }

  // ── Summary generation
  const generateSummary = async () => {
    if (!apiKey) { showToast('Please enter your Gemini API key.', 'error'); return }
    if (!currentSubject) return
    if (!hasMaterials) { showToast('Please add files or URLs first.', 'error'); return }

    setSummaryOutput('')
    setSummaryStreaming(true)
    try {
      await streamFetch(
        '/api/generate',
        {
          apiKey,
          files: currentSubject.files,
          urls: currentSubject.urls.map((u) => u.url),
          prompt: summaryFocus,
          mode: 'summary',
          subject: activeSubject,
        },
        (chunk) => setSummaryOutput((prev) => prev + chunk)
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(`Generation failed: ${message}`, 'error')
    } finally {
      setSummaryStreaming(false)
    }
  }

  // ── Podcast generation
  const generatePodcast = async () => {
    if (!apiKey) { showToast('Please enter your Gemini API key.', 'error'); return }
    if (!currentSubject) return
    if (!hasMaterials) { showToast('Please add files or URLs first.', 'error'); return }

    setPodcastOutput('')
    setPodcastStreaming(true)
    try {
      await streamFetch(
        '/api/generate',
        {
          apiKey,
          files: currentSubject.files,
          urls: currentSubject.urls.map((u) => u.url),
          prompt: podcastFocus,
          mode: 'podcast',
          subject: activeSubject,
        },
        (chunk) => setPodcastOutput((prev) => prev + chunk)
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(`Generation failed: ${message}`, 'error')
    } finally {
      setPodcastStreaming(false)
    }
  }

  // ── Chat operations
  const currentChatHistory = chatHistories[activeSubject] ?? []

  const startChatSession = async () => {
    if (!apiKey) { showToast('Please enter your Gemini API key.', 'error'); return }
    if (!currentSubject) return
    if (!hasMaterials) { showToast('Please add files or URLs first.', 'error'); return }

    setChatSessionActive(true)
    setChatStreaming(true)

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    setChatHistories((prev) => ({
      ...prev,
      [activeSubject]: [assistantMsg],
    }))

    let accumulated = ''
    try {
      await streamFetch(
        '/api/chat',
        {
          apiKey,
          files: currentSubject.files,
          urls: currentSubject.urls.map((u) => u.url),
          history: [],
          message: '',
          subject: activeSubject,
          isFirst: true,
        },
        (chunk) => {
          accumulated += chunk
          setChatHistories((prev) => {
            const hist = [...(prev[activeSubject] ?? [])]
            if (hist.length > 0) {
              hist[hist.length - 1] = {
                ...hist[hist.length - 1],
                content: accumulated,
              }
            }
            return { ...prev, [activeSubject]: hist }
          })
        }
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(`Chat failed: ${message}`, 'error')
      setChatSessionActive(false)
    } finally {
      setChatStreaming(false)
    }
  }

  const sendChatMessage = async () => {
    const msg = chatInput.trim()
    if (!msg || chatStreaming) return
    if (!apiKey) { showToast('Please enter your Gemini API key.', 'error'); return }

    const userMsg: ChatMessage = {
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    }
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
    }

    // Get current history before update for API call
    const historyForApi = [...currentChatHistory]

    setChatHistories((prev) => ({
      ...prev,
      [activeSubject]: [...(prev[activeSubject] ?? []), userMsg, assistantMsg],
    }))
    setChatInput('')
    setChatStreaming(true)

    let accumulated = ''
    try {
      await streamFetch(
        '/api/chat',
        {
          apiKey,
          files: currentSubject?.files ?? [],
          urls: currentSubject?.urls.map((u) => u.url) ?? [],
          history: historyForApi,
          message: msg,
          subject: activeSubject,
          isFirst: false,
        },
        (chunk) => {
          accumulated += chunk
          setChatHistories((prev) => {
            const hist = [...(prev[activeSubject] ?? [])]
            if (hist.length > 0) {
              hist[hist.length - 1] = {
                ...hist[hist.length - 1],
                content: accumulated,
              }
            }
            return { ...prev, [activeSubject]: hist }
          })
        }
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(`Chat failed: ${message}`, 'error')
    } finally {
      setChatStreaming(false)
    }
  }

  const clearChatSession = () => {
    setChatHistories((prev) => ({ ...prev, [activeSubject]: [] }))
    setChatSessionActive(false)
  }

  // ── Download helper
  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  const subjectKeys = Object.keys(subjects)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="w-[280px] flex-shrink-0 bg-slate-900 flex flex-col h-screen overflow-hidden">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            <span className="text-white font-semibold text-lg tracking-tight">Study Agent</span>
          </div>
          <p className="text-slate-400 text-xs mt-1">AI-powered learning assistant</p>
        </div>

        <div className="mx-5 border-t border-slate-700/60" />

        {/* API Key */}
        <div className="px-5 pt-4 pb-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
            <Key className="w-3.5 h-3.5" />
            Gemini API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full bg-slate-800 text-slate-300 text-xs px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
          />
        </div>

        {/* TTS Toggle */}
        <div className="px-5 pb-3">
          <button
            onClick={() => setTtsEnabled((v) => !v)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              ttsEnabled
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
            }`}
          >
            {ttsEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
            Text-to-Speech {ttsEnabled ? 'On' : 'Off'}
          </button>
        </div>

        <div className="mx-5 border-t border-slate-700/60" />

        {/* Subjects section */}
        <div className="px-5 pt-3 pb-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subjects</p>
        </div>

        {/* Add subject form */}
        <div className="px-5 pb-3">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSubject()}
              placeholder="New subject..."
              className="flex-1 bg-slate-800 text-slate-300 text-xs px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 min-w-0"
            />
            <button
              onClick={addSubject}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Subject list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 sidebar-scroll space-y-1">
          {subjectKeys.length === 0 && (
            <p className="text-slate-600 text-xs text-center py-4 px-2">
              Add a subject to get started
            </p>
          )}
          {subjectKeys.map((name) => {
            const subj = subjects[name]
            const isActive = name === activeSubject
            const isRenaming = renamingSubject === name
            const isDeleting = deletingSubject === name
            const count = subj.files.length + subj.urls.length

            return (
              <div
                key={name}
                className={`rounded-lg overflow-hidden transition-colors ${
                  isActive ? 'bg-indigo-600' : 'hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  {isRenaming ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameSubject(name, renameValue)
                          if (e.key === 'Escape') setRenamingSubject(null)
                        }}
                        className="flex-1 min-w-0 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-500 focus:outline-none focus:border-indigo-400"
                      />
                      <button
                        onClick={() => renameSubject(name, renameValue)}
                        className="text-green-400 hover:text-green-300 p-0.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setRenamingSubject(null)}
                        className="text-slate-400 hover:text-slate-300 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : isDeleting ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-red-300 text-xs flex-1 min-w-0 truncate">Delete &ldquo;{name}&rdquo;?</span>
                      <button
                        onClick={() => deleteSubject(name)}
                        className="text-red-400 hover:text-red-300 p-0.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingSubject(null)}
                        className="text-slate-400 hover:text-slate-300 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setActiveSubject(name)
                          setActiveTab('summary')
                        }}
                        className={`flex-1 min-w-0 text-left text-xs font-medium truncate py-0.5 transition-colors ${
                          isActive ? 'text-white' : 'text-slate-300'
                        }`}
                      >
                        {name}
                      </button>
                      {count > 0 && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            isActive
                              ? 'bg-indigo-500 text-indigo-100'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setRenamingSubject(name)
                          setRenameValue(name)
                          setActiveSubject(name)
                        }}
                        className={`p-0.5 rounded transition-colors flex-shrink-0 ${
                          isActive
                            ? 'text-indigo-200 hover:text-white'
                            : 'text-slate-600 hover:text-slate-300'
                        }`}
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setDeletingSubject(name)}
                        className={`p-0.5 rounded transition-colors flex-shrink-0 ${
                          isActive
                            ? 'text-indigo-200 hover:text-red-300'
                            : 'text-slate-600 hover:text-red-400'
                        }`}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700/60">
          <p className="text-slate-600 text-xs text-center">Powered by Gemini 2.5 Flash</p>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main className="flex-1 bg-slate-50 overflow-y-auto">
        {!activeSubject || !currentSubject ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 bg-indigo-100 rounded-2xl flex items-center justify-center mb-5">
              <BookOpen className="w-10 h-10 text-indigo-500" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-800 mb-2">Welcome to Study Agent</h2>
            <p className="text-slate-500 max-w-sm">
              Create a subject in the sidebar, then add your study materials to get started.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-4 max-w-lg">
              {[
                { icon: Sparkles, label: 'Summary', desc: 'Structured breakdown' },
                { icon: Mic, label: 'Podcast', desc: 'Story-driven narration' },
                { icon: GraduationCap, label: 'Q&A', desc: 'Chat with AI professor' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm text-center">
                  <Icon className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{activeSubject}</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {currentSubject.files.length} file{currentSubject.files.length !== 1 ? 's' : ''} &bull;{' '}
                {currentSubject.urls.length} URL{currentSubject.urls.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Add Materials */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4 text-slate-400" />
                Add Materials
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {/* File upload zone */}
                <div>
                  <div
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                        <p className="text-xs text-slate-600 truncate max-w-full px-2">
                          Uploading {uploadingFile}...
                        </p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-600">
                          Drop files or click to upload
                        </p>
                        <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, MD</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>

                {/* URL input */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Add URL
                  </label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                      placeholder="https://example.com/article"
                      className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={addUrl}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* URL list */}
                  {currentSubject.urls.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {currentSubject.urls.map((u) => (
                        <div
                          key={u.url}
                          className="flex items-center gap-2 py-1 px-2 bg-slate-50 rounded-lg group"
                        >
                          <Globe className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <a
                            href={u.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline flex-1 min-w-0 truncate"
                          >
                            {u.title || new URL(u.url).hostname}
                          </a>
                          <button
                            onClick={() => removeUrl(activeSubject, u.url)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Files list */}
            {currentSubject.files.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Uploaded Files
                </h3>
                <div className="space-y-1.5">
                  {currentSubject.files.map((f) => (
                    <div
                      key={f.geminiFileUri}
                      className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-slate-50 group transition-colors"
                    >
                      <FileIcon mimeType={f.mimeType} />
                      <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                        {f.displayName}
                      </span>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {timeAgo(f.uploadedAt)}
                      </span>
                      <button
                        onClick={() => removeFile(activeSubject, f.geminiFileUri)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status banner */}
            {hasMaterials && (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <p className="text-sm text-green-800 font-medium">
                  Materials ready &mdash; choose a mode below
                </p>
                <ChevronRight className="w-4 h-4 text-green-600 ml-auto" />
              </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-slate-200">
                {([
                  { key: 'summary', label: 'Summary', icon: Sparkles },
                  { key: 'podcast', label: 'Podcast', icon: Mic },
                  { key: 'qa', label: 'Q&A', icon: GraduationCap },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors flex-1 justify-center ${
                      activeTab === key
                        ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Summary Tab ── */}
              {activeTab === 'summary' && (
                <div className="p-5">
                  <div className="flex gap-3 mb-4">
                    <input
                      type="text"
                      value={summaryFocus}
                      onChange={(e) => setSummaryFocus(e.target.value)}
                      placeholder="Optional: focus on a specific topic or aspect..."
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={generateSummary}
                      disabled={summaryStreaming || !hasMaterials}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                    >
                      {summaryStreaming ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate
                        </>
                      )}
                    </button>
                  </div>

                  {summaryOutput && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-700">Summary</h3>
                        <div className="flex items-center gap-2">
                          {ttsEnabled && (
                            <button
                              onClick={() => speak(summaryOutput, ttsEnabled)}
                              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              Listen
                            </button>
                          )}
                          <button
                            onClick={() =>
                              downloadText(summaryOutput, `${activeSubject}-summary.txt`)
                            }
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        </div>
                      </div>
                      <div
                        className={`bg-slate-50 border border-slate-200 rounded-xl p-5 max-h-[600px] overflow-y-auto prose-content text-sm text-slate-800 ${
                          summaryStreaming ? 'streaming-cursor' : ''
                        }`}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(summaryOutput) }}
                      />
                    </div>
                  )}

                  {!summaryOutput && !summaryStreaming && (
                    <div className="text-center py-10 text-slate-400">
                      <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Generate a structured summary of your materials</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Podcast Tab ── */}
              {activeTab === 'podcast' && (
                <div className="p-5">
                  <div className="flex gap-3 mb-4">
                    <input
                      type="text"
                      value={podcastFocus}
                      onChange={(e) => setPodcastFocus(e.target.value)}
                      placeholder="Optional: focus on a specific angle or theme..."
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={generatePodcast}
                      disabled={podcastStreaming || !hasMaterials}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                    >
                      {podcastStreaming ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Writing...
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" />
                          Generate
                        </>
                      )}
                    </button>
                  </div>

                  {podcastOutput && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-700">Podcast Script</h3>
                        <div className="flex items-center gap-2">
                          {ttsEnabled && (
                            <button
                              onClick={() => speak(podcastOutput, ttsEnabled)}
                              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              Listen
                            </button>
                          )}
                          <button
                            onClick={() =>
                              downloadText(podcastOutput, `${activeSubject}-podcast.txt`)
                            }
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        </div>
                      </div>
                      <div
                        className={`bg-slate-50 border border-slate-200 rounded-xl p-5 max-h-[600px] overflow-y-auto prose-content text-sm text-slate-800 ${
                          podcastStreaming ? 'streaming-cursor' : ''
                        }`}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(podcastOutput) }}
                      />
                    </div>
                  )}

                  {!podcastOutput && !podcastStreaming && (
                    <div className="text-center py-10 text-slate-400">
                      <Mic className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Generate an engaging podcast-style narration</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Q&A Tab ── */}
              {activeTab === 'qa' && (
                <div className="flex flex-col" style={{ height: '600px' }}>
                  {!chatSessionActive && currentChatHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 p-8">
                      <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
                        <GraduationCap className="w-8 h-8 text-indigo-600" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-800 mb-1">
                        Study Session
                      </h3>
                      <p className="text-sm text-slate-500 text-center max-w-xs mb-6">
                        Start a session with your AI professor. They will guide you through the material and answer your questions.
                      </p>
                      <button
                        onClick={startChatSession}
                        disabled={!hasMaterials}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
                      >
                        <GraduationCap className="w-5 h-5" />
                        Start Study Session
                      </button>
                      {!hasMaterials && (
                        <p className="text-xs text-slate-400 mt-3">
                          Add materials first to start a session
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Chat header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                            <GraduationCap className="w-4 h-4 text-indigo-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-700">
                            AI Professor
                          </span>
                          <span className="w-2 h-2 bg-green-400 rounded-full" />
                        </div>
                        <button
                          onClick={clearChatSession}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          New Session
                        </button>
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        {currentChatHistory.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {msg.role === 'assistant' && (
                              <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                                <span className="text-xs">🎓</span>
                              </div>
                            )}
                            <div
                              className={`max-w-[75%] ${
                                msg.role === 'user'
                                  ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5'
                                  : 'bg-white border border-slate-200 rounded-2xl rounded-tl-sm shadow-sm px-4 py-3'
                              }`}
                            >
                              {msg.role === 'assistant' && msg.content === '' && chatStreaming ? (
                                <div className="flex items-center gap-1 py-1">
                                  <span className="text-sm text-slate-400">Thinking</span>
                                  <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" />
                                </div>
                              ) : msg.role === 'assistant' ? (
                                <div
                                  className={`prose-content text-sm text-slate-800 ${
                                    i === currentChatHistory.length - 1 && chatStreaming
                                      ? 'streaming-cursor'
                                      : ''
                                  }`}
                                  dangerouslySetInnerHTML={{
                                    __html: renderMarkdown(msg.content),
                                  }}
                                />
                              ) : (
                                <p className="text-sm">{msg.content}</p>
                              )}

                              {/* TTS button for assistant messages */}
                              {msg.role === 'assistant' && msg.content && ttsEnabled && (
                                <button
                                  onClick={() => speak(msg.content, ttsEnabled)}
                                  className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 transition-colors"
                                >
                                  <Volume2 className="w-3 h-3" />
                                  Listen
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Chat input */}
                      <div className="px-4 py-3 border-t border-slate-100">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                sendChatMessage()
                              }
                            }}
                            placeholder="Ask your professor anything..."
                            disabled={chatStreaming}
                            className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
                          />
                          <button
                            onClick={sendChatMessage}
                            disabled={chatStreaming || !chatInput.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-colors flex-shrink-0"
                          >
                            {chatStreaming ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Send className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
