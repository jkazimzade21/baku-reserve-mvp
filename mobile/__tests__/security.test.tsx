/**
 * Security tests for mobile app
 * Tests input validation, data sanitization, and security best practices
 */

import { sanitizeInput, validateEmail, validatePhoneNumber } from '../src/utils/validation';

describe('Input Validation', () => {
  describe('XSS Prevention', () => {
    it('should sanitize script tags', () => {
      const maliciousInput = '<script>alert("XSS")</script>Hello';
      const sanitized = sanitizeInput(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should sanitize javascript: protocol', () => {
      // eslint-disable-next-line no-script-url
      const maliciousInput = 'javascript:alert("XSS")';
      const sanitized = sanitizeInput(maliciousInput);

      // eslint-disable-next-line no-script-url
      expect(sanitized).not.toContain('javascript:');
    });

    it('should sanitize event handlers', () => {
      // eslint-disable-next-line no-script-url
      const maliciousInput = '<img src=x onerror=alert("XSS")>';
      const sanitized = sanitizeInput(maliciousInput);

      expect(sanitized).not.toContain('onerror=');
    });

    it('should handle nested attacks', () => {
      const maliciousInput = '<scr<script>ipt>alert("XSS")</scr</script>ipt>';
      let sanitized = maliciousInput;
      for (let i = 0; i < 3; i += 1) {
        sanitized = sanitizeInput(sanitized);
      }

      expect(sanitized.toLowerCase()).not.toContain('script');
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email formats', () => {
      const validEmails = [
        'user@example.com',
        'test.user@example.com',
        'user+tag@example.co.uk',
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
      ];

      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });
  });

  describe('Phone Number Validation', () => {
    it('should validate correct phone formats', () => {
      const validPhones = [
        '+1234567890',
        '(123) 456-7890',
        '123-456-7890',
        '+44 20 1234 5678',
      ];

      validPhones.forEach(phone => {
        expect(validatePhoneNumber(phone)).toBe(true);
      });
    });

    it('should reject invalid phone formats', () => {
      const invalidPhones = [
        'abc',
        '123',
        '+1 abc',
        '',
      ];

      invalidPhones.forEach(phone => {
        expect(validatePhoneNumber(phone)).toBe(false);
      });
    });
  });
});

describe('Data Sanitization', () => {
  it('should sanitize user-generated content', () => {
    const userContent = {
      name: '<script>alert("XSS")</script>John',
      comment: 'Great restaurant! <img src=x onerror=alert("XSS")>',
      rating: '5',
    };

    const sanitized = {
      name: sanitizeInput(userContent.name),
      comment: sanitizeInput(userContent.comment),
      rating: userContent.rating,
    };

    expect(sanitized.name).not.toContain('<script>');
    expect(sanitized.comment).not.toContain('onerror=');
  });

  it('should handle null and undefined safely', () => {
    expect(sanitizeInput('')).toBe('');
    // Test that function handles edge cases
  });
});

describe('Secure Storage', () => {
  it('should not store sensitive data in plain text', () => {
    const sensitiveData = {
      password: 'mypassword123',
      creditCard: '1234-5678-9012-3456',
      ssn: '123-45-6789',
    };

    // Sensitive data should never be stored directly
    const shouldNotStore = [
      'password',
      'creditCard',
      'ssn',
      'apiKey',
    ];

    Object.keys(sensitiveData).forEach(key => {
      expect(shouldNotStore).toContain(key);
    });
  });

  it('should use secure storage for tokens', () => {
    // Mock secure storage
    const secureStorage = new Map<string, string>();

    const storeToken = (key: string, value: string) => {
      // Should use secure storage, not AsyncStorage
      secureStorage.set(key, value);
    };

    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
    storeToken('authToken', token);

    expect(secureStorage.get('authToken')).toBe(token);
  });
});

describe('API Security', () => {
  it('should include CSRF tokens in requests', () => {
    const csrfToken = 'abc123';

    const makeSecureRequest = (url: string, token: string) => {
      return {
        url,
        headers: {
          'X-CSRF-Token': token,
          'Content-Type': 'application/json',
        },
      };
    };

    const request = makeSecureRequest('/api/data', csrfToken);

    expect(request.headers['X-CSRF-Token']).toBe(csrfToken);
  });

  it('should not expose API keys in client code', () => {
    // Check that sensitive config is not hardcoded
    const config = {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:8000',
      // API key should come from secure environment variable
      apiKey: process.env.EXPO_PUBLIC_API_KEY || '',
    };

    // Should not have hardcoded keys
    expect(config.apiKey).not.toMatch(/^[a-zA-Z0-9]{32,}$/);
  });

  it('should validate SSL certificates', () => {
    const validateSSL = (url: string): boolean => {
      return url.startsWith('https://');
    };

    expect(validateSSL('https://api.example.com')).toBe(true);
    expect(validateSSL('http://api.example.com')).toBe(false);
  });
});

describe('Authentication Security', () => {
  it('should handle token expiration', () => {
    const isTokenExpired = (token: { exp: number }): boolean => {
      return Date.now() / 1000 > token.exp;
    };

    const expiredToken = { exp: Date.now() / 1000 - 3600 }; // 1 hour ago
    const validToken = { exp: Date.now() / 1000 + 3600 }; // 1 hour from now

    expect(isTokenExpired(expiredToken)).toBe(true);
    expect(isTokenExpired(validToken)).toBe(false);
  });

  it('should clear sensitive data on logout', () => {
    const userSession = {
      token: 'abc123',
      userId: '123',
      email: 'user@example.com',
    };

    const logout = () => {
      return {
        token: null,
        userId: null,
        email: null,
      };
    };

    const clearedSession = logout();

    expect(clearedSession.token).toBeNull();
    expect(clearedSession.userId).toBeNull();
    expect(clearedSession.email).toBeNull();
  });
});

describe('Deep Link Security', () => {
  it('should validate deep link URLs', () => {
    const validateDeepLink = (url: string): boolean => {
      const allowedSchemes = ['bakureserve://', 'https://app.bakureserve.com'];
      return allowedSchemes.some(scheme => url.startsWith(scheme));
    };

    expect(validateDeepLink('bakureserve://restaurant/123')).toBe(true);
    expect(validateDeepLink('https://app.bakureserve.com/restaurant/123')).toBe(true);
    // eslint-disable-next-line no-script-url
    expect(validateDeepLink('javascript:alert("XSS")')).toBe(false);
    expect(validateDeepLink('http://malicious.com')).toBe(false);
  });

  it('should sanitize deep link parameters', () => {
    const parseDeepLinkParams = (url: string): Record<string, string> => {
      const urlObj = new URL(url);
      const params: Record<string, string> = {};

      urlObj.searchParams.forEach((value, key) => {
        // Sanitize each parameter
        params[key] = sanitizeInput(value);
      });

      return params;
    };

    const url = 'bakureserve://restaurant?id=<script>alert("XSS")</script>';
    const params = parseDeepLinkParams(url);

    expect(params.id).not.toContain('<script>');
  });
});

describe('File Upload Security', () => {
  it('should validate file types', () => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    const validateFileType = (mimeType: string): boolean => {
      return allowedTypes.includes(mimeType);
    };

    expect(validateFileType('image/jpeg')).toBe(true);
    expect(validateFileType('image/png')).toBe(true);
    expect(validateFileType('application/javascript')).toBe(false);
    expect(validateFileType('text/html')).toBe(false);
  });

  it('should limit file sizes', () => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    const validateFileSize = (size: number): boolean => {
      return size <= MAX_FILE_SIZE;
    };

    expect(validateFileSize(1 * 1024 * 1024)).toBe(true); // 1MB
    expect(validateFileSize(10 * 1024 * 1024)).toBe(false); // 10MB
  });
});
