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
  errors?: ValidationErrors;
}

export interface BatchEmailResponse {
  results: BatchEmailResult[];
}

export interface Domain {
  id: number;
  domain_name: string;
  verification_status: string;
  /** 1 for the account's default domain, else 0 */
  is_default: number;
  total_sent: number;
  total_bounced: number;
  total_complained: number;
}

export interface AccountInfo {
  account: {
    id: number;
    status: string;
    plan_type: string;
    /** null means the account does not consume credits */
    credit_balance: number | null;
    monthly_email_limit: number;
    limit_per_second: number;
    ses_region: string;
    /** Fraction between 0 and 1, not a percentage */
    bounce_rate: number;
    /** Fraction between 0 and 1, not a percentage */
    complaint_rate: number;
    ses_status: string;
  };
  domains: Domain[];
}

export interface ToSendErrorResponse {
  status_code: number;
  error_type: ErrorType;
  message: string;
  /**
   * Field-level validation detail.
   *
   * The sending API returns a nested map (`{subject: {required: "..."}}`);
   * the Worker's ApiError returns a flat one (`{name: "required"}`). Both
   * shapes reach this type, so consumers must not assume either — see
   * ToSendError.errors.
   */
  errors?: ValidationErrors;
}

/**
 * Either shape the API may return for `errors`.
 *
 * ToSendError declared the nested form only, so `err.errors.name` was typed
 * as an object while the Worker actually sends the string `'required'`. That
 * compiled because the response was cast, and would have surfaced as an
 * undefined property at runtime.
 */
export type ValidationErrors = Record<string, string | Record<string, string>>;

export type ErrorType =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limit_exceeded'
  | 'internal_error';

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
  readonly errorType: ErrorType;
  /** See ValidationErrors — the value may be a string or a nested map. */
  readonly errors: ValidationErrors;

  private static readonly ERROR_TYPE_MAP: Record<number, ErrorType> = {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    422: 'validation_error',
    429: 'rate_limit_exceeded',
  };

  constructor(
    message: string,
    code: number = 0,
    errors: ValidationErrors = {},
    errorType?: ErrorType
  ) {
    super(message);
    this.name = 'ToSendError';
    this.code = code;
    this.errors = errors;
    this.errorType = errorType ?? ToSendError.ERROR_TYPE_MAP[code] ?? 'internal_error';
  }

  get isValidationError(): boolean {
    return this.errorType === 'validation_error' || this.code === 422;
  }

  get isAuthenticationError(): boolean {
    return (
      this.errorType === 'unauthorized' ||
      this.errorType === 'forbidden' ||
      this.code === 401 ||
      this.code === 403
    );
  }

  get isRateLimitError(): boolean {
    return this.errorType === 'rate_limit_exceeded' || this.code === 429;
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

      const data = await response.json() as T & {
        message?: string;
        errors?: ValidationErrors;
        error_type?: ErrorType;
      };

      if (!response.ok) {
        throw new ToSendError(
          data.message ?? 'Unknown error',
          response.status,
          data.errors ?? {},
          data.error_type
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
// Admin API Types
// ============================================================================

export interface AdminDomain {
  /** Domain identifier used across the Admin API */
  id: string;
  domain_name: string;
  verification_status: 'draft' | 'pending' | 'verified' | 'failed';
  is_default: boolean;
  ses_region: string | null;
  total_sent: number;
  total_bounced: number;
  total_complained: number;
  updated_at: string;
}

export interface DnsRecord {
  type: 'TXT' | 'MX';
  name: string;
  content: string;
  TTL: string;
  priority: string;
  /**
   * NOT returned by the Admin API.
   *
   * The domain-detail endpoint does not resolve DNS on your behalf (that
   * would make a GET fire four lookups and a write), so there is no
   * per-record status. Poll `verification_status` on the domain instead —
   * it is the result of the automatic 10-minute check.
   *
   * @deprecated Always undefined. Kept so existing code still compiles.
   */
  status?: string;
}

export interface CreatedDomain {
  /** Same identifier the list and detail endpoints use */
  id: string;
  domain_name: string;
  verification_status: string;
  created_at: string;
}

export interface AdminDomainDetail {
  id: string;
  domain_name: string;
  verification_status: string;
  dmarc_policy: string | null;
  created_at: string;
  dns_records: {
    dkim: DnsRecord;
    spf: DnsRecord[];
  };
  /** Whether the automatic 10-minute DNS check still covers this domain */
  auto_verification: { active: boolean; reason: string };
}

export interface EmailLog {
  /** Same value POST /v2/emails returned as message_id */
  id: string;
  status: string;
  subject: string | null;
  from: string | null;
  from_name: string | null;
  to: Array<{ email: string; name?: string }>;
  reply_to: string | null;
  recipients_count: number;
  error: string | null;
  has_attachments: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface ListLogsParams {
  page?: number;
  /** 1-100, default 25 */
  per_page?: number;
  status?: string;
  /** Domain name or domain id */
  domain?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface Suppression {
  email: string;
  bounce_sub_type: string | null;
  bounce_reason: string | null;
  hard_bounced_at: string | null;
  last_complaint_at: string | null;
  complaint_count: number;
  created_at: string;
  updated_at: string;
}

/** The only events toSend emits. Delivery, open and click do not exist. */
export type WebhookEvent = 'bounced' | 'complaint';

export interface Webhook {
  id: number;
  title: string | null;
  url: string;
  events: WebhookEvent[];
  status: string;
  include_message: boolean;
  created_at: string;
  updated_at: string;
}

export interface SendingKey {
  id: number;
  title: string | null;
  /** Masked. The full key is returned only by createSendingKey(). */
  key: string;
  status: string;
  domain: string | null;
  created_at: string;
}

export interface CreatedSendingKey {
  id: number;
  name: string;
  /** Shown once. Store it now — it cannot be retrieved later. */
  api_key: string;
  created_at: string;
}

/** GET /v2/info with an admin key */
export interface AdminInfo {
  account: {
    id: number;
    status: string;
    plan_type: string;
    /** The pooled balance for the whole account, never a child team's own */
    credit_balance: number | null;
    credits_shared: boolean;
    limit_per_second: number;
    ses_region: string;
    bounce_rate: number;
    complaint_rate: number;
  };
  key: {
    id: number;
    title: string;
    type: 'admin';
    /** The team this request acted on */
    acting_on: number;
    /** The team that owns the key */
    owned_by: number;
    scopes: string[];
  };
  /** Present only when the key has `domains:read` */
  domains?: AdminDomain[];
}

export interface SuppressionReactivation {
  deleted: boolean;
  message: string;
  used_today: number;
  remaining_today: number;
  daily_limit: number;
}

export interface TeamList {
  account: { id: number; name: string | null; status: string; credit_balance: number | null };
  teams: Array<{ id: number; name: string | null; status: string }>;
  /** Credits pool at the parent; child teams have no separate balance */
  credits_shared: boolean;
}

export interface AdminConfig {
  /** Your admin API key (tsend_admin_...) */
  apiKey: string;
  /** Act on a child team by default. Overridable per call. */
  accountId?: number;
  baseUrl?: string;
  timeout?: number;
}

// ============================================================================
// Admin Client
// ============================================================================

/**
 * Account-level API client.
 *
 * Deliberately a separate class from `ToSend`: admin keys and sending keys are
 * different credentials and are not interchangeable. A sending key cannot
 * manage the account, and an admin key can only send when it holds the
 * `emails:send` scope. Keeping them on separate clients means the mistake is
 * caught at the type level rather than by a 401 in production.
 *
 * @example
 * ```ts
 * const admin = new ToSendAdmin(process.env.TOSEND_ADMIN_KEY!);
 *
 * const domain = await admin.createDomain('client.example.com');
 * const detail = await admin.getDomain(domain.id);
 * console.log(detail.dns_records.dkim);
 * // No verify call needed — toSend checks DNS every 10 minutes.
 * ```
 */
export class ToSendAdmin {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly accountId?: number;

  constructor(config: string | AdminConfig) {
    if (typeof config === 'string') {
      this.apiKey = config;
      this.baseUrl = 'https://api.tosend.com';
      this.timeout = 30000;
    } else {
      this.apiKey = config.apiKey;
      this.baseUrl = config.baseUrl?.replace(/\/$/, '') ?? 'https://api.tosend.com';
      this.timeout = config.timeout ?? 30000;
      this.accountId = config.accountId;
    }

    if (!this.apiKey?.trim()) {
      throw new ToSendError('Admin API key is required', 401);
    }

    // Caught here rather than as a 401 from the server, because pasting a
    // sending key is the likeliest mistake and the message should say so.
    if (!this.apiKey.startsWith('tsend_admin_')) {
      throw new ToSendError(
        'This is not an admin API key. Admin keys start with "tsend_admin_" and are created in the dashboard under API Keys.',
        401
      );
    }
  }

  /**
   * The team this key acts on, the key itself and its scopes. Needs no scope,
   * so it is the way to check a key works.
   */
  async getInfo(): Promise<AdminInfo> {
    return this.request<AdminInfo>('GET', '/v2/info');
  }

  /** Return a client scoped to one of your child teams. */
  forAccount(accountId: number): ToSendAdmin {
    return new ToSendAdmin({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      accountId,
    });
  }

  // ── Sending (requires the emails:send scope) ──

  /**
   * Send an email as the targeted team (the key's own, or one set with
   * forAccount()). The key must hold the `emails:send` scope.
   */
  async send(params: SendEmailParams): Promise<SendEmailResponse> {
    return this.request<SendEmailResponse>('POST', '/v2/emails', params);
  }

  /** Send up to 100 emails in one request; same scope and targeting as send(). */
  async batch(emails: SendEmailParams[]): Promise<BatchEmailResponse> {
    return this.request<BatchEmailResponse>('POST', '/v2/emails/batch', { emails });
  }

  // ── Domains ──

  async listDomains(params: { page?: number; per_page?: number } = {}): Promise<Paginated<AdminDomain>> {
    return this.request<Paginated<AdminDomain>>('GET', '/v2/domains', undefined, params);
  }

  /**
   * Add a sending domain.
   *
   * The domain starts in `draft`. There is NO verify call to make: toSend
   * checks public DNS every 10 minutes and provisions the domain as soon as
   * the records resolve.
   *
   * A duplicate throws a 409. Treat that as "already exists, go read it" —
   * domain names are globally unique, so a retry after a timeout hits this
   * for a domain your first call created successfully.
   */
  async createDomain(name: string): Promise<CreatedDomain> {
    const res = await this.request<{ data: CreatedDomain }>('POST', '/v2/domains', { name });
    return res.data;
  }

  /** Domain detail plus the DNS records your customer must publish. */
  async getDomain(id: string): Promise<AdminDomainDetail> {
    const res = await this.request<{ data: AdminDomainDetail }>('GET', `/v2/domains/${encodeURIComponent(id)}`);
    return res.data;
  }

  /**
   * Remove a domain.
   *
   * Does NOT remove anything from your customer's DNS zone. Records left
   * published can allow the domain to be re-verified elsewhere, so clean them
   * up in your own workflow.
   */
  async deleteDomain(id: string): Promise<void> {
    await this.request('DELETE', `/v2/domains/${encodeURIComponent(id)}`);
  }

  // ── Logs ──

  async listEmails(params: ListLogsParams = {}): Promise<Paginated<EmailLog>> {
    return this.request<Paginated<EmailLog>>('GET', '/v2/emails', undefined, params);
  }

  /** Look up one message by the id POST /v2/emails returned. */
  async getEmail(messageId: string): Promise<EmailLog> {
    const res = await this.request<{ data: EmailLog }>('GET', `/v2/emails/${encodeURIComponent(messageId)}`);
    return res.data;
  }

  // ── Suppressions ──

  async listSuppressions(params: { page?: number; per_page?: number; search?: string; status?: string } = {}): Promise<Paginated<Suppression>> {
    return this.request<Paginated<Suppression>>('GET', '/v2/suppressions', undefined, params);
  }

  /** Limited to 500 per day per account, shared with the dashboard. */
  async deleteSuppression(email: string): Promise<SuppressionReactivation> {
    return this.request<SuppressionReactivation>('DELETE', '/v2/suppressions', undefined, { email });
  }

  // ── Webhooks ──

  async listWebhooks(params: { page?: number; per_page?: number } = {}): Promise<Paginated<Webhook>> {
    return this.request<Paginated<Webhook>>('GET', '/v2/webhooks', undefined, params);
  }

  /**
   * The signing `secret` is generated by toSend. The API returns it only in
   * this response (the dashboard can show it later), so store it now.
   */
  async createWebhook(params: {
    url: string;
    events: WebhookEvent[];
    title?: string;
    include_message?: boolean;
  }): Promise<Webhook & { secret: string }> {
    const res = await this.request<{ data: Webhook & { secret: string } }>('POST', '/v2/webhooks', params);
    return res.data;
  }

  async updateWebhook(id: number, params: Partial<{
    url: string;
    events: WebhookEvent[];
    title: string;
    status: 'active' | 'inactive';
    include_message: boolean;
  }>): Promise<Webhook> {
    const res = await this.request<{ data: Webhook }>('PUT', `/v2/webhooks/${id}`, params);
    return res.data;
  }

  async deleteWebhook(id: number): Promise<void> {
    await this.request('DELETE', `/v2/webhooks/${id}`);
  }

  // ── Sending keys ──

  async listSendingKeys(params: { page?: number; per_page?: number } = {}): Promise<Paginated<SendingKey>> {
    return this.request<Paginated<SendingKey>>('GET', '/v2/api-keys', undefined, params);
  }

  /**
   * Mint a sending key for this team — how you give each client their own key.
   *
   * The raw key is returned once and never again. Pass `domain` (a domain id)
   * to restrict it to one domain; omit it for all domains on the team.
   * Needs the `api_keys:write` and `emails:send` scopes.
   */
  async createSendingKey(name: string, domain?: string): Promise<CreatedSendingKey> {
    const res = await this.request<{ data: CreatedSendingKey }>('POST', '/v2/api-keys', { name, domain });
    return res.data;
  }

  async deleteSendingKey(id: number): Promise<void> {
    await this.request('DELETE', `/v2/api-keys/${id}`);
  }

  // ── Teams ──

  async listTeams(): Promise<TeamList> {
    const res = await this.request<{ data: TeamList }>('GET', '/v2/teams');
    return res.data;
  }

  /** Only the parent account can create teams. */
  async createTeam(name: string): Promise<{ id: number; name: string; status: string }> {
    const res = await this.request<{ data: any }>('POST', '/v2/teams', { name });
    return res.data;
  }

  async updateTeam(id: number, params: { name?: string; status?: 'active' | 'suspended' }): Promise<{ id: number; name: string; status: string }> {
    const res = await this.request<{ data: any }>('PUT', `/v2/teams/${id}`, params);
    return res.data;
  }

  // ── Private ──

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown,
    query?: Record<string, string | number | undefined> | ListLogsParams | { page?: number; per_page?: number }
  ): Promise<T> {
    let url = `${this.baseUrl}${endpoint}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.accountId !== undefined) {
      headers['X-Account-Id'] = String(this.accountId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json() as T & {
        message?: string;
        errors?: ValidationErrors;
        error_type?: ErrorType;
      };

      if (!response.ok) {
        throw new ToSendError(
          data.message ?? 'Unknown error',
          response.status,
          data.errors ?? {},
          data.error_type
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ToSendError) throw error;

      if (error instanceof Error) {
        if (error.name === 'AbortError') throw new ToSendError('Request timeout', 408);
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
