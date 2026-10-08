import type { ResourceEnvironment } from '../workspace/services/projectResourceEnvironment'

export interface DiffSnapshot {
  commitId: string | null
  label: string
  content: string
  resourceRootPath?: string | null
  sourceFilePath?: string | null
  resourceEnvironment?: ResourceEnvironment | null
}

export interface DiffRevisionOption {
  commitId: string | null
  label: string
  shortId?: string
  authoredAtSeconds?: number
}

export interface DiffSession {
  id: string
  fileTypeId: string
  path: string
  name: string
  before: DiffSnapshot
  after: DiffSnapshot
}

export interface DiffComparisonSelection {
  beforeCommitId: string | null
  afterCommitId: string | null
}
