# Deployment and operations

## Target

The app is a static directory at `https://chahid.bagdouri.com/sjsu-timemap/`, served by the user's existing shared Gandi server. Build assets and data must use the `/sjsu-timemap/` base path.

GitHub Actions performs scraping, validation, and builds on hosted Linux runners. Standard runners are free for public repositories under current GitHub terms. Existing Gandi hosting/domain fees continue; this design adds no paid service.

## Folder isolation

Use SFTP to an explicit app-only directory. Validate its exact destination before upload. Upload versioned files first and entry points last; retain a prior snapshot. Cleanup, if added, must be confined to that app directory. Never run a site-wide mirror or Gandi git deployment against the shared website.

Gandi supports SFTP and SSH keys: https://docs.gandi.net/en/web_hosting/connection/sftp.html

## Credentials

Use GitHub Actions secrets for the dedicated deployment key/token and connection details. Confirm the host fingerprint independently. Nothing is published to the Gandi server until its endpoint and destination are configured.

## Scheduling limitation

GitHub native schedules can be delayed and are automatically disabled after 60 days without public repository activity. Successful downloads alone do not prove repository activity. This remains an operational limitation of the agreed GitHub-only automation choice.

https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Pending setup

The owner confirmed the FileZilla directory tree on 2026-11-25:

- Website document root: `/srv/bagdouri/sftp/chahid/www`
- Application destination: `/srv/bagdouri/sftp/chahid/www/sjsu-timemap/`
- Public application URL: `https://chahid.bagdouri.com/sjsu-timemap/`

`GANDI_REMOTE_DIR` is configured to that application destination in GitHub; `GANDI_DEPLOY_ENABLED` remains `false`. Remaining setup is the SFTP endpoint, username, credential, and independently trusted host key. The SSH/SFTP server can expose a different chroot-relative path; confirm the configured directory resolves to this exact app folder on the first connection.

## GitHub workflows

CI checks Python regression tests, published snapshot hashes, TypeScript calculations, and the production build. Daily refresh runs at 14:17 UTC (6:17 AM Pacific standard / 7:17 AM Pacific daylight), discovers the latest spring/fall terms, commits validated observations, and retains prior terms. Manually trigger it from the Actions tab. Builds are workflow artifacts retained for three days. The refresh job runs its own checks because pushes using GITHUB_TOKEN do not trigger the usual push workflow.

## Production configuration

Repository variables: `GANDI_DEPLOY_ENABLED` (false until ready), `GANDI_REMOTE_DIR` (the app-only destination confirmed from FileZilla), and optional `GANDI_SFTP_PORT` (22 by default).

GitHub Actions secrets: `GANDI_SFTP_HOST`, `GANDI_SFTP_USER`, `GANDI_SFTP_KNOWN_HOSTS`, and either `GANDI_SFTP_PRIVATE_KEY` (plus optional `GANDI_SFTP_KEY_PASSPHRASE`) or `GANDI_SFTP_PASSWORD` for an appropriate deployment token/password. Configure credentials through GitHub Settings, never source control or chat. Verify the host key against the host's published fingerprint or a trusted FileZilla connection.

`python scripts/deploy_sftp.py --remote-dir /path/to/site/www/sjsu-timemap` performs a dry run. Actual upload requires `--execute`. The script rejects roots, traversal, other app names, and symlink destinations. Assets and immutable datasets are uploaded first, the manifest next, and index.html last through atomic SFTP renames. Only strictly named expired app datasets are eligible for bounded cleanup after publication.

After connection setup, verify a scoped upload and the live app before enabling daily production uploads. Existing DNS and sibling projects are outside this deployment.

## Verified cloud execution

The [first hosted refresh](https://github.com/ChahidBagdouri/sjsu-timemap/actions/runs/45763739389) succeeded on 2026-11-26 UTC, including anonymous enrollment exports for both semesters, validation, tests, production build, artifact upload, and a bot commit of the observations. [CI](https://github.com/ChahidBagdouri/sjsu-timemap/actions/runs/45763742207) also passed. The Gandi upload step was skipped because production deployment is disabled.

To finish production setup:

1. In the repository's **Settings > Secrets and variables > Actions**, add the connection secrets listed above. Enter credentials there directly.
2. Confirm the SFTP-visible app destination and a trusted host key. The server must support atomic `posix-rename`.
3. Set `GANDI_DEPLOY_ENABLED` to `true`, then manually run **Refresh official SJSU data**. This collects, checks, builds, and uploads only the application folder.
4. Open the public URL and verify both semesters and the source download timestamps. If anything is wrong, set the enable variable back to `false` while investigating.

A source-code push runs CI. Run the refresh workflow manually to publish a code change immediately; otherwise the next daily refresh includes the latest code. Check the Actions tab after a source change or an alert. GitHub's workflow notifications are the initial failure signal; no paid monitoring service is required.
