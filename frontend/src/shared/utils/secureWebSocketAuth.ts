// Secure WebSocket authentication utility
// This provides a token exchange mechanism to avoid putting JWT tokens in URLs

import { logSecurityEvent } from './securityUtils';

interface TokenData {
  jwtToken: string;
  expiresAt: number;
  used: boolean;
}

class SecureWebSocketAuth {
  private tempTokens: Map<string, TokenData>;
  private tokenTTL: number;

  constructor() {
    this.tempTokens = new Map();
    this.tokenTTL = 5 * 60 * 1000; // 5 minutes
  }

  // Generate a temporary token for WebSocket authentication
  async generateTempToken(jwtToken: string): Promise<string> {
    try {
      // Create a temporary token that can be safely used in WebSocket URLs
      const tempToken = this.createTempToken();
      const expiresAt = Date.now() + this.tokenTTL;
      
      // Store the mapping between temp token and JWT
      this.tempTokens.set(tempToken, {
        jwtToken,
        expiresAt,
        used: false
      });
      
      // Clean up expired tokens
      this.cleanupExpiredTokens();
      
      logSecurityEvent('temp_token_generated', { tempToken: tempToken.substring(0, 8) + '...' });
      
      return tempToken;
    } catch (error) {
      logSecurityEvent('temp_token_generation_failed', { error: (error as Error).message });
      throw error;
    }
  }

  // Create a secure temporary token
  createTempToken(): string {
    // Use crypto.getRandomValues for cryptographically secure random values
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Validate and consume a temporary token
  validateTempToken(tempToken: string): string | null {
    const tokenData = this.tempTokens.get(tempToken);
    
    if (!tokenData) {
      logSecurityEvent('temp_token_not_found', { tempToken: tempToken?.substring(0, 8) + '...' });
      return null;
    }
    
    if (tokenData.used) {
      logSecurityEvent('temp_token_already_used', { tempToken: tempToken.substring(0, 8) + '...' });
      this.tempTokens.delete(tempToken);
      return null;
    }
    
    if (Date.now() > tokenData.expiresAt) {
      logSecurityEvent('temp_token_expired', { tempToken: tempToken.substring(0, 8) + '...' });
      this.tempTokens.delete(tempToken);
      return null;
    }
    
    // Mark as used (one-time use)
    tokenData.used = true;
    
    logSecurityEvent('temp_token_validated', { tempToken: tempToken.substring(0, 8) + '...' });
    
    return tokenData.jwtToken;
  }

  // Clean up expired tokens
  cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [token, data] of this.tempTokens.entries()) {
      if (now > data.expiresAt || data.used) {
        this.tempTokens.delete(token);
      }
    }
  }

  // Clear all tokens (on logout)
  clearAllTokens(): void {
    this.tempTokens.clear();
    logSecurityEvent('all_temp_tokens_cleared');
  }
}

// Export singleton instance
export const secureWebSocketAuth = new SecureWebSocketAuth();

// Enhanced WebSocket connection function
export const createSecureWebSocketConnection = async (
  baseUrl: string, 
  jwtToken: string, 
  sessionId: string
): Promise<WebSocket> => {
  try {
    // Use Sec-WebSocket-Protocol as an array for authentication
    const subprotocols = [jwtToken, sessionId];

    logSecurityEvent('secure_websocket_connection_initiated', { 
      url: baseUrl,
      sessionId: sessionId?.substring(0, 8) + '...'
    });

    return new WebSocket(baseUrl, subprotocols);
  } catch (error) {
    logSecurityEvent('secure_websocket_connection_failed', { 
      error: (error as Error).message,
      url: baseUrl 
    });
    throw error;
  }
};

// Alternative: Use WebSocket subprotocol for authentication (if backend supports it)
export const createWebSocketWithSubprotocol = (baseUrl: string, jwtToken: string, sessionId: string): WebSocket => {
  try {
    // Encode authentication info in subprotocol
    const authData = btoa(JSON.stringify({ 
      token: jwtToken, 
      sessionId,
      timestamp: Date.now()
    }));
    
    logSecurityEvent('websocket_subprotocol_connection_initiated', { 
      url: baseUrl,
      sessionId: sessionId?.substring(0, 8) + '...'
    });
    
    // WebSocket with custom subprotocol
    return new WebSocket(baseUrl, [`auth.${authData}`]);
  } catch (error) {
    logSecurityEvent('websocket_subprotocol_connection_failed', { 
      error: (error as Error).message,
      url: baseUrl 
    });
    throw error;
  }
};

// Use Sec-WebSocket-Protocol with accessToken and sessionId
export const createWebSocketWithSecProtocol = (baseUrl: string, accessToken: string, sessionId: string): WebSocket => {
  try {
    // Use Sec-WebSocket-Protocol for authentication
    const subprotocol = `${accessToken},${sessionId}`;

    logSecurityEvent('websocket_sec_protocol_connection_initiated', { 
      url: baseUrl,
      sessionId: sessionId || 'null'
    });

    // WebSocket with Sec-WebSocket-Protocol
    return new WebSocket(baseUrl, subprotocol);
  } catch (error) {
    logSecurityEvent('websocket_sec_protocol_connection_failed', { 
      error: (error as Error).message,
      url: baseUrl 
    });
    throw error;
  }
};

export const initializeWebSocketWithJWT = (jwtToken: string): WebSocket => {
  const baseUrl = 'wss://hhgvsv3ey7.execute-api.us-west-2.amazonaws.com/dev';
  return new WebSocket(baseUrl, jwtToken);
};

const secureWebSocketUtils = {
  secureWebSocketAuth,
  createSecureWebSocketConnection,
  createWebSocketWithSubprotocol,
  createWebSocketWithSecProtocol
};

export default secureWebSocketUtils;








