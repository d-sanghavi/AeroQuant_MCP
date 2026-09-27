/**
 * Promise wrapper around the data worker.
 *
 * One worker, one instance, created lazily. Requests are correlated by id, and a
 * request that is superseded before it resolves is simply ignored by the caller - the
 * worker is fast enough that cancellation machinery would cost more than it saves.
 */

import type { WorkerRequest, WorkerResponse } from './worker/protocol'

type Resolver = {
  resolve: (value: WorkerResponse) => void
  reject: (reason: Error) => void
  onProgress?: (fraction: number, label: string) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Resolver>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker/data.worker.ts', import.meta.url), {
    type: 'module',
    name: 'aeroquant-data',
  })
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data
    const entry = pending.get(msg.id)
    if (!entry) return
    if (msg.type === 'progress') {
      entry.onProgress?.(msg.fraction, msg.label)
      return
    }
    pending.delete(msg.id)
    if (msg.type === 'error') {
      const err = new Error(msg.message)
      if (msg.stack) err.stack = msg.stack
      entry.reject(err)
      return
    }
    entry.resolve(msg)
  })
  worker.addEventListener('error', (event) => {
    const err = new Error(event.message || 'The data worker failed to start.')
    for (const [, entry] of pending) entry.reject(err)
    pending.clear()
  })
  return worker
}

function request<T extends WorkerResponse['type']>(
  payload: Omit<Extract<WorkerRequest, { type: string }>, 'id'>,
  expect: T,
  onProgress?: (fraction: number, label: string) => void,
): Promise<Extract<WorkerResponse, { type: T }>> {
  const w = ensureWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: (msg) => {
        if (msg.type !== expect) {
          reject(new Error(`Expected a ${expect} response, got ${msg.type}`))
          return
        }
        resolve(msg as Extract<WorkerResponse, { type: T }>)
      },
      reject,
      onProgress,
    })
    w.postMessage({ ...payload, id } as WorkerRequest)
  })
}

type Req = WorkerRequest

export const dataWorker = {
  generate: (seed: number, onProgress?: (f: number, label: string) => void) =>
    request({ type: 'generate', seed } as Omit<Req, 'id'>, 'generated', onProgress).then(
      (m) => m.summary,
    ),

  indices: (filter: Extract<Req, { type: 'indices' }>['filter']) =>
    request({ type: 'indices', filter } as Omit<Req, 'id'>, 'indices').then((m) => m.payload),

  termStructure: (filter: Extract<Req, { type: 'termStructure' }>['filter']) =>
    request({ type: 'termStructure', filter } as Omit<Req, 'id'>, 'termStructure').then(
      (m) => m.payload,
    ),

  attribution: (
    filter: Extract<Req, { type: 'attribution' }>['filter'],
    period?: string,
  ) =>
    request({ type: 'attribution', filter, period } as Omit<Req, 'id'>, 'attribution').then(
      (m) => m.payload,
    ),

  anomalies: (filter: Extract<Req, { type: 'anomalies' }>['filter'], q = 0.05) =>
    request({ type: 'anomalies', filter, q } as Omit<Req, 'id'>, 'anomalies').then(
      (m) => m.payload,
    ),

  portfolio: (filter: Extract<Req, { type: 'portfolio' }>['filter']) =>
    request({ type: 'portfolio', filter } as Omit<Req, 'id'>, 'portfolio').then((m) => m.payload),

  carriers: (filter: Extract<Req, { type: 'carriers' }>['filter']) =>
    request({ type: 'carriers', filter } as Omit<Req, 'id'>, 'carriers').then((m) => m.payload),

  pivot: (spec: Extract<Req, { type: 'pivot' }>['spec']) =>
    request({ type: 'pivot', spec } as Omit<Req, 'id'>, 'pivot').then((m) => m.payload),

  routeDetail: (routeId: string, filter: Extract<Req, { type: 'routeDetail' }>['filter']) =>
    request({ type: 'routeDetail', routeId, filter } as Omit<Req, 'id'>, 'routeDetail').then(
      (m) => m.payload,
    ),

  lineage: (args: Omit<Extract<Req, { type: 'lineage' }>, 'id' | 'type'>) =>
    request({ type: 'lineage', ...args } as Omit<Req, 'id'>, 'lineage').then((m) => m.payload),

  observation: (index: number) =>
    request({ type: 'observation', index } as Omit<Req, 'id'>, 'observation').then(
      (m) => m.payload,
    ),

  budget: (
    req: Extract<Req, { type: 'budget' }>['request'],
    filter: Extract<Req, { type: 'budget' }>['filter'],
  ) =>
    request({ type: 'budget', request: req, filter } as Omit<Req, 'id'>, 'budget').then(
      (m) => m.payload,
    ),
}
