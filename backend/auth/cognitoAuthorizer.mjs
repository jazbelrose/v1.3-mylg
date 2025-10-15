import jwt from "jsonwebtoken"; // Ensure you have this dependency in package.json
import jwksClient from "jwks-rsa";

const COGNITO_POOL_ID = process.env.COGNITO_POOL_ID;
const REGION = process.env.AWS_REGION;

// Set up JWKS Client
const client = jwksClient({
  jwksUri: `https://cognito-idp.${REGION}.amazonaws.com/${COGNITO_POOL_ID}/.well-known/jwks.json`
});

// ✅ Fix: Move getSigningKey function **before** the handler
const getSigningKey = async (kid) => {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        resolve(key.publicKey || key.rsaPublicKey);
      }
    });
  });
};

// ✅ Now the handler has access to getSigningKey
export const handler = async (event) => {
  console.log("🚀 Lambda Authorizer Invoked:", JSON.stringify(event, null, 2));
  
  // Debug: Log all headers to understand what we're receiving
  console.log("📋 All Headers:", JSON.stringify(event.headers, null, 2));
  console.log("📋 Query Parameters:", JSON.stringify(event.queryStringParameters, null, 2));

  try {
    // ✅ Fix: Extract token and sessionId from Base64 encoded Sec-WebSocket-Protocol header
    const headerKey = Object.keys(event.headers).find(
      k => k.toLowerCase() === 'sec-websocket-protocol'
    );
    const proto = headerKey ? event.headers[headerKey] : '';
    console.log("🔍 Raw subprotocol:", proto);
    
    if (!proto) {
      console.error("❌ Missing subprotocol header");
      return generateDenyResponse(event);
    }

    // Split the decoded string to get token and sessionId
    const parts = proto.split(',').map(s => s.trim());
    const token = parts[0];
    const sessionId = parts[1];
    console.log("🎫 Extracted token length:", token?.length);
    console.log("🆔 Extracted sessionId:", sessionId);

    if (!token || !sessionId) {
      console.error("❌ Missing token or sessionId in decoded subprotocol");
      console.error("   Token exists:", !!token);
      console.error("   SessionId exists:", !!sessionId);
      return generateDenyResponse(event);
    }

    console.log("🪪 Raw token string:", token);
    // Decode and verify token
    const decoded = jwt.decode(token, { complete: true });
    console.log("🔍 Decoded Token:", decoded);

    if (!decoded || !decoded.header || !decoded.header.kid) {
      throw new Error("❌ Invalid token structure");
    }

    const signingKey = await getSigningKey(decoded.header.kid);
    const verified = jwt.verify(token, signingKey, { algorithms: ["RS256"] });

    console.log("✅ Token Verified:", verified);

    // ✅ Correct WebSocket API Gateway response format
    const response = {
      principalId: verified.sub, // Required field
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect: "Allow",
            Resource: "*", // Temporarily set to "*" to rule out scoping issues
          },
        ],
      },
      context: {
        userId: String(verified['custom:userId'] || verified.sub),
        email: String(verified.email),
        role: String(verified.role),
      },
    };

    console.log("🚀 Returning Correct Authorizer Response:", JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error("❌ Error during token verification:", error);
    return generateDenyResponse(event);
  }
};

// ✅ Generates a "Deny" response
function generateDenyResponse(event) {
  return {
    principalId: "unauthorized",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Deny",
          Resource: "*"
        }
      ]
    },
    context: {
      reason: "Authentication failed"
    }
  };
}

