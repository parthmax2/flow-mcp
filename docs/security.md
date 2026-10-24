# Security and risks

flow-mcp acts as your signed-in Google account inside Google Flow. Read this before you use it.

## Google's terms

flow-mcp automates the Flow website. Google may consider that against its terms and could limit or block
the account. Use it at your own risk, with an account you are prepared to risk, at a human pace. It does
not solve or bypass captchas or other protections; when Google asks for a verification, you finish it in
the Chrome window.

flow-mcp is an unofficial, independent project. It is not affiliated with, endorsed by or sponsored by
Google. Google and Google Flow are trademarks of Google LLC.

## The local control port

The Chrome window flow-mcp opens listens on `127.0.0.1:9222` so the server can drive it. Any program
running on your computer can reach that port and act as your signed-in Google account. Do not run
flow-mcp on a shared or untrusted machine.

## Your session files

`FLOW_HOME` (`~/.flow-mcp` by default) holds the Chrome profile with your Google session. Keep it
private, out of backups you share, and out of version control.

## Uploads and rights

Flow asks the uploader to confirm they hold the rights to each file. flow-mcp only confirms that when you
say so, per request or once during `setup`. Only attach files you own or may use, and don't put real
people in footage without their consent.

## Spending

Images are free. Videos only run when Flow's quoted price is within the `max_credits` you allow, Flow's
"Always approve" is never chosen, and paid generations are never retried automatically. See
[Using flow-mcp](usage.md#credits).
