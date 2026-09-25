# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-09-26

### Added

- `ToSendAdmin`: client for the Admin API (domains, delivery logs, suppressions, webhooks, sending keys, client teams, and sending with an `emails:send` key). `forAccount()` targets a child team.

### Fixed

- `AccountInfo` now matches what `GET /v2/info` returns (`id`, `credit_balance`, `limit_per_second`, `ses_region`, rates, and per-domain totals). The old `title`, `emails_usage_this_month` and `emails_sent_last_24hrs` fields were never returned.
- `BatchEmailResult.errors` accepts both the nested and the flat error shape.

## [1.0.0] - 2026-01-24

### Added

- Initial release
- `send()` - Send single emails
- `batch()` - Send multiple emails in one request
- `getAccountInfo()` - Retrieve account information
- Full TypeScript support
- Input validation with detailed errors
- `ToSendError` class with error type helpers
