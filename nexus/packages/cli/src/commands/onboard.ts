import { join } from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { checkPrerequisites } from '../lib/checks.js';
import { printCheckResults, banner } from '../lib/ui.js';
import { generateApiKey, generateRedisPassword } from '../lib/secrets.js';
import { writeEnvFile, backupEnvFile, type EnvConfig } from '../lib/env-writer.js';
import { loadConfigFile, configFileToEnvConfig } from '../lib/config-file.js';
import { RollbackStack } from '../lib/rollback.js';
import { runSetup, printHealthResults } from './setup.js';
import { verifyHealth } from '../lib/pm2.js';

// ── Validation helpers ──────────────────────────────────────────

function validateDomain(value: string): string | undefined {
  if (!value) return 'Domain is required';
  if (value === 'localhost') return undefined;
  const hostnameRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  if (!hostnameRegex.test(value)) {
    return 'Enter a valid domain (e.g. example.com) or "localhost"';
  }
  return undefined;
}

function validateTelegramToken(value: string): string | undefined {
  if (!value) return 'Token is required';
  const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
  if (!tokenRegex.test(value)) {
    return 'Invalid format. Expected: 123456789:ABCdefGHI_jklMNO';
  }
  return undefined;
}

function validateNotEmpty(label: string) {
  return (value: string): string | undefined => {
    if (!value.trim()) return `${label} is required`;
    return undefined;
  };
}

function validatePort(value: string): string | undefined {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1 || num > 65535) {
    return 'Enter a valid port number (1-65535)';
  }
  return undefined;
}

// ── Cancel guard ────────────────────────────────────────────────

/**
 * Check if value is a cancel symbol and exit if so.
 * Returns the unwrapped value for the caller to use.
 */
function guard<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Onboarding cancelled.');
    process.exit(0);
  }
  return value as T;
}

// ── Command registration ────────────────────────────────────────

export function registerOnboardCommand(program: Command): void {
  program
    .command('onboard')
    .description('Set up LivOS on this server')
    .option('-c, --config <path>', 'Path to setup.json for non-interactive mode')
    .action(async (opts: { config?: string }) => {
      if (opts.config) {
        await runNonInteractive(opts.config);
      } else {
        await runOnboardWizard();
      }
    });
}

// ── Non-interactive mode ────────────────────────────────────────

async function runNonInteractive(configPath: string): Promise<void> {
  banner();
  p.intro(pc.bold('LivOS Non-Interactive Setup'));

  const rollback = new RollbackStack();

  try {
    // 1. Load config file
    p.log.step('Loading configuration...');
    const setupConfig = loadConfigFile(configPath);
    p.log.success(`Config loaded from: ${configPath}`);

    // 2. Check prerequisites
    const s = p.spinner();
    s.start('Checking prerequisites...');
    const checks = await checkPrerequisites();
    s.stop('Prerequisites checked');

    const criticalNames = ['Node.js', 'Docker'];
    const criticalFailed = checks.filter(c => !c.ok && criticalNames.includes(c.name));

    if (criticalFailed.length > 0) {
      p.log.error(
        `Critical prerequisites missing: ${criticalFailed.map(c => c.name).join(', ')}.\n` +
        'Please install them and re-run `livinity onboard --config`.'
      );
      process.exit(1);
    }

    // 3. Convert config and generate secrets
    const config = configFileToEnvConfig(setupConfig);
    const livosBaseDir = config.livosBaseDir;
    const nexusBaseDir = config.nexusBaseDir;
    const envPath = join(livosBaseDir, '.env');

    p.log.info(`Domain: ${config.domain}${config.useHttps ? ' (HTTPS)' : ''}`);
    p.log.info(`Paths: LivOS=${livosBaseDir}, Nexus=${nexusBaseDir}`);

    // 4. Write .env
    const backupPath = backupEnvFile(envPath);
    if (backupPath) {
      p.log.info(`Existing .env backed up to: ${backupPath}`);
    }

    writeEnvFile(envPath, config);
    rollback.push('wrote .env file', () => {
      // Don't delete .env on rollback — user may want the config
      // Instead, restore backup if one was created
      if (backupPath) {
        const { copyFileSync } = require('node:fs') as typeof import('node:fs');
        copyFileSync(backupPath, envPath);
      }
    });
    p.log.success(`Environment file written to: ${envPath}`);

    // 5. Run full setup
    await runSetup({ livosBaseDir, nexusBaseDir, rollback });

    // 6. Completion banner
    printCompletionBanner(config.domain, config.useHttps, config.apiPort);

    p.outro(pc.green('LivOS is ready!'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(`Setup failed: ${msg}`);

    if (rollback.size > 0) {
      await rollback.rollback();
    }

    p.cancel('Onboarding aborted. Server has been cleaned up.');
    process.exit(1);
  }
}

// ── Interactive wizard ──────────────────────────────────────────

async function runOnboardWizard(): Promise<void> {
  // 1. Banner + Intro
  banner();
  p.intro(pc.bold('LivOS Onboarding Wizard'));

  const rollback = new RollbackStack();

  try {
    // 2. Prerequisite Check
    const s = p.spinner();
    s.start('Checking prerequisites...');
    const checks = await checkPrerequisites();
    s.stop('Prerequisites checked');

    printCheckResults(checks);

    const criticalNames = ['Node.js', 'Docker'];
    const criticalFailed = checks.filter(c => !c.ok && criticalNames.includes(c.name));
    const nonCriticalFailed = checks.filter(c => !c.ok && !criticalNames.includes(c.name));

    if (criticalFailed.length > 0) {
      p.log.error(
        `Critical prerequisites missing: ${criticalFailed.map(c => c.name).join(', ')}.\n` +
        'Please install them and re-run `livinity onboard`.'
      );
      p.cancel('Cannot continue without critical prerequisites.');
      process.exit(1);
    }

    if (nonCriticalFailed.length > 0) {
      p.log.warn(
        `Non-critical checks failed: ${nonCriticalFailed.map(c => c.name).join(', ')}.\n` +
        'You can install these later, but some features may not work.'
      );
      const proceed = guard(await p.confirm({
        message: 'Continue anyway?',
        initialValue: true,
      }));
      if (!proceed) {
        p.cancel('Onboarding cancelled.');
        process.exit(0);
      }
    }

    // 3. Domain Configuration
    p.log.step(pc.bold('Domain Configuration'));

    const domain = guard(await p.text({
      message: 'What is your domain?',
      placeholder: 'example.com',
      defaultValue: 'localhost',
      validate: validateDomain,
    }));

    let useHttps = false;
    if (domain !== 'localhost') {
      useHttps = guard(await p.confirm({
        message: "Enable HTTPS via Caddy/Let's Encrypt?",
        initialValue: true,
      }));
    }

    // 4. Channel Configuration
    p.log.step(pc.bold('Channel Configuration'));

    let telegramBotToken: string | undefined;
    let telegramDmPolicy: 'open' | 'pairing' | undefined;

    const configureTelegram = guard(await p.confirm({
      message: 'Configure Telegram bot?',
      initialValue: false,
    }));

    if (configureTelegram) {
      telegramBotToken = guard(await p.text({
        message: 'Telegram bot token',
        placeholder: '123456789:ABCdefGHI_jklMNO',
        validate: validateTelegramToken,
      }));

      telegramDmPolicy = guard(await p.select({
        message: 'Telegram DM policy',
        options: [
          { value: 'pairing' as const, label: 'Pairing (recommended)', hint: 'Users must enter an activation code' },
          { value: 'open' as const, label: 'Open', hint: 'Anyone can DM the bot' },
        ],
        initialValue: 'pairing' as const,
      }));
    }

    let discordBotToken: string | undefined;
    let discordApplicationId: string | undefined;

    const configureDiscord = guard(await p.confirm({
      message: 'Configure Discord bot?',
      initialValue: false,
    }));

    if (configureDiscord) {
      discordBotToken = guard(await p.text({
        message: 'Discord bot token',
        placeholder: 'your-discord-bot-token',
        validate: validateNotEmpty('Discord bot token'),
      }));

      discordApplicationId = guard(await p.text({
        message: 'Discord application ID',
        placeholder: '123456789012345678',
        validate: validateNotEmpty('Discord application ID'),
      }));
    }

    // 5. Optional Features
    p.log.step(pc.bold('Optional Features'));

    let deepgramApiKey: string | undefined;
    let cartesiaApiKey: string | undefined;

    const configureVoice = guard(await p.confirm({
      message: 'Configure voice (Deepgram STT + Cartesia TTS)?',
      initialValue: false,
    }));

    if (configureVoice) {
      deepgramApiKey = guard(await p.text({
        message: 'Deepgram API key',
        placeholder: 'your-deepgram-api-key',
        validate: validateNotEmpty('Deepgram API key'),
      }));

      cartesiaApiKey = guard(await p.text({
        message: 'Cartesia API key',
        placeholder: 'your-cartesia-api-key',
        validate: validateNotEmpty('Cartesia API key'),
      }));
    }

    let gmailClientId: string | undefined;
    let gmailClientSecret: string | undefined;

    const configureGmail = guard(await p.confirm({
      message: 'Configure Gmail integration?',
      initialValue: false,
    }));

    if (configureGmail) {
      p.log.info(
        'Gmail requires OAuth credentials from Google Cloud Console.\n' +
        'Create at: https://console.cloud.google.com/apis/credentials'
      );

      gmailClientId = guard(await p.text({
        message: 'Gmail OAuth client ID',
        placeholder: 'xxxx.apps.googleusercontent.com',
        validate: validateNotEmpty('Gmail client ID'),
      }));

      gmailClientSecret = guard(await p.text({
        message: 'Gmail OAuth client secret',
        placeholder: 'GOCSPX-xxxx',
        validate: validateNotEmpty('Gmail client secret'),
      }));
    }

    // 6. Path Configuration
    p.log.step(pc.bold('Path & Port Configuration'));

    const livosBaseDir = guard(await p.text({
      message: 'LivOS base directory',
      defaultValue: '/opt/livos',
      validate: validateNotEmpty('LivOS base directory'),
    }));

    const nexusBaseDir = guard(await p.text({
      message: 'Nexus base directory',
      defaultValue: '/opt/nexus',
      validate: validateNotEmpty('Nexus base directory'),
    }));

    const mcpPortStr = guard(await p.text({
      message: 'MCP server port',
      defaultValue: '3100',
      validate: validatePort,
    }));

    const apiPortStr = guard(await p.text({
      message: 'API server port',
      defaultValue: '3200',
      validate: validatePort,
    }));

    const memoryPortStr = guard(await p.text({
      message: 'Memory service port',
      defaultValue: '3300',
      validate: validatePort,
    }));

    // 7. Secret Generation
    const secretSpinner = p.spinner();
    secretSpinner.start('Generating secure secrets...');

    const jwtSecret = generateApiKey();
    const apiKey = generateApiKey();
    const redisPassword = generateRedisPassword();

    // Brief pause so spinner is visible (secrets generate instantly)
    await new Promise(resolve => setTimeout(resolve, 500));
    secretSpinner.stop('Secrets generated');

    // 8. Summary + Confirm
    const summaryLines = [
      `Domain:     ${domain}${useHttps ? ' (HTTPS)' : ''}`,
      `Telegram:   ${telegramBotToken ? 'Configured' : 'Not configured'}`,
      `Discord:    ${discordBotToken ? 'Configured' : 'Not configured'}`,
      `Voice:      ${deepgramApiKey ? 'Configured' : 'Not configured'}`,
      `Gmail:      ${gmailClientId ? 'Configured' : 'Not configured'}`,
      `LivOS dir:  ${livosBaseDir}`,
      `Nexus dir:  ${nexusBaseDir}`,
      `Ports:      MCP=${mcpPortStr} API=${apiPortStr} Memory=${memoryPortStr}`,
      `Secrets:    JWT, API key, Redis password (auto-generated)`,
    ];

    p.note(summaryLines.join('\n'), 'Configuration Summary');

    const writeConfirm = guard(await p.confirm({
      message: 'Write configuration and proceed?',
      initialValue: true,
    }));

    if (!writeConfirm) {
      p.cancel('Onboarding cancelled. No files were written.');
      process.exit(0);
    }

    // 9. Write .env
    const envPath = join(livosBaseDir, '.env');

    const backupPath = backupEnvFile(envPath);
    if (backupPath) {
      p.log.info(`Existing .env backed up to: ${backupPath}`);
    }

    const apiPort = parseInt(apiPortStr, 10);

    const config: EnvConfig = {
      domain,
      useHttps,
      jwtSecret,
      apiKey,
      redisPassword,
      telegramBotToken,
      telegramDmPolicy,
      discordBotToken,
      discordApplicationId,
      deepgramApiKey,
      cartesiaApiKey,
      gmailClientId,
      gmailClientSecret,
      livosBaseDir,
      nexusBaseDir,
      apiPort,
      mcpPort: parseInt(mcpPortStr, 10),
      memoryPort: parseInt(memoryPortStr, 10),
    };

    try {
      writeEnvFile(envPath, config);
      rollback.push('wrote .env file', () => {
        if (backupPath) {
          const { copyFileSync } = require('node:fs') as typeof import('node:fs');
          copyFileSync(backupPath, envPath);
        }
      });
      p.log.success(`Environment file written to: ${envPath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(`Failed to write .env: ${msg}`);
      p.log.info(
        'This may be a permissions issue. Try running with sudo,\n' +
        `or manually create the directory: mkdir -p ${livosBaseDir}`
      );
      p.cancel('Onboarding failed.');
      process.exit(1);
    }

    // 10. Offer to run setup
    const runSetupNow = guard(await p.confirm({
      message: 'Install dependencies and start services now?',
      initialValue: true,
    }));

    if (runSetupNow) {
      await runSetup({ livosBaseDir, nexusBaseDir, rollback });
      printCompletionBanner(domain, useHttps, apiPort);
      p.outro(pc.green('LivOS is ready!'));
    } else {
      p.log.info('Run `livinity setup` later to complete installation.');
      p.outro('Configuration complete!');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(`Onboarding failed: ${msg}`);

    if (rollback.size > 0) {
      await rollback.rollback();
    }

    p.cancel('Onboarding aborted. Changes have been rolled back.');
    process.exit(1);
  }
}

// ── Completion banner ───────────────────────────────────────────

function printCompletionBanner(
  domain: string,
  useHttps: boolean,
  apiPort: number,
): void {
  const proto = useHttps ? 'https' : 'http';
  const livosUrl = `${proto}://${domain}:8080`;
  const apiUrl = `${proto}://${domain}:${apiPort}`;

  const lines = [
    `LivOS UI:   ${pc.cyan(livosUrl)}`,
    `Nexus API:  ${pc.cyan(apiUrl)}`,
    '',
    'Next steps:',
    `  1. Open ${pc.bold(livosUrl)} in your browser`,
    '  2. Log in and configure additional features in Settings',
    '  3. Run `livinity status` to check service health anytime',
  ];

  p.note(lines.join('\n'), 'LivOS is Running');
}
