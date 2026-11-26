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

Confirm Gandi hosting product, SFTP endpoint, exact document root, remote app directory, credential, and host fingerprint. These do not block local implementation or CI.
