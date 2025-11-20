// --- Client-side helper to mirror typical Cognito password policy ---
// Keep outside the component so it isn't recreated on each render and is easy to unit test.
export const validatePasswordAgainstTypicalCognitoPolicy = (pwd: string) => {
  const missing: string[] = [];
  if (pwd.length < 8) missing.push("at least 8 characters");
  if (!/[0-9]/.test(pwd)) missing.push("a number");
  if (!/[a-z]/.test(pwd)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(pwd)) missing.push("an uppercase letter");
  // If your pool requires symbols, un-comment the next line:
  // if (!/[^A-Za-z0-9]/.test(pwd)) missing.push("a special character");
  return missing;
};