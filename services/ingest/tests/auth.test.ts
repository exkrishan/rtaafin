/**
 * Unit tests for JWT authentication
 */

import { extractToken, validateJWT, authenticateConnection } from '../src/auth';

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

import jwt from 'jsonwebtoken';

describe('Auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMOCK_KEY\n-----END PUBLIC KEY-----';
  });

  afterEach(() => {
    delete process.env.JWT_PUBLIC_KEY;
  });

  describe('extractToken', () => {
    it('should extract token from Bearer header', () => {
      const token = extractToken('Bearer abc123');
      expect(token).toBe('abc123');
    });

    it('should return null for missing header', () => {
      const token = extractToken(undefined);
      expect(token).toBeNull();
    });

    it('should return null for invalid format', () => {
      const token = extractToken('Invalid abc123');
      expect(token).toBeNull();
    });
  });

  describe('validateJWT', () => {
    it('should validate valid JWT token', () => {
      const mockPayload = { tenant_id: 'tenant-123', interaction_id: 'int-456' };
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = validateJWT('valid-token');
      expect(result).toEqual(mockPayload);
      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        process.env.JWT_PUBLIC_KEY,
        { algorithms: ['RS256'] }
      );
    });

    it('should throw error for expired token', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => validateJWT('expired-token')).toThrow('JWT token expired');
    });

    it('should throw error for invalid token', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => validateJWT('invalid-token')).toThrow('Invalid JWT token');
    });
  });

  describe('authenticateConnection', () => {
    it('should authenticate valid connection', () => {
      const mockPayload = { tenant_id: 'tenant-123', interaction_id: 'int-456' };
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const headers = { authorization: 'Bearer valid-token' };
      const result = authenticateConnection(headers);

      expect(result).toEqual(mockPayload);
    });

    it('should throw error for missing authorization header', () => {
      expect(() => authenticateConnection({})).toThrow('Missing or invalid Authorization header');
    });

    it('should throw error for invalid token', () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid');
      });

      const headers = { authorization: 'Bearer invalid-token' };
      expect(() => authenticateConnection(headers)).toThrow();
    });
  });
});

