import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { EncryptedSecret } from '../domain/types.js';

export class TokenVault {
  constructor(private readonly keyHex: string) {}

  encrypt(plain: string): EncryptedSecret {
    const key = Buffer.from(this.keyHex, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    };
  }

  decrypt(secret: EncryptedSecret): string {
    const key = Buffer.from(this.keyHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  }
}
