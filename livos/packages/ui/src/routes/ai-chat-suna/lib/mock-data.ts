// Stage 1a mock data — replaces Suna API calls (react-query hooks)
// Stage 2 will wire real tRPC endpoints

export interface MockThread {
  threadId: string
  projectId: string
  projectName: string
  url: string
  updatedAt: string
}

export interface MockUser {
  display_name: string
  email: string
  avatar: string
  tier: string
  credits: number
}

// 6 mock chat threads matching the image spec
export const MOCK_THREADS: MockThread[] = [
  {
    threadId: 'thread-1',
    projectId: 'proj-1',
    projectName: 'do some research...',
    url: '#',
    updatedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(), // 14m ago
  },
  {
    threadId: 'thread-2',
    projectId: 'proj-2',
    projectName: 'can you research nv...',
    url: '#',
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
  },
  {
    threadId: 'thread-3',
    projectId: 'proj-3',
    projectName: 'Model Info',
    url: '#',
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
  },
  {
    threadId: 'thread-4',
    projectId: 'proj-4',
    projectName: 'BYND Stock Analysis',
    url: '#',
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
  },
  {
    threadId: 'thread-5',
    projectId: 'proj-5',
    projectName: 'BYND Stock Volatility',
    url: '#',
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
  },
  {
    threadId: 'thread-6',
    projectId: 'proj-6',
    projectName: 'AI Trends Today',
    url: '#',
    updatedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8h ago
  },
]

// Mock user matching the image spec
export const MOCK_USER: MockUser = {
  display_name: 'jacob',
  email: 'jacob@example.com',
  avatar: '',
  tier: 'Ultra',
  credits: 999999,
}
