# Testing Patterns

**Analysis Date:** 2026-02-03

## Test Framework

**Runner:**
- Vitest for unit and integration tests (livinityd)
- Playwright for E2E tests (UI package)
- Config: `livos/packages/livinityd/package.json` scripts

**Assertion Library:**
- Vitest built-in `expect`
- Playwright `expect` for E2E

**Run Commands:**
```bash
# livinityd tests
npm run test                    # All tests (180s timeout)
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests only
npm run test:coverage          # Open coverage report

# UI E2E tests
npx playwright test            # Run all E2E tests
npx playwright test --headed   # Run with browser visible
```

## Test File Organization

**Location:**
- Co-located with source code
- Tests live next to the files they test

**Naming:**
- Unit tests: `*.unit.test.ts` (e.g., `system.unit.test.ts`)
- Integration tests: `*.integration.test.ts` (e.g., `files.list.integration.test.ts`)
- E2E tests: `*.spec.ts` in `tests/` directory (e.g., `happy-path.spec.ts`)
- Descriptive prefixes: `files.list.integration.test.ts`, `files.copy.integration.test.ts`

**Structure:**
```
livos/packages/livinityd/source/modules/
├── files/
│   ├── files.ts                           # Source
│   ├── files.list.integration.test.ts     # Integration test
│   ├── files.copy.integration.test.ts     # Integration test
│   ├── files.trash.test.ts                # Unit test
│   └── recents.test.ts                    # Unit test
├── system/
│   ├── system.ts
│   └── system.unit.test.ts
└── test-utilities/
    ├── create-test-livinityd.ts           # Test helpers
    └── run-git-server.ts                  # Test infrastructure
```

## Test Structure

**Suite Organization:**
```typescript
// Unit test pattern (system.unit.test.ts)
import {describe, afterEach, expect, test, vi} from 'vitest'

vi.mock('systeminformation')
vi.mock('execa')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getCpuTemperature', () => {
  test('should return main cpu temperature when system supports it', async () => {
    vi.mocked(systemInformation.cpuTemperature).mockResolvedValue({main: 69} as any)
    expect(await getCpuTemperature()).toMatchObject({warning: 'normal', temperature: 69})
  })

  test('should throw error when system does not support cpu temperature', async () => {
    vi.mocked(systemInformation.cpuTemperature).mockResolvedValue({main: null} as any)
    expect(getCpuTemperature()).rejects.toThrow('Could not get CPU temperature')
  })
})
```

**Integration test pattern:**
```typescript
// Integration test pattern (files.list.integration.test.ts)
import {vi, expect, beforeAll, afterAll, test} from 'vitest'
import fse from 'fs-extra'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'

let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>

beforeAll(async () => {
  livinityd = await createTestLivinityd()
  await livinityd.registerAndLogin()
})

afterAll(async () => {
  await livinityd.cleanup()
})

test('list() throws invalid error without auth token', async () => {
  await expect(livinityd.unauthenticatedClient.files.list.query({path: '/'}))
    .rejects.toThrow('Invalid token')
})

test('list() lists the root directory', async () => {
  await expect(livinityd.client.files.list.query({path: '/'})).resolves.toMatchObject({
    name: '',
    path: '/',
    type: 'directory',
    files: expect.arrayContaining([
      expect.objectContaining({name: 'Apps'}),
      expect.objectContaining({name: 'Home'}),
    ]),
  })
})
```

**E2E test pattern (Playwright):**
```typescript
// E2E test pattern (happy-path.spec.ts)
import {faker} from '@faker-js/faker'
import {expect, test} from '@playwright/test'

const TEST_USER = faker.person.firstName()
const TEST_PASSWORD = 'sdfsdf'

test.beforeAll(async () => {
  stopLivinityd = await resetLivinitydAndStart()
})

test.afterAll(async () => {
  stopLivinityd?.()
})

test('happy path', async ({page, context}) => {
  await page.goto('localhost:3000')
  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByText('Start')).toBeVisible()
  await page.click('text=Start')
  // ... more assertions
})
```

## Mocking

**Framework:** Vitest `vi.mock()` and `vi.mocked()`

**Patterns:**

1. **Module mocking:**
```typescript
import systemInformation from 'systeminformation'
import * as execa from 'execa'

vi.mock('systeminformation')
vi.mock('execa')

// In test:
vi.mocked(systemInformation.cpuTemperature).mockResolvedValue({main: 69} as any)
vi.mocked(execa.$).mockResolvedValue({ stdout: '...' })
```

2. **Function spy with custom implementation:**
```typescript
const originalLstat = fse.lstat
vi.spyOn(fse, 'lstat').mockImplementation(async (path: fse.PathLike) => {
  if (path.toString().endsWith('/unreadable.txt')) {
    throw new Error('Permission denied')
  }
  return originalLstat(path)
})
```

3. **Restore after each test:**
```typescript
afterEach(() => {
  vi.restoreAllMocks()
})
```

**What to Mock:**
- External services (systeminformation, Docker)
- File system operations for edge cases
- Network requests
- Time-dependent functions

**What NOT to Mock:**
- tRPC client in integration tests (use real server)
- File system in integration tests (use temp directories)
- Business logic under test

## Fixtures and Factories

**Test Data:**
```typescript
// Test credentials
const userCredentials = {
  name: 'satoshi',
  password: 'moneyprintergobrrr',
}

// Test files created in temp directory
await Promise.all([
  fse.writeFile(`${testDirectory}/text.txt`, ''),
  fse.writeFile(`${testDirectory}/image.png`, ''),
  fse.writeFile(`${testDirectory}/video.mp4`, ''),
])
```

**Test Instance Factory:**
```typescript
// livos/packages/livinityd/source/modules/test-utilities/create-test-livinityd.ts
export default async function createTestLivinityd({autoLogin = false, autoStart = true} = {}) {
  const directory = temporaryDirectory()
  await directory.createRoot()

  const gitServer = await runGitServer()
  const dataDirectory = await directory.create()

  const livinityd = new Livinityd({
    dataDirectory,
    port: 0,  // Random available port
    logLevel: 'silent',
    defaultAppStoreRepo: gitServer.url,
  })

  if (autoStart) await livinityd.start()

  const client = createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({ url: `http://localhost:${livinityd.server.port}/trpc` })],
  })

  return {
    instance: livinityd,
    client,
    unauthenticatedClient,
    registerAndLogin,
    cleanup,
  }
}
```

**Location:**
- `livos/packages/livinityd/source/modules/test-utilities/`
- Shared across all integration tests

## Coverage

**Requirements:** No enforced coverage threshold

**Configuration:**
- Uses `@vitest/coverage-v8`
- Reports generated in `coverage/` directory

**View Coverage:**
```bash
npm run test:coverage  # Opens coverage/index.html
```

## Test Types

**Unit Tests:**
- Scope: Single function or module in isolation
- Mocking: Heavy mocking of dependencies
- Speed: Fast (<100ms per test)
- Pattern: `*.unit.test.ts`
- Example: `system.unit.test.ts` tests `getCpuTemperature`, `shutdown`, `reboot`

**Integration Tests:**
- Scope: Multiple modules working together
- Mocking: Real filesystem, real tRPC server, mock external services
- Speed: Slower (100ms-10s per test)
- Pattern: `*.integration.test.ts`
- Example: `files.list.integration.test.ts` tests full file listing flow

**E2E Tests:**
- Framework: Playwright
- Scope: Full user journeys through the UI
- Config: `livos/packages/ui/playwright.config.ts`
- Browsers: Chromium, Firefox, WebKit
- Pattern: `*.spec.ts` in `tests/` directory

## Common Patterns

**Async Testing:**
```typescript
test('async operation succeeds', async () => {
  await expect(asyncFunction()).resolves.toMatchObject({
    success: true,
    data: expect.any(Object),
  })
})

test('async operation fails', async () => {
  await expect(asyncFunction()).rejects.toThrow('Expected error')
})
```

**Error Testing:**
```typescript
test('throws on invalid input', async () => {
  await expect(client.files.list.query({path: ''}))
    .rejects.toThrow('[path-not-absolute]')
})

test('throws on directory traversal attempt', async () => {
  await expect(client.files.list.query({path: '/Home/../../../../etc'}))
    .rejects.toThrow('[invalid-base]')
})
```

**Parallel assertions:**
```typescript
test('multiple paths throw correctly', async () => {
  await Promise.all([
    expect(client.files.list.query({path: ''})).rejects.toThrow('[path-not-absolute]'),
    expect(client.files.list.query({path: '.'})).rejects.toThrow('[path-not-absolute]'),
    expect(client.files.list.query({path: 'Home'})).rejects.toThrow('[path-not-absolute]'),
  ])
})
```

**Cleanup pattern:**
```typescript
test('creates and cleans up test data', async () => {
  const testDirectory = `${livinityd.instance.dataDirectory}/home/test`
  await fse.mkdir(testDirectory)

  try {
    // Test logic here
    const result = await client.files.list.query({path: '/Home/test'})
    expect(result.files).toHaveLength(0)
  } finally {
    // Always clean up
    await fse.remove(testDirectory)
  }
})
```

**Timeout handling:**
```typescript
// In package.json scripts
"test": "vitest --testTimeout 180000 --hookTimeout 180000"
```

## Playwright Configuration

```typescript
// livos/packages/ui/playwright.config.ts
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: {...devices['Desktop Chrome']} },
    { name: 'firefox', use: {...devices['Desktop Firefox']} },
    { name: 'webkit', use: {...devices['Desktop Safari']} },
  ],
})
```

## Vitest Configuration

Configuration is passed via CLI in package.json:
```json
"test": "vitest --testTimeout 180000 --hookTimeout 180000 --maxConcurrency 1 --poolOptions.threads.singleThread true --reporter verbose"
```

Key settings:
- `testTimeout`: 180000ms (3 minutes)
- `hookTimeout`: 180000ms (3 minutes)
- `maxConcurrency`: 1 (tests run sequentially)
- `singleThread`: true (avoid parallelism issues)
- `reporter`: verbose

---

*Testing analysis: 2026-02-03*
