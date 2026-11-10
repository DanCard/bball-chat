import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { createRequire } from 'node:module';

const MCP_SERVER_DIR = path.join(os.homedir(), '.claude', 'mcp-servers', 'google-workspace');
const MASTER_KEY_PATH = path.join(MCP_SERVER_DIR, '.gemini-cli-workspace-master-key');
const TOKEN_PATH = path.join(MCP_SERVER_DIR, 'gemini-cli-workspace-token.json');
// The MCP server stores credentials in the OS keyring (Secret Service) when one
// is available, and in TOKEN_PATH otherwise. Which one it uses can change when a
// keyring daemon starts, so we read both and trust the most recently updated.
const KEYCHAIN_SERVICE = 'gemini-cli-workspace-oauth';
const KEYCHAIN_ACCOUNT = 'main-account';
const CLOUD_REFRESH_URL = 'https://google-workspace-extension.geminicli.com/refreshToken';

function getEncryptionKey() {
  if (!fs.existsSync(MASTER_KEY_PATH)) {
    throw new Error(`Master key not found at ${MASTER_KEY_PATH}`);
  }
  const masterKey = fs.readFileSync(MASTER_KEY_PATH);
  const salt = `${os.hostname()}-${os.userInfo().username}-gemini-cli-workspace`;
  return crypto.scryptSync(masterKey, salt, 32);
}

function decryptTokenFile(encKey) {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(`Token file not found at ${TOKEN_PATH}`);
  }
  const encryptedData = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  const [ivHex, authTagHex, cipherText] = encryptedData.split(':');
  if (!ivHex || !authTagHex || !cipherText) {
    throw new Error('Invalid encrypted token format in token file');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let dec = decipher.update(cipherText, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return JSON.parse(dec);
}

function encryptAndSaveTokens(tokensObj, encKey) {
  const plainText = JSON.stringify(tokensObj);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  let cipherText = cipher.update(plainText, 'utf8', 'hex');
  cipherText += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  const out = `${iv.toString('hex')}:${authTag.toString('hex')}:${cipherText}`;
  
  const tmpPath = `${TOKEN_PATH}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, out, 'utf8');
  fs.renameSync(tmpPath, TOKEN_PATH);
}

function loadKeytar() {
  try {
    const req = createRequire(path.join(MCP_SERVER_DIR, 'package.json'));
    return req('keytar');
  } catch {
    return null;
  }
}

async function readKeychainAccount(keytar) {
  if (!keytar) return null;
  try {
    const raw = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // keyring unavailable (no D-Bus session, daemon down, locked)
  }
}

function readFileTokens(encKey) {
  try {
    return decryptTokenFile(encKey);
  } catch {
    return null;
  }
}

/**
 * Loads the freshest main-account credential and returns it with a save()
 * that writes it back to the store it came from.
 */
async function loadAccount() {
  const keytar = loadKeytar();
  const fromKeychain = await readKeychainAccount(keytar);

  let encKey = null;
  let fileTokens = null;
  try {
    encKey = getEncryptionKey();
    fileTokens = readFileTokens(encKey);
  } catch {
    // no master key: keyring only
  }
  const fromFile = fileTokens?.[KEYCHAIN_ACCOUNT] ?? null;

  const candidates = [];
  if (fromKeychain?.token) {
    candidates.push({
      account: fromKeychain,
      save: () => keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, JSON.stringify(fromKeychain)),
    });
  }
  if (fromFile?.token) {
    candidates.push({
      account: fromFile,
      save: () => encryptAndSaveTokens(fileTokens, encKey),
    });
  }
  if (candidates.length === 0) {
    throw new Error(
      `No ${KEYCHAIN_ACCOUNT} token found in keyring (${KEYCHAIN_SERVICE}) or ${TOKEN_PATH}`
    );
  }
  candidates.sort((a, b) => Number(b.account.updatedAt || 0) - Number(a.account.updatedAt || 0));
  return candidates[0];
}

/**
 * Retrieves a valid Google OAuth access token.
 * Refreshes automatically via the Google Workspace cloud function if expired.
 */
export async function getAccessToken() {
  const { account, save } = await loadAccount();
  const token = account.token;
  const now = Date.now();
  const expiresAt = token.expiresAt ? Number(token.expiresAt) : 0;

  // If token is valid for at least another 60 seconds, return it
  if (expiresAt > now + 60000 && token.accessToken) {
    return token.accessToken;
  }

  // Token is expired or expiring soon; refresh via cloud function
  if (!token.refreshToken) {
    if (token.accessToken) {
      return token.accessToken; // fallback to current token if no refresh token
    }
    throw new Error('Cannot refresh token: refreshToken is missing');
  }

  const res = await fetch(CLOUD_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: token.refreshToken })
  });

  if (!res.ok) {
    const errText = await res.text();
    // If refresh failed but we still have an access token, log warning and try it
    if (token.accessToken) {
      console.warn(`[bball-chat] Token refresh warning (${res.status}): ${errText}`);
      return token.accessToken;
    }
    throw new Error(`Token refresh failed with status ${res.status}: ${errText}`);
  }

  const freshData = await res.json();
  const newAccessToken = freshData.access_token;
  const newExpiry = freshData.expiry_date || (now + (freshData.expires_in ? freshData.expires_in * 1000 : 3600000));

  // Update object and save back to the store it came from
  token.accessToken = newAccessToken;
  token.expiresAt = newExpiry;
  if (freshData.refresh_token) {
    token.refreshToken = freshData.refresh_token;
  }
  account.updatedAt = now;

  try {
    await save();
  } catch (saveErr) {
    console.warn('[bball-chat] Warning: Failed to write back refreshed token:', saveErr.message);
  }

  return newAccessToken;
}

/**
 * True if an error means Google login is broken (expired/revoked token,
 * missing credentials) rather than a transient network or API failure.
 */
export function isAuthError(err) {
  const msg = String(err?.message ?? err ?? '');
  return /\(401\)|\b401\b|UNAUTHENTICATED|invalid_grant|Cannot refresh token|No main-account token|Token file not found|Master key not found/i.test(msg);
}
