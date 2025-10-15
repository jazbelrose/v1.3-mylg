// Security utilities for CSRF protection and rate limiting
import { v4 as uuidv4 } from 'uuid';

// CSRF Token Management
class CSRFProtection {
  private tokenKey: string;
  private headerName: string;

  constructor() {
    this.tokenKey = 'csrf_token';
    this.headerName = 'X-CSRF-Token';
  }

  // Generate a new CSRF token
  generateToken(): string {
    const token = uuidv4();
    sessionStorage.setItem(this.tokenKey, token);
    return token;
  }

  // Get the current CSRF token
  getToken(): string {
    let token = sessionStorage.getItem(this.tokenKey);
    if (!token) {
      token = this.generateToken();
    }
    return token;
  }

  // Validate CSRF token (for form submissions)
  validateToken(submittedToken: string): boolean {
    const storedToken = sessionStorage.getItem(this.tokenKey);
    return storedToken !== null && storedToken === submittedToken;
  }

  // Add CSRF token to request headers
  addToHeaders(headers: Record<string, string> = {}): Record<string, string> {
    return {
      ...headers,
      [this.headerName]: this.getToken()
    };
  }

  // Add CSRF token to fetch requests
  addToFetchOptions(options: RequestInit = {}): RequestInit {
    return {
      ...options,
      headers: this.addToHeaders(options.headers as Record<string, string>)
    };
  }

  // Clear the CSRF token (on logout)
  clearToken(): void {
    sessionStorage.removeItem(this.tokenKey);
  }
}

// Rate Limiting for Client-Side Protection
class RateLimiter {
  private requests: Map<string, number[]>;

  constructor() {
    this.requests = new Map();
  }

  // Check if request is allowed (returns true if allowed)
  isAllowed(key: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const requestTimes = this.requests.get(key)!;
    
    // Remove old requests outside the window
    const validRequests = requestTimes.filter(time => time > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }

  // Get remaining requests in current window
  getRemainingRequests(key: string, maxRequests: number = 10, windowMs: number = 60000): number {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.requests.has(key)) {
      return maxRequests;
    }
    
    const requestTimes = this.requests.get(key)!;
    const validRequests = requestTimes.filter(time => time > windowStart);
    
    return Math.max(0, maxRequests - validRequests.length);
  }

  // Clear rate limiting data for a key
  clear(key: string): void {
    this.requests.delete(key);
  }

  // Clear all rate limiting data
  clearAll(): void {
    this.requests.clear();
  }
}

interface SecurityLogEntry {
  timestamp: string;
  event: string;
  details: Record<string, unknown>;
  userAgent: string;
  url: string;
}

// Input Sanitization
export const sanitizeInput = (input: unknown): unknown => {
  if (typeof input !== 'string') return input;
  
  // Basic XSS prevention - encode HTML entities
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Secure API request wrapper
export const secureApiRequest = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const csrf = new CSRFProtection();
  const rateLimiter = new RateLimiter();
  
  // Rate limiting check
  const rateLimitKey = `api_${url}`;
  if (!rateLimiter.isAllowed(rateLimitKey, 30, 60000)) { // 30 requests per minute
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  // Add CSRF protection
  const secureOptions = csrf.addToFetchOptions(options);
  
  // Add additional security headers
  secureOptions.headers = {
    ...secureOptions.headers,
    'X-Requested-With': 'XMLHttpRequest', // CSRF protection
  };
  
  try {
    const response = await fetch(url, secureOptions);
    
    // Check for security-related response headers
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json') && !contentType.includes('text/')) {
      console.warn('Unexpected content type:', contentType);
    }
    
    return response;
  } catch (error) {
    console.error('Secure API request failed:', error);
    throw error;
  }
};

// Export singleton instances
export const csrfProtection = new CSRFProtection();
export const rateLimiter = new RateLimiter();

// Security event logging
export const logSecurityEvent = (event: string, details: Record<string, unknown> = {}): void => {
  const logEntry: SecurityLogEntry = {
    timestamp: new Date().toISOString(),
    event,
    details,
    userAgent: navigator.userAgent,
    url: window.location.href
  };
  
  // In production, this should be sent to a security monitoring service
  console.warn('Security Event:', logEntry);
  
  // Store in session for debugging (limit to 100 entries)
  const logs: SecurityLogEntry[] = JSON.parse(sessionStorage.getItem('security_logs') || '[]');
  logs.push(logEntry);
  if (logs.length > 100) {
    logs.shift();
  }
  sessionStorage.setItem('security_logs', JSON.stringify(logs));
};

export default {
  csrfProtection,
  rateLimiter,
  sanitizeInput,
  secureApiRequest,
  logSecurityEvent
};








