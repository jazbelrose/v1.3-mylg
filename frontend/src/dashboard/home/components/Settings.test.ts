import { describe, it, expect } from 'vitest';
import { validatePasswordAgainstTypicalCognitoPolicy } from './Settings';

describe('validatePasswordAgainstTypicalCognitoPolicy', () => {
  it('valid password returns empty list', () => {
    expect(validatePasswordAgainstTypicalCognitoPolicy('Test1234')).toEqual([]);
  });

  it('no number flagged', () => {
    expect(validatePasswordAgainstTypicalCognitoPolicy('TestTest')).toContain('a number');
  });

  it('too short flagged', () => {
    expect(validatePasswordAgainstTypicalCognitoPolicy('Test1')).toContain('at least 8 characters');
  });

  it('no lowercase flagged', () => {
    expect(validatePasswordAgainstTypicalCognitoPolicy('TEST1234')).toContain('a lowercase letter');
  });

  it('no uppercase flagged', () => {
    expect(validatePasswordAgainstTypicalCognitoPolicy('test1234')).toContain('an uppercase letter');
  });
});