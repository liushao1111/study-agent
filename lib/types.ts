export interface StoredFile {
  geminiFileUri: string
  geminiFileName: string
  displayName: string
  mimeType: string
  uploadedAt: number
}

export interface SubjectURL {
  url: string
  title: string
  addedAt: number
}

export interface Subject {
  name: string
  files: StoredFile[]
  urls: SubjectURL[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AppState {
  apiKey: string
  subjects: Record<string, Subject>
  activeSubject: string
  chatHistories: Record<string, ChatMessage[]>
  ttsEnabled: boolean
}
