/**
 * ToSend Node.js SDK
 *
 * Official SDK for the ToSend email API.
 * @see https://tosend.com/docs
 */

// ============================================================================
// Types
// ============================================================================

export interface Address {
  email: string;
  name?: string;
}

export interface Attachment {
  /** MIME type (e.g., 'application/pdf') */
  type: string;
  /** Filename */
  name: string;
  /** Base64 encoded content */
  content: string;
}

export interface SendEmailParams {
  /** Sender address */
  from: Address;
  /** Recipients (max 50) */
  to: Address[];
  /** Email subject */
  subject: string;
  /** HTML content */
  html?: string;
  /** Plain text content */
  text?: string;
  /** CC recipients */
  cc?: Address[];
  /** BCC recipients */
  bcc?: Address[];
  /** Reply-to address */
  reply_to?: Address;
  /** Custom headers */
  headers?: Record<string, string>;
  /** File attachments */
  attachments?: Attachment[];
}

export interface SendEmailResponse {
  message_id: string;
}

export interface BatchEmailResult {
  status: 'success' | 'error' | 'spam';
  message_id?: string;
  message?: string;
  errors?: Record<string, Record<string, string>>;
}

export interface BatchEmailResponse {
  results: BatchEmailResult[];
}

export interface Domain {
  domain_name: string;
  verification_status: 'pending' | 'verified' | 'failed';
  created_at: string;
}

export interface AccountInfo {
  account: {
    title: string;
    plan_type: string;
    status: string;
    emails_usage_this_month: number;
    emails_sent_last_24hrs: number;
  };
  domains: Domain[];
}

export interface ToSendErrorResponse {
  error_code: number;
  message: string;
  errors?: Record<string, Record<string, string>>;
}

export interface ToSendConfig {
  /** Your ToSend API key */
  apiKey: string;
  /** Custom base URL (optional) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

// ============================================================================
// Error Class
// ============================================================================

export class ToSendError extends Error {
  readonly code: number;
  readonly errors: Record<string, Record<string, string>>;

  constructor(
    message: string,
    code: number = 0,
    errors: Record<string, Record<string, string>> = {}
  ) {
    super(message);
    this.name = 'ToSendError';
    this.code = code;
    this.errors = errors;
  }

  get isValidationError(): boolean {
    return this.code === 422;
  }

  get isAuthenticationError(): boolean {
    return this.code === 401 || this.code === 403;
  }

  get isRateLimitError(): boolean {
    return this.code === 429;
  }
}

// ============================================================================
// Main Client
// ============================================================================

export class ToSend {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: string | ToSendConfig) {
    if (typeof config === 'string') {
      this.apiKey = config;
      this.baseUrl = 'https://api.tosend.com';
      this.timeout = 30000;
    } else {
      this.apiKey = config.apiKey;
      this.baseUrl = config.baseUrl?.replace(/\/$/, '') ?? 'https://api.tosend.com';
      this.timeout = config.timeout ?? 30000;
    }

    if (!this.apiKey?.trim()) {
      throw new ToSendError('API key is required', 401);
    }
  }

  /**
   * Send a single email.
   *
   * @example
   * ```ts
   * const response = await tosend.send({
   *   from: { email: 'hello@example.com', name: 'My App' },
   *   to: [{ email: 'user@example.com' }],
   *   subject: 'Hello!',
   *   html: '<p>Welcome!</p>'
   * });
   * console.log(response.message_id);
   * ```
   */
  async send(params: SendEmailParams): Promise<SendEmailResponse> {
    this.validateEmailParams(params);
    return this.request<SendEmailResponse>('POST', '/v2/emails', params);
  }

  /**
   * Send multiple emails in a single request.
   *
   * @example
   * ```ts
   * const response = await tosend.batch([
   *   {
   *     from: { email: 'hello@example.com' },
   *     to: [{ email: 'user1@example.com' }],
   *     subject: 'Hello User 1',
   *     html: '<p>Hi!</p>'
   *   },
   *   {
   *     from: { email: 'hello@example.com' },
   *     to: [{ email: 'user2@example.com' }],
   *     subject: 'Hello User 2',
   *     html: '<p>Hi!</p>'
   *   }
   * ]);
   *
   * response.results.forEach(result => {
   *   if (result.status === 'success') {
   *     console.log('Sent:', result.message_id);
   *   }
   * });
   * ```
   */
  async batch(emails: SendEmailParams[]): Promise<BatchEmailResponse> {
    if (!emails?.length) {
      throw new ToSendError('Emails array is required and cannot be empty', 422, {
        emails: { required: 'At least one email is required' },
      });
    }

    emails.forEach((email, index) => {
      try {
        this.validateEmailParams(email);
      } catch (error) {
        if (error instanceof ToSendError) {
          throw new ToSendError(
            `Email at index ${index}: ${error.message}`,
            error.code,
            error.errors
          );
        }
        throw error;
      }
    });

    return this.request<BatchEmailResponse>('POST', '/v2/emails/batch', { emails });
  }

  /**
   * Get account information and domains.
   *
   * @example
   * ```ts
   * const info = await tosend.getAccountInfo();
   * console.log(info.account.title);
   * console.log(info.account.emails_usage_this_month);
   * info.domains.forEach(d => console.log(d.domain_name, d.verification_status));
   * ```
   */
  async getAccountInfo(): Promise<AccountInfo> {
    return this.request<AccountInfo>('GET', '/v2/info');
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private validateEmailParams(params: SendEmailParams): void {
    const errors: Record<string, Record<string, string>> = {};

    if (!params.from?.email) {
      errors.from = { required: 'From email is required' };
    } else if (!this.isValidEmail(params.from.email)) {
      errors.from = { invalid: 'From email is invalid' };
    }

    if (!params.to?.length) {
      errors.to = { required: 'To is required' };
    } else {
      const hasValidRecipient = params.to.some(
        (r) => r.email && this.isValidEmail(r.email)
      );
      if (!hasValidRecipient) {
        errors.to = { invalid: 'At least one valid recipient email is required' };
      }
    }

    if (!params.subject) {
      errors.subject = { required: 'Subject is required' };
    }

    if (!params.html && !params.text) {
      errors.content = { required: 'Either html or text content is required' };
    }

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      const message = Object.values(firstError)[0];
      throw new ToSendError(message, 422, errors);
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json() as T & { message?: string; errors?: Record<string, unknown> };

      if (!response.ok) {
        throw new ToSendError(
          data.message ?? 'Unknown error',
          response.status,
          data.errors ?? {}
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ToSendError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ToSendError('Request timeout', 408);
        }
        throw new ToSendError(error.message);
      }

      throw new ToSendError('Unknown error');
    }
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default ToSend;
