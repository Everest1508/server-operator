// Encrypts secrets with the OS keychain (Electron safeStorage).
// Output looks like "enc:v1:<base64>". Anything without that prefix is treated as plain text.
const { safeStorage, ipcMain } = require('electron');

const PREFIX = 'enc:v1:';

// On Linux without a keyring, Electron falls back to a hardcoded key ("basic_text").
// That is not real protection, so treat it as unavailable.
function canEncrypt() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
      return safeStorage.getSelectedStorageBackend() !== 'basic_text';
    }
    return true;
  } catch (_) {
    return false;
  }
}

function protect(plain) {
  if (typeof plain !== 'string' || plain === '') return plain;
  if (plain.startsWith(PREFIX) || !canEncrypt()) return plain;
  return PREFIX + safeStorage.encryptString(plain).toString('base64');
}

function reveal(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(PREFIX.length), 'base64'));
  } catch (_) {
    return null;
  }
}

function registerSecretHandlers() {
  ipcMain.handle('secrets:available', async () => canEncrypt());
  ipcMain.handle('secrets:encrypt', async (_e, { values }) =>
    (Array.isArray(values) ? values : []).map((v) => protect(v)));
  ipcMain.handle('secrets:decrypt', async (_e, { values }) =>
    (Array.isArray(values) ? values : []).map((v) => reveal(v)));
}

module.exports = { protect, reveal, canEncrypt, registerSecretHandlers };
