import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

const MCP_SERVER_DIR = path.join(os.homedir(), '.claude', 'mcp-servers', 'google-workspace');
const MASTER_KEY_PATH = path.join(MCP_SERVER_DIR, '.gemini-cli-workspace-master-key');
const TOKEN_PATH = path.join(MCP_SERVER_DIR, 'gemini-cli-workspace-token.json');
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

/**
 * Retrieves a valid Google OAuth access token.
 * Refreshes automatically via the Google Workspace cloud function if expired.
 */
export async function getAccessToken() {
  const encKey = getEncryptionKey();
  const tokensObj = decryptTokenFile(encKey);
  const account = tokensObj['main-account'];
  if (!account || !account.token) {
    throw new Error('No main-account token found in encrypted credentials');
  }

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

  // Update object and save
  token.accessToken = newAccessToken;
  token.expiresAt = newExpiry;
  if (freshData.refresh_token) {
    token.refreshToken = freshData.refresh_token;
  }
  account.updatedAt = now;

  try {
    encryptAndSaveTokens(tokensObj, encKey);
  } catch (saveErr) {
    console.warn('[bball-chat] Warning: Failed to write back refreshed token:', saveErr.message);
  }

  return newAccessToken;
}
