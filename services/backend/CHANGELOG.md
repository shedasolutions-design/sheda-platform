# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows semantic versioning where practical.

## [Unreleased]

## [2026-03-09]

### Added
- Pinata v3 IPFS upload integration using JWT authentication.
- Configurable `PINATA_GATEWAY_URL` for generated IPFS links.
- Batch upload support for media endpoints via a single `files` form field (1 or more files):
  - `POST /api/v1/media/file-upload/{type}`
  - `POST /api/v1/media/ipfs-upload`
- Reusable email base template at `templates/base.html`.
- Custom 404 page with quick links to `/sheda-docs` and `/sheda-backend`.

### Changed
- `templates/otp_email.html` now inherits from `templates/base.html`.
- `README.md` updated to reflect current platform capabilities and recent updates.

### Fixed
- Alembic migration flow hardened to support clean/empty database upgrades.
- Migration operations made more defensive/idempotent for table/column/index creation and alteration where needed.
