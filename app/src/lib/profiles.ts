/**
 * Profiles — parent-first accounts, mocked locally.
 *
 * The adult holds the account; learners are nickname + avatar + band, nothing
 * else (no child email, no child password). This store mirrors the shape the
 * backend will have so the UI does not change when it arrives. Persisted with
 * the same storage-or-memory adapter idea as the event log.
 */

import { useSyncExternalStore } from 'react'
import type { Band } from './bands'
import { setActiveProfile } from './events'

export interface LearnerProfile {
  id: string
  nickname: string
  /** Emoji avatar — no photos of children. */
  avatar: string
  band: Band
  createdAt: number
}

export interface ParentAccount {
  /** Display name for the parent home. */
  name: string
  /** How they signed up (mocked): phone (OTP) or email. */
  contact: string
  learners: LearnerProfile[]
  activeLearnerId: string
}

export const AVATARS = ['🦉', '🐢', '🦊', '🐘', '🦜', '🐙', '🦒', '🐝', '🦋', '🐬']

const KEY = 'ploobia.profiles.v1'

const DEFAULT: ParentAccount = {
  name: '',
  contact: '',
  learners: [
    { id: 'local-learner', nickname: 'Player 1', avatar: '🦉', band: 'scientist', createdAt: 0 },
  ],
  activeLearnerId: 'local-learner',
}

function load(): ParentAccount {
  try {
    const raw = window.localStorage?.getItem(KEY)
    if (raw) return JSON.parse(raw) as ParentAccount
  } catch {
    /* storage blocked */
  }
  return DEFAULT
}
function save(a: ParentAccount) {
  try {
    window.localStorage?.setItem(KEY, JSON.stringify(a))
  } catch {
    /* ignore */
  }
}

let account: ParentAccount = typeof window === 'undefined' ? DEFAULT : load()
setActiveProfile(account.activeLearnerId)
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function getAccount(): ParentAccount {
  return account
}
export function useAccount(): ParentAccount {
  return useSyncExternalStore(subscribe, getAccount, getAccount)
}
export function useActiveLearner(): LearnerProfile {
  const a = useAccount()
  return a.learners.find((l) => l.id === a.activeLearnerId) ?? a.learners[0]
}

function commit(next: ParentAccount) {
  account = next
  save(account)
  setActiveProfile(account.activeLearnerId)
  notify()
}

export function setParent(name: string, contact: string): void {
  commit({ ...account, name, contact })
}

export function addLearner(nickname: string, avatar: string, band: Band): LearnerProfile {
  const id = `learner-${Date.now().toString(36)}`
  const learner: LearnerProfile = { id, nickname: nickname.trim() || 'Learner', avatar, band, createdAt: Date.now() }
  commit({ ...account, learners: [...account.learners, learner], activeLearnerId: id })
  return learner
}

export function updateLearner(id: string, patch: Partial<Omit<LearnerProfile, 'id'>>): void {
  commit({
    ...account,
    learners: account.learners.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  })
}

export function removeLearner(id: string): void {
  const rest = account.learners.filter((l) => l.id !== id)
  if (!rest.length) return
  commit({
    ...account,
    learners: rest,
    activeLearnerId: account.activeLearnerId === id ? rest[0].id : account.activeLearnerId,
  })
}

export function selectLearner(id: string): void {
  if (!account.learners.some((l) => l.id === id)) return
  commit({ ...account, activeLearnerId: id })
}
