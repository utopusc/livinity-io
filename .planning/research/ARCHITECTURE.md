# Security Architecture Research

**Date:** 2026-02-03
**Focus:** Self-hosted Node.js application security hardening patterns for LivOS

---

## 1. Secrets Management

### Problem Statement
LivOS currently has hardcoded secrets in `.env` files including API keys (GEMINI_API_KEY), database credentials (REDIS_URL with password), and authentication secrets (JWT_SECRET). If leaked, these compromise all authentication.

### Industry Best Practices (2025-2026)

#### Hybrid Approach (Recommended)
Use environment variables for non-sensitive configuration, and a secrets manager for credentials, keys, and tokens.

```
Non-sensitive (.env)          Sensitive (Secrets Manager)
---------------------------   ----------------------------
NODE_ENV=production           GEMINI_API_KEY
LOG_LEVEL=info                JWT_SECRET
DAEMON_INTERVAL_MS=30000      REDIS_PASSWORD
PORT=3000                     DATABASE_URL
```

#### Secrets Manager Options

| Solution | Best For | Complexity |
|----------|----------|------------|
| HashiCorp Vault | Self-hosted, multi-cloud | High |
| Doppler | SaaS, team collaboration | Low |
| Infisical | Open-source, self-hosted | Medium |
| Docker Secrets | Docker Swarm environments | Low |
| Kubernetes Secrets | K8s environments | Medium |

#### Implementation Pattern: Bootstrap Token

```typescript
// secrets-manager.ts
import Vault from 'node-vault';

interface SecretsManager {
  get(key: string): Promise<string>;
  getAll(): Promise<Record<string, string>>;
}

class VaultSecretsManager implements SecretsManager {
  private client: Vault.client;
  private secrets: Map<string, string> = new Map();

  constructor() {
    // Bootstrap token from env (short-lived, single-use)
    const bootstrapToken = process.env.VAULT_TOKEN;
    if (!bootstrapToken) {
      throw new Error('VAULT_TOKEN required for bootstrap');
    }

    this.client = Vault({
      endpoint: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
      token: bootstrapToken,
    });
  }

  async initialize(): Promise<void> {
    // Fetch all secrets at startup
    const result = await this.client.read('secret/data/livos');
    const data = result.data.data;

    for (const [key, value] of Object.entries(data)) {
      this.secrets.set(key, value as string);
    }

    // Clear bootstrap token from memory
    delete process.env.VAULT_TOKEN;
  }

  async get(key: string): Promise<string> {
    const value = this.secrets.get(key);
    if (!value) throw new Error(`Secret "${key}" not found`);
    return value;
  }

  async getAll(): Promise<Record<string, string>> {
    return Object.fromEntries(this.secrets);
  }
}

// Fallback for development
class EnvSecretsManager implements SecretsManager {
  async get(key: string): Promise<string> {
    const value = process.env[key];
    if (!value) throw new Error(`Secret "${key}" not found in environment`);
    return value;
  }

  async getAll(): Promise<Record<string, string>> {
    return { ...process.env } as Record<string, string>;
  }
}

export function createSecretsManager(): SecretsManager {
  if (process.env.VAULT_ADDR) {
    return new VaultSecretsManager();
  }
  return new EnvSecretsManager();
}
```

#### Production Checklist
- [ ] Never commit `.env` files (add to `.gitignore`)
- [ ] Rotate all secrets after any suspected leak
- [ ] Use short-lived tokens for bootstrap
- [ ] Set up audit logging for secret access
- [ ] Implement automatic secret rotation where possible
- [ ] Use Kubernetes Secrets or Docker Secrets in containerized environments

### Sources
- [Security Boulevard: Environment Variables in 2026](https://securityboulevard.com/2025/12/are-environment-variables-still-safe-for-secrets-in-2026/)
- [Managing Secrets in Node.js with HashiCorp Vault](https://codersociety.com/blog/articles/hashicorp-vault-node)
- [Node.js Security Best Practices](https://www.nodejs-security.com/blog/do-not-use-secrets-in-environment-variables-and-here-is-how-to-do-it-better)

---

## 2. Shell Command Sandboxing

### Problem Statement
LivOS AI agents can execute shell commands. The current blocklist approach (`shell.ts`) is insufficient and can be bypassed with alternative syntax (e.g., `rm -r /` without `-f`, `curl | bash`, environment variable exfiltration).

### Core Principle: Allowlist Over Blocklist

Blocklists will always have gaps. An attacker can find alternative commands, encodings, or syntax to bypass restrictions. **Allowlists define exactly what is permitted and block everything else.**

### Implementation Patterns

#### Pattern 1: Use `execFile`/`spawn` Instead of `exec`

```typescript
// DANGEROUS - shell interpretation allows injection
import { exec } from 'child_process';
exec(`ls -la ${userInput}`); // userInput: "; rm -rf /"

// SAFE - arguments are passed as array, no shell interpretation
import { execFile, spawn } from 'child_process';
execFile('ls', ['-la', userInput]); // arguments are escaped
spawn('ls', ['-la', userInput], { shell: false }); // explicit no shell
```

#### Pattern 2: Command Allowlist with Argument Validation

```typescript
// safe-shell.ts
import { spawn, type SpawnOptionsWithoutStdio } from 'child_process';

interface CommandConfig {
  bin: string;
  allowedArgs: RegExp[];      // Patterns for allowed argument values
  forbiddenArgs: string[];    // Flags that should never be allowed
  maxArgs: number;
  requiresPath?: boolean;     // If true, last arg must be valid path
}

const COMMAND_ALLOWLIST: Record<string, CommandConfig> = {
  ls: {
    bin: '/bin/ls',
    allowedArgs: [/^-[latrshR]+$/, /^[a-zA-Z0-9_./-]+$/],
    forbiddenArgs: [],
    maxArgs: 10,
  },
  cat: {
    bin: '/bin/cat',
    allowedArgs: [/^[a-zA-Z0-9_./-]+$/],
    forbiddenArgs: [],
    maxArgs: 5,
    requiresPath: true,
  },
  docker: {
    bin: '/usr/bin/docker',
    allowedArgs: [/^(ps|logs|inspect|stats)$/, /^--tail$/, /^\d+$/, /^[a-zA-Z0-9_-]+$/],
    forbiddenArgs: ['--privileged', '-v', '--volume', '--rm', 'exec'],
    maxArgs: 10,
  },
  pm2: {
    bin: '/usr/local/bin/pm2',
    allowedArgs: [/^(list|logs|describe|status)$/, /^--lines$/, /^\d+$/, /^[a-zA-Z0-9_-]+$/],
    forbiddenArgs: ['delete', 'kill', 'flush'],
    maxArgs: 5,
  },
};

// Shell metacharacters that indicate injection attempts
const SHELL_METACHARACTERS = /[;&|`$\\<>(){}[\]!#*?~]/;

// Paths that should never be accessible
const FORBIDDEN_PATHS = [
  '/etc/shadow',
  '/etc/passwd',
  '~/.ssh',
  '/root',
  '/proc',
  '/sys',
  '.env',
];

export interface SafeShellResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export async function safeExec(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<SafeShellResult> {
  // 1. Validate command is in allowlist
  const config = COMMAND_ALLOWLIST[command];
  if (!config) {
    return {
      success: false,
      stdout: '',
      stderr: `Command "${command}" is not allowed. Allowed: ${Object.keys(COMMAND_ALLOWLIST).join(', ')}`,
      code: 1,
    };
  }

  // 2. Validate argument count
  if (args.length > config.maxArgs) {
    return {
      success: false,
      stdout: '',
      stderr: `Too many arguments (max ${config.maxArgs})`,
      code: 1,
    };
  }

  // 3. Validate each argument
  for (const arg of args) {
    // Check for shell metacharacters
    if (SHELL_METACHARACTERS.test(arg)) {
      return {
        success: false,
        stdout: '',
        stderr: `Argument contains forbidden characters: ${arg}`,
        code: 1,
      };
    }

    // Check forbidden args
    if (config.forbiddenArgs.includes(arg)) {
      return {
        success: false,
        stdout: '',
        stderr: `Argument "${arg}" is not allowed for ${command}`,
        code: 1,
      };
    }

    // Check allowed patterns
    const matchesAllowed = config.allowedArgs.some(pattern => pattern.test(arg));
    if (!matchesAllowed) {
      return {
        success: false,
        stdout: '',
        stderr: `Argument "${arg}" does not match allowed patterns for ${command}`,
        code: 1,
      };
    }

    // Check forbidden paths
    for (const forbiddenPath of FORBIDDEN_PATHS) {
      if (arg.includes(forbiddenPath)) {
        return {
          success: false,
          stdout: '',
          stderr: `Access to path "${arg}" is forbidden`,
          code: 1,
        };
      }
    }
  }

  // 4. Execute with spawn (no shell)
  return new Promise((resolve) => {
    const spawnOpts: SpawnOptionsWithoutStdio = {
      shell: false, // CRITICAL: no shell interpretation
      cwd: options?.cwd || '/tmp',
      timeout: options?.timeout || 30000,
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: '/tmp',
        // Minimal env - no secrets
      },
    };

    const proc = spawn(config.bin, args, spawnOpts);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.slice(0, 50000), // Limit output size
        stderr: stderr.slice(0, 10000),
        code,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout: '',
        stderr: err.message,
        code: 1,
      });
    });
  });
}
```

#### Pattern 3: Container-Based Sandboxing (Maximum Security)

For truly untrusted code, use Docker containers with strict limits:

```typescript
// docker-sandbox.ts
import { spawn } from 'child_process';

interface SandboxOptions {
  command: string;
  args: string[];
  timeout?: number;
  memoryLimit?: string;
  cpuLimit?: string;
  networkDisabled?: boolean;
  readOnlyRoot?: boolean;
}

export async function runInSandbox(options: SandboxOptions): Promise<SafeShellResult> {
  const dockerArgs = [
    'run',
    '--rm',                                    // Remove container after execution
    '--network', options.networkDisabled ? 'none' : 'bridge',
    '--memory', options.memoryLimit || '128m',
    '--cpus', options.cpuLimit || '0.5',
    '--pids-limit', '100',                     // Limit processes
    '--read-only',                             // Read-only filesystem
    '--security-opt', 'no-new-privileges',     // No privilege escalation
    '--cap-drop', 'ALL',                       // Drop all capabilities
    '--user', '1000:1000',                     // Non-root user
    'livos-sandbox:latest',                    // Minimal sandbox image
    options.command,
    ...options.args,
  ];

  return new Promise((resolve) => {
    const proc = spawn('docker', dockerArgs, {
      shell: false,
      timeout: options.timeout || 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr, code });
    });
  });
}
```

### Recommended Approach for LivOS

1. **Immediate**: Replace blocklist with strict allowlist in `shell.ts`
2. **Short-term**: Implement argument validation with patterns
3. **Long-term**: Consider container sandboxing for high-risk operations

### Sources
- [Preventing Command Injection in Node.js](https://auth0.com/blog/preventing-command-injection-attacks-in-node-js-apps/)
- [StackHawk: Node.js Command Injection Guide](https://www.stackhawk.com/blog/nodejs-command-injection-examples-and-prevention/)
- [eslint-plugin-security: Avoid Command Injection](https://github.com/eslint-community/eslint-plugin-security/blob/main/docs/avoid-command-injection-node.md)
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices)

---

## 3. Internal Service-to-Service Communication

### Problem Statement
LivOS internal services (Cognee memory at localhost:3300, Firecrawl) are accessed without authentication. Anyone on the local network can add/query memories.

### Authentication Patterns

#### Pattern 1: Mutual TLS (mTLS) - Strongest

Both client and server authenticate each other with certificates.

```typescript
// server-with-mtls.ts
import https from 'https';
import fs from 'fs';
import express from 'express';

const app = express();

const server = https.createServer({
  key: fs.readFileSync('/certs/server-key.pem'),
  cert: fs.readFileSync('/certs/server-cert.pem'),
  ca: fs.readFileSync('/certs/ca-cert.pem'),  // Certificate Authority
  requestCert: true,                           // Require client cert
  rejectUnauthorized: true,                    // Reject invalid certs
}, app);

// Middleware to extract client identity
app.use((req, res, next) => {
  const cert = req.socket.getPeerCertificate();
  if (!cert || !cert.subject) {
    return res.status(401).json({ error: 'Client certificate required' });
  }
  req.clientId = cert.subject.CN; // Common Name identifies the service
  next();
});
```

```typescript
// client-with-mtls.ts
import https from 'https';
import fs from 'fs';

const agent = new https.Agent({
  key: fs.readFileSync('/certs/client-key.pem'),
  cert: fs.readFileSync('/certs/client-cert.pem'),
  ca: fs.readFileSync('/certs/ca-cert.pem'),
});

// Use with fetch or axios
const response = await fetch('https://memory-service:3300/add', {
  agent,
  method: 'POST',
  body: JSON.stringify({ data: 'example' }),
});
```

#### Pattern 2: Shared Secret / API Key - Simple

For internal services on the same host, use a shared secret.

```typescript
// internal-auth-middleware.ts
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['x-internal-api-key'];

  if (!authHeader || authHeader !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing internal API key' });
  }

  next();
}

// Apply to all internal routes
app.use('/internal', requireInternalAuth);
```

#### Pattern 3: JWT with Short Expiry - For Complex Auth

```typescript
// service-jwt.ts
import jwt from 'jsonwebtoken';

const SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET;

interface ServiceToken {
  service: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export function generateServiceToken(service: string, permissions: string[]): string {
  return jwt.sign(
    { service, permissions },
    SERVICE_JWT_SECRET,
    { expiresIn: '5m' } // Short expiry for service-to-service
  );
}

export function verifyServiceToken(token: string): ServiceToken {
  return jwt.verify(token, SERVICE_JWT_SECRET) as ServiceToken;
}

// Middleware
export function requireServiceAuth(requiredPermission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Bearer token required' });
    }

    try {
      const token = authHeader.slice(7);
      const payload = verifyServiceToken(token);

      if (!payload.permissions.includes(requiredPermission)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.serviceId = payload.service;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
```

### Recommended Approach for LivOS

| Service | Recommendation |
|---------|----------------|
| Memory (Cognee) | API Key + localhost binding |
| Redis | Password + TLS in production |
| Internal APIs | JWT with service identity |
| Cross-host communication | mTLS |

```typescript
// Example: Securing memory service calls
async function addMemory(content: string): Promise<void> {
  await fetch('http://127.0.0.1:3300/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': process.env.MEMORY_SERVICE_KEY,
    },
    body: JSON.stringify({ content }),
  });
}
```

### Sources
- [Securing Microservices: JWTs, API Keys, and Service-to-Service Authentication](https://developers-heaven.net/blog/securing-microservices-jwts-api-keys-and-service-to-service-authentication/)
- [Building Secure Microservices with Node.js](https://industrywired.com/building-secure-microservices-with-node-js/)
- [Solo.io: Using JWTs to Authenticate Services](https://www.solo.io/blog/jwts-authenticate-services-api-gateways)

---

## 4. Rate Limiting for AI/LLM APIs

### Problem Statement
LivOS has no rate limiting on AI API calls and tool executions. A single user could exhaust API quotas or enable DoS attacks.

### Algorithm Selection

| Algorithm | Best For | Burst Handling |
|-----------|----------|----------------|
| Fixed Window | Simple APIs | Poor (boundary issues) |
| Sliding Window | General APIs | Good |
| Token Bucket | Burst-tolerant APIs | Excellent |
| Leaky Bucket | Smooth rate enforcement | Good |

**For LLM APIs: Token Bucket is recommended** because LLM workloads are bursty (users send multiple messages, then pause).

### Implementation Patterns

#### Pattern 1: Token Bucket with Redis (Distributed)

```typescript
// rate-limiter.ts
import Redis from 'ioredis';

interface RateLimitConfig {
  bucketSize: number;      // Max tokens in bucket
  refillRate: number;      // Tokens added per second
  tokensPerRequest: number; // Tokens consumed per request
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export class TokenBucketLimiter {
  constructor(
    private redis: Redis,
    private keyPrefix: string,
    private config: RateLimitConfig
  ) {}

  async consume(identifier: string, tokens: number = this.config.tokensPerRequest): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}:${identifier}`;
    const now = Date.now();

    // Lua script for atomic token bucket operation
    const script = `
      local key = KEYS[1]
      local bucket_size = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local requested = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])

      local bucket = redis.call('HMGET', key, 'tokens', 'last_update')
      local tokens = tonumber(bucket[1]) or bucket_size
      local last_update = tonumber(bucket[2]) or now

      -- Calculate refill
      local elapsed = (now - last_update) / 1000
      local refill = elapsed * refill_rate
      tokens = math.min(bucket_size, tokens + refill)

      if tokens >= requested then
        tokens = tokens - requested
        redis.call('HMSET', key, 'tokens', tokens, 'last_update', now)
        redis.call('EXPIRE', key, 3600)
        return {1, tokens, 0}
      else
        local wait_time = (requested - tokens) / refill_rate * 1000
        return {0, tokens, wait_time}
      end
    `;

    const result = await this.redis.eval(
      script,
      1,
      key,
      this.config.bucketSize,
      this.config.refillRate,
      tokens,
      now
    ) as [number, number, number];

    const [allowed, remaining, waitTime] = result;

    return {
      allowed: allowed === 1,
      remaining: Math.floor(remaining),
      resetAt: now + (this.config.bucketSize - remaining) / this.config.refillRate * 1000,
      retryAfter: allowed === 0 ? Math.ceil(waitTime / 1000) : undefined,
    };
  }
}

// Usage configurations for different tiers
export const RATE_LIMIT_CONFIGS = {
  // Free tier: 10 requests/minute, bucket of 15
  free: {
    bucketSize: 15,
    refillRate: 10 / 60, // 10 per minute = 0.167 per second
    tokensPerRequest: 1,
  },
  // Pro tier: 60 requests/minute, bucket of 100
  pro: {
    bucketSize: 100,
    refillRate: 1, // 1 per second
    tokensPerRequest: 1,
  },
  // Tool execution: stricter limits
  toolExecution: {
    bucketSize: 20,
    refillRate: 0.5, // 30 per minute
    tokensPerRequest: 1,
  },
  // Shell commands: very strict
  shellExecution: {
    bucketSize: 5,
    refillRate: 0.1, // 6 per minute
    tokensPerRequest: 1,
  },
};
```

#### Pattern 2: Express Middleware

```typescript
// rate-limit-middleware.ts
import { TokenBucketLimiter, RATE_LIMIT_CONFIGS } from './rate-limiter';

export function rateLimitMiddleware(
  limiter: TokenBucketLimiter,
  identifierFn: (req: Request) => string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = identifierFn(req);
    const result = await limiter.consume(identifier);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter!);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: result.retryAfter,
      });
    }

    next();
  };
}

// Usage
const aiLimiter = new TokenBucketLimiter(redis, 'ratelimit:ai', RATE_LIMIT_CONFIGS.free);

app.post('/api/chat',
  rateLimitMiddleware(aiLimiter, (req) => req.user?.id || req.ip),
  chatHandler
);
```

#### Pattern 3: Adaptive Rate Limiting (Advanced)

Adjust limits based on system health (p95 latency).

```typescript
// adaptive-limiter.ts
export class AdaptiveRateLimiter {
  private currentMultiplier = 1.0;
  private latencyWindow: number[] = [];

  constructor(
    private baseLimiter: TokenBucketLimiter,
    private targetP95Latency: number // e.g., 2000ms
  ) {}

  recordLatency(latencyMs: number): void {
    this.latencyWindow.push(latencyMs);
    if (this.latencyWindow.length > 100) {
      this.latencyWindow.shift();
    }
    this.adjustMultiplier();
  }

  private adjustMultiplier(): void {
    if (this.latencyWindow.length < 10) return;

    const sorted = [...this.latencyWindow].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index];

    if (p95 > this.targetP95Latency * 1.2) {
      // System stressed, reduce rate
      this.currentMultiplier = Math.max(0.5, this.currentMultiplier * 0.9);
    } else if (p95 < this.targetP95Latency * 0.8) {
      // System healthy, allow more
      this.currentMultiplier = Math.min(1.5, this.currentMultiplier * 1.1);
    }
  }

  async consume(identifier: string): Promise<RateLimitResult> {
    const adjustedTokens = Math.ceil(1 / this.currentMultiplier);
    return this.baseLimiter.consume(identifier, adjustedTokens);
  }
}
```

### Recommended Limits for LivOS

| Endpoint | Free Tier | Pro Tier |
|----------|-----------|----------|
| Chat messages | 10/min | 60/min |
| Tool executions | 20/min | 100/min |
| Shell commands | 5/min | 20/min |
| File operations | 30/min | 200/min |
| Memory queries | 20/min | 100/min |

### Sources
- [API Rate Limits Explained: Best Practices 2025](https://orq.ai/blog/api-rate-limit)
- [From Token Bucket to Sliding Window](https://api7.ai/blog/rate-limiting-guide-algorithms-best-practices)
- [Adaptive Rate Control with Token Buckets](https://medium.com/@2nick2patel2/node-js-adaptive-rate-control-token-buckets-tuned-by-p95-latency-1016a82a28f4)
- [Rate Limiting for LLM APIs](https://apxml.com/courses/intro-llm-red-teaming/chapter-5-defenses-mitigation-strategies-llms/rate-limiting-access-controls-llm-apis)

---

## 5. Security Headers and Authentication (Express)

### Problem Statement
Express applications need proper security headers and authentication middleware to prevent common web vulnerabilities.

### Helmet.js Configuration

```typescript
// security-headers.ts
import helmet from 'helmet';
import express from 'express';

const app = express();

// Apply all default security headers
app.use(helmet());

// Or configure individually
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Adjust for your CSS needs
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'https://api.anthropic.com'], // API endpoints
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  })
);

// Remove X-Powered-By (helmet does this by default)
app.disable('x-powered-by');
```

### Headers Set by Helmet (Default)

| Header | Purpose |
|--------|---------|
| Content-Security-Policy | Prevent XSS and injection |
| Cross-Origin-Opener-Policy | Process isolation |
| Cross-Origin-Resource-Policy | Block cross-origin loading |
| Origin-Agent-Cluster | Origin-based process isolation |
| Strict-Transport-Security | Enforce HTTPS |
| X-Content-Type-Options | Prevent MIME sniffing |
| X-DNS-Prefetch-Control | Control DNS prefetching |
| X-Download-Options | Prevent file downloads in IE |
| X-Frame-Options | Prevent clickjacking |
| X-Permitted-Cross-Domain-Policies | Restrict Adobe Flash/PDF |
| X-XSS-Protection | Enable browser XSS filter |

### Authentication Middleware

```typescript
// auth-middleware.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tier: 'free' | 'pro' | 'admin';
  };
}

// JWT Authentication
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthenticatedRequest['user'];
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Role-based access control
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.tier)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Usage
app.get('/api/admin/users', requireAuth, requireRole('admin'), adminUsersHandler);
app.post('/api/chat', requireAuth, chatHandler);
```

### Cookie Security

```typescript
// session-config.ts
import session from 'express-session';
import RedisStore from 'connect-redis';

app.use(
  session({
    store: new RedisStore({ client: redis }),
    secret: process.env.SESSION_SECRET!,
    name: 'livos.sid', // Custom name (not default 'connect.sid')
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only
      httpOnly: true,    // Not accessible via JavaScript
      sameSite: 'strict', // CSRF protection
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);
```

### CORS Configuration

```typescript
// cors-config.ts
import cors from 'cors';

const ALLOWED_ORIGINS = [
  'https://livos.local',
  'https://dashboard.livos.local',
];

if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:5173');
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy violation'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  })
);
```

### Sources
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [Beginner's Guide to Helmet.js](https://dev.to/abhishekjaiswal_4896/a-beginners-guide-to-helmetjs-protect-your-nodejs-apps-4p2c)
- [Securing Express Apps with Helmet](https://www.veracode.com/blog/secure-development/fasten-your-helmetjs-part-1-securing-your-express-http-headers)

---

## 6. Allowlist vs Blocklist for Command Execution

### Problem Statement
LivOS uses a blocklist approach for shell command restrictions. This is fundamentally flawed because attackers can always find bypass techniques.

### Why Blocklists Fail

| Blocklist Entry | Bypass Technique |
|-----------------|------------------|
| `rm -rf /` | `rm -r /`, `find / -delete` |
| `curl` | `wget`, `python -c "import urllib..."` |
| `nc` | `bash -i >& /dev/tcp/...`, `python -c "import socket..."` |
| `;` | `$(cmd)`, `` `cmd` ``, `\n` |

**You cannot enumerate all dangerous patterns. Allowlists define what IS permitted.**

### Allowlist Implementation

#### Existing Example (from `mcp-client-manager.ts`)

The archived code already implements a good pattern:

```typescript
// From _archive/security-hardening/mcp-client-manager.ts
const ALLOWED_COMMANDS = new Set([
  'npx', 'node', 'python', 'python3', 'uvx', 'docker', 'deno', 'bun',
]);

private validateCommand(command: string): void {
  const base = command.split('/').pop() || command;
  if (!ALLOWED_COMMANDS.has(base)) {
    throw new Error(
      `Command "${command}" is not allowed. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`,
    );
  }
}
```

#### Enhanced Allowlist Pattern

```typescript
// command-allowlist.ts

interface AllowedCommand {
  /** The binary name (without path) */
  name: string;
  /** Full path to verify (prevents PATH hijacking) */
  path: string;
  /** Allowed subcommands (first positional arg) */
  allowedSubcommands?: string[];
  /** Forbidden flags that should never be passed */
  forbiddenFlags?: string[];
  /** Whether this command can accept arbitrary file paths */
  allowsFilePaths: boolean;
  /** Regex patterns for allowed arguments */
  argPatterns?: RegExp[];
}

const COMMAND_ALLOWLIST: AllowedCommand[] = [
  {
    name: 'docker',
    path: '/usr/bin/docker',
    allowedSubcommands: ['ps', 'logs', 'inspect', 'stats', 'images'],
    forbiddenFlags: ['--privileged', '-v', '--volume', 'exec', 'run', 'rm', 'rmi'],
    allowsFilePaths: false,
  },
  {
    name: 'pm2',
    path: '/usr/local/bin/pm2',
    allowedSubcommands: ['list', 'status', 'logs', 'describe', 'monit'],
    forbiddenFlags: ['delete', 'kill', 'flush', 'update'],
    allowsFilePaths: false,
  },
  {
    name: 'ls',
    path: '/bin/ls',
    allowsFilePaths: true,
    argPatterns: [/^-[lahtrS]+$/, /^\/opt\/livos\/.+$/], // Only livos paths
  },
  {
    name: 'cat',
    path: '/bin/cat',
    allowsFilePaths: true,
    argPatterns: [/^\/opt\/livos\/logs\/.+\.log$/], // Only log files
  },
  {
    name: 'tail',
    path: '/usr/bin/tail',
    allowsFilePaths: true,
    argPatterns: [/^-[nf]$/, /^\d+$/, /^\/opt\/livos\/logs\/.+\.log$/],
  },
  {
    name: 'systemctl',
    path: '/usr/bin/systemctl',
    allowedSubcommands: ['status', 'is-active', 'list-units'],
    forbiddenFlags: ['start', 'stop', 'restart', 'enable', 'disable', 'daemon-reload'],
    allowsFilePaths: false,
  },
];

export class CommandValidator {
  private allowlistMap: Map<string, AllowedCommand>;

  constructor() {
    this.allowlistMap = new Map(
      COMMAND_ALLOWLIST.map(cmd => [cmd.name, cmd])
    );
  }

  validate(command: string, args: string[]): { valid: boolean; error?: string } {
    // Extract command name from potential path
    const cmdName = command.split('/').pop() || command;

    // 1. Check if command is in allowlist
    const allowed = this.allowlistMap.get(cmdName);
    if (!allowed) {
      return {
        valid: false,
        error: `Command "${cmdName}" is not in the allowlist. Allowed: ${[...this.allowlistMap.keys()].join(', ')}`,
      };
    }

    // 2. Verify full path matches (prevents PATH hijacking)
    if (command.includes('/') && command !== allowed.path) {
      return {
        valid: false,
        error: `Command path "${command}" does not match expected path "${allowed.path}"`,
      };
    }

    // 3. Check subcommand (first arg) if restricted
    if (allowed.allowedSubcommands && args.length > 0) {
      const subcommand = args[0];
      if (!allowed.allowedSubcommands.includes(subcommand)) {
        return {
          valid: false,
          error: `Subcommand "${subcommand}" is not allowed for ${cmdName}. Allowed: ${allowed.allowedSubcommands.join(', ')}`,
        };
      }
    }

    // 4. Check for forbidden flags
    if (allowed.forbiddenFlags) {
      for (const arg of args) {
        if (allowed.forbiddenFlags.includes(arg)) {
          return {
            valid: false,
            error: `Flag "${arg}" is forbidden for ${cmdName}`,
          };
        }
      }
    }

    // 5. Validate argument patterns
    if (allowed.argPatterns) {
      for (const arg of args) {
        const matchesPattern = allowed.argPatterns.some(p => p.test(arg));
        if (!matchesPattern) {
          return {
            valid: false,
            error: `Argument "${arg}" does not match allowed patterns for ${cmdName}`,
          };
        }
      }
    }

    // 6. If command doesn't allow file paths, ensure no path-like args
    if (!allowed.allowsFilePaths) {
      for (const arg of args) {
        if (arg.includes('/') && !arg.startsWith('-')) {
          return {
            valid: false,
            error: `File paths are not allowed for ${cmdName}`,
          };
        }
      }
    }

    return { valid: true };
  }
}
```

### File Path Restrictions

```typescript
// path-validator.ts

const ALLOWED_PATH_PREFIXES = [
  '/opt/livos/',
  '/tmp/',
  '/var/log/livos/',
];

const FORBIDDEN_PATHS = [
  '/etc/shadow',
  '/etc/passwd',
  '/etc/sudoers',
  '/root/',
  '/.ssh/',
  '/.env',
  '/proc/',
  '/sys/',
  '/dev/',
  '../', // Path traversal
];

export function validatePath(path: string): { valid: boolean; error?: string } {
  // Normalize path to prevent traversal
  const normalized = path.replace(/\/+/g, '/');

  // Check for traversal attempts
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path traversal detected' };
  }

  // Check forbidden paths
  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalized.includes(forbidden)) {
      return { valid: false, error: `Access to "${forbidden}" is forbidden` };
    }
  }

  // Check allowed prefixes
  const hasAllowedPrefix = ALLOWED_PATH_PREFIXES.some(prefix =>
    normalized.startsWith(prefix)
  );

  if (!hasAllowedPrefix) {
    return {
      valid: false,
      error: `Path must start with one of: ${ALLOWED_PATH_PREFIXES.join(', ')}`,
    };
  }

  return { valid: true };
}
```

### Migration from Blocklist to Allowlist

```typescript
// BEFORE (blocklist - dangerous)
const BLOCKED_COMMANDS = ['rm', 'mkfs', 'dd', 'shutdown'];

function isCommandAllowed(cmd: string): boolean {
  return !BLOCKED_COMMANDS.some(blocked => cmd.includes(blocked));
}

// AFTER (allowlist - secure)
const ALLOWED_COMMANDS = new Set(['ls', 'cat', 'docker', 'pm2', 'tail']);

function isCommandAllowed(cmd: string): boolean {
  const cmdName = cmd.split(/\s+/)[0].split('/').pop();
  return ALLOWED_COMMANDS.has(cmdName);
}
```

### Sources
- [Node.js Permissions Model](https://nodejs.org/api/permissions.html)
- [Secure JavaScript Coding Practices Against Command Injection](https://www.nodejs-security.com/blog/secure-javascript-coding-practices-against-command-injection-vulnerabilities)
- [OWASP NPM Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html)
- [Content Security Policy for Node.js](https://www.digitalocean.com/community/tutorials/how-to-secure-node-js-applications-with-a-content-security-policy)

---

## Summary: Prioritized Actions for LivOS

### Immediate (Critical)

1. **Rotate all exposed secrets** - JWT_SECRET, API keys in `.env`
2. **Add `.env` to `.gitignore`** - prevent future commits
3. **Replace shell blocklist with allowlist** - in `livos/packages/livcoreai/src/shell.ts`
4. **Add authentication to internal services** - Memory service at localhost:3300

### Short-term (1-2 weeks)

5. **Implement rate limiting** - Token bucket for AI endpoints
6. **Add Helmet.js** - Security headers for Express
7. **Implement service-to-service auth** - API keys for internal communication
8. **Add argument validation** - Regex patterns for allowed command arguments

### Medium-term (1 month)

9. **Integrate secrets manager** - HashiCorp Vault or Doppler
10. **Container sandboxing** - Docker isolation for shell commands
11. **Add adaptive rate limiting** - Based on p95 latency
12. **Implement mTLS** - For cross-host service communication

### Long-term (3+ months)

13. **Security audit** - OWASP ZAP, penetration testing
14. **Automated secret rotation** - Vault dynamic secrets
15. **Zero-trust architecture** - Authenticate every request
16. **Compliance review** - SOC2, GDPR as needed
