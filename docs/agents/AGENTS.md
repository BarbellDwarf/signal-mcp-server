# AGENTS.md

Guidance for an AI agent that calls the tools this MCP server exposes. Read this before you touch
any of them.

## What you are

This server bridges you to a Signal account through signal-cli-rest-api. You get fifteen MCP
tools, and each one maps to one HTTP endpoint on the Signal backend. Tools return JSON on success.
Failures come back as an object with an `error` field that carries a message and, when available,
the HTTP status.

## The tool set

- `send_message` and `receive_messages` handle messaging.
- `list_accounts`, `list_contacts`, `list_groups`, and `get_group` describe the account and what
  it can reach.
- `create_group`, `update_group`, and `delete_group` manage groups.
- `update_profile` changes the account's public profile.
- `register_number`, `verify_number`, and `link_device_qrcode` set up numbers and devices.
- `get_about` and `get_health` report on the backend, and you can call them anytime.

## How to pick a tool

Start a task by listing what the account can reach. Call `list_accounts` when you do not know
which numbers are registered, and call `list_contacts` or `list_groups` when you need a recipient.
A recipient is either a phone number in international format or a group ID, and group IDs come from
`list_groups`.

Confirm the recipient before you send. If a number is wrong, the message still goes out. Delivery
errors only appear after the attempt.

## The default number

Nine tools accept an optional `number` argument. When you omit it, the server substitutes the
`SIGNAL_NUMBER` environment variable. That applies to the tools for messages, contacts, groups,
and your profile.

That default is a real account. When you omit `number` and no default exists, the tool returns an
error that tells you to pass `number` or set `SIGNAL_NUMBER`. Say which account you act as in your
own reasoning when a number is involved, even when the default covers it.

## Sending messages

`send_message` takes a `message` and a `recipients` array. The recipients can mix phone numbers
and group IDs. For a group, pass its ID in the same array.

```json
{ "message": "Reminder: the call starts at 15:00", "recipients": ["+15559876543"] }
```

Attachments go in `base64_attachments` as base64-encoded strings. A link preview goes in
`link_preview` with a `url` plus optional `title` and `image` fields. The result holds a
timestamp. On a partial send, `errors.recipients` maps each failed recipient to its errors, so
check that field before you report success.

## Receiving messages

`receive_messages` polls the account and returns whatever is queued. The result is a list of
`{ account, envelope }` entries, and the envelope carries the content, which may be a data
message, a sync, a receipt, or a typing event. Use the optional `timeout`, from 1 to 300 seconds,
when you want the backend to wait. This is polling, so a call can come back empty.

## Registering a number

To create a new Signal account, call `register_number` with the number, then `verify_number` with
the code the user received by SMS or voice. Some registrations need a captcha. The backend returns
`challenge_tokens` when it does, and you pass a solved token through the `captcha` argument. When
the number has a registration lock, `verify_number` accepts a `pin`.

`link_device_qrcode` is the alternative for an existing account. It returns a base64 PNG that the
user scans in the Signal app.

## Safety

Sending is real and immediate. Every `send_message` call transmits instantly, and no approval step
sits between you and the recipient. Confirm the recipient and the content with the user before you
send, and never send a message the user did not ask for.

Deleting is permanent. `delete_group` removes the group, and there is no undo.

Registration and profile changes affect a real Signal identity. Run them only when the user
explicitly asked.

The backend has no authentication. Keep the network path private, and treat the token value with
care.

An operator can set `SIGNAL_ALLOWED_RECIPIENTS` to a comma-separated allowlist. When it is set,
`send_message` refuses any recipient outside the list and returns an error that names the blocked
recipients. If you hit that error, do not retry against a different recipient unless the user asked
for it. The allowlist is a hard limit, not a suggestion.
