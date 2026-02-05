# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please DO NOT open a public GitHub issue for security vulnerabilities.**

Instead, report vulnerabilities via email:

**Email**: security@livinity.io

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## Response Timeline

| Severity | Initial Response | Fix Timeline |
|----------|------------------|--------------|
| Critical | 24 hours | 24-48 hours |
| High | 48 hours | 7 days |
| Medium | 7 days | 30 days |
| Low | 14 days | 90 days |

- **Acknowledgment**: Within 48 hours of report
- **Initial Assessment**: Within 7 days
- **Status Updates**: Every 7 days until resolved

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter submits vulnerability details privately
2. We acknowledge receipt and begin investigation
3. We develop and test a fix
4. We release the fix and publish a security advisory
5. Reporter is credited (unless anonymity requested)

**Disclosure Deadline**: 90 days from initial report

## Security-Sensitive Areas

These areas require extra scrutiny when contributing:

- **API Authentication**: `LIV_API_KEY` validation in auth middleware
- **Shell Command Execution**: Command blocklist in `shell.ts`
- **File System Access**: Path traversal prevention in file operations
- **Docker Socket Access**: Container privilege controls
- **JWT Token Handling**: Token validation and expiry
- **MCP Server**: Tool execution permissions

## Safe Harbor

We support good-faith security research. Researchers who:

- Make a good faith effort to avoid privacy violations
- Avoid accessing data that does not belong to them
- Do not disrupt our services
- Report findings responsibly

...will not face legal action from us.

### Please Avoid

- Accessing or modifying other users' data
- Denial of service attacks
- Physical security attacks
- Social engineering of staff or users
- Automated scanning that impacts service availability

## Acknowledgments

We appreciate security researchers who help keep LivOS secure. With your permission, we'll acknowledge your contribution in our security advisories.

---

Thank you for helping keep LivOS and its users safe.
