import { fetchAuthSession } from 'aws-amplify/auth';

export async function waitForAuthReady(maxRetries: number = 5, delay: number = 300): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const session = await fetchAuthSession().catch(() => null);
    const token = session?.tokens?.accessToken?.toString();

    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('Auth not ready after retries');
}








