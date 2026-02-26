/**
 * AES-256-GCM encryption for eBay OAuth tokens.
 *
 * Key is read from EBAY_TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes).
 * Generate a key:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Ciphertext format:  "<iv_hex>.<authTag_hex>.<encrypted_hex>"
 * The auth tag provides integrity verification — any tampering causes decryption to throw.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const hex = process.env.EBAY_TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'EBAY_TOKEN_ENCRYPTION_KEY must be set to 64 hex characters (32 bytes). ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12) // 96-bit IV recommended for AES-GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag() // 128-bit authentication tag
  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split('.')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}
