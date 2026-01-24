import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToSend, ToSendError } from './index';

describe('ToSend', () => {
  describe('constructor', () => {
    it('accepts API key as string', () => {
      const client = new ToSend('tsend_test_key');
      expect(client).toBeInstanceOf(ToSend);
    });

    it('accepts config object', () => {
      const client = new ToSend({
        apiKey: 'tsend_test_key',
        baseUrl: 'https://custom.api.com',
        timeout: 5000,
      });
      expect(client).toBeInstanceOf(ToSend);
    });

    it('throws error when API key is empty', () => {
      expect(() => new ToSend('')).toThrow(ToSendError);
      expect(() => new ToSend('')).toThrow('API key is required');
    });

    it('throws error when API key is whitespace', () => {
      expect(() => new ToSend('   ')).toThrow(ToSendError);
    });

    it('throws error when config has empty API key', () => {
      expect(() => new ToSend({ apiKey: '' })).toThrow(ToSendError);
    });
  });

  describe('send validation', () => {
    const client = new ToSend('tsend_test_key');

    it('throws error when from is missing', async () => {
      await expect(
        client.send({
          from: { email: '' },
          to: [{ email: 'test@example.com' }],
          subject: 'Test',
          html: '<p>Hi</p>',
        })
      ).rejects.toThrow('From email is required');
    });

    it('throws error when from email is invalid', async () => {
      await expect(
        client.send({
          from: { email: 'not-an-email' },
          to: [{ email: 'test@example.com' }],
          subject: 'Test',
          html: '<p>Hi</p>',
        })
      ).rejects.toThrow('From email is invalid');
    });

    it('throws error when to is empty', async () => {
      await expect(
        client.send({
          from: { email: 'sender@example.com' },
          to: [],
          subject: 'Test',
          html: '<p>Hi</p>',
        })
      ).rejects.toThrow('To is required');
    });

    it('throws error when to has invalid emails', async () => {
      await expect(
        client.send({
          from: { email: 'sender@example.com' },
          to: [{ email: 'invalid' }],
          subject: 'Test',
          html: '<p>Hi</p>',
        })
      ).rejects.toThrow('At least one valid recipient');
    });

    it('throws error when subject is missing', async () => {
      await expect(
        client.send({
          from: { email: 'sender@example.com' },
          to: [{ email: 'test@example.com' }],
          subject: '',
          html: '<p>Hi</p>',
        })
      ).rejects.toThrow('Subject is required');
    });

    it('throws error when content is missing', async () => {
      await expect(
        client.send({
          from: { email: 'sender@example.com' },
          to: [{ email: 'test@example.com' }],
          subject: 'Test',
        })
      ).rejects.toThrow('Either html or text content is required');
    });

    it('accepts text without html', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message_id: 'test123' }),
      });
      global.fetch = mockFetch;

      const response = await client.send({
        from: { email: 'sender@example.com' },
        to: [{ email: 'test@example.com' }],
        subject: 'Test',
        text: 'Plain text',
      });

      expect(response.message_id).toBe('test123');
    });
  });

  describe('batch validation', () => {
    const client = new ToSend('tsend_test_key');

    it('throws error when emails array is empty', async () => {
      await expect(client.batch([])).rejects.toThrow(
        'Emails array is required and cannot be empty'
      );
    });

    it('throws error with index when email is invalid', async () => {
      await expect(
        client.batch([
          {
            from: { email: 'sender@example.com' },
            to: [{ email: 'test@example.com' }],
            subject: 'Valid',
            html: '<p>Hi</p>',
          },
          {
            from: { email: 'sender@example.com' },
            to: [{ email: 'test@example.com' }],
            subject: '',
            html: '<p>Hi</p>',
          },
        ])
      ).rejects.toThrow('Email at index 1:');
    });
  });
});

describe('ToSendError', () => {
  it('creates error with message', () => {
    const error = new ToSendError('Something went wrong');
    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe(0);
    expect(error.errors).toEqual({});
  });

  it('creates error with code and errors', () => {
    const errors = { from: { required: 'From is required' } };
    const error = new ToSendError('Validation failed', 422, errors);

    expect(error.message).toBe('Validation failed');
    expect(error.code).toBe(422);
    expect(error.errors).toEqual(errors);
  });

  it('isValidationError returns true for 422', () => {
    const error = new ToSendError('Validation failed', 422);
    expect(error.isValidationError).toBe(true);
    expect(error.isAuthenticationError).toBe(false);
    expect(error.isRateLimitError).toBe(false);
  });

  it('isAuthenticationError returns true for 401', () => {
    const error = new ToSendError('Unauthorized', 401);
    expect(error.isValidationError).toBe(false);
    expect(error.isAuthenticationError).toBe(true);
  });

  it('isAuthenticationError returns true for 403', () => {
    const error = new ToSendError('Forbidden', 403);
    expect(error.isAuthenticationError).toBe(true);
  });

  it('isRateLimitError returns true for 429', () => {
    const error = new ToSendError('Too many requests', 429);
    expect(error.isRateLimitError).toBe(true);
  });
});

describe('API requests', () => {
  let client: ToSend;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new ToSend('tsend_test_key');
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends email successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message_id: 'abc123' }),
    });

    const response = await client.send({
      from: { email: 'sender@example.com', name: 'Sender' },
      to: [{ email: 'recipient@example.com' }],
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(response.message_id).toBe('abc123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.tosend.com/v2/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer tsend_test_key',
        }),
      })
    );
  });

  it('sends batch successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { status: 'success', message_id: 'abc' },
            { status: 'success', message_id: 'def' },
          ],
        }),
    });

    const response = await client.batch([
      {
        from: { email: 'sender@example.com' },
        to: [{ email: 'user1@example.com' }],
        subject: 'Test 1',
        html: '<p>Hi</p>',
      },
      {
        from: { email: 'sender@example.com' },
        to: [{ email: 'user2@example.com' }],
        subject: 'Test 2',
        html: '<p>Hi</p>',
      },
    ]);

    expect(response.results).toHaveLength(2);
    expect(response.results[0].status).toBe('success');
  });

  it('gets account info successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          account: {
            title: 'Test Account',
            plan_type: 'pro',
            status: 'active',
            emails_usage_this_month: 1000,
            emails_sent_last_24hrs: 50,
          },
          domains: [
            {
              domain_name: 'example.com',
              verification_status: 'verified',
              created_at: '2024-01-01',
            },
          ],
        }),
    });

    const info = await client.getAccountInfo();

    expect(info.account.title).toBe('Test Account');
    expect(info.domains).toHaveLength(1);
    expect(info.domains[0].domain_name).toBe('example.com');
  });

  it('throws ToSendError on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          message: 'Invalid API key',
          errors: { api_key: { invalid: 'The API key is invalid' } },
        }),
    });

    await expect(
      client.send({
        from: { email: 'sender@example.com' },
        to: [{ email: 'test@example.com' }],
        subject: 'Test',
        html: '<p>Hi</p>',
      })
    ).rejects.toThrow(ToSendError);
  });
});
