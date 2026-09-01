# Tools

The server registers fifteen MCP tools. Every tool maps to one signal-cli-rest-api endpoint, and
every tool returns its result as JSON text. Successful calls return the backend payload directly.
Failed calls return an object shaped like `{"error": {...}}` with a message, and, when the backend
reports them, an HTTP status, the request method, and the request URL. Registration requests that
hit Signal's rate limit may also carry `challenge_tokens`.

Several tools take an optional `number` argument. When you leave it out, the server falls back to
the `SIGNAL_NUMBER` environment variable. See [docs/configuration.md](docs/configuration.md) for
how that default works.

An operator can remove tools from this list entirely with `SIGNAL_DISABLED_TOOLS`. Disabled tools
are absent from `tools/list`, so they never show up here or in an agent's view. See
[docs/configuration.md](docs/configuration.md#signal_disabled_tools) for details.

## send_message

Sends a text message to one or more recipients. A recipient is a phone number or a group ID, and
the list can mix both. You can attach base64-encoded files and a link preview in the same call.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Sender account. Defaults to `SIGNAL_NUMBER`. |
| `message` | string | yes | Message body text. |
| `recipients` | array of string | yes | Recipient phone numbers and/or group IDs. |
| `base64_attachments` | array of string | no | Files to attach, base64-encoded. |
| `link_preview` | object | no | `{ url, title?, image? }` with the preview URL, an optional title, and an optional base64 image. |
| `text_mode` | string | no | `normal`, `length_extension`, or `extended`, passed through to the backend. |

Endpoint: `POST /v2/send`

```json
{
  "number": "+15551234567",
  "message": "Meeting moved to 15:00",
  "recipients": ["+15559876543", "group-id-here"]
}
```

The result contains the message timestamp. When only some recipients are reachable, the result also
includes an `errors.recipients` map that pairs each failed recipient with its error messages.

`text_mode` tells the backend how to render the body. `length_extension` and `extended` carry
bodies longer than Signal's normal limit, and the backend falls back to its default when you leave
it out.

## receive_messages

Polls the account for messages that have arrived and returns whatever is queued. The result is an
array of `{ account, envelope }` entries, where the envelope carries the incoming content. An
envelope can hold a data message, a sync message, a receipt, or a typing notification.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Account to receive for. Defaults to `SIGNAL_NUMBER`. |
| `timeout` | integer | no | Seconds to wait, from 1 to 300. The backend decides the default when omitted. |

Endpoint: `GET /v1/receive/{number}?timeout=N`

```json
{ "timeout": 10 }
```

This is a polling receive. It returns whatever is queued at call time, and it does not stream
messages in real time.

## list_accounts

Lists every account number registered in the signal-cli-rest-api instance. Takes no arguments.

Endpoint: `GET /v1/accounts`

```json
{}
```

## list_contacts

Lists the known contacts of an account. The backend includes people the account has interacted
with even when they are not saved contacts.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Account to list contacts for. Defaults to `SIGNAL_NUMBER`. |

Endpoint: `GET /v1/contacts/{number}?all_recipients=true`

```json
{}
```

Each entry is an object with fields such as `number`, `name`, and `color`.

## list_groups

Lists the groups an account belongs to. Each entry carries the group `id`, `name`, `description`,
and `members`.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Account to list groups for. Defaults to `SIGNAL_NUMBER`. |

Endpoint: `GET /v1/groups/{number}`

```json
{}
```

## get_group

Fetches the details of a single group.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Account that is a member of the group. Defaults to `SIGNAL_NUMBER`. |
| `group_id` | string | yes | Group ID to fetch. |

Endpoint: `GET /v1/groups/{number}/{groupId}`

```json
{ "group_id": "group-id-here" }
```

## create_group

Creates a new group on behalf of an account. The account that creates the group becomes its owner
and is added to the members list automatically.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Owning account. Defaults to `SIGNAL_NUMBER`. |
| `name` | string | yes | Group name. |
| `members` | array of string | yes | Initial member phone numbers. |
| `description` | string | no | Group description. |

Endpoint: `POST /v1/groups/{number}`

```json
{
  "name": "Weekend plans",
  "members": ["+15559876543", "+15552223344"],
  "description": "Ideas for Saturday"
}
```

The result holds the new group's `id`, which you can then pass as a `send_message` recipient.

## update_group

Changes the name and/or description of a group. Only the fields you provide are updated.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Account that is a member of the group. Defaults to `SIGNAL_NUMBER`. |
| `group_id` | string | yes | Group ID to update. |
| `name` | string | no | New group name. |
| `description` | string | no | New group description. |

Endpoint: `PUT /v1/groups/{number}/{groupId}`

```json
{ "group_id": "group-id-here", "name": "Weekend plans v2" }
```

## delete_group

Removes a group for an account. Treat this as permanent, since the group is gone once the call
succeeds.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Account that is a member of the group. Defaults to `SIGNAL_NUMBER`. |
| `group_id` | string | yes | Group ID to delete. |

Endpoint: `DELETE /v1/groups/{number}/{groupId}`

```json
{ "group_id": "group-id-here" }
```

## update_profile

Updates the public profile of an account: display name, about text, and avatar image. The avatar
is base64-encoded. Only the fields you provide are changed.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | no | Account to update. Defaults to `SIGNAL_NUMBER`. |
| `name` | string | no | New display name. |
| `about` | string | no | New about text. |
| `base64_avatar` | string | no | New avatar image, base64-encoded. |

Endpoint: `PUT /v1/profiles/{number}`

```json
{ "name": "Assistant", "about": "I send messages for you" }
```

## register_number

Starts registration for a phone number that has no Signal account yet. The backend asks Signal for
a verification code, sent by SMS, or by voice call when `use_voice` is true. Follow up with
`verify_number` using the code you received.

Some registrations trip Signal's anti-spam captcha. When that happens the backend returns
`challenge_tokens`, and you must pass a solved captcha token through the `captcha` argument.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | yes | Number to register, international format. |
| `use_voice` | boolean | no | Request the code by voice call instead of SMS. |
| `captcha` | string | no | Captcha token required by Signal. |

Endpoint: `POST /v1/register/{number}`

```json
{ "number": "+15551234567" }
```

## verify_number

Completes a registration started by `register_number`. Pass the verification code you received,
plus the registration lock PIN when the number has one set.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `number` | string | yes | Number being verified, international format. |
| `token` | string | yes | Verification code from SMS or voice call. |
| `pin` | string | no | Registration lock PIN, if set. |

Endpoint: `POST /v1/register/{number}/verify/{token}`

```json
{ "number": "+15551234567", "token": "123456" }
```

## link_device_qrcode

Produces a QR code that links a new device to an existing account. The result is
`{ "deviceName": "...", "base64Png": "..." }`. Scan the PNG in the Signal app under Settings, then
Linked devices, then Link new device.

Input:

| Argument | Type | Required | Description |
|---|---|---|---|
| `device_name` | string | yes | Short name for the new device, shown in the Signal app. |

Endpoint: `GET /v1/qrcodelink?device_name=...`

```json
{ "device_name": "my-agent" }
```

## get_about

Fetches version information about the signal-cli-rest-api instance, such as `{ version,
latestVersion }`. Takes no arguments.

Endpoint: `GET /v1/about`

```json
{}
```

## get_health

Checks that signal-cli-rest-api is alive. Returns `{ "status": "ok" }` when the backend answers.
Takes no arguments.

Endpoint: `GET /v1/health`

```json
{}
```
