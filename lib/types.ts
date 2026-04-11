export interface StoredFile {
  geminiFileUri: string
  geminiFileName: string
  displayName: string
  mimeType: string
  uploadedAt: number
  localId: string      // key into IndexedDB
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
  wiki?: SubjectWiki
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface WikiPage {
  path: string        // e.g. "sources/barco.md"
  content: string     // markdown
  updatedAt: number
}

export interface SubjectWiki {
  pages: Record<string, WikiPage>  // path -> WikiPage
}

export interface AppState {
  apiKey: string
  subjects: Record<string, Subject>
  activeSubject: string
  chatHistories: Record<string, ChatMessage[]>
  ttsEnabled: boolean
  wikis: Record<string, SubjectWiki>  // subject name -> wiki
}
