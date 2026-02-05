# Contributing to LivOS

Thank you for your interest in contributing to LivOS! This guide covers setting up your development environment and the contribution process.

LivOS is an AI-powered home server platform with chat, server control, and autonomous agents. We welcome contributions of all kinds - bug fixes, features, documentation, and more.

## Development Setup

### Prerequisites

Before you begin, ensure you have:

- **Node.js 22+** - Required for both workspaces
- **pnpm 9+** - Package manager for livos/
- **npm 10+** - Package manager for nexus/
- **Docker and Docker Compose** - For Redis and optional services
- **Redis** - Required for session management and caching (or use Docker)

### Clone the Repository

```bash
git clone https://github.com/utopusc/livinity-io.git
cd livinity-io
```

### LivOS Setup (pnpm workspace)

The main platform lives in the `livos/` directory:

```bash
cd livos
pnpm install
cp .env.example .env
# Edit .env with your values
pnpm dev:livd    # Start backend daemon
pnpm dev:ui      # Start frontend (in another terminal)
```

### Nexus Setup (npm workspace)

The AI agent system lives in the `nexus/` directory:

```bash
cd nexus
npm install
cp .env.example .env
# Edit .env with your values
npm run dev:core     # Start core agent
npm run dev:memory   # Start memory service (in another terminal)
```

### Start Dependencies

```bash
# Redis (required)
docker run -d --name redis -p 6379:6379 redis:7

# PostgreSQL (optional, for persistence)
docker run -d --name postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres postgres:15
```

## Project Structure

This is a monorepo with two main workspaces:

```
livinity-io/
├── livos/                     # Main platform (pnpm workspace)
│   ├── packages/
│   │   ├── livinityd/         # Backend daemon
│   │   │   └── source/
│   │   │       ├── modules/   # Feature modules (ai, apps, files, etc.)
│   │   │       └── index.ts   # Server entry point
│   │   ├── ui/                # React frontend
│   │   │   └── src/
│   │   │       ├── routes/    # Page components
│   │   │       ├── modules/   # Feature modules
│   │   │       └── components/# Shared components
│   │   ├── config/            # @livos/config package
│   │   └── marketplace/       # App marketplace
│   ├── skills/                # AI skill definitions
│   └── package.json           # pnpm workspace root
│
├── nexus/                     # AI Agent system (npm workspace)
│   ├── packages/
│   │   ├── core/              # Agent brain, daemon, tools
│   │   ├── memory/            # Embedding service
│   │   ├── mcp-server/        # Claude/Cursor MCP integration
│   │   └── worker/            # Background task worker
│   ├── skills/                # Nexus skill definitions
│   └── package.json           # npm workspace root
│
├── _archive/                  # Deprecated code (do not modify)
├── CONTRIBUTING.md            # This file
├── CODE_OF_CONDUCT.md         # Community standards
└── README.md                  # Project overview
```

## Code Style

### TypeScript Guidelines

- **Strict mode** - All packages use TypeScript strict mode
- **No `any` types** - Use proper typing or `unknown` with type guards
- **Node.js imports** - Use `node:` prefix for built-ins:
  ```typescript
  import path from 'node:path';
  import fs from 'node:fs';
  ```

### Configuration

- **Use `@livos/config`** - Never hardcode paths or domains:
  ```typescript
  import { getConfig } from '@livos/config';
  const config = getConfig();
  const outputDir = config.paths.output;
  ```

### Error Handling

- **Use error helpers** - In catch blocks, use the appropriate helper:
  ```typescript
  import { formatErrorMessage } from './utils/error-helpers.js';

  try {
    // ...
  } catch (err: unknown) {
    console.error(formatErrorMessage(err));
  }
  ```

- **Local helper pattern** - For files without shared helpers:
  ```typescript
  function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
  ```

### API Keys and Auth

- **Use `X-API-Key` header** - For service-to-service auth
- **Use `timingSafeEqual`** - When comparing secrets
- **Never log secrets** - Mask or omit sensitive values from logs

## Testing

### Running Tests

```bash
# LivOS tests
cd livos && pnpm test

# Nexus tests
cd nexus && npm test
```

### Testing Guidelines

- Write tests for new features
- Ensure existing tests pass before submitting PR
- For bug fixes, add a regression test when possible

## Pull Request Process

### Branch Naming

Use descriptive branch names with a prefix:

- `feature/add-skill-editor` - New feature
- `fix/memory-leak-in-agent` - Bug fix
- `docs/update-api-reference` - Documentation
- `refactor/simplify-auth-flow` - Code refactoring

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use For |
|--------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation changes |
| `refactor:` | Code refactoring (no behavior change) |
| `test:` | Adding or updating tests |
| `perf:` | Performance improvement |
| `chore:` | Config, tooling, dependencies |
| `style:` | Formatting, linting fixes |

Examples:
```
feat: add skill scheduling support
fix: prevent memory leak in long-running agents
docs: update installation guide for Docker
```

### PR Checklist

Before submitting, ensure:

- [ ] Tests pass (`pnpm test` / `npm test`)
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] Code follows style guidelines
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow conventional commits

### Review Process

1. Submit your PR with a clear description
2. Automated checks will run (tests, linting, type checking)
3. A maintainer will review within 48 hours
4. Address any feedback
5. Once approved, your PR will be merged

## Issue Reporting

### Bug Reports

When reporting bugs, please include:

- **LivOS version** - Check `livos/package.json`
- **Node.js version** - Run `node --version`
- **Operating system** - e.g., Ubuntu 22.04, macOS 14
- **Steps to reproduce** - Detailed steps to trigger the bug
- **Expected behavior** - What should happen
- **Actual behavior** - What actually happens
- **Logs** - Relevant error messages or logs

### Feature Requests

For feature requests, please describe:

- The problem you're trying to solve
- Your proposed solution
- Alternative approaches you've considered

## Code of Conduct

All contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md). In short: be kind, be respectful, and be inclusive.

## Questions?

- **GitHub Discussions** - For questions and general discussion
- **GitHub Issues** - For bug reports and feature requests
- **Discord** - Join our community (link in README)

---

Thank you for contributing to LivOS! Your efforts help make self-hosted AI servers accessible to everyone.
