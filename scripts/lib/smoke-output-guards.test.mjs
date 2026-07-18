import assert from 'node:assert/strict'
import test from 'node:test'

import { createPreviewSurfaceOutputGuard } from './smoke-output-guards.mjs'

test('preview surface output guard ignores unrelated shutdown noise', () => {
  const guard = createPreviewSurfaceOutputGuard()
  guard.inspectLine(
    '[123:ERROR:content/browser/gpu/gpu_process_host.cc] GPU process exited unexpectedly'
  )
  guard.inspectLine('[backend:warn] WebSocket receive error: Connection reset by peer')
  assert.doesNotThrow(() => guard.assertClean())
})

test('preview surface output guard fails on ipc handler errors', () => {
  const guard = createPreviewSurfaceOutputGuard()
  guard.inspectLine(
    "Error occurred in handler for 'preview-surface:apply-host-commands': TypeError: Object has been destroyed"
  )

  assert.deepEqual(guard.failures(), [
    "Error occurred in handler for 'preview-surface:apply-host-commands': TypeError: Object has been destroyed"
  ])
  assert.throws(
    () => guard.assertClean(),
    /Preview surface host emitted handler error\(s\).*preview-surface:apply-host-commands/
  )
})

test('preview surface output guard fails on native fallback warnings', () => {
  const guard = createPreviewSurfaceOutputGuard()
  guard.inspectLine(
    'Native preview falling back to image polling: the compositor status carries no Metal IOSurface target (metalTargetIosurfaceId=absent), so there is nothing to present natively for this scene.'
  )

  assert.deepEqual(guard.failures(), [
    'Native preview falling back to image polling: the compositor status carries no Metal IOSurface target (metalTargetIosurfaceId=absent), so there is nothing to present natively for this scene.'
  ])
  assert.throws(
    () => guard.assertClean(),
    /Preview surface host emitted handler error\(s\).*falling back to image polling/
  )
})
