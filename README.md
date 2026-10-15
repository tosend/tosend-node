# ToSend Node.js SDK

Official Node.js SDK for the [ToSend](https://tosend.com) email API.

## Installation

```bash
npm install tosend
```

## Quick Start

```typescript
import { ToSend } from 'tosend';

const tosend = new ToSend('tsend_your_api_key');

const response = await tosend.send({
  from: { email: 'hello@yourdomain.com', name: 'Your App' },
  to: [{ email: 'user@example.com' }],
  subject: 'Welcome!',
  html: '<h1>Hello!</h1><p>Thanks for signing up.</p>',
});

console.log(response.message_id);
```

## Usage

### Send an Email

```typescript
const response = await tosend.send({
  from: { email: 'hello@yourdomain.com', name: 'Your App' },
  to: [
    { email: 'user@example.com' },
    { email: 'another@example.com', name: 'John Doe' },
  ],
  subject: 'Hello!',
  html: '<h1>Welcome</h1>',
  text: 'Welcome', // optional
});
```

### With CC, BCC, and Reply-To

```typescript
const response = await tosend.send({
  from: { email: 'hello@yourdomain.com' },
  to: [{ email: 'user@example.com' }],
  cc: [{ email: 'cc@example.com' }],
  bcc: [{ email: 'bcc@example.com' }],
  reply_to: { email: 'support@yourdomain.com', name: 'Support' },
  subject: 'Hello',
  html: '<p>Hello World</p>',
});
```

### With Attachments

```typescript
import * as fs from 'fs';

const response = await tosend.send({
  from: { email: 'hello@yourdomain.com' },
  to: [{ email: 'user@example.com' }],
  subject: 'Your Invoice',
  html: '<p>Please find your invoice attached.</p>',
  attachments: [
    {
      type: 'application/pdf',
      name: 'invoice.pdf',
      content: fs.readFileSync('invoice.pdf').toString('base64'),
    },
  ],
});
```

### Inline Images

Give an attachment a `content_id` and reference it from the HTML with `cid:`:

```typescript
await tosend.send({
  from: { email: 'hello@yourdomain.com' },
  to: [{ email: 'user@example.com' }],
  subject: 'Welcome',
  html: '<img src="cid:logo@yourdomain.com" alt="Logo">',
  attachments: [
    {
      type: 'image/png',
      name: 'logo.png',
      content: fs.readFileSync('logo.png').toString('base64'),
      content_id: 'logo@yourdomain.com',
    },
  ],
});
```

### Batch Sending

Send multiple emails in a single request:

```typescript
const response = await tosend.batch([
  {
    from: { email: 'hello@yourdomain.com' },
    to: [{ email: 'user1@example.com' }],
    subject: 'Hello User 1',
    html: '<p>Welcome!</p>',
  },
  {
    from: { email: 'hello@yourdomain.com' },
    to: [{ email: 'user2@example.com' }],
    subject: 'Hello User 2',
    html: '<p>Welcome!</p>',
  },
]);

response.results.forEach((result) => {
  if (result.status === 'success') {
    console.log('Sent:', result.message_id);
  } else {
    console.log('Failed:', result.message);
  }
});
```

### Get Account Info

```typescript
const info = await tosend.getAccountInfo();

console.log(info.account.status);          // 'active'
console.log(info.account.credit_balance);  // null = no credit limit
console.log(info.account.limit_per_second);

info.domains.forEach((domain) => {
  console.log(domain.domain_name, domain.verification_status);
});
```

## Admin API

`ToSendAdmin` is a separate client for the [Admin API](https://tosend.com/docs/api/admin-api). It takes an admin key (`tsend_admin_...`) and refuses a sending key at construction. Each call needs the matching [scope](https://tosend.com/docs/api/admin-api#scopes) on the key.

```typescript
import { ToSendAdmin } from 'tosend';

const admin = new ToSendAdmin(process.env.TOSEND_ADMIN_KEY!);

// Act on one of your client teams (sends X-Account-Id)
const client = admin.forAccount(4203);

const domain = await client.createDomain('client.example.com');
const detail = await client.getDomain(domain.id);
console.log(detail.dns_records.dkim); // show these records to your client

// Needs api_keys:write and emails:send
const key = await client.createSendingKey('Client: Acme Corp');
console.log(key.api_key); // returned once, store it now

// Needs emails:send
await client.send({
  from: { email: 'hello@client.example.com' },
  to: [{ email: 'user@example.com' }],
  subject: 'Hi',
  html: '<p>Hello</p>',
});
```

Also available: `getInfo` (checks the key and lists its scopes), `listDomains`, `deleteDomain`, `listEmails`, `getEmail`, `listSuppressions`, `deleteSuppression`, `listWebhooks`, `createWebhook`, `updateWebhook`, `deleteWebhook`, `listSendingKeys`, `deleteSendingKey`, `listTeams`, `createTeam` (`createTeam('Acme', { ses_region: 'eu-central-1' })` for an EU team; the region can't be changed later), `updateTeam` and `batch`. List methods take `page` and `per_page` and return `{ data, total, page, per_page }`.

## Configuration

### Simple (API key only)

```typescript
const tosend = new ToSend('tsend_your_api_key');
```

### With Options

```typescript
const tosend = new ToSend({
  apiKey: 'tsend_your_api_key',
  baseUrl: 'https://api.tosend.com', // optional
  timeout: 30000, // optional, in milliseconds
});
```

## Error Handling

```typescript
import { ToSend, ToSendError } from 'tosend';

try {
  const response = await tosend.send({
    from: { email: 'hello@yourdomain.com' },
    to: [{ email: 'user@example.com' }],
    subject: 'Hello',
    html: '<p>Hello</p>',
  });
} catch (error) {
  if (error instanceof ToSendError) {
    console.log('Error:', error.message);
    console.log('Code:', error.code);
    console.log('Errors:', error.errors);

    if (error.isValidationError) {
      // Handle validation error (422)
    }

    if (error.isAuthenticationError) {
      // Handle auth error (401/403)
    }

    if (error.isRateLimitError) {
      // Handle rate limit (429)
    }
  }
}
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import {
  ToSend,
  ToSendError,
  SendEmailParams,
  SendEmailResponse,
  BatchEmailResponse,
  AccountInfo,
  Address,
  Attachment,
} from 'tosend';
```

## Requirements

- Node.js 18 or higher

## License

MIT
