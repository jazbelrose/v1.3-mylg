import { sha256 as jsSha256 } from 'js-sha256';

export async function sha256(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const data = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return jsSha256(str);
}








