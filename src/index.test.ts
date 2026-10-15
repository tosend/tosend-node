import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToSend, ToSendAdmin, ToSendError } from './index';

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
    expect(error.errorType).toBe('internal_error');
  });

  it('creates error with code and errors', () => {
    const errors = { from: { required: 'From is required' } };
    const error = new ToSendError('Validation failed', 422, errors);

    expect(error.message).toBe('Validation failed');
    expect(error.code).toBe(422);
    expect(error.errors).toEqual(errors);
    expect(error.errorType).toBe('validation_error');
  });

  it('creates error with explicit errorType', () => {
    const error = new ToSendError('Custom error', 400, {}, 'bad_request');
    expect(error.errorType).toBe('bad_request');
  });

  it('auto-maps error type from status code', () => {
    expect(new ToSendError('', 400).errorType).toBe('bad_request');
    expect(new ToSendError('', 401).errorType).toBe('unauthorized');
    expect(new ToSendError('', 403).errorType).toBe('forbidden');
    expect(new ToSendError('', 404).errorType).toBe('not_found');
    expect(new ToSendError('', 422).errorType).toBe('validation_error');
    expect(new ToSendError('', 429).errorType).toBe('rate_limit_exceeded');
    expect(new ToSendError('', 500).errorType).toBe('internal_error');
  });

  it('isValidationError returns true for 422', () => {
    const error = new ToSendError('Validation failed', 422);
    expect(error.isValidationError).toBe(true);
    expect(error.isAuthenticationError).toBe(false);
    expect(error.isRateLimitError).toBe(false);
  });

  it('isValidationError returns true for validation_error type', () => {
    const error = new ToSendError('Validation failed', 0, {}, 'validation_error');
    expect(error.isValidationError).toBe(true);
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

  it('isAuthenticationError returns true for unauthorized/forbidden types', () => {
    expect(new ToSendError('', 0, {}, 'unauthorized').isAuthenticationError).toBe(true);
    expect(new ToSendError('', 0, {}, 'forbidden').isAuthenticationError).toBe(true);
  });

  it('isRateLimitError returns true for 429', () => {
    const error = new ToSendError('Too many requests', 429);
    expect(error.isRateLimitError).toBe(true);
  });

  it('isRateLimitError returns true for rate_limit_exceeded type', () => {
    const error = new ToSendError('', 0, {}, 'rate_limit_exceeded');
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

  it('passes an attachment content_id through for inline images', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ message_id: 'abc123' }) });

    await client.send({
      from: { email: 'sender@example.com' },
      to: [{ email: 'recipient@example.com' }],
      subject: 'Inline',
      html: '<img src="cid:logo@example.com">',
      attachments: [{ type: 'image/png', name: 'logo.png', content: 'cG5n', content_id: 'logo@example.com' }],
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body).attachments).toEqual([
      { type: 'image/png', name: 'logo.png', content: 'cG5n', content_id: 'logo@example.com' },
    ]);
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
            id: 142,
            status: 'active',
            plan_type: 'pro',
            credit_balance: 48750,
            monthly_email_limit: 100000,
            limit_per_second: 14,
            ses_region: 'us-east-1',
            ses_status: 'healthy',
          },
          domains: [
            {
              id: 88,
              domain_name: 'example.com',
              verification_status: 'verified',
              is_default: 1,
              total_sent: 10,
              total_bounced: 0,
              total_complained: 0,
            },
          ],
        }),
    });

    const info = await client.getAccountInfo();

    expect(info.account.credit_balance).toBe(48750);
    expect(info.domains).toHaveLength(1);
    expect(info.domains[0].domain_name).toBe('example.com');
  });

  it('throws ToSendError on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          status_code: 403,
          error_type: 'forbidden',
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

  it('parses error_type from API response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          status_code: 422,
          error_type: 'validation_error',
          message: 'Validation failed',
          errors: { subject: { required: 'Subject is required' } },
        }),
    });

    try {
      await client.send({
        from: { email: 'sender@example.com' },
        to: [{ email: 'test@example.com' }],
        subject: 'Test',
        html: '<p>Hi</p>',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ToSendError);
      expect((error as ToSendError).errorType).toBe('validation_error');
      expect((error as ToSendError).code).toBe(422);
    }
  });
});

describe('ToSendAdmin', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  function reply(body: unknown, status = 200) {
    mockFetch.mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });
  }

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a sending key at construction', () => {
    expect(() => new ToSendAdmin('tsend_abc')).toThrow(/not an admin API key/);
  });

  it('sends X-Account-Id only from forAccount()', async () => {
    const admin = new ToSendAdmin('tsend_admin_abc');
    reply({ data: { account: {}, teams: [], credits_shared: true } });

    await admin.listTeams();
    expect(mockFetch.mock.calls[0][1].headers['X-Account-Id']).toBeUndefined();

    await admin.forAccount(4203).listTeams();
    expect(mockFetch.mock.calls[1][1].headers['X-Account-Id']).toBe('4203');
  });

  it('createTeam sends ses_region only when given', async () => {
    const admin = new ToSendAdmin('tsend_admin_abc');
    reply({ data: { id: 8, name: 'Clients EU', status: 'active', ses_region: 'eu-central-1' } });

    const team = await admin.createTeam('Clients EU', { ses_region: 'eu-central-1' });
    await admin.createTeam('Clients');

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ name: 'Clients EU', ses_region: 'eu-central-1' });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ name: 'Clients' });
    expect(team.ses_region).toBe('eu-central-1');
  });

  it('exposes the flat insufficient_scope error', async () => {
    reply({ status_code: 403, message: 'no scope', errors: { code: 'insufficient_scope', required_scope: 'domains:read' } }, 403);

    const err = await new ToSendAdmin('tsend_admin_abc').listDomains().catch((e) => e);
    expect(err).toBeInstanceOf(ToSendError);
    expect(err.code).toBe(403);
    expect(err.errors.code).toBe('insufficient_scope');
    expect(err.errors.required_scope).toBe('domains:read');
  });

  it('pages sending keys and encodes the suppression email', async () => {
    const admin = new ToSendAdmin('tsend_admin_abc');
    reply({ data: [], total: 0, page: 2, per_page: 50 });
    const page = await admin.listSendingKeys({ page: 2, per_page: 50 });
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.tosend.com/v2/api-keys?page=2&per_page=50');
    expect(page.page).toBe(2);

    reply({ deleted: true, message: 'ok', used_today: 1, remaining_today: 499, daily_limit: 500 });
    const res = await admin.deleteSuppression('a+b@example.com');
    expect(mockFetch.mock.calls[1][0]).toBe('https://api.tosend.com/v2/suppressions?email=a%2Bb%40example.com');
    expect(res.remaining_today).toBe(499);
  });

  it('reads the key and its scopes from getInfo()', async () => {
    reply({ account: { id: 1 }, key: { id: 9, type: 'admin', acting_on: 1, owned_by: 1, scopes: ['teams:read'] } });
    const info = await new ToSendAdmin('tsend_admin_abc').getInfo();
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.tosend.com/v2/info');
    expect(info.key.scopes).toEqual(['teams:read']);
  });
});
